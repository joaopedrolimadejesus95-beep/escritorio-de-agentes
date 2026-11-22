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

export type LLMProviderType = 'gemini' | 'openai' | 'ollama';

export interface LLMStatusDTO {
  configured: boolean;
  provider: LLMProviderType | null;
  model: string | null;
  maskedKey: string | null;
  ollamaAvailable: boolean;
}

const DEFAULT_AGENTS: Record<DepartmentId, AgentDeskStateDTO> = {
  director: {
    department: 'director',
    visualState: 'idle',
    activeTaskId: null,
    activeTaskKey: null,
    statusBubble: 'Aguardando escopo do projeto',
    updatedAt: new Date().toISOString(),
  },
  research: {
    department: 'research',
    visualState: 'idle',
    activeTaskId: null,
    activeTaskKey: null,
    statusBubble: 'Pronto para pesquisa de mercado',
    updatedAt: new Date().toISOString(),
  },
  design: {
    department: 'design',
    visualState: 'idle',
    activeTaskId: null,
    activeTaskKey: null,
    statusBubble: 'Pronto para design de interface',
    updatedAt: new Date().toISOString(),
  },
  engineering: {
    department: 'engineering',
    visualState: 'idle',
    activeTaskId: null,
    activeTaskKey: null,
    statusBubble: 'Pronto para arquitetura de sistema',
    updatedAt: new Date().toISOString(),
  },
  growth: {
    department: 'growth',
    visualState: 'idle',
    activeTaskId: null,
    activeTaskKey: null,
    statusBubble: 'Pronto para estratégia de lançamento',
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
  hoveredDepartment: DepartmentId | null;
  activeHandoffs: ActiveHandoffAnimation[];
  lastError: string | null;
  llmStatus: LLMStatusDTO | null;
  isSettingsModalOpen: boolean;

  connectSocket: (projectId?: string) => void;
  joinProject: (projectId: string) => void;
  fetchLLMStatus: () => Promise<void>;
  saveLLMSettings: (params: {
    provider: LLMProviderType;
    model: string;
    apiKey?: string;
    baseUrl?: string;
  }) => Promise<void>;
  setSettingsModalOpen: (open: boolean) => void;
  createProject: (params: {
    title: string;
    rawScope: string;
    tokenBudget?: number;
  }) => Promise<void>;
  selectDepartment: (department: DepartmentId | null) => void;
  setHoveredDepartment: (department: DepartmentId | null) => void;
  approveTask: (taskId: string) => Promise<void>;
  rejectTask: (taskId: string, feedback: string) => Promise<void>;
  retryTask: (taskId: string) => Promise<void>;
  pauseProject: (reason?: string) => Promise<void>;
  clearError: () => void;
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
  hoveredDepartment: null,
  activeHandoffs: [],
  lastError: null,
  llmStatus: null,
  isSettingsModalOpen: false,

  connectSocket: (initialProjectId?: string) => {
    void get().fetchLLMStatus();

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

    socket.on('AGENT_STATE_CHANGED', (payload: AgentStateChangedPayload) => {
      set((state) => {
        const prevAgent = state.agents[payload.department];
        const nextRecentTools = payload.toolCallLog
          ? [payload.toolCallLog, ...(prevAgent?.recentTools ?? [])].slice(0, 15)
          : prevAgent?.recentTools ?? [];

        const nextAgents = {
          ...state.agents,
          [payload.department]: {
            department: payload.department,
            visualState: payload.visualState,
            activeTaskId: payload.activeTaskId,
            activeTaskKey: payload.activeTaskKey,
            statusBubble: payload.statusBubble,
            activeTool:
              payload.activeTool !== undefined
                ? payload.activeTool
                : prevAgent?.activeTool ?? null,
            recentTools: nextRecentTools,
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
              ...state.agents[payload.department],
              department: payload.department,
              visualState: 'awaiting_approval',
              activeTaskId: payload.task.id,
              activeTaskKey: payload.task.taskKey,
              statusBubble: `Aguardando aprovação (v${payload.artifact.version})`,
              updatedAt: payload.timestamp,
            },
          },
        };
      });
    });

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

  fetchLLMStatus: async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/settings/llm`);
      if (res.ok) {
        const status = (await res.json()) as LLMStatusDTO;
        set({ llmStatus: status });
      }
    } catch {
      // Silencioso enquanto backend sobe
    }
  },

  saveLLMSettings: async (params) => {
    const res = await fetch(`${BACKEND_URL}/api/settings/llm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? 'Falha ao salvar configuração de IA');
    }
    set({
      llmStatus: data as LLMStatusDTO,
      isSettingsModalOpen: false,
      lastError: null,
    });
  },

  setSettingsModalOpen: (open) => set({ isSettingsModalOpen: open }),

  joinProject: (projectId: string) => {
    const { socket } = get();
    if (!socket) {
      get().connectSocket(projectId);
      return;
    }
    socket.emit('JOIN_PROJECT', { projectId });
  },

  createProject: async (params) => {
    set({ lastError: null });
    const response = await fetch(`${BACKEND_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 428 || data.code === 'LLM_NOT_CONFIGURED') {
        set({
          isSettingsModalOpen: true,
          lastError:
            data.error ??
            'Configure um provedor de IA (Gemini, OpenAI ou Ollama) para executar o fluxo real.',
        });
      } else {
        set({ lastError: data.error ?? 'Falha ao iniciar projeto' });
      }
      throw new Error(data.error ?? 'Falha ao iniciar projeto');
    }

    const typed = data as {
      project: ProjectDTO;
      snapshot: OfficeSnapshotPayload;
    };

    set({
      project: typed.snapshot.project,
      agents: typed.snapshot.agents,
      tasks: typed.snapshot.tasks,
      artifacts: typed.snapshot.artifacts,
      lastError: null,
    });

    get().joinProject(typed.project.id);
  },

  selectDepartment: (department) => {
    set({ selectedDepartment: department });
  },

  setHoveredDepartment: (department) => {
    set({ hoveredDepartment: department });
  },

  approveTask: async (taskId: string) => {
    const { socket, project } = get();
    if (!socket || !project) return;

    await new Promise<void>((resolve, reject) => {
      socket.emit('APPROVE_TASK', { projectId: project.id, taskId }, (res) => {
        if (res?.ok) resolve();
        else reject(new Error(res?.error ?? 'Erro ao aprovar entrega'));
      });
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
          else reject(new Error(res?.error ?? 'Erro ao solicitar ajuste'));
        }
      );
    });
  },

  retryTask: async (taskId: string) => {
    const { socket, project } = get();
    if (!socket || !project) return;

    await new Promise<void>((resolve, reject) => {
      socket.emit('RETRY_TASK', { projectId: project.id, taskId }, (res) => {
        if (res?.ok) resolve();
        else reject(new Error(res?.error ?? 'Erro ao reexecutar tarefa'));
      });
    });
  },

  pauseProject: async (reason?: string) => {
    const { socket, project } = get();
    if (!socket || !project) return;

    await new Promise<void>((resolve, reject) => {
      socket.emit('PAUSE_PROJECT', { projectId: project.id, reason }, (res) => {
        if (res?.ok) resolve();
        else reject(new Error(res?.error ?? 'Erro ao pausar projeto'));
      });
    });
  },

  clearError: () => set({ lastError: null }),

  pruneExpiredHandoffs: (now: number) => {
    const current = get().activeHandoffs;
    if (current.length === 0) return;
    const active = current.filter((h) => now - h.startedAt < h.durationMs);
    if (active.length !== current.length) {
      set({ activeHandoffs: active });
    }
  },
}));
