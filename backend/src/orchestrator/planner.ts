import { z } from 'zod';
import { generateValidatedJson } from '../llm/llmService.js';

// ============================================================================
// 1. CONTRATO ZOD DO PLANO GERADO PELO AGENTE DIRETOR (LLM)
// ============================================================================

export const PlannedTaskDepartmentSchema = z.enum([
  'research',
  'design',
  'engineering',
  'growth',
  'builder',
]);

export const PlannedTaskSchema = z.object({
  task_key: z
    .string()
    .regex(/^[a-z0-9_]+$/, 'task_key deve ser snake_case alfanumérico'),
  department: PlannedTaskDepartmentSchema,
  objective: z.string().min(20, 'O objetivo da tarefa deve ser detalhado e específico ao escopo'),
  depends_on: z.array(z.string()).default([]),
  max_attempts: z.number().int().min(1).max(5).default(3),
  requires_approval: z.boolean().default(false),
});

export const ExecutionPlanSchema = z.object({
  project_title: z.string().min(3),
  tasks: z
    .array(PlannedTaskSchema)
    .min(3, 'O plano deve conter pelo menos 3 tarefas especializadas')
    .max(12, 'O plano não pode exceder 12 tarefas'),
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
// 3. SERVIÇO DO PLANNER REAL (AGENTE DIRETOR VIA LLM + KAHN DAG)
// ============================================================================

export interface LLMPlannerProvider {
  generateValidatedPlan(rawScope: string): Promise<{
    plan: ExecutionPlan;
    topologicalTasks: PlannedTask[];
    tokensUsed: number;
  }>;
}

export class RealDirectorPlannerProvider implements LLMPlannerProvider {
  async generateValidatedPlan(rawScope: string): Promise<{
    plan: ExecutionPlan;
    topologicalTasks: PlannedTask[];
    tokensUsed: number;
  }> {
    let validatedTopoOrder: PlannedTask[] = [];

    const result = await generateValidatedJson({
      schema: ExecutionPlanSchema,
      temperature: 0.2,
      systemInstruction: `Você é o Diretor Executivo de Produto e Engenharia (DAG Planner) de um estúdio de software sênior.
Sua única responsabilidade é transformar o escopo do usuário em um Grafo Acíclico Dirigido (DAG) de tarefas especializadas entre os departamentos:
- "research": Pesquisa profunda de mercado, concorrentes reais, modelos de preço, dores de usuários e recomendação de posicionamento.
- "engineering": Arquitetura de sistema e engenharia técnica (decisões de stack justificadas, fluxo Mermaid, modelagem SQL e contratos de API).
- "design": Design de interface e UX (paleta, tipografia e código HTML/Tailwind responsivo completo das telas principais).
- "growth": Estratégia de lançamento, posicionamento comercial, canais de aquisição e modelo de precificação.
- "builder": Construção real do Frontend MVP em React + Vite + TypeScript + Tailwind + localStorage dentro do template base, geração da pasta /docs e verificação com tsc --noEmit + vite build.

Regras obrigatórias:
1. Retorne JSON estrito com:
   {
     "project_title": "Título curto e claro do produto",
     "tasks": [
       {
         "task_key": "snake_case_unico",
         "department": "research" | "design" | "engineering" | "growth" | "builder",
         "objective": "Objetivo específico e detalhado adaptado ao domínio exato pedido pelo usuário",
         "depends_on": ["task_key_anterior"],
         "max_attempts": 3,
         "requires_approval": true | false
       }
     ]
   }
2. Crie exatamente 1 tarefa por departamento essencial (5 tarefas encadeadas no DAG):
   - "research": depends_on: [], requires_approval: true.
   - "engineering": depends_on: [research_key], requires_approval: true.
   - "design": depends_on: [research_key, engineering_key], requires_approval: true.
   - "growth": depends_on: [engineering_key, design_key], requires_approval: false.
   - "builder": depends_on: [research_key, engineering_key, design_key, growth_key], requires_approval: true (constrói o MVP React completo com CRUD real em localStorage e /docs, validado via build).
3. Os objetivos devem citar explicitamente o domínio, público-alvo e funcionalidades centrais do escopo fornecido.`,
      userPrompt: `Escopo do projeto informado pelo usuário:\n"""\n${rawScope}\n"""\n\nGere o plano DAG em JSON.`,
      extraValidator: (plan) => {
        const errors: string[] = [];
        try {
          validatedTopoOrder = validateExecutionPlanDAG(plan);
        } catch (err) {
          errors.push(err instanceof Error ? err.message : String(err));
        }
        return errors;
      },
    });

    if (validatedTopoOrder.length === 0) {
      validatedTopoOrder = validateExecutionPlanDAG(result.data);
    }

    return {
      plan: result.data,
      topologicalTasks: validatedTopoOrder,
      tokensUsed: result.tokensUsed,
    };
  }
}

export class DirectorPlanner {
  constructor(
    private readonly provider: LLMPlannerProvider = new RealDirectorPlannerProvider()
  ) {}

  async createValidatedPlan(rawScope: string): Promise<{
    plan: ExecutionPlan;
    topologicalTasks: PlannedTask[];
    tokensUsed: number;
  }> {
    return await this.provider.generateValidatedPlan(rawScope);
  }
}
