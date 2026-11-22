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
import type { OfficeStateMachine } from '../orchestrator/stateMachine.js';

export function getProjectRoom(projectId: string): string {
  return `project:${projectId}`;
}

export function createOfficeSocketServer(
  httpServer: HttpServer,
  stateMachine: OfficeStateMachine
): SocketIOServer<ClientToServerEvents, ServerToClientEvents> {
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    }
  );

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
  // 2. CONEXÃO DE CLIENTES E COMANDOS (Client -> Server)
  // ==========================================================================

  io.on('connection', (socket) => {
    console.log(`[Socket.io] Cliente conectado: ${socket.id}`);

    // JOIN_PROJECT: Entra na sala isolada do projectId e envia OFFICE_SNAPSHOT completo (suporte a F5)
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
        // Remove o socket de salas de projetos anteriores para garantir isolamento
        for (const room of socket.rooms) {
          if (room.startsWith('project:') && room !== getProjectRoom(projectId)) {
            await socket.leave(room);
          }
        }

        const snapshot = await stateMachine.getOfficeSnapshot(projectId);
        await socket.join(getProjectRoom(projectId));

        // Emite snapshot completo imediatamente ao entrar na sala
        socket.emit('OFFICE_SNAPSHOT', snapshot);
        ack?.({ ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        socket.emit('SERVER_ERROR', {
          code: 'SNAPSHOT_ERROR',
          message,
        });
        ack?.({ ok: false, error: message });
      }
    });

    // APPROVE_TASK: Libera Quality Gate humano e retoma o DAG
    socket.on('APPROVE_TASK', async (rawPayload, ack) => {
      const parsed = ApproveTaskPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues.map((i) => i.message).join(', ');
        ack?.({ ok: false, error: errorMsg });
        return;
      }

      const { projectId, taskId } = parsed.data;
      try {
        await stateMachine.approveTask(projectId, taskId);
        const snapshot = await stateMachine.getOfficeSnapshot(projectId);
        io.to(getProjectRoom(projectId)).emit('OFFICE_SNAPSHOT', snapshot);
        ack?.({ ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        socket.emit('SERVER_ERROR', {
          code: 'APPROVE_TASK_ERROR',
          message,
        });
        ack?.({ ok: false, error: message });
      }
    });

    // REJECT_TASK: Reprova artefato com feedback humano obrigatório e agenda retry determinístico
    socket.on('REJECT_TASK', async (rawPayload, ack) => {
      const parsed = RejectTaskPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues.map((i) => i.message).join(', ');
        ack?.({ ok: false, error: errorMsg });
        return;
      }

      const { projectId, taskId, feedback } = parsed.data;
      try {
        await stateMachine.rejectTask(projectId, taskId, feedback);
        const snapshot = await stateMachine.getOfficeSnapshot(projectId);
        io.to(getProjectRoom(projectId)).emit('OFFICE_SNAPSHOT', snapshot);
        ack?.({ ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        socket.emit('SERVER_ERROR', {
          code: 'REJECT_TASK_ERROR',
          message,
        });
        ack?.({ ok: false, error: message });
      }
    });

    // PAUSE_PROJECT: Pausa a execução do projeto
    socket.on('PAUSE_PROJECT', async (rawPayload, ack) => {
      const parsed = PauseProjectPayloadSchema.safeParse(rawPayload);
      if (!parsed.success) {
        const errorMsg = parsed.error.issues.map((i) => i.message).join(', ');
        ack?.({ ok: false, error: errorMsg });
        return;
      }

      const { projectId, reason } = parsed.data;
      try {
        await stateMachine.pauseProject(projectId, reason);
        const snapshot = await stateMachine.getOfficeSnapshot(projectId);
        io.to(getProjectRoom(projectId)).emit('OFFICE_SNAPSHOT', snapshot);
        ack?.({ ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        socket.emit('SERVER_ERROR', {
          code: 'PAUSE_PROJECT_ERROR',
          message,
        });
        ack?.({ ok: false, error: message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.io] Cliente desconectado: ${socket.id}`);
    });
  });

  return io;
}
