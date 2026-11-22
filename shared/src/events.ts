import { z } from 'zod';

// ============================================================================
// 1. DOMÍNIO & ENUMS (Zod Schemas + TypeScript Types)
// ============================================================================

export const DepartmentIdSchema = z.enum([
  'director',
  'research',
  'design',
  'engineering',
  'growth',
]);
export type DepartmentId = z.infer<typeof DepartmentIdSchema>;

export const AgentVisualStateSchema = z.enum([
  'idle',
  'thinking',
  'working',
  'validating',
  'awaiting_approval',
  'error',
]);
export type AgentVisualState = z.infer<typeof AgentVisualStateSchema>;

export const ProjectStatusSchema = z.enum([
  'planning',
  'running',
  'paused',
  'completed',
  'failed',
]);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const TaskStatusSchema = z.enum([
  'pending',
  'ready',
  'running',
  'awaiting_approval',
  'done',
  'failed',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// ============================================================================
// 2. ENTIDADES DE DADOS & SNAPSHOT
// ============================================================================

export interface ProjectDTO {
  id: string;
  title: string;
  rawScope: string;
  status: ProjectStatus;
  tokenBudget: number;
  tokensUsed: number;
  createdAt: string;
}

export interface TaskDTO {
  id: string;
  projectId: string;
  taskKey: string;
  department: Exclude<DepartmentId, 'director'>;
  objective: string;
  dependsOn: string[];
  status: TaskStatus;
  attempts: number;
  maxAttempts: number;
  requiresApproval: boolean;
  lastError?: string | null;
}

export interface ArtifactDTO<TContent = Record<string, unknown>> {
  id: string;
  projectId: string;
  taskId: string;
  taskKey: string;
  department: DepartmentId;
  name: string;
  content: TContent;
  version: number;
  createdAt: string;
}

export interface ToolCallLogDTO {
  toolName: string;
  input: Record<string, unknown>;
  outputSummary: string;
  durationMs: number;
  success: boolean;
  timestamp: string;
}

export interface AgentDeskStateDTO {
  department: DepartmentId;
  visualState: AgentVisualState;
  activeTaskId: string | null;
  activeTaskKey: string | null;
  statusBubble: string | null;
  activeTool?: string | null;
  recentTools?: ToolCallLogDTO[];
  updatedAt: string;
}

export interface OfficeSnapshotPayload {
  project: ProjectDTO;
  agents: Record<DepartmentId, AgentDeskStateDTO>;
  tasks: TaskDTO[];
  artifacts: ArtifactDTO[];
}

// ============================================================================
// 3. PAYLOADS DE EVENTOS (Server -> Client)
// ============================================================================

export interface AgentStateChangedPayload {
  projectId: string;
  department: DepartmentId;
  visualState: AgentVisualState;
  activeTaskId: string | null;
  activeTaskKey: string | null;
  statusBubble: string | null;
  activeTool?: string | null;
  toolCallLog?: ToolCallLogDTO;
  taskStatus?: TaskStatus;
  attempts?: number;
  timestamp: string;
}

export interface ArtifactHandoffPayload {
  projectId: string;
  artifact: ArtifactDTO;
  fromDepartment: DepartmentId;
  toDepartments: DepartmentId[];
  timestamp: string;
}

export interface ApprovalRequiredPayload {
  projectId: string;
  task: TaskDTO;
  artifact: ArtifactDTO;
  department: DepartmentId;
  timestamp: string;
}

export interface BudgetUpdatedPayload {
  projectId: string;
  tokensUsed: number;
  tokenBudget: number;
  projectStatus: ProjectStatus;
  timestamp: string;
}

export interface ServerErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

// ============================================================================
// 4. PAYLOADS DE COMANDOS (Client -> Server) + VALIDAÇÃO ZOD
// ============================================================================

export const JoinProjectPayloadSchema = z.object({
  projectId: z.string().uuid(),
});
export type JoinProjectPayload = z.infer<typeof JoinProjectPayloadSchema>;

export const ApproveTaskPayloadSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
});
export type ApproveTaskPayload = z.infer<typeof ApproveTaskPayloadSchema>;

export const RejectTaskPayloadSchema = z.object({
  projectId: z.string().uuid(),
  taskId: z.string().uuid(),
  feedback: z.string().min(3, 'Feedback deve conter instruções claras para a nova tentativa.'),
});
export type RejectTaskPayload = z.infer<typeof RejectTaskPayloadSchema>;

export const PauseProjectPayloadSchema = z.object({
  projectId: z.string().uuid(),
  reason: z.string().optional(),
});
export type PauseProjectPayload = z.infer<typeof PauseProjectPayloadSchema>;

// ============================================================================
// 5. CONTRATO SOCKET.IO (Tipagem Forte Bidirecional)
// ============================================================================

export interface ServerToClientEvents {
  OFFICE_SNAPSHOT: (payload: OfficeSnapshotPayload) => void;
  AGENT_STATE_CHANGED: (payload: AgentStateChangedPayload) => void;
  ARTIFACT_HANDOFF: (payload: ArtifactHandoffPayload) => void;
  APPROVAL_REQUIRED: (payload: ApprovalRequiredPayload) => void;
  BUDGET_UPDATED: (payload: BudgetUpdatedPayload) => void;
  SERVER_ERROR: (payload: ServerErrorPayload) => void;
}

export interface ClientToServerEvents {
  JOIN_PROJECT: (
    payload: JoinProjectPayload,
    ack?: (response: { ok: boolean; error?: string }) => void
  ) => void;
  APPROVE_TASK: (
    payload: ApproveTaskPayload,
    ack?: (response: { ok: boolean; error?: string }) => void
  ) => void;
  REJECT_TASK: (
    payload: RejectTaskPayload,
    ack?: (response: { ok: boolean; error?: string }) => void
  ) => void;
  PAUSE_PROJECT: (
    payload: PauseProjectPayload,
    ack?: (response: { ok: boolean; error?: string }) => void
  ) => void;
}
