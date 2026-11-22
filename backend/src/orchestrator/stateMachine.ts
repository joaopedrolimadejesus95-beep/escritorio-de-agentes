import { EventEmitter } from 'node:events';
import {
  type AgentDeskStateDTO,
  type AgentStateChangedPayload,
  type AgentVisualState,
  type ApprovalRequiredPayload,
  type ArtifactDTO,
  type ArtifactHandoffPayload,
  type BudgetUpdatedPayload,
  type DepartmentId,
  type OfficeSnapshotPayload,
  type ProjectDTO,
  type ProjectStatus,
  type TaskDTO,
  type TaskStatus,
  type ToolCallLogDTO,
} from '@ai-office/shared';
import { pool, withTransaction, type DbClient } from '../db/pool.js';
import { DirectorPlanner } from './planner.js';
import {
  defaultToolRegistry,
  type AgentToolRegistry,
  type ToolExecutionReport,
} from '../tools/toolRegistry.js';

// ============================================================================
// 1. CONTRATO DE POD ESPECIALISTA (EXECUTOR + VALIDADOR DETERMINÍSTICO)
// ============================================================================

export interface DependencyArtifactContext {
  taskKey: string;
  department: DepartmentId;
  artifactName: string;
  version: number;
  content: Record<string, unknown>;
}

export interface PodToolRuntime {
  useTool<TOutput = any>(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<ToolExecutionReport<TOutput>>;
}

export interface PodExecutionInput {
  projectId: string;
  task: TaskDTO;
  dependencyArtifacts: DependencyArtifactContext[];
  humanFeedback?: string | null;
  tools: PodToolRuntime;
}

export interface PodExecutionOutput {
  artifactName: string;
  content: Record<string, unknown>;
  tokensUsed: number;
}

export interface DeterministicValidationResult {
  valid: boolean;
  errors: string[];
}

export interface DepartmentPod {
  readonly department: Exclude<DepartmentId, 'director'>;
  execute(input: PodExecutionInput): Promise<PodExecutionOutput>;
  validate(output: PodExecutionOutput, input: PodExecutionInput): DeterministicValidationResult;
}

// ============================================================================
// 2. EVENTOS INTERNOS DA STATE MACHINE (CONSUMIDOS PELO SOCKET.IO NA ETAPA 3)
// ============================================================================

export interface StateMachineEvents {
  AGENT_STATE_CHANGED: (payload: AgentStateChangedPayload) => void;
  ARTIFACT_HANDOFF: (payload: ArtifactHandoffPayload) => void;
  APPROVAL_REQUIRED: (payload: ApprovalRequiredPayload) => void;
  BUDGET_UPDATED: (payload: BudgetUpdatedPayload) => void;
}

// ============================================================================
// 3. STATE MACHINE DETERMINÍSTICA
// ============================================================================

const ALL_DEPARTMENTS: DepartmentId[] = [
  'director',
  'research',
  'design',
  'engineering',
  'growth',
];

export class OfficeStateMachine extends EventEmitter {
  private readonly pods = new Map<Exclude<DepartmentId, 'director'>, DepartmentPod>();
  private readonly activeTaskRunners = new Set<string>();
  private readonly agentStates = new Map<
    string,
    Record<DepartmentId, AgentDeskStateDTO>
  >();

  constructor(
    private readonly planner: DirectorPlanner = new DirectorPlanner(),
    private readonly toolRegistry: AgentToolRegistry = defaultToolRegistry
  ) {
    super();
  }

  public registerPod(pod: DepartmentPod): void {
    this.pods.set(pod.department, pod);
  }

  // --------------------------------------------------------------------------
  // Inicialização de Projeto + Planejamento DAG
  // --------------------------------------------------------------------------

  public async createAndPlanProject(params: {
    title: string;
    rawScope: string;
    tokenBudget?: number;
  }): Promise<ProjectDTO> {
    const tokenBudget = params.tokenBudget ?? 100_000;

    // 1. Cria o projeto no status 'planning'
    const insertRes = await pool.query(
      `INSERT INTO projects (title, raw_scope, status, token_budget, tokens_used)
       VALUES ($1, $2, 'planning', $3, 0)
       RETURNING *`,
      [params.title, params.rawScope, tokenBudget]
    );
    const project = this.mapProjectRow(insertRes.rows[0]);

    this.ensureProjectAgentStates(project.id);
    this.updateAgentVisualState({
      projectId: project.id,
      department: 'director',
      visualState: 'thinking',
      activeTaskId: null,
      activeTaskKey: 'director_planning',
      statusBubble: 'Gerando DAG de tarefas e validando dependências...',
    });

    try {
      // 2. Planejamento via DirectorPlanner + Validação Zod + Kahn DAG
      const { plan, topologicalTasks, tokensUsed } =
        await this.planner.createValidatedPlan(params.rawScope);

      await withTransaction(async (client) => {
        // Verifica teto de orçamento já no planejamento
        await this.consumeTokensInTx(client, project.id, tokensUsed);

        for (const planned of topologicalTasks) {
          const initialStatus: TaskStatus =
            planned.depends_on.length === 0 ? 'ready' : 'pending';

          await client.query(
            `INSERT INTO tasks (
               project_id, task_key, department, objective, depends_on,
               status, attempts, max_attempts, requires_approval
             ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8)`,
            [
              project.id,
              planned.task_key,
              planned.department,
              planned.objective,
              planned.depends_on,
              initialStatus,
              planned.max_attempts,
              planned.requires_approval,
            ]
          );
        }

        await client.query(
          `UPDATE projects SET title = $1, status = 'running' WHERE id = $2`,
          [plan.project_title || params.title, project.id]
        );
      });

      this.updateAgentVisualState({
        projectId: project.id,
        department: 'director',
        visualState: 'idle',
        activeTaskId: null,
        activeTaskKey: null,
        statusBubble: 'Plano DAG validado e distribuído aos departamentos.',
      });

      await this.emitBudgetUpdate(project.id);

      // 3. Dispara o loop determinístico de agendamento do DAG
      void this.tickProject(project.id);

      return await this.getProject(project.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await pool.query(`UPDATE projects SET status = 'failed' WHERE id = $1`, [
        project.id,
      ]);
      this.updateAgentVisualState({
        projectId: project.id,
        department: 'director',
        visualState: 'error',
        activeTaskId: null,
        activeTaskKey: null,
        statusBubble: `Falha no planejamento: ${message}`,
      });
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Snapshot Completo para Sincronização Inicial / F5 (`OFFICE_SNAPSHOT`)
  // --------------------------------------------------------------------------

  public async getOfficeSnapshot(projectId: string): Promise<OfficeSnapshotPayload> {
    const project = await this.getProject(projectId);
    const tasks = await this.getProjectTasks(projectId);
    const artifacts = await this.getProjectArtifacts(projectId);
    const agents = this.ensureProjectAgentStates(projectId, tasks);

    return {
      project,
      agents,
      tasks,
      artifacts,
    };
  }

  // --------------------------------------------------------------------------
  // Motor de Resolução do DAG (`tickProject`)
  // --------------------------------------------------------------------------

  public async tickProject(projectId: string): Promise<void> {
    const project = await this.getProject(projectId);
    if (project.status !== 'running') {
      return;
    }

    // Verifica se o orçamento de tokens foi estourado
    if (project.tokensUsed >= project.tokenBudget) {
      await this.failProjectOnBudgetExceeded(projectId);
      return;
    }

    // 1. Promove tarefas 'pending' cujas dependências em `depends_on` já estão 'done'
    await withTransaction(async (client) => {
      const tasksRes = await client.query(
        `SELECT * FROM tasks WHERE project_id = $1 FOR UPDATE`,
        [projectId]
      );
      const tasks = tasksRes.rows.map((r) => this.mapTaskRow(r));
      const doneKeys = new Set(
        tasks.filter((t) => t.status === 'done').map((t) => t.taskKey)
      );

      for (const task of tasks) {
        if (task.status === 'pending') {
          const allDepsDone = task.dependsOn.every((depKey) =>
            doneKeys.has(depKey)
          );
          if (allDepsDone) {
            await client.query(
              `UPDATE tasks SET status = 'ready', updated_at = NOW() WHERE id = $1`,
              [task.id]
            );
          }
        }
      }
    });

    // 2. Verifica condição de término ou falha global do projeto
    const updatedTasks = await this.getProjectTasks(projectId);
    const allDone =
      updatedTasks.length > 0 && updatedTasks.every((t) => t.status === 'done');

    if (allDone) {
      await pool.query(
        `UPDATE projects SET status = 'completed' WHERE id = $1 AND status = 'running'`,
        [projectId]
      );
      await this.emitBudgetUpdate(projectId);
      return;
    }

    const anyFailed = updatedTasks.some((t) => t.status === 'failed');
    const anyActive = updatedTasks.some(
      (t) => t.status === 'running' || t.status === 'ready'
    );
    if (anyFailed && !anyActive) {
      await pool.query(
        `UPDATE projects SET status = 'failed' WHERE id = $1 AND status = 'running'`,
        [projectId]
      );
      await this.emitBudgetUpdate(projectId);
      return;
    }

    // 3. Despacha tarefas `ready` (respeitando 1 tarefa ativa por departamento por projeto)
    const busyDepartments = new Set(
      updatedTasks
        .filter((t) => t.status === 'running')
        .map((t) => t.department)
    );

    const readyTasks = updatedTasks.filter((t) => t.status === 'ready');
    for (const readyTask of readyTasks) {
      if (busyDepartments.has(readyTask.department)) {
        continue;
      }
      if (this.activeTaskRunners.has(readyTask.id)) {
        continue;
      }
      busyDepartments.add(readyTask.department);
      void this.executeTaskLifecycle(projectId, readyTask.id);
    }
  }

  // --------------------------------------------------------------------------
  // Ciclo de Vida de Execução de uma Tarefa (Executor -> Validador -> Gate)
  // --------------------------------------------------------------------------

  private async executeTaskLifecycle(
    projectId: string,
    taskId: string
  ): Promise<void> {
    if (this.activeTaskRunners.has(taskId)) return;
    this.activeTaskRunners.add(taskId);

    try {
      // Transição atômica: ready -> running (incrementando attempts)
      const task = await withTransaction(async (client) => {
        const projectRes = await client.query(
          `SELECT status, tokens_used, token_budget FROM projects WHERE id = $1 FOR UPDATE`,
          [projectId]
        );
        const proj = projectRes.rows[0];
        if (!proj || proj.status !== 'running') return null;
        if (proj.tokens_used >= proj.token_budget) return null;

        const taskRes = await client.query(
          `SELECT * FROM tasks WHERE id = $1 AND project_id = $2 FOR UPDATE`,
          [taskId, projectId]
        );
        const row = taskRes.rows[0];
        if (!row || row.status !== 'ready') return null;

        if (row.attempts >= row.max_attempts) {
          await client.query(
            `UPDATE tasks SET status = 'failed', last_error = 'Limite máximo de tentativas excedido.', updated_at = NOW() WHERE id = $1`,
            [taskId]
          );
          return null;
        }

        const updatedRes = await client.query(
          `UPDATE tasks
           SET status = 'running', attempts = attempts + 1, updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [taskId]
        );
        return this.mapTaskRow(updatedRes.rows[0]);
      });

      if (!task) {
        return;
      }

      const pod = this.pods.get(task.department);
      if (!pod) {
        throw new Error(
          `Nenhum Pod Especialista registrado para o departamento "${task.department}".`
        );
      }

      // Fase 1: Thinking (Preparando contexto apenas das dependências diretas)
      this.updateAgentVisualState({
        projectId,
        department: task.department,
        visualState: 'thinking',
        activeTaskId: task.id,
        activeTaskKey: task.taskKey,
        statusBubble: `Lendo artefatos de dependência (${task.dependsOn.length})...`,
        taskStatus: 'running',
        attempts: task.attempts,
      });

      const dependencyArtifacts = await this.loadDirectDependencyArtifacts(
        projectId,
        task.dependsOn
      );
      const humanFeedback = await this.getTaskHumanFeedback(task.id);

      // Fase 2: Working (Execução do Agente Especialista)
      this.updateAgentVisualState({
        projectId,
        department: task.department,
        visualState: 'working',
        activeTaskId: task.id,
        activeTaskKey: task.taskKey,
        statusBubble: `Executando: ${task.taskKey} (tentativa ${task.attempts}/${task.maxAttempts})`,
        taskStatus: 'running',
        attempts: task.attempts,
      });

      const executionInput: PodExecutionInput = {
        projectId,
        task,
        dependencyArtifacts,
        humanFeedback,
        tools: {
          useTool: async <TOutput = any>(
            toolName: string,
            rawInput: Record<string, unknown>
          ) => {
            return await this.toolRegistry.invokeTool<TOutput>({
              department: task.department,
              toolName,
              rawInput,
              onToolStart: (name) => {
                this.updateAgentVisualState({
                  projectId,
                  department: task.department,
                  visualState: 'working',
                  activeTaskId: task.id,
                  activeTaskKey: task.taskKey,
                  activeTool: name,
                  statusBubble: `Executando ferramenta: ${name}`,
                  taskStatus: 'running',
                  attempts: task.attempts,
                });
              },
              onToolFinish: (log) => {
                this.updateAgentVisualState({
                  projectId,
                  department: task.department,
                  visualState: 'working',
                  activeTaskId: task.id,
                  activeTaskKey: task.taskKey,
                  activeTool: null,
                  toolCallLog: log,
                  statusBubble: log.outputSummary,
                  taskStatus: 'running',
                  attempts: task.attempts,
                });
              },
            });
          },
        },
      };

      const output = await pod.execute(executionInput);

      // Contabiliza tokens consumidos e valida orçamento
      const budgetOk = await this.recordTokenUsage(projectId, output.tokensUsed);
      if (!budgetOk) {
        return;
      }

      // Fase 3: Validating (Validador Determinístico do Pod)
      this.updateAgentVisualState({
        projectId,
        department: task.department,
        visualState: 'validating',
        activeTaskId: task.id,
        activeTaskKey: task.taskKey,
        statusBubble: `Validando entrega de ${task.taskKey} deterministicamente...`,
        taskStatus: 'running',
        attempts: task.attempts,
      });

      const validation = pod.validate(output, executionInput);
      if (!validation.valid) {
        await this.handleTaskFailureOrRetry(
          projectId,
          task,
          `Falha na validação determinística: ${validation.errors.join('; ')}`
        );
        return;
      }

      // Fase 4: Persistência de Artefato Versionado
      const savedArtifact = await this.saveVersionedArtifact({
        projectId,
        task,
        artifactName: output.artifactName,
        content: output.content,
      });

      // Fase 5: Quality Gate (Human-in-the-Loop) ou Conclusão Direta
      if (task.requiresApproval) {
        await pool.query(
          `UPDATE tasks SET status = 'awaiting_approval', last_error = NULL, updated_at = NOW() WHERE id = $1`,
          [task.id]
        );

        const updatedTask: TaskDTO = { ...task, status: 'awaiting_approval' };

        this.updateAgentVisualState({
          projectId,
          department: task.department,
          visualState: 'awaiting_approval',
          activeTaskId: task.id,
          activeTaskKey: task.taskKey,
          statusBubble: `Aguardando aprovação humana para "${savedArtifact.name}" (v${savedArtifact.version})`,
          taskStatus: 'awaiting_approval',
          attempts: task.attempts,
        });

        const approvalPayload: ApprovalRequiredPayload = {
          projectId,
          task: updatedTask,
          artifact: savedArtifact,
          department: task.department,
          timestamp: new Date().toISOString(),
        };
        this.emit('APPROVAL_REQUIRED', approvalPayload);
      } else {
        await this.completeTaskAndEmitHandoff(projectId, task, savedArtifact);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const currentTask = await this.getTaskById(taskId);
      if (currentTask) {
        await this.handleTaskFailureOrRetry(projectId, currentTask, message);
      }
    } finally {
      this.activeTaskRunners.delete(taskId);
      void this.tickProject(projectId);
    }
  }

  // --------------------------------------------------------------------------
  // Comandos Human-in-the-Loop (`APPROVE_TASK`, `REJECT_TASK`, `PAUSE_PROJECT`)
  // --------------------------------------------------------------------------

  public async approveTask(projectId: string, taskId: string): Promise<void> {
    const task = await this.getTaskById(taskId);
    if (!task || task.projectId !== projectId) {
      throw new Error('Tarefa não encontrada neste projeto.');
    }
    if (task.status !== 'awaiting_approval') {
      throw new Error(
        `A tarefa "${task.taskKey}" não está aguardando aprovação (status atual: ${task.status}).`
      );
    }

    const latestArtifact = await this.getLatestTaskArtifact(projectId, task);
    if (!latestArtifact) {
      throw new Error('Artefato da tarefa não encontrado para aprovação.');
    }

    await this.completeTaskAndEmitHandoff(projectId, task, latestArtifact);
    void this.tickProject(projectId);
  }

  public async rejectTask(
    projectId: string,
    taskId: string,
    feedback: string
  ): Promise<void> {
    const task = await this.getTaskById(taskId);
    if (!task || task.projectId !== projectId) {
      throw new Error('Tarefa não encontrada neste projeto.');
    }
    if (task.status !== 'awaiting_approval') {
      throw new Error(
        `A tarefa "${task.taskKey}" não pode ser rejeitada no status "${task.status}".`
      );
    }

    if (task.attempts >= task.maxAttempts) {
      await pool.query(
        `UPDATE tasks
         SET status = 'failed', human_feedback = $1, last_error = 'Reprovada pelo humano no limite máximo de tentativas.', updated_at = NOW()
         WHERE id = $2`,
        [feedback, task.id]
      );

      this.updateAgentVisualState({
        projectId,
        department: task.department,
        visualState: 'error',
        activeTaskId: task.id,
        activeTaskKey: task.taskKey,
        statusBubble: `Falhou após ${task.attempts}/${task.maxAttempts} tentativas.`,
        taskStatus: 'failed',
        attempts: task.attempts,
      });
    } else {
      await pool.query(
        `UPDATE tasks
         SET status = 'ready', human_feedback = $1, last_error = $2, updated_at = NOW()
         WHERE id = $3`,
        [feedback, `Feedback humano: ${feedback}`, task.id]
      );

      this.updateAgentVisualState({
        projectId,
        department: task.department,
        visualState: 'thinking',
        activeTaskId: task.id,
        activeTaskKey: task.taskKey,
        statusBubble: `Reprogramando execução com feedback humano...`,
        taskStatus: 'ready',
        attempts: task.attempts,
      });
    }

    void this.tickProject(projectId);
  }

  public async pauseProject(projectId: string, reason?: string): Promise<void> {
    await pool.query(
      `UPDATE projects SET status = 'paused' WHERE id = $1 AND status = 'running'`,
      [projectId]
    );

    this.updateAgentVisualState({
      projectId,
      department: 'director',
      visualState: 'idle',
      activeTaskId: null,
      activeTaskKey: null,
      statusBubble: reason
        ? `Projeto pausado: ${reason}`
        : 'Projeto pausado pelo usuário.',
    });

    await this.emitBudgetUpdate(projectId);
  }

  public async retryFailedTask(projectId: string, taskId: string): Promise<void> {
    const task = await this.getTaskById(taskId);
    if (!task || task.projectId !== projectId) {
      throw new Error('Tarefa não encontrada neste projeto.');
    }
    if (task.status !== 'failed') {
      throw new Error(
        `A tarefa "${task.taskKey}" não está em estado de falha (status atual: ${task.status}).`
      );
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE projects SET status = 'running' WHERE id = $1 AND status IN ('failed', 'paused')`,
        [projectId]
      );
      await client.query(
        `UPDATE tasks
         SET status = 'ready', attempts = 0, last_error = NULL, updated_at = NOW()
         WHERE id = $1`,
        [task.id]
      );
    });

    this.updateAgentVisualState({
      projectId,
      department: task.department,
      visualState: 'thinking',
      activeTaskId: task.id,
      activeTaskKey: task.taskKey,
      statusBubble: 'Reiniciando execução do departamento...',
      taskStatus: 'ready',
      attempts: 0,
    });

    await this.emitBudgetUpdate(projectId);
    void this.tickProject(projectId);
  }

  // --------------------------------------------------------------------------
  // Handoff de Artefatos, Retry Determinístico e Controle de Budget
  // --------------------------------------------------------------------------

  private async completeTaskAndEmitHandoff(
    projectId: string,
    task: TaskDTO,
    artifact: ArtifactDTO
  ): Promise<void> {
    await pool.query(
      `UPDATE tasks SET status = 'done', last_error = NULL, updated_at = NOW() WHERE id = $1`,
      [task.id]
    );

    this.updateAgentVisualState({
      projectId,
      department: task.department,
      visualState: 'idle',
      activeTaskId: null,
      activeTaskKey: null,
      statusBubble: `Concluído: ${artifact.name} (v${artifact.version})`,
      taskStatus: 'done',
      attempts: task.attempts,
    });

    // Descobre quais departamentos dependem diretamente desta task_key para animar o handoff 3D
    const allTasks = await this.getProjectTasks(projectId);
    const targetDepartments = Array.from(
      new Set(
        allTasks
          .filter((t) => t.dependsOn.includes(task.taskKey))
          .map((t) => t.department as DepartmentId)
      )
    );

    if (targetDepartments.length > 0) {
      const handoffPayload: ArtifactHandoffPayload = {
        projectId,
        artifact,
        fromDepartment: task.department,
        toDepartments: targetDepartments,
        timestamp: new Date().toISOString(),
      };
      this.emit('ARTIFACT_HANDOFF', handoffPayload);
    }
  }

  private async handleTaskFailureOrRetry(
    projectId: string,
    task: TaskDTO,
    errorMessage: string
  ): Promise<void> {
    if (task.attempts < task.maxAttempts) {
      await pool.query(
        `UPDATE tasks SET status = 'ready', last_error = $1, updated_at = NOW() WHERE id = $2`,
        [errorMessage, task.id]
      );

      this.updateAgentVisualState({
        projectId,
        department: task.department,
        visualState: 'thinking',
        activeTaskId: task.id,
        activeTaskKey: task.taskKey,
        statusBubble: `Tentativa ${task.attempts}/${task.maxAttempts} falhou. Preparando retry...`,
        taskStatus: 'ready',
        attempts: task.attempts,
      });
    } else {
      await pool.query(
        `UPDATE tasks SET status = 'failed', last_error = $1, updated_at = NOW() WHERE id = $2`,
        [errorMessage, task.id]
      );

      this.updateAgentVisualState({
        projectId,
        department: task.department,
        visualState: 'error',
        activeTaskId: task.id,
        activeTaskKey: task.taskKey,
        statusBubble: `Erro fatal (${task.attempts}/${task.maxAttempts}): ${errorMessage}`,
        taskStatus: 'failed',
        attempts: task.attempts,
      });
    }
  }

  private async consumeTokensInTx(
    client: DbClient,
    projectId: string,
    tokensToAdd: number
  ): Promise<{ tokensUsed: number; tokenBudget: number; status: ProjectStatus }> {
    const res = await client.query(
      `UPDATE projects
       SET tokens_used = tokens_used + $1
       WHERE id = $2
       RETURNING tokens_used, token_budget, status`,
      [Math.max(0, Math.round(tokensToAdd)), projectId]
    );
    const row = res.rows[0];
    if (row.tokens_used > row.token_budget) {
      await client.query(`UPDATE projects SET status = 'failed' WHERE id = $1`, [
        projectId,
      ]);
      throw new Error(
        `Teto de orçamento de tokens excedido (${row.tokens_used}/${row.token_budget}).`
      );
    }
    return {
      tokensUsed: row.tokens_used,
      tokenBudget: row.token_budget,
      status: row.status,
    };
  }

  private async recordTokenUsage(
    projectId: string,
    tokensToAdd: number
  ): Promise<boolean> {
    const res = await pool.query(
      `UPDATE projects
       SET tokens_used = tokens_used + $1
       WHERE id = $2
       RETURNING tokens_used, token_budget, status`,
      [Math.max(0, Math.round(tokensToAdd)), projectId]
    );
    const row = res.rows[0];
    if (!row) return false;

    if (row.tokens_used > row.token_budget) {
      await this.failProjectOnBudgetExceeded(projectId);
      return false;
    }

    await this.emitBudgetUpdate(projectId);
    return true;
  }

  private async failProjectOnBudgetExceeded(projectId: string): Promise<void> {
    await pool.query(`UPDATE projects SET status = 'failed' WHERE id = $1`, [
      projectId,
    ]);
    this.updateAgentVisualState({
      projectId,
      department: 'director',
      visualState: 'error',
      activeTaskId: null,
      activeTaskKey: null,
      statusBubble: 'Orçamento máximo de tokens atingido. Execução abortada.',
    });
    await this.emitBudgetUpdate(projectId);
  }

  private async emitBudgetUpdate(projectId: string): Promise<void> {
    const project = await this.getProject(projectId);
    const payload: BudgetUpdatedPayload = {
      projectId,
      tokensUsed: project.tokensUsed,
      tokenBudget: project.tokenBudget,
      projectStatus: project.status,
      timestamp: new Date().toISOString(),
    };
    this.emit('BUDGET_UPDATED', payload);
  }

  // --------------------------------------------------------------------------
  // Persistência e Leitura Isolada de Artefatos (`depends_on`)
  // --------------------------------------------------------------------------

  /**
   * Busca SOMENTE a última versão do artefato de cada tarefa listada em `dependsOn`.
   * Nenhum histórico de chat ou artefato de outros nós fora de `depends_on` é exposto.
   */
  private async loadDirectDependencyArtifacts(
    projectId: string,
    dependsOnKeys: string[]
  ): Promise<DependencyArtifactContext[]> {
    if (dependsOnKeys.length === 0) {
      return [];
    }

    const res = await pool.query(
      `SELECT DISTINCT ON (t.task_key)
         t.task_key,
         t.department,
         a.name AS artifact_name,
         a.version,
         a.content
       FROM tasks t
       JOIN artifacts a ON a.task_id = t.id
       WHERE t.project_id = $1
         AND t.task_key = ANY($2::text[])
       ORDER BY t.task_key, a.version DESC`,
      [projectId, dependsOnKeys]
    );

    return res.rows.map((r) => ({
      taskKey: r.task_key,
      department: r.department,
      artifactName: r.artifact_name,
      version: r.version,
      content: r.content,
    }));
  }

  private async saveVersionedArtifact(params: {
    projectId: string;
    task: TaskDTO;
    artifactName: string;
    content: Record<string, unknown>;
  }): Promise<ArtifactDTO> {
    return await withTransaction(async (client) => {
      const versionRes = await client.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
         FROM artifacts
         WHERE task_id = $1`,
        [params.task.id]
      );
      const nextVersion: number = Number(versionRes.rows[0].next_version);

      const insertRes = await client.query(
        `INSERT INTO artifacts (project_id, task_id, name, content, version)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         RETURNING *`,
        [
          params.projectId,
          params.task.id,
          params.artifactName,
          JSON.stringify(params.content),
          nextVersion,
        ]
      );

      const row = insertRes.rows[0];
      return {
        id: row.id,
        projectId: row.project_id,
        taskId: row.task_id,
        taskKey: params.task.taskKey,
        department: params.task.department,
        name: row.name,
        content: row.content,
        version: row.version,
        createdAt: new Date(row.created_at).toISOString(),
      };
    });
  }

  // --------------------------------------------------------------------------
  // Gerenciamento de Estado Visual dos Bonecos e Helpers de Banco
  // --------------------------------------------------------------------------

  private ensureProjectAgentStates(
    projectId: string,
    tasks: TaskDTO[] = []
  ): Record<DepartmentId, AgentDeskStateDTO> {
    let map = this.agentStates.get(projectId);
    if (!map) {
      const now = new Date().toISOString();
      map = {
        director: {
          department: 'director',
          visualState: 'idle',
          activeTaskId: null,
          activeTaskKey: null,
          statusBubble: null,
          updatedAt: now,
        },
        research: {
          department: 'research',
          visualState: 'idle',
          activeTaskId: null,
          activeTaskKey: null,
          statusBubble: null,
          updatedAt: now,
        },
        design: {
          department: 'design',
          visualState: 'idle',
          activeTaskId: null,
          activeTaskKey: null,
          statusBubble: null,
          updatedAt: now,
        },
        engineering: {
          department: 'engineering',
          visualState: 'idle',
          activeTaskId: null,
          activeTaskKey: null,
          statusBubble: null,
          updatedAt: now,
        },
        growth: {
          department: 'growth',
          visualState: 'idle',
          activeTaskId: null,
          activeTaskKey: null,
          statusBubble: null,
          updatedAt: now,
        },
      };
      this.agentStates.set(projectId, map);
    }

    // Reconcilia com o banco caso o servidor tenha reiniciado (suporte real a F5 / crash recovery)
    for (const dept of ALL_DEPARTMENTS) {
      if (dept === 'director') continue;
      const activeTask = tasks.find(
        (t) =>
          t.department === dept &&
          (t.status === 'running' ||
            t.status === 'awaiting_approval' ||
            t.status === 'failed')
      );
      if (activeTask && map[dept].visualState === 'idle') {
        map[dept] = {
          department: dept,
          visualState:
            activeTask.status === 'awaiting_approval'
              ? 'awaiting_approval'
              : activeTask.status === 'failed'
                ? 'error'
                : 'working',
          activeTaskId: activeTask.id,
          activeTaskKey: activeTask.taskKey,
          statusBubble:
            activeTask.status === 'awaiting_approval'
              ? `Aguardando aprovação: ${activeTask.taskKey}`
              : activeTask.lastError ?? activeTask.objective,
          updatedAt: new Date().toISOString(),
        };
      }
    }

    return map;
  }

  private updateAgentVisualState(params: {
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
  }): void {
    const states = this.ensureProjectAgentStates(params.projectId);
    const timestamp = new Date().toISOString();
    const prev = states[params.department];
    const recentTools = params.toolCallLog
      ? [params.toolCallLog, ...(prev?.recentTools ?? [])].slice(0, 15)
      : prev?.recentTools ?? [];

    states[params.department] = {
      department: params.department,
      visualState: params.visualState,
      activeTaskId: params.activeTaskId,
      activeTaskKey: params.activeTaskKey,
      statusBubble: params.statusBubble,
      activeTool:
        params.activeTool !== undefined
          ? params.activeTool
          : prev?.activeTool ?? null,
      recentTools,
      updatedAt: timestamp,
    };

    const payload: AgentStateChangedPayload = {
      projectId: params.projectId,
      department: params.department,
      visualState: params.visualState,
      activeTaskId: params.activeTaskId,
      activeTaskKey: params.activeTaskKey,
      statusBubble: params.statusBubble,
      activeTool: states[params.department].activeTool,
      toolCallLog: params.toolCallLog,
      taskStatus: params.taskStatus,
      attempts: params.attempts,
      timestamp,
    };

    this.emit('AGENT_STATE_CHANGED', payload);
  }

  public async getProject(projectId: string): Promise<ProjectDTO> {
    const res = await pool.query(`SELECT * FROM projects WHERE id = $1`, [
      projectId,
    ]);
    if (res.rows.length === 0) {
      throw new Error(`Projeto "${projectId}" não encontrado.`);
    }
    return this.mapProjectRow(res.rows[0]);
  }

  public async getProjectTasks(projectId: string): Promise<TaskDTO[]> {
    const res = await pool.query(
      `SELECT * FROM tasks WHERE project_id = $1 ORDER BY created_at ASC`,
      [projectId]
    );
    return res.rows.map((r) => this.mapTaskRow(r));
  }

  public async getTaskById(taskId: string): Promise<TaskDTO | null> {
    const res = await pool.query(`SELECT * FROM tasks WHERE id = $1`, [taskId]);
    if (res.rows.length === 0) return null;
    return this.mapTaskRow(res.rows[0]);
  }

  private async getTaskHumanFeedback(taskId: string): Promise<string | null> {
    const res = await pool.query(
      `SELECT human_feedback FROM tasks WHERE id = $1`,
      [taskId]
    );
    return res.rows[0]?.human_feedback ?? null;
  }

  public async getProjectArtifacts(projectId: string): Promise<ArtifactDTO[]> {
    const res = await pool.query(
      `SELECT a.*, t.task_key, t.department
       FROM artifacts a
       JOIN tasks t ON t.id = a.task_id
       WHERE a.project_id = $1
       ORDER BY a.created_at DESC`,
      [projectId]
    );
    return res.rows.map((r) => ({
      id: r.id,
      projectId: r.project_id,
      taskId: r.task_id,
      taskKey: r.task_key,
      department: r.department,
      name: r.name,
      content: r.content,
      version: r.version,
      createdAt: new Date(r.created_at).toISOString(),
    }));
  }

  private async getLatestTaskArtifact(
    projectId: string,
    task: TaskDTO
  ): Promise<ArtifactDTO | null> {
    const res = await pool.query(
      `SELECT * FROM artifacts
       WHERE project_id = $1 AND task_id = $2
       ORDER BY version DESC
       LIMIT 1`,
      [projectId, task.id]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      projectId: row.project_id,
      taskId: row.task_id,
      taskKey: task.taskKey,
      department: task.department,
      name: row.name,
      content: row.content,
      version: row.version,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private mapProjectRow(row: Record<string, any>): ProjectDTO {
    return {
      id: row.id,
      title: row.title,
      rawScope: row.raw_scope,
      status: row.status,
      tokenBudget: Number(row.token_budget),
      tokensUsed: Number(row.tokens_used),
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private mapTaskRow(row: Record<string, any>): TaskDTO {
    return {
      id: row.id,
      projectId: row.project_id,
      taskKey: row.task_key,
      department: row.department,
      objective: row.objective,
      dependsOn: row.depends_on ?? [],
      status: row.status,
      attempts: Number(row.attempts),
      maxAttempts: Number(row.max_attempts),
      requiresApproval: Boolean(row.requires_approval),
      lastError: row.last_error ?? null,
    };
  }
}
