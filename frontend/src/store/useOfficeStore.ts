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

export type LLMProviderType = 'gemini' | 'anthropic' | 'openai' | 'ollama';
export type LLMKeyStorageMode =
  | 'encrypted_db'
  | 'session_memory'
  | 'local_env'
  | 'ollama_auto';

export interface LLMStatusDTO {
  configured: boolean;
  provider: LLMProviderType | null;
  model: string | null;
  maskedKey: string | null;
  storageMode?: LLMKeyStorageMode | null;
  ollamaAvailable: boolean;
}

export interface AuthUserDTO {
  id: string;
  name: string;
  email: string;
  createdAt: string;
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
  builder: {
    department: 'builder',
    visualState: 'idle',
    activeTaskId: null,
    activeTaskKey: null,
    statusBubble: 'Pronto para build MVP',
    updatedAt: new Date().toISOString(),
  },
};

interface OfficeStoreState {
  socket: Socket<ServerToClientEvents, ClientToServerEvents> | null;
  connected: boolean;
  authUser: AuthUserDTO | null;
  authChecked: boolean;
  isAuthModalOpen: boolean;
  isHistoryModalOpen: boolean;
  projectHistory: ProjectDTO[];
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
  reconnectSocketWithSession: (projectId?: string) => void;
  joinProject: (projectId: string) => void;
  fetchAuthMe: () => Promise<void>;
  login: (params: { email: string; password: string }) => Promise<void>;
  register: (params: {
    name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  fetchProjectHistory: () => Promise<void>;
  setAuthModalOpen: (open: boolean) => void;
  setHistoryModalOpen: (open: boolean) => void;
  fetchLLMStatus: () => Promise<void>;
  saveLLMSettings: (params: {
    provider: LLMProviderType;
    model: string;
    apiKey?: string;
    baseUrl?: string;
    persistInDb?: boolean;
  }) => Promise<void>;
  deleteLLMSettings: () => Promise<void>;
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
  exportProjectZip: () => Promise<void>;
  clearError: () => void;
  pruneExpiredHandoffs: (now: number) => void;
}

export const useOfficeStore = create<OfficeStoreState>((set, get) => ({
  socket: null,
  connected: false,
  authUser: null,
  authChecked: false,
  isAuthModalOpen: false,
  isHistoryModalOpen: false,
  projectHistory: [],
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
    void get().fetchAuthMe();
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
        withCredentials: true,
      }
    );

    socket.on('connect', () => {
      set({ connected: true, lastError: null });
      const targetProjectId = initialProjectId ?? get().project?.id;
      if (targetProjectId && get().authUser) {
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

  reconnectSocketWithSession: (projectId?: string) => {
    const oldSocket = get().socket;
    if (oldSocket) {
      oldSocket.removeAllListeners();
      oldSocket.disconnect();
      set({ socket: null, connected: false });
    }
    get().connectSocket(projectId);
  },

  fetchAuthMe: async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = (await res.json()) as { user: AuthUserDTO | null };
        set({ authUser: data.user, authChecked: true });
        if (data.user) {
          void get().fetchProjectHistory();
          const urlId = new URLSearchParams(window.location.search).get(
            'projectId'
          );
          if (urlId && !get().project) {
            get().joinProject(urlId);
          }
        }
      } else {
        set({ authChecked: true });
      }
    } catch {
      set({ authChecked: true });
    }
  },

  login: async (params) => {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? 'Falha ao entrar na conta.');
    }
    const urlId =
      new URLSearchParams(window.location.search).get('projectId') ?? undefined;
    set({
      authUser: data.user as AuthUserDTO,
      isAuthModalOpen: false,
      lastError: null,
    });
    get().reconnectSocketWithSession(urlId);
    void get().fetchLLMStatus();
    void get().fetchProjectHistory();
  },

  register: async (params) => {
    const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? 'Falha ao criar conta.');
    }
    set({
      authUser: data.user as AuthUserDTO,
      isAuthModalOpen: false,
      lastError: null,
    });
    get().reconnectSocketWithSession();
    void get().fetchLLMStatus();
    void get().fetchProjectHistory();
  },

  logout: async () => {
    await fetch(`${BACKEND_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});

    window.history.replaceState(null, '', window.location.pathname);
    set({
      authUser: null,
      projectHistory: [],
      project: null,
      agents: DEFAULT_AGENTS,
      tasks: [],
      artifacts: [],
      selectedDepartment: null,
      llmStatus: null,
      isHistoryModalOpen: false,
      lastError: null,
    });
    get().reconnectSocketWithSession();
  },

  fetchProjectHistory: async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/projects`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = (await res.json()) as { projects: ProjectDTO[] };
        set({ projectHistory: data.projects ?? [] });
      }
    } catch {
      // Silencioso
    }
  },

  setAuthModalOpen: (open) => set({ isAuthModalOpen: open }),
  setHistoryModalOpen: (open) => {
    if (open && get().authUser) {
      void get().fetchProjectHistory();
    }
    set({ isHistoryModalOpen: open });
  },

  fetchLLMStatus: async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/settings/llm`, {
        credentials: 'include',
      });
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
      credentials: 'include',
      body: JSON.stringify(params),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 || data.code === 'AUTH_REQUIRED') {
        set({ isAuthModalOpen: true });
      }
      throw new Error(data.error ?? 'Falha ao salvar configuração de IA');
    }
    set({
      llmStatus: data as LLMStatusDTO,
      isSettingsModalOpen: false,
      lastError: null,
    });
  },

  deleteLLMSettings: async () => {
    const res = await fetch(`${BACKEND_URL}/api/settings/llm`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? 'Falha ao remover chave salva.');
    }
    set({ llmStatus: data as LLMStatusDTO });
  },

  setSettingsModalOpen: (open) => {
    if (open && !get().authUser) {
      set({ isAuthModalOpen: true });
      return;
    }
    set({ isSettingsModalOpen: open });
  },

  joinProject: (projectId: string) => {
    const { socket, authUser } = get();
    if (!authUser) {
      set({ isAuthModalOpen: true });
      return;
    }
    if (!socket) {
      get().connectSocket(projectId);
      return;
    }
    socket.emit('JOIN_PROJECT', { projectId });
  },

  createProject: async (params) => {
    if (!get().authUser) {
      set({
        isAuthModalOpen: true,
        lastError: 'Entre ou crie uma conta para iniciar e salvar seus projetos.',
      });
      throw new Error('Autenticação necessária');
    }

    set({ lastError: null });
    const response = await fetch(`${BACKEND_URL}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(params),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 || data.code === 'AUTH_REQUIRED') {
        set({ isAuthModalOpen: true, lastError: data.error ?? 'Login necessário.' });
      } else if (response.status === 428 || data.code === 'LLM_NOT_CONFIGURED') {
        set({
          isSettingsModalOpen: true,
          lastError:
            data.error ??
            'Configure sua chave de IA (Gemini, Anthropic, OpenAI ou Ollama).',
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
    void get().fetchProjectHistory();
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

  exportProjectZip: async () => {
    const { project } = get();
    if (!project) return;

    const res = await fetch(
      `${BACKEND_URL}/api/projects/${project.id}/export`,
      {
        method: 'GET',
        credentials: 'include',
      }
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = data.error ?? 'Falha ao exportar projeto (.zip).';
      set({ lastError: msg });
      throw new Error(msg);
    }

    const blob = await res.blob();
    const disp = res.headers.get('content-disposition') ?? '';
    const match = disp.match(/filename="([^"]+)"/i);
    const filename = match?.[1] ?? 'ai-office-mvp.zip';

    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(blobUrl);
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
