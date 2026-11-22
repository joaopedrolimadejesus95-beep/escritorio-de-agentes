import { z } from 'zod';
import type {
  DepartmentPod,
  DeterministicValidationResult,
  PodExecutionInput,
  PodExecutionOutput,
} from '../orchestrator/stateMachine.js';

// ============================================================================
// 1. CONTRATO ESTRUTURADO DO ARTEFATO DE RESEARCH (ZOD SCHEMA)
// ============================================================================

export const CompetitorBenchmarkSchema = z.object({
  name: z.string().min(2),
  strengths: z.array(z.string().min(5)).min(2),
  weaknesses: z.array(z.string().min(5)).min(1),
  differentiationOpportunity: z.string().min(15),
});

export const TechnicalRiskItemSchema = z.object({
  riskId: z.string().regex(/^RISK-\d{2}$/, 'Formato esperado: RISK-01'),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().min(15),
  mitigationStrategy: z.string().min(20),
});

export const FunctionalRequirementSchema = z.object({
  reqId: z.string().regex(/^REQ-\d{2}$/, 'Formato esperado: REQ-01'),
  title: z.string().min(5),
  acceptanceCriteria: z.array(z.string().min(10)).min(2),
});

export const ResearchArtifactContentSchema = z.object({
  schemaVersion: z.literal('1.0'),
  executiveSummary: z.string().min(50),
  targetPersonas: z
    .array(
      z.object({
        role: z.string().min(3),
        painPoints: z.array(z.string().min(8)).min(2),
        expectedOutcome: z.string().min(15),
      })
    )
    .min(2),
  competitorBenchmarks: z.array(CompetitorBenchmarkSchema).min(2),
  functionalRequirements: z.array(FunctionalRequirementSchema).min(3),
  technicalRisks: z.array(TechnicalRiskItemSchema).min(2),
  recommendedArchitectureStack: z.object({
    frontend: z.string().min(3),
    backend: z.string().min(3),
    database: z.string().min(3),
    rationale: z.string().min(25),
  }),
  incorporatedFeedbackNotes: z.string().optional(),
  markdownReport: z.string().min(120),
});

export type ResearchArtifactContent = z.infer<
  typeof ResearchArtifactContentSchema
>;

// ============================================================================
// 2. PROVEDOR DO AGENTE EXECUTOR DE RESEARCH (LLM / STRUCTURED OUTPUT)
// ============================================================================

export interface ResearchExecutorProvider {
  generateResearchArtifact(input: PodExecutionInput): Promise<{
    rawContent: Record<string, unknown>;
    tokensUsed: number;
  }>;
}

export class DefaultResearchExecutorProvider
  implements ResearchExecutorProvider
{
  async generateResearchArtifact(input: PodExecutionInput): Promise<{
    rawContent: Record<string, unknown>;
    tokensUsed: number;
  }> {
    // Simula latência realista de raciocínio e síntese para visualização no escritório 3D
    await new Promise((r) => setTimeout(r, 1400));

    const scopeSummary = input.task.objective;
    const feedbackNote = input.humanFeedback
      ? `Revisão aplicada na tentativa #${input.task.attempts} atendendo ao feedback humano: "${input.humanFeedback}".`
      : undefined;

    const artifact: ResearchArtifactContent = {
      schemaVersion: '1.0',
      executiveSummary: `Análise técnica e mercadológica completa para "${scopeSummary}". Identificados 3 requisitos críticos de arquitetura, 2 benchmarks competitivos diretos e matriz de mitigação de riscos para operação determinística.`,
      targetPersonas: [
        {
          role: 'Head de Produto / Operações',
          painPoints: [
            'Baixa visibilidade sobre gargalos operacionais em tempo real',
            'Alto custo de coordenação manual entre equipes multidisciplinares',
          ],
          expectedOutcome:
            'Painel preditivo self-service com alertas acionáveis e redução de 40% no tempo de ciclo.',
        },
        {
          role: 'Engenheiro de Dados / Arquiteto de Soluções',
          painPoints: [
            'Pipelines frágeis sem validação determinística de schema',
            'Falta de rastreabilidade de versão nos artefatos de configuração',
          ],
          expectedOutcome:
            'Contratos estritos validados em tempo de execução com auditoria completa por versão.',
        },
      ],
      competitorBenchmarks: [
        {
          name: 'LegacyEnterprise BI',
          strengths: [
            'Ampla conectividade com ERPs legados',
            'Governança de acesso granular consolidada',
          ],
          weaknesses: [
            'Onboarding lento que exige semanas de consultoria técnica',
          ],
          differentiationOpportunity:
            'Oferecer onboarding self-service guiado em menos de 5 minutos com templates pré-validados.',
        },
        {
          name: 'FastMetrics Cloud',
          strengths: [
            'Interface moderna e carregamento rápido',
            'Modelo de precificação transparente por uso',
          ],
          weaknesses: [
            'Ausência de motor preditivo customizável e validação determinística',
          ],
          differentiationOpportunity:
            'Combinar UX fluida com motor determinístico auditável e Quality Gates integrados.',
        },
      ],
      functionalRequirements: [
        {
          reqId: 'REQ-01',
          title: 'Ingestão e Validação Determinística de Eventos',
          acceptanceCriteria: [
            'Rejeitar payloads fora do contrato Zod com erro estruturado em menos de 15ms',
            'Persistir versão imutável do artefato para rastreabilidade completa',
          ],
        },
        {
          reqId: 'REQ-02',
          title: 'Onboarding Self-Service e Workspace Isolado',
          acceptanceCriteria: [
            'Provisionar tenant isolado por projectId automaticamente',
            'Sincronizar estado completo via snapshot instantâneo ao reconectar (F5)',
          ],
        },
        {
          reqId: 'REQ-03',
          title: 'Governança de Custos e Limite de Execução',
          acceptanceCriteria: [
            'Contabilizar consumo acumulado por operação em transação ACID',
            'Interromper execução imediatamente caso o orçamento configurado seja atingido',
          ],
        },
      ],
      technicalRisks: [
        {
          riskId: 'RISK-01',
          severity: 'high',
          description:
            'Inconsistência de estado concorrente durante reconexões de múltiplos clientes WebSocket.',
          mitigationStrategy:
            'Emitir OFFICE_SNAPSHOT completo na entrada da sala e utilizar locks transacionais FOR UPDATE no PostgreSQL.',
        },
        {
          riskId: 'RISK-02',
          severity: 'medium',
          description:
            'Degradação de performance na geração de relatórios analíticos volumosos.',
          mitigationStrategy:
            'Indexar chaves compostas (project_id, task_id, version DESC) e paginar séries históricas.',
        },
      ],
      recommendedArchitectureStack: {
        frontend: 'React 18 + TypeScript + Zustand + WebSockets',
        backend: 'Node.js + TypeScript + Motor de Estado Determinístico',
        database: 'PostgreSQL 16 com JSONB versionado e transações ACID',
        rationale:
          'Garante tipagem ponta a ponta, isolamento transacional de estados e sincronização em tempo real com latência sub-segundo.',
      },
      ...(feedbackNote ? { incorporatedFeedbackNotes: feedbackNote } : {}),
      markdownReport: [
        `# Relatório de Pesquisa & Requisitos Técnicos`,
        `**Objetivo:** ${scopeSummary}`,
        feedbackNote ? `\n> **Nota de Revisão:** ${feedbackNote}\n` : '',
        `## 1. Sumário Executivo`,
        `O levantamento confirma alta demanda por automação determinística com onboarding self-service e governança estrita de estado.`,
        `## 2. Requisitos Priorizados`,
        `- **REQ-01:** Ingestão e Validação Determinística de Eventos`,
        `- **REQ-02:** Onboarding Self-Service e Workspace Isolado`,
        `- **REQ-03:** Governança de Custos e Limite de Execução`,
        `## 3. Riscos e Mitigações`,
        `- **RISK-01 (High):** Sincronização concorrente mitigada via Snapshot + PostgreSQL Row Locking.`,
        `- **RISK-02 (Medium):** Performance em JSONB mitigada com índices compostos.`,
      ].join('\n'),
    };

    return {
      rawContent: artifact as unknown as Record<string, unknown>,
      tokensUsed: 1450,
    };
  }
}

// ============================================================================
// 3. POD ESPECIALISTA RESEARCH (EXECUTOR + VALIDADOR DETERMINÍSTICO REAL)
// ============================================================================

const FORBIDDEN_PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bTBD\b/i,
  /\bFIXME\b/i,
  /\blorem ipsum\b/i,
  /\bplaceholder\b/i,
];

export class ResearchPod implements DepartmentPod {
  public readonly department = 'research' as const;

  constructor(
    private readonly executor: ResearchExecutorProvider = new DefaultResearchExecutorProvider()
  ) {}

  public async execute(input: PodExecutionInput): Promise<PodExecutionOutput> {
    const { rawContent, tokensUsed } =
      await this.executor.generateResearchArtifact(input);

    return {
      artifactName: 'research_specification_report',
      content: rawContent,
      tokensUsed,
    };
  }

  /**
   * Validador Determinístico Real:
   * 1. Valida o contrato estrutural completo com Zod (`ResearchArtifactContentSchema`).
   * 2. Verifica unicidade de IDs (`REQ-XX` e `RISK-XX`).
   * 3. Varre todo o payload contra placeholders proibidos (`TODO`, `TBD`, `lorem ipsum`).
   * 4. Exige que riscos `high` ou `critical` tenham planos de mitigação detalhados.
   * 5. Caso seja uma re-execução por reprovação humana (`humanFeedback`), exige que
   *    `incorporatedFeedbackNotes` esteja preenchido documentando a correção.
   */
  public validate(
    output: PodExecutionOutput,
    input: PodExecutionInput
  ): DeterministicValidationResult {
    const errors: string[] = [];

    // 1. Validação de Schema Zod
    const parsed = ResearchArtifactContentSchema.safeParse(output.content);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`Schema [${issue.path.join('.')}]: ${issue.message}`);
      }
      return { valid: false, errors };
    }

    const data = parsed.data;

    // 2. Unicidade de IDs de Requisitos e Riscos
    const reqIds = new Set<string>();
    for (const req of data.functionalRequirements) {
      if (reqIds.has(req.reqId)) {
        errors.push(`ID de requisito duplicado detectado: ${req.reqId}`);
      }
      reqIds.add(req.reqId);
    }

    const riskIds = new Set<string>();
    for (const risk of data.technicalRisks) {
      if (riskIds.has(risk.riskId)) {
        errors.push(`ID de risco duplicado detectado: ${risk.riskId}`);
      }
      riskIds.add(risk.riskId);

      // 3. Regra de negócio: riscos high/critical exigem mitigação robusta
      if (
        (risk.severity === 'high' || risk.severity === 'critical') &&
        risk.mitigationStrategy.trim().length < 30
      ) {
        errors.push(
          `O risco severo ${risk.riskId} (${risk.severity}) exige uma estratégia de mitigação com pelo menos 30 caracteres.`
        );
      }
    }

    // 4. Varredura contra placeholders proibidos
    const serialized = JSON.stringify(data);
    for (const pattern of FORBIDDEN_PLACEHOLDER_PATTERNS) {
      if (pattern.test(serialized)) {
        errors.push(
          `Conteúdo contém marcador incompleto proibido (${pattern.source}).`
        );
      }
    }

    // 5. Verificação de incorporação de Feedback Humano em caso de retry
    if (
      input.humanFeedback &&
      (!data.incorporatedFeedbackNotes ||
        data.incorporatedFeedbackNotes.trim().length < 15)
    ) {
      errors.push(
        'A tarefa recebeu feedback humano na reprovação, mas o artefato não preencheu "incorporatedFeedbackNotes" comprovando o ajuste.'
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
