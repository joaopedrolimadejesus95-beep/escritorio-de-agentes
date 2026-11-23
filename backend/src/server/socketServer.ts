import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import {
  ApproveTaskPayloadSchema,
  JoinProjectPayloadSchema,
  PauseProjectPayloadSchema,
  RejectTaskPayloadSchema,
  type AgentStateChangedPayload,
  type ApprovalRequiredPayload,
  type ArtifactHandoffPayload,
  type BudgetUpdatedPayload,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@ai-office/shared';
import { getUserByCookieHeader } from '../auth/authService.js';
import type { OfficeStateMachine } from '../orchestrator/stateMachine.js';
import {
  globalRateLimiter,
  resolveAllowedCorsOrigin,
  sanitizeSensitiveText,
} from '../security/security.js';

export function getProjectRoom(projectId: string): string {
  return `project:${projectId}`;
}

function checkSocketActionRate(
  userId: string,
  action: string,
  limit = 20,
  windowMs = 60_000
): string | null {
  const res = globalRateLimiter.check(
    `socket:${action}:${userId}`,
    limit,
    windowMs
  );
  if (!res.allowed) {
    return `Muitas requisições em sequência (${action}). Aguarde ${res.retryAfterSec}s.`;
  }
  return null;
}

export function createOfficeSocketServer(
  httpServer: HttpServer,
  stateMachine: OfficeStateMachine
): SocketIOServer<ClientToServerEvents, ServerToClientEvents> {
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: {
        origin: (origin, callback) => {
          const allowed = resolveAllowedCorsOrigin(origin);
          if (!origin || allowed) {
            callback(null, allowed ?? true);
          } else {
            callback(new Error('Origem não autorizada pelo CORS'), false);
          }
        },
        credentials: true,
        methods: ['GET', 'POST'],
      },
    }
  );

  // Autenticação da conexão via cookie HttpOnly no handshake
  io.use(async (socket, next) => {
    try {
      const user = await getUserByCookieHeader(socket.request.headers.cookie);
      socket.data.userId = user?.id ?? null;
      next();
    } catch {
      socket.data.userId = null;
      next();
    }
  });

  // ==========================================================================
  // 1. BIND DOS EVENTOS INCREMENTAIS DA STATE MACHINE -> SALAS DO SOCKET.IO
  // ==========================================================================

  stateMachine.on(
    'AGENT_STATE_CHANGED',
    (payload: AgentStateChangedPayload) => {
      io.to(getProjectRoom(payload.projectId)).emit(
        'AGENT_STATE_CHANGED',
        payload
      );
    }
  );

  stateMachine.on('ARTIFACT_HANDOFF', (payload: ArtifactHandoffPayload) => {
    io.to(getProjectRoom(payload.projectId)).emit('ARTIFACT_HANDOFF', payload);
  });

  stateMachine.on('APPROVAL_REQUIRED', (payload: ApprovalRequiredPayload) => {
    io.to(getProjectRoom(payload.projectId)).emit('APPROVAL_REQUIRED', payload);
  });

  stateMachine.on('BUDGET_UPDATED', (payload: BudgetUpdatedPayload) => {
    io.to(getProjectRoom(payload.projectId)).emit('BUDGET_UPDATED', payload);
  });

  // ==========================================================================
  // 2. CONEXÃO DE CLIENTES E COMANDOS AUTENTICADOS (Client -> Server)
  // ==========================================================================

  io.on('connection', (socket) => {
    const requireAuthUserId = (): string => {
      const uid = socket.data.userId as string | null | undefined;
      if (!uid) {
        throw new Error('Sessão expirada ou não autenticada. Faça login para acessar este projeto.');
      }
      return uid;
    };

    // JOIN_PROJECT: Valida dono do projeto antes de entrar na sala
    socket.on('JOIN_PROJECT', async (rawPayload, ack) => {
      const parsed = JoinProjectPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues.map((i) => i.message).join(', ');
        socket.emit('SERVER_ERROR', {
          code: 'INVALID_JOIN_PAYLOAD',
          message: errorMsg,
        });
        ack?.({ ok: false, error: errorMsg });
        return;
      }

      const { projectId } = parsed.data;

      try {
        const userId = requireAuthUserId();
        const rateErr = checkSocketActionRate(userId, 'join', 40, 60_000);
        if (rateErr) throw new Error(rateErr);

        await stateMachine.assertProjectAccess(projectId, userId);

        for (const room of socket.rooms) {
          if (room.startsWith('project:') && room !== getProjectRoom(projectId)) {
            await socket.leave(room);
          }
        }

        const snapshot = await stateMachine.getOfficeSnapshot(projectId);
        await socket.join(getProjectRoom(projectId));

        socket.emit('OFFICE_SNAPSHOT', snapshot);
        ack?.({ ok: true });
      } catch (error) {
        const message = sanitizeSensitiveText(
          error instanceof Error ? error.message : String(error)
        );
        socket.emit('SERVER_ERROR', {
          code: 'SNAPSHOT_ERROR',
          message,
        });
        ack?.({ ok: false, error: message });
      }
    });

    // APPROVE_TASK: Libera Quality Gate humano (somente dono autenticado)
    socket.on('APPROVE_TASK', async (rawPayload, ack) => {
      const parsed = ApproveTaskPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues.map((i) => i.message).join(', ');
        ack?.({ ok: false, error: errorMsg });
        return;
      }

      const { projectId, taskId } = parsed.data;
      try {
        const userId = requireAuthUserId();
        const rateErr = checkSocketActionRate(userId, 'approve', 20, 60_000);
        if (rateErr) throw new Error(rateErr);

        await stateMachine.assertProjectAccess(projectId, userId);
        await stateMachine.approveTask(projectId, taskId);
        const snapshot = await stateMachine.getOfficeSnapshot(projectId);
        io.to(getProjectRoom(projectId)).emit('OFFICE_SNAPSHOT', snapshot);
        ack?.({ ok: true });
      } catch (error) {
        const message = sanitizeSensitiveText(
          error instanceof Error ? error.message : String(error)
        );
        socket.emit('SERVER_ERROR', {
          code: 'APPROVE_TASK_ERROR',
          message,
        });
        ack?.({ ok: false, error: message });
      }
    });

    // REJECT_TASK: Reprova artefato com feedback humano obrigatório (somente dono autenticado)
    socket.on('REJECT_TASK', async (rawPayload, ack) => {
      const parsed = RejectTaskPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues.map((i) => i.message).join(', ');
        ack?.({ ok: false, error: errorMsg });
        return;
      }

      const { projectId, taskId, feedback } = parsed.data;
      try {
        const userId = requireAuthUserId();
        const rateErr = checkSocketActionRate(userId, 'reject', 20, 60_000);
        if (rateErr) throw new Error(rateErr);

        await stateMachine.assertProjectAccess(projectId, userId);
        await stateMachine.rejectTask(projectId, taskId, feedback);
        const snapshot = await stateMachine.getOfficeSnapshot(projectId);
        io.to(getProjectRoom(projectId)).emit('OFFICE_SNAPSHOT', snapshot);
        ack?.({ ok: true });
      } catch (error) {
        const message = sanitizeSensitiveText(
          error instanceof Error ? error.message : String(error)
        );
        socket.emit('SERVER_ERROR', {
          code: 'REJECT_TASK_ERROR',
          message,
        });
        ack?.({ ok: false, error: message });
      }
    });

    // PAUSE_PROJECT: Pausa a execução do projeto (somente dono autenticado)
    socket.on('PAUSE_PROJECT', async (rawPayload, ack) => {
      const parsed = PauseProjectPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues.map((i) => i.message).join(', ');
        ack?.({ ok: false, error: errorMsg });
        return;
      }

      const { projectId, reason } = parsed.data;
      try {
        const userId = requireAuthUserId();
        const rateErr = checkSocketActionRate(userId, 'pause', 20, 60_000);
        if (rateErr) throw new Error(rateErr);

        await stateMachine.assertProjectAccess(projectId, userId);
        await stateMachine.pauseProject(projectId, reason);
        const snapshot = await stateMachine.getOfficeSnapshot(projectId);
        io.to(getProjectRoom(projectId)).emit('OFFICE_SNAPSHOT', snapshot);
        ack?.({ ok: true });
      } catch (error) {
        const message = sanitizeSensitiveText(
          error instanceof Error ? error.message : String(error)
        );
        socket.emit('SERVER_ERROR', {
          code: 'PAUSE_PROJECT_ERROR',
          message,
        });
        ack?.({ ok: false, error: message });
      }
    });

    // RETRY_TASK: Reinicia uma tarefa que falhou (somente dono autenticado)
    socket.on('RETRY_TASK', async (rawPayload, ack) => {
      const parsed = ApproveTaskPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues.map((i) => i.message).join(', ');
        ack?.({ ok: false, error: errorMsg });
        return;
      }

      const { projectId, taskId } = parsed.data;
      try {
        const userId = requireAuthUserId();
        const rateErr = checkSocketActionRate(userId, 'retry', 12, 60_000);
        if (rateErr) throw new Error(rateErr);

        await stateMachine.assertProjectAccess(projectId, userId);
        await stateMachine.retryFailedTask(projectId, taskId);
        const snapshot = await stateMachine.getOfficeSnapshot(projectId);
        io.to(getProjectRoom(projectId)).emit('OFFICE_SNAPSHOT', snapshot);
        ack?.({ ok: true });
      } catch (error) {
        const message = sanitizeSensitiveText(
          error instanceof Error ? error.message : String(error)
        );
        socket.emit('SERVER_ERROR', {
          code: 'RETRY_TASK_ERROR',
          message,
        });
        ack?.({ ok: false, error: message });
      }
    });
  });

  return io;
}
