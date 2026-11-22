import { z } from 'zod';
import type {
  DepartmentPod,
  DeterministicValidationResult,
  PodExecutionInput,
  PodExecutionOutput,
} from '../orchestrator/stateMachine.js';

// ============================================================================
// 1. POD DESIGN (Consome artefato de `research` via `depends_on`)
// ============================================================================

const DesignArtifactSchema = z.object({
  schemaVersion: z.literal('1.0'),
  basedOnDependencyArtifacts: z.array(z.string()).min(1),
  designTokens: z.object({
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    surfaceColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    typographyScale: z.string().min(3),
  }),
  coreUserFlows: z
    .array(
      z.object({
        flowName: z.string().min(5),
        steps: z.array(z.string().min(5)).min(3),
      })
    )
    .min(2),
  componentHierarchy: z.array(z.string().min(3)).min(3),
  incorporatedFeedback: z.string().optional(),
});

export class DesignPod implements DepartmentPod {
  public readonly department = 'design' as const;

  public async execute(input: PodExecutionInput): Promise<PodExecutionOutput> {
    // 1. Pesquisa padrões de Design System / UI na internet
    await input.tools.useTool('web_search', {
      query: 'B2B SaaS design system tokens UI patterns',
      limit: 3,
    });

    const depNames = input.dependencyArtifacts.map(
      (d) => `${d.taskKey}:${d.artifactName}@v${d.version}`
    );

    const content = {
      schemaVersion: '1.0' as const,
      basedOnDependencyArtifacts:
        depNames.length > 0 ? depNames : ['standalone_design_scope'],
      designTokens: {
        primaryColor: '#38bdf8',
        surfaceColor: '#0f172a',
        typographyScale: 'Inter / JetBrains Mono Modular Scale',
      },
      coreUserFlows: [
        {
          flowName: 'Self-Service Workspace Provisioning',
          steps: [
            'Definir escopo e limites de orçamento no HUD',
            'Inspecionar DAG gerado pelo Diretor em tempo real',
            'Aprovar entregas críticas nos Quality Gates laterais',
          ],
        },
        {
          flowName: 'Auditoria de Artefatos Versionados',
          steps: [
            'Selecionar estação de trabalho 3D do departamento',
            'Comparar versão atual do artefato JSON/Markdown',
            'Emitir aprovação ou feedback estruturado para retry',
          ],
        },
      ],
      componentHierarchy: [
        'AppShellHUD',
        'IsometricOfficeCanvas',
        'DepartmentWorkstation3D',
        'QualityGateInspectorDrawer',
      ],
      ...(input.humanFeedback
        ? { incorporatedFeedback: `Ajuste aplicado: ${input.humanFeedback}` }
        : {}),
    };

    // 2. Salva especificação de Design Tokens em disco
    await input.tools.useTool('workspace_write_file', {
      projectId: input.projectId,
      relativePath: 'design/design_system_tokens.json',
      content: JSON.stringify(content, null, 2),
    });

    return {
      artifactName: 'ui_ux_architecture_spec',
      tokensUsed: 1200,
      content,
    };
  }

  public validate(
    output: PodExecutionOutput,
    input: PodExecutionInput
  ): DeterministicValidationResult {
    const errors: string[] = [];
    const parsed = DesignArtifactSchema.safeParse(output.content);
    if (!parsed.success) {
      return {
        valid: false,
        errors: parsed.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`
        ),
      };
    }

    if (
      input.task.dependsOn.length > 0 &&
      input.dependencyArtifacts.length === 0
    ) {
      errors.push(
        'A tarefa possui depends_on declarados, mas nenhum artefato de dependência foi recebido no contexto.'
      );
    }

    return { valid: errors.length === 0, errors };
  }
}

// ============================================================================
// 2. POD ENGINEERING (Consome artefatos de `research` e `design`)
// ============================================================================

const EngineeringArtifactSchema = z.object({
  schemaVersion: z.literal('1.0'),
  consumedArtifacts: z.array(z.string()).min(1),
  serviceModules: z
    .array(
      z.object({
        moduleName: z.string().min(3),
        responsibility: z.string().min(10),
        exposedContracts: z.array(z.string().min(3)).min(1),
      })
    )
    .min(2),
  databaseMigrations: z.array(z.string().min(5)).min(1),
  deterministicGuarantees: z.array(z.string().min(10)).min(2),
  incorporatedFeedback: z.string().optional(),
});

export class EngineeringPod implements DepartmentPod {
  public readonly department = 'engineering' as const;

  public async execute(input: PodExecutionInput): Promise<PodExecutionOutput> {
    // 1. Consulta repositórios reais no GitHub via github_tech_radar
    await input.tools.useTool('github_tech_radar', {
      topic: 'nodejs state-machine websocket postgresql',
      limit: 3,
    });

    const consumed = input.dependencyArtifacts.map(
      (d) => `${d.department}/${d.artifactName}@v${d.version}`
    );

    const content = {
      schemaVersion: '1.0' as const,
      consumedArtifacts:
        consumed.length > 0 ? consumed : ['direct_engineering_task'],
      serviceModules: [
        {
          moduleName: 'DagOrchestratorCore',
          responsibility:
            'Validação topológica via Algoritmo de Kahn e agendamento transacional de tarefas.',
          exposedContracts: ['createAndPlanProject', 'tickProject'],
        },
        {
          moduleName: 'IsolatedContextResolver',
          responsibility:
            'Carregamento estrito da última versão dos artefatos listados em depends_on.',
          exposedContracts: [
            'loadDirectDependencyArtifacts',
            'saveVersionedArtifact',
          ],
        },
      ],
      databaseMigrations: [
        '001_initial_schema.sql (projects, tasks, artifacts JSONB)',
      ],
      deterministicGuarantees: [
        'Locks transacionais FOR UPDATE impedem condição de corrida entre múltiplos workers',
        'Aborto imediato de execução ao atingir token_budget ou max_attempts',
      ],
      ...(input.humanFeedback
        ? { incorporatedFeedback: `Ajuste técnico: ${input.humanFeedback}` }
        : {}),
    };

    // 2. Salva blueprint técnico no workspace
    await input.tools.useTool('workspace_write_file', {
      projectId: input.projectId,
      relativePath: 'engineering/architecture_blueprint.json',
      content: JSON.stringify(content, null, 2),
    });

    return {
      artifactName: 'technical_blueprint_and_contracts',
      tokensUsed: 1650,
      content,
    };
  }

  public validate(
    output: PodExecutionOutput
  ): DeterministicValidationResult {
    const parsed = EngineeringArtifactSchema.safeParse(output.content);
    if (!parsed.success) {
      return {
        valid: false,
        errors: parsed.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`
        ),
      };
    }
    return { valid: true, errors: [] };
  }
}

// ============================================================================
// 3. POD GROWTH (Consome artefato de `engineering`)
// ============================================================================

const GrowthArtifactSchema = z.object({
  schemaVersion: z.literal('1.0'),
  consumedArtifacts: z.array(z.string()).min(1),
  launchChannels: z
    .array(
      z.object({
        channel: z.string().min(3),
        targetMetric: z.string().min(5),
        experimentHypothesis: z.string().min(15),
      })
    )
    .min(2),
  northStarMetric: z.string().min(5),
});

export class GrowthPod implements DepartmentPod {
  public readonly department = 'growth' as const;

  public async execute(input: PodExecutionInput): Promise<PodExecutionOutput> {
    // 1. Pesquisa tendências de Go-To-Market e Product-Led Growth na web
    await input.tools.useTool('web_search', {
      query: 'B2B SaaS Product Led Growth onboarding activation metrics',
      limit: 3,
    });

    const consumed = input.dependencyArtifacts.map(
      (d) => `${d.department}/${d.artifactName}@v${d.version}`
    );

    const content = {
      schemaVersion: '1.0' as const,
      consumedArtifacts:
        consumed.length > 0 ? consumed : ['direct_growth_task'],
      northStarMetric:
        'Projetos multiagente concluídos com 100% dos artefatos validados no primeiro ciclo',
      launchChannels: [
        {
          channel: 'Product-Led Onboarding Interativo 3D',
          targetMetric: 'Taxa de ativação > 65% na primeira sessão',
          experimentHypothesis:
            'Visualizar handoffs de artefatos em 3D aumenta a confiança e reduz o tempo de revisão nos Quality Gates.',
        },
        {
          channel: 'Comunidades de Engenharia de Sistemas & IA',
          targetMetric: 'Custo de aquisição orgânico próximo de zero',
          experimentHypothesis:
            'Demonstrar orquestração DAG determinística sem frameworks pesados atrai líderes técnicos.',
        },
      ],
    };

    // 2. Salva plano de GTM no workspace
    await input.tools.useTool('workspace_write_file', {
      projectId: input.projectId,
      relativePath: 'growth/gtm_playbook.json',
      content: JSON.stringify(content, null, 2),
    });

    return {
      artifactName: 'gtm_and_growth_experiment_plan',
      tokensUsed: 980,
      content,
    };
  }

  public validate(
    output: PodExecutionOutput
  ): DeterministicValidationResult {
    const parsed = GrowthArtifactSchema.safeParse(output.content);
    if (!parsed.success) {
      return {
        valid: false,
        errors: parsed.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`
        ),
      };
    }
    return { valid: true, errors: [] };
  }
}
