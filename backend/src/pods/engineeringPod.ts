import { z } from 'zod';
import type {
  DepartmentPod,
  DeterministicValidationResult,
  PodExecutionInput,
  PodExecutionOutput,
} from '../orchestrator/stateMachine.js';
import { generateValidatedJson } from '../llm/llmService.js';

// ============================================================================
// 1. CONTRATO DE ARQUITETURA & ENGENHARIA (ZOD SCHEMA)
// ============================================================================

export const StackDecisionSchema = z.object({
  layer: z.string().min(3),
  choice: z.string().min(2),
  rationale: z.string().min(20),
  tradeOffs: z.string().min(15),
});

export const ApiContractSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'WS']),
  path: z.string().min(2),
  purpose: z.string().min(10),
  authRequired: z.boolean(),
  requestExample: z.string().min(2),
  responseExample: z.string().min(2),
});

export const DatabaseEntitySummarySchema = z.object({
  tableName: z.string().min(2),
  purpose: z.string().min(10),
  keyColumns: z.array(z.string().min(2)).min(2),
});

export const EngineeringArtifactContentSchema = z.object({
  schemaVersion: z.literal('2.0'),
  consumedArtifacts: z.array(z.string()).min(1),
  architectureSummary: z.string().min(60),
  stackDecisions: z.array(StackDecisionSchema).min(4),
  mermaidFlowDiagram: z.string().min(50),
  databaseModel: z.object({
    engine: z.string().min(3),
    entities: z.array(DatabaseEntitySummarySchema).min(3),
    sqlSchema: z.string().min(120),
  }),
  apiContracts: z.array(ApiContractSchema).min(4),
  securityAndScalabilityNotes: z.array(z.string().min(15)).min(3),
  incorporatedFeedbackNotes: z.string().optional(),
});

export type EngineeringArtifactContent = z.infer<
  typeof EngineeringArtifactContentSchema
>;

// ============================================================================
// 2. POD ENGINEERING / ARQUITETURA (EXECUTOR REAL + VALIDADOR DETERMINÍSTICO)
// ============================================================================

export class EngineeringPod implements DepartmentPod {
  public readonly department = 'engineering' as const;

  public async execute(input: PodExecutionInput): Promise<PodExecutionOutput> {
    // 1. Consulta bibliotecas e referências reais no GitHub/NPM para embasar as decisões de stack
    const githubRefs = await input.tools.useTool<{
      repositories: Array<{
        fullName: string;
        url: string;
        stars: number;
        description: string;
      }>;
    }>('github_tech_radar', {
      topic: `${input.task.objective.slice(0, 45)} architecture`,
      limit: 3,
    });

    const npmRefs = await input.tools.useTool<{
      packages: Array<{ name: string; version: string; description: string }>;
    }>('npm_package_radar', {
      query: 'zod drizzle-orm fastify bullmq',
      limit: 4,
    });

    const consumedArtifacts = input.dependencyArtifacts.map(
      (d) => `${d.department}/${d.artifactName}@v${d.version}`
    );

    const feedbackSection = input.humanFeedback
      ? `\n\nFEEDBACK HUMANO OBRIGATÓRIO PARA REVISÃO (Tentativa ${input.task.attempts}):\n"${input.humanFeedback}"\nAplique todas as mudanças solicitadas na arquitetura/SQL/API e documente em "incorporatedFeedbackNotes".`
      : '';

    const compactResearchDeps = input.dependencyArtifacts.map((dep) => {
      if (dep.department === 'research') {
        const { liveWebSources: _ignored, ...restContent } = dep.content as Record<
          string,
          unknown
        >;
        return {
          department: dep.department,
          artifactName: dep.artifactName,
          content: restContent,
        };
      }
      return dep;
    });

    const llmResult = await generateValidatedJson({
      schema: EngineeringArtifactContentSchema,
      temperature: 0.2,
      maxTokens: 6144,
      systemInstruction: `Você é um Principal Software Architect Sênior.
Com base no escopo e no artefato de pesquisa recebido, projete a arquitetura real e completa do sistema.

Regras obrigatórias de saída (JSON estrito):
{
  "schemaVersion": "2.0",
  "consumedArtifacts": ["..."],
  "architectureSummary": "Visão arquitetural objetiva (mín. 60 chars) explicando os componentes e fluxo de dados",
  "stackDecisions": [
    {
      "layer": "Frontend | Backend API | Banco de Dados | Cache/Filas | Auth",
      "choice": "Tecnologia exata escolhida",
      "rationale": "Por que essa escolha atende ao domínio e requisitos da pesquisa",
      "tradeOffs": "Limitações ou custos assumidos nessa escolha"
    }
  ],
  "mermaidFlowDiagram": "flowchart TD\\n  ...",
  "databaseModel": {
    "engine": "PostgreSQL 16",
    "entities": [
      { "tableName": "users", "purpose": "...", "keyColumns": ["id UUID PK", "email TEXT UNIQUE"] }
    ],
    "sqlSchema": "CREATE TABLE ... (DDL SQL completo e válido com chaves primárias, estrangeiras e índices)"
  },
  "apiContracts": [
    {
      "method": "POST",
      "path": "/api/v1/...",
      "purpose": "Descrição objetiva do endpoint",
      "authRequired": true,
      "requestExample": "{ \\"campo\\": \\"valor\\" }",
      "responseExample": "{ \\"id\\": \\"uuid\\", \\"status\\": \\"ok\\" }"
    }
  ],
  "securityAndScalabilityNotes": ["Garantia prática 1", "Garantia prática 2", "Garantia prática 3"],
  "incorporatedFeedbackNotes": "Opcional, obrigatório se houver feedback humano"
}

Regras críticas para o Mermaid e SQL:
1. "mermaidFlowDiagram" DEVE começar com "flowchart TD" ou "flowchart LR" ou "sequenceDiagram". Sempre coloque textos com espaços ou parênteses entre aspas nos nós, ex: A["Cliente Web"] --> B["API Gateway"]. Nunca use tags HTML (<br/>, etc.) dentro do Mermaid.
2. "sqlSchema" DEVE conter múltiplas instruções "CREATE TABLE" reais e específicas ao domínio do projeto, usando tipos PostgreSQL válidos.
3. Não use emojis, TODOs ou placeholders genéricos. Idioma: Português (Brasil).`,
      userPrompt: `Objetivo:\n${input.task.objective}${feedbackSection}\n\nArtefatos das dependências diretas (Pesquisa):\n${JSON.stringify(compactResearchDeps, null, 2)}\n\nReferências reais GitHub/NPM:\n${JSON.stringify({ github: githubRefs.data.repositories.slice(0, 3), npm: npmRefs.data.packages.slice(0, 3) }, null, 2)}`,
      extraValidator: (data) => {
        return this.validateArchitectureRules(data, input);
      },
    });

    const content: EngineeringArtifactContent = {
      ...llmResult.data,
      consumedArtifacts:
        consumedArtifacts.length > 0
          ? consumedArtifacts
          : llmResult.data.consumedArtifacts,
    };

    // Salva artefatos técnicos reais no workspace do projeto
    await input.tools.useTool('workspace_write_file', {
      projectId: input.projectId,
      relativePath: 'engineering/schema.sql',
      content: content.databaseModel.sqlSchema,
    });

    await input.tools.useTool('workspace_write_file', {
      projectId: input.projectId,
      relativePath: 'engineering/architecture.mmd',
      content: content.mermaidFlowDiagram,
    });

    await input.tools.useTool('workspace_write_file', {
      projectId: input.projectId,
      relativePath: 'engineering/api_contracts.json',
      content: JSON.stringify(content.apiContracts, null, 2),
    });

    return {
      artifactName: 'system_architecture_and_contracts',
      content: content as unknown as Record<string, unknown>,
      tokensUsed: llmResult.tokensUsed,
    };
  }

  private validateArchitectureRules(
    data: EngineeringArtifactContent,
    input: PodExecutionInput
  ): string[] {
    const errors: string[] = [];

    const diagram = data.mermaidFlowDiagram.trim();
    if (
      !/^(flowchart\s+(TD|TB|LR|RL)|sequenceDiagram|graph\s+(TD|LR))/i.test(
        diagram
      )
    ) {
      errors.push(
        'mermaidFlowDiagram deve iniciar com "flowchart TD", "flowchart LR" ou "sequenceDiagram".'
      );
    }
    if (!diagram.includes('-->') && !diagram.includes('->>')) {
      errors.push(
        'mermaidFlowDiagram não contém conexões válidas entre nós ("-->" ou "->>").'
      );
    }

    const sqlUpper = data.databaseModel.sqlSchema.toUpperCase();
    const createTableCount = (sqlUpper.match(/CREATE\s+TABLE/g) ?? []).length;
    if (createTableCount < 3) {
      errors.push(
        `sqlSchema deve definir pelo menos 3 tabelas reais com CREATE TABLE (encontradas: ${createTableCount}).`
      );
    }

    const serialized = JSON.stringify(data);
    if (/\b(TODO|TBD|FIXME|lorem ipsum|placeholder)\b/i.test(serialized)) {
      errors.push('O blueprint contém marcadores proibidos (TODO/TBD/placeholder).');
    }

    if (
      input.humanFeedback &&
      (!data.incorporatedFeedbackNotes ||
        data.incorporatedFeedbackNotes.trim().length < 10)
    ) {
      errors.push(
        'Há feedback humano pendente, mas "incorporatedFeedbackNotes" não documentou a revisão.'
      );
    }

    return errors;
  }

  public validate(
    output: PodExecutionOutput,
    input: PodExecutionInput
  ): DeterministicValidationResult {
    const parsed = EngineeringArtifactContentSchema.safeParse(output.content);
    if (!parsed.success) {
      return {
        valid: false,
        errors: parsed.error.issues.map(
          (i) => `Schema [${i.path.join('.')}]: ${i.message}`
        ),
      };
    }

    const errors = this.validateArchitectureRules(parsed.data, input);
    return { valid: errors.length === 0, errors };
  }
}
