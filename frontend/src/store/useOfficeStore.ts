import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import type {
  AgentDeskStateDTO,
  AgentStateChangedPayload,
  ApprovalRequiredPayload,
  ArtifactDTO,
  ArtifactHandoffPayload,
  BudgetUpdatedPayload,
  ClientToServerEvents,
  DepartmentId,
  OfficeSnapshotPayload,
  ProjectDTO,
  ServerToClientEvents,
  TaskDTO,
} from '@ai-office/shared';

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:4000';

export interface ActiveHandoffAnimation {
  id: string;
  fromDepartment: DepartmentId;
  toDepartment: DepartmentId;
  artifactName: string;
  startedAt: number;
  durationMs: number;
}

const DEFAULT_AGENTS: Record<DepartmentId, AgentDeskStateDTO> = {
  director: {
    department: 'director',
    visualState: 'idle',
    activeTaskId: null,
    activeTaskKey: null,
    statusBubble: 'Aguardando novo escopo de projeto...',
    updatedAt: new Date().toISOString(),
  },
  research: {
    department: 'research',
    visualState: 'idle',
    activeTaskId: null,
    activeTaskKey: null,
    statusBubble: null,
    updatedAt: new Date().toISOString(),
  },
  design: {
    department: 'design',
    visualState: 'idle',
    activeTaskId: null,
    activeTaskKey: null,
    statusBubble: null,
    updatedAt: new Date().toISOString(),
  },
  engineering: {
    department: 'engineering',
    visualState: 'idle',
    activeTaskId: null,
    activeTaskKey: null,
    statusBubble: null,
    updatedAt: new Date().toISOString(),
  },
  growth: {
    department: 'growth',
    visualState: 'idle',
    activeTaskId: null,
    activeTaskKey: null,
    statusBubble: null,
    updatedAt: new Date().toISOString(),
  },
};

interface OfficeStoreState {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  connected: boolean;
  project: ProjectDTO | null;
  agents: Record<DepartmentId, AgentDeskStateDTO>;
  tasks: TaskDTO[];
  artifacts: ArtifactDTO[];
  selectedDepartment: DepartmentId | null;
  activeHandoffs: ActiveHandoffAnimation[];
  lastError: string | null;

  // Actions
  connectSocket: (projectId?: string) => void;
  joinProject: (projectId: string) => void;
  createProject: (params: {
    title: string;
    rawScope: string;
    tokenBudget?: number;
  }) => Promise<void>;
  selectDepartment: (department: DepartmentId | null) => void;
  approveTask: (taskId: string) => Promise<void>;
  rejectTask: (taskId: string, feedback: string) => Promise<void>;
  pauseProject: (reason?: string) => Promise<void>;
  pruneExpiredHandoffs: (now: number) => void;
}

export const useOfficeStore = create<OfficeStoreState>((set, get) => ({
  socket: null,
  connected: false,
  project: null,
  agents: DEFAULT_AGENTS,
  tasks: [],
  artifacts: [],
  selectedDepartment: null,
  activeHandoffs: [],
  lastError: null,

  connectSocket: (initialProjectId?: string) => {
    const existing = get().socket;
    if (existing) {
      if (initialProjectId) {
        get().joinProject(initialProjectId);
      }
      return;
    }

    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
      BACKEND_URL,
      {
        transports: ['websocket'],
      }
    );

    socket.on('connect', () => {
      set({ connected: true, lastError: null });
      const targetProjectId = initialProjectId ?? get().project?.id;
      if (targetProjectId) {
        socket.emit('JOIN_PROJECT', { projectId: targetProjectId });
      }
    });

    socket.on('disconnect', () => {
      set({ connected: false });
    });

    // 1. OFFICE_SNAPSHOT: Sincronização completa (suporta F5)
    socket.on('OFFICE_SNAPSHOT', (snapshot: OfficeSnapshotPayload) => {
      set({
        project: snapshot.project,
        agents: snapshot.agents,
        tasks: snapshot.tasks,
        artifacts: snapshot.artifacts,
        lastError: null,
      });
      window.history.replaceState(
        null,
        '',
        `?projectId=${snapshot.project.id}`
      );
    });

    // 2. AGENT_STATE_CHANGED: Atualização discreta de animação e balão
    socket.on('AGENT_STATE_CHANGED', (payload: AgentStateChangedPayload) => {
      set((state) => {
        const nextAgents = {
          ...state.agents,
          [payload.department]: {
            department: payload.department,
            visualState: payload.visualState,
            activeTaskId: payload.activeTaskId,
            activeTaskKey: payload.activeTaskKey,
            statusBubble: payload.statusBubble,
            updatedAt: payload.timestamp,
          },
        };

        const nextTasks = payload.activeTaskId
          ? state.tasks.map((t) =>
              t.id === payload.activeTaskId
                ? {
                    ...t,
                    status: payload.taskStatus ?? t.status,
                    attempts: payload.attempts ?? t.attempts,
                  }
                : t
            )
          : state.tasks;

        return {
          agents: nextAgents,
          tasks: nextTasks,
        };
      });
    });

    // 3. ARTIFACT_HANDOFF: Registra artefato e dispara animação 3D entre mesas
    socket.on('ARTIFACT_HANDOFF', (payload: ArtifactHandoffPayload) => {
      const now = performance.now();
      const newAnimations: ActiveHandoffAnimation[] =
        payload.toDepartments.map((toDept) => ({
          id: `${payload.artifact.id}-${toDept}-${now}`,
          fromDepartment: payload.fromDepartment,
          toDepartment: toDept,
          artifactName: `${payload.artifact.name} (v${payload.artifact.version})`,
          startedAt: now,
          durationMs: 2200,
        }));

      set((state) => {
        const exists = state.artifacts.some(
          (a) => a.id === payload.artifact.id
        );
        return {
          artifacts: exists
            ? state.artifacts
            : [payload.artifact, ...state.artifacts],
          activeHandoffs: [...state.activeHandoffs, ...newAnimations],
        };
      });
    });

    // 4. APPROVAL_REQUIRED: Atualiza estado do agente, tarefa e artefato para revisão no Drawer
    socket.on('APPROVAL_REQUIRED', (payload: ApprovalRequiredPayload) => {
      set((state) => {
        const artifactExists = state.artifacts.some(
          (a) => a.id === payload.artifact.id
        );
        return {
          tasks: state.tasks.map((t) =>
            t.id === payload.task.id ? payload.task : t
          ),
          artifacts: artifactExists
            ? state.artifacts
            : [payload.artifact, ...state.artifacts],
          agents: {
            ...state.agents,
            [payload.department]: {
              department: payload.department,
              visualState: 'awaiting_approval',
              activeTaskId: payload.task.id,
              activeTaskKey: payload.task.taskKey,
              statusBubble: `Aprovação necessária: ${payload.artifact.name} (v${payload.artifact.version})`,
              updatedAt: payload.timestamp,
            },
          },
        };
      });
    });

    // 5. BUDGET_UPDATED: Atualiza HUD de consumo de tokens e status do projeto
    socket.on('BUDGET_UPDATED', (payload: BudgetUpdatedPayload) => {
      set((state) => ({
        project: state.project
          ? {
              ...state.project,
              tokensUsed: payload.tokensUsed,
              tokenBudget: payload.tokenBudget,
              status: payload.projectStatus,
            }
          : null,
      }));
    });

    socket.on('SERVER_ERROR', (err) => {
      set({ lastError: `${err.code}: ${err.message}` });
    });

    set({ socket });
  },

  joinProject: (projectId: string) => {
    const { socket } = get();
    if (!socket) {
      get().connectSocket(projectId);
      return;
    }
    socket.emit('JOIN_PROJECT', { projectId });
  },

  createProject: async (params) => {
    const response = await fetch(`${BACKEND_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error ?? 'Falha ao criar projeto');
    }

    const data = (await response.json()) as {
      project: ProjectDTO;
      snapshot: OfficeSnapshotPayload;
    };

    set({
      project: data.snapshot.project,
      agents: data.snapshot.agents,
      tasks: data.snapshot.tasks,
      artifacts: data.snapshot.artifacts,
      lastError: null,
    });

    get().joinProject(data.project.id);
  },

  selectDepartment: (department) => {
    set({ selectedDepartment: department });
  },

  approveTask: async (taskId: string) => {
    const { socket, project } = get();
    if (!socket || !project) return;

    await new Promise<void>((resolve, reject) => {
      socket.emit(
        'APPROVE_TASK',
        { projectId: project.id, taskId },
        (res) => {
          if (res?.ok) resolve();
          else reject(new Error(res?.error ?? 'Erro ao aprovar tarefa'));
        }
      );
    });
  },

  rejectTask: async (taskId: string, feedback: string) => {
    const { socket, project } = get();
    if (!socket || !project) return;

    await new Promise<void>((resolve, reject) => {
      socket.emit(
        'REJECT_TASK',
        { projectId: project.id, taskId, feedback },
        (res) => {
          if (res?.ok) resolve();
          else reject(new Error(res?.error ?? 'Erro ao reprovar tarefa'));
        }
      );
    });
  },

  pauseProject: async (reason?: string) => {
    const { socket, project } = get();
    if (!socket || !project) return;

    await new Promise<void>((resolve, reject) => {
      socket.emit(
        'PAUSE_PROJECT',
        { projectId: project.id, reason },
        (res) => {
          if (res?.ok) resolve();
          else reject(new Error(res?.error ?? 'Erro ao pausar projeto'));
        }
      );
    });
  },

  pruneExpiredHandoffs: (now: number) => {
    const current = get().activeHandoffs;
    if (current.length === 0) return;
    const active = current.filter((h) => now - h.startedAt < h.durationMs);
    if (active.length !== current.length) {
      set({ activeHandoffs: active });
    }
  },
}));
