import { z } from 'zod';

// ============================================================================
// 1. CONTRATO ZOD DO PLANO GERADO PELO AGENTE DIRETOR (LLM)
// ============================================================================

export const PlannedTaskDepartmentSchema = z.enum([
  'research',
  'design',
  'engineering',
  'growth',
]);

export const PlannedTaskSchema = z.object({
  task_key: z
    .string()
    .regex(/^[a-z0-9_]+$/, 'task_key deve ser snake_case alfanumérico'),
  department: PlannedTaskDepartmentSchema,
  objective: z.string().min(10, 'O objetivo da tarefa deve ser detalhado'),
  depends_on: z.array(z.string()).default([]),
  max_attempts: z.number().int().min(1).max(5).default(3),
  requires_approval: z.boolean().default(false),
});

export const ExecutionPlanSchema = z.object({
  project_title: z.string().min(3),
  tasks: z
    .array(PlannedTaskSchema)
    .min(1, 'O plano deve conter pelo menos uma tarefa')
    .max(25, 'O plano não pode exceder 25 tarefas'),
});

export type PlannedTask = z.infer<typeof PlannedTaskSchema>;
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

// ============================================================================
// 2. VALIDAÇÃO DETERMINÍSTICA DO DAG (UNICIDADE, REFERÊNCIAS E CICLOS)
// ============================================================================

export class DagValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DagValidationError';
  }
}

/**
 * Valida se a lista de tarefas forma um Grafo Acíclico Dirigido (DAG) válido:
 * 1. Chaves `task_key` únicas.
 * 2. Todas as referências em `depends_on` existem no plano.
 * 3. Nenhuma tarefa depende de si mesma.
 * 4. Ausência de ciclos verificada via Algoritmo de Kahn (ordenação topológica).
 */
export function validateExecutionPlanDAG(plan: ExecutionPlan): PlannedTask[] {
  const taskMap = new Map<string, PlannedTask>();

  for (const task of plan.tasks) {
    if (taskMap.has(task.task_key)) {
      throw new DagValidationError(
        `task_key duplicada encontrada no plano: "${task.task_key}"`
      );
    }
    taskMap.set(task.task_key, task);
  }

  // Grafo de adjacência (u -> dependentes de u) e grau de entrada (in-degree)
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const task of plan.tasks) {
    inDegree.set(task.task_key, 0);
    dependents.set(task.task_key, []);
  }

  for (const task of plan.tasks) {
    const uniqueDeps = new Set(task.depends_on);
    for (const depKey of uniqueDeps) {
      if (depKey === task.task_key) {
        throw new DagValidationError(
          `Auto-dependência detectada na tarefa "${task.task_key}"`
        );
      }
      if (!taskMap.has(depKey)) {
        throw new DagValidationError(
          `A tarefa "${task.task_key}" depende de "${depKey}", que não existe no plano.`
        );
      }

      dependents.get(depKey)!.push(task.task_key);
      inDegree.set(task.task_key, (inDegree.get(task.task_key) ?? 0) + 1);
    }
  }

  // Algoritmo de Kahn para ordenação topológica e detecção de ciclos
  const queue: string[] = [];
  for (const [key, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(key);
    }
  }

  const sortedOrder: PlannedTask[] = [];

  while (queue.length > 0) {
    const currentKey = queue.shift()!;
    sortedOrder.push(taskMap.get(currentKey)!);

    for (const dependentKey of dependents.get(currentKey) ?? []) {
      const nextDegree = inDegree.get(dependentKey)! - 1;
      inDegree.set(dependentKey, nextDegree);
      if (nextDegree === 0) {
        queue.push(dependentKey);
      }
    }
  }

  if (sortedOrder.length !== plan.tasks.length) {
    const cyclicKeys = plan.tasks
      .map((t) => t.task_key)
      .filter((k) => (inDegree.get(k) ?? 0) > 0);
    throw new DagValidationError(
      `Ciclo de dependência detectado no DAG envolvendo as tarefas: [${cyclicKeys.join(', ')}]`
    );
  }

  return sortedOrder;
}

// ============================================================================
// 3. SERVIÇO DO PLANNER (AGENTE DIRETOR)
// ============================================================================

export interface LLMPlannerProvider {
  generateRawPlan(rawScope: string): Promise<{
    rawJson: unknown;
    tokensUsed: number;
  }>;
}

/**
 * Fallback/Default Planner determinístico caso nenhuma chave de LLM externa seja injetada,
 * ou adaptador para chamada Structured Output da LLM.
 */
export class DefaultDirectorPlannerProvider implements LLMPlannerProvider {
  async generateRawPlan(rawScope: string): Promise<{
    rawJson: unknown;
    tokensUsed: number;
  }> {
    const title =
      rawScope.trim().slice(0, 60) || 'Projeto Multiagente Autônomo';

    const rawJson: ExecutionPlan = {
      project_title: title,
      tasks: [
        {
          task_key: 'market_and_technical_research',
          department: 'research',
          objective: `Realizar levantamento de requisitos, benchmarks técnicos e riscos para o escopo: ${rawScope}`,
          depends_on: [],
          max_attempts: 3,
          requires_approval: false,
        },
        {
          task_key: 'ui_ux_system_design',
          department: 'design',
          objective:
            'Definir arquitetura de interface, fluxos de usuário e tokens visuais baseados no relatório de pesquisa.',
          depends_on: ['market_and_technical_research'],
          max_attempts: 3,
          requires_approval: true,
        },
        {
          task_key: 'core_architecture_implementation',
          department: 'engineering',
          objective:
            'Especificar contratos técnicos, esquema de dados e módulos de implementação baseados na pesquisa e no design aprovado.',
          depends_on: ['market_and_technical_research', 'ui_ux_system_design'],
          max_attempts: 3,
          requires_approval: true,
        },
        {
          task_key: 'launch_and_growth_strategy',
          department: 'growth',
          objective:
            'Criar plano de go-to-market, métricas de ativação e canais de distribuição alinhados ao produto construído.',
          depends_on: ['core_architecture_implementation'],
          max_attempts: 3,
          requires_approval: false,
        },
      ],
    };

    return {
      rawJson,
      tokensUsed: 850,
    };
  }
}

export class DirectorPlanner {
  constructor(
    private readonly provider: LLMPlannerProvider = new DefaultDirectorPlannerProvider()
  ) {}

  /**
   * Gera o plano via LLM, valida o schema com Zod e verifica se o DAG é acíclico.
   */
  async createValidatedPlan(rawScope: string): Promise<{
    plan: ExecutionPlan;
    topologicalTasks: PlannedTask[];
    tokensUsed: number;
  }> {
    const { rawJson, tokensUsed } = await this.provider.generateRawPlan(rawScope);

    // 1. Validação Estrutural (Zod)
    const parsedPlan = ExecutionPlanSchema.parse(rawJson);

    // 2. Validação Determinística de Grafo (DAG sem ciclos)
    const topologicalTasks = validateExecutionPlanDAG(parsedPlan);

    return {
      plan: parsedPlan,
      topologicalTasks,
      tokensUsed,
    };
  }
}
