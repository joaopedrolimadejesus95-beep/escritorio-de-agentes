import { z } from 'zod';
import type {
  DepartmentPod,
  DeterministicValidationResult,
  PodExecutionInput,
  PodExecutionOutput,
} from '../orchestrator/stateMachine.js';
import { generateValidatedJson } from '../llm/llmService.js';
import type { WebSearchResultItem } from '../tools/toolRegistry.js';

// ============================================================================
// 1. CONTRATO ESTRUTURADO DE PESQUISA SÊNIOR (ZOD SCHEMA)
// ============================================================================

export const CompetitorAnalysisSchema = z.object({
  name: z.string().min(2),
  websiteOrSource: z.string().min(3),
  pricingModel: z.string().min(8),
  targetSegment: z.string().min(5),
  strengths: z.array(z.string().min(8)).min(2),
  weaknesses: z.array(z.string().min(8)).min(2),
  ourEdge: z.string().min(15),
});

export const UserPainPointSchema = z.object({
  persona: z.string().min(3),
  pain: z.string().min(15),
  currentWorkaround: z.string().min(10),
  severity: z.enum(['medium', 'high', 'critical']),
  productOpportunity: z.string().min(15),
});

export const FunctionalRequirementSchema = z.object({
  reqId: z.string().regex(/^REQ-\d{2}$/, 'Formato esperado: REQ-01'),
  title: z.string().min(5),
  priority: z.enum(['P0', 'P1', 'P2']),
  acceptanceCriteria: z.array(z.string().min(12)).min(2),
});

export const TechnicalRiskItemSchema = z.object({
  riskId: z.string().regex(/^RISK-\d{2}$/, 'Formato esperado: RISK-01'),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().min(15),
  mitigationStrategy: z.string().min(25),
});

export const ResearchArtifactContentSchema = z.object({
  schemaVersion: z.literal('2.0'),
  executiveSummary: z.string().min(80),
  positioningRecommendation: z.object({
    valueProposition: z.string().min(25),
    idealCustomerProfile: z.string().min(20),
    pricingStrategyRecommendation: z.string().min(20),
    keyDifferentiators: z.array(z.string().min(10)).min(3),
  }),
  competitors: z.array(CompetitorAnalysisSchema).min(3),
  userPainPoints: z.array(UserPainPointSchema).min(3),
  functionalRequirements: z.array(FunctionalRequirementSchema).min(4),
  technicalRisks: z.array(TechnicalRiskItemSchema).min(2),
  liveWebSources: z
    .array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string(),
        source: z.string(),
      })
    )
    .default([]),
  incorporatedFeedbackNotes: z.string().optional(),
});

export type ResearchArtifactContent = z.infer<
  typeof ResearchArtifactContentSchema
>;

// ============================================================================
// 2. POD RESEARCH (EXECUTOR REAL COM WEB SEARCH + VALIDADOR DETERMINÍSTICO)
// ============================================================================

const FORBIDDEN_PATTERNS = [
  /\bTODO\b/i,
  /\bTBD\b/i,
  /\bFIXME\b/i,
  /\blorem ipsum\b/i,
  /\bplaceholder\b/i,
  /LegacyEnterprise BI/i,
  /FastMetrics Cloud/i,
];

export class ResearchPod implements DepartmentPod {
  public readonly department = 'research' as const;

  public async execute(input: PodExecutionInput): Promise<PodExecutionOutput> {
    const objective = input.task.objective;

    // 1. Coleta dados reais da internet sobre concorrentes, preços e dores do domínio
    const marketSearch = await input.tools.useTool<{
      query: string;
      results: WebSearchResultItem[];
    }>('web_search', {
      query: `${objective.slice(0, 70)} competitors pricing`,
      limit: 6,
    });

    const painSearch = await input.tools.useTool<{
      query: string;
      results: WebSearchResultItem[];
    }>('web_search', {
      query: `${objective.slice(0, 60)} software user problems reviews`,
      limit: 4,
    });

    // 2. Lê conteúdo real da principal URL encontrada (quando disponível)
    const allSources = [
      ...marketSearch.data.results,
      ...painSearch.data.results,
    ];
    const uniqueSources = Array.from(
      new Map(allSources.map((s) => [s.url, s])).values()
    ).slice(0, 8);

    let primaryPageExcerpt = '';
    const firstHttpUrl = uniqueSources.find((s) =>
      s.url.startsWith('http')
    )?.url;
    if (firstHttpUrl) {
      const pageReport = await input.tools.useTool<{
        url: string;
        status: number;
        title: string;
        textExcerpt: string;
      }>('http_fetch_page', {
        url: firstHttpUrl,
        maxChars: 2200,
      });
      if (pageReport.data.status >= 200 && pageReport.data.status < 400) {
        primaryPageExcerpt = `Página lida (${pageReport.data.url} - ${pageReport.data.title}):\n${pageReport.data.textExcerpt}`;
      }
    }

    // 3. Síntese analítica de nível sênior via LLM real com validação Zod + auto-reparo
    const feedbackSection = input.humanFeedback
      ? `\n\nFEEDBACK HUMANO OBRIGATÓRIO PARA REVISÃO (Tentativa ${input.task.attempts}):\n"${input.humanFeedback}"\nVocê DEVE ajustar toda a análise para atender a esse feedback e preencher o campo "incorporatedFeedbackNotes" explicando objetivamente o que foi alterado.`
      : '';

    const llmResult = await generateValidatedJson({
      schema: ResearchArtifactContentSchema,
      temperature: 0.25,
      systemInstruction: `Você é um Principal Product Researcher e Estrategista de Mercado Sênior.
Sua missão é produzir uma pesquisa de mercado e produto REAL, profunda, objetiva e específica para o escopo informado — nunca genérica ou com placeholders.

Regras estritas de saída:
- Retorne exclusivamente JSON válido seguindo exatamente a estrutura:
  {
    "schemaVersion": "2.0",
    "executiveSummary": "Resumo executivo denso (mín. 80 chars) contextualizado ao produto exato",
    "positioningRecommendation": {
      "valueProposition": "Proposta de valor clara e diferenciada",
      "idealCustomerProfile": "ICP detalhado (porte, setor, decisor)",
      "pricingStrategyRecommendation": "Modelo de precificação recomendado com faixas ou lógica de cobrança",
      "keyDifferentiators": ["Diferencial concreto 1", "Diferencial concreto 2", "Diferencial concreto 3"]
    },
    "competitors": [
      {
        "name": "Nome real de concorrente do segmento",
        "websiteOrSource": "URL ou domínio real",
        "pricingModel": "Modelo de preço real ou faixa típica (ex: Freemium + Pro $29/mês)",
        "targetSegment": "Público principal deste concorrente",
        "strengths": ["Ponto forte real 1", "Ponto forte real 2"],
        "weaknesses": ["Fraqueza real 1", "Fraqueza real 2"],
        "ourEdge": "Como o nosso produto vence essa fraqueza"
      }
    ],
    "userPainPoints": [
      {
        "persona": "Cargo ou perfil do usuário",
        "pain": "Dor concreta enfrentada hoje",
        "currentWorkaround": "Como resolvem hoje (planilhas, ferramentas manuais, etc.)",
        "severity": "medium" | "high" | "critical",
        "productOpportunity": "Funcionalidade ou solução direta no produto"
      }
    ],
    "functionalRequirements": [
      {
        "reqId": "REQ-01",
        "title": "Nome do requisito",
        "priority": "P0" | "P1" | "P2",
        "acceptanceCriteria": ["Critério verificável 1", "Critério verificável 2"]
      }
    ],
    "technicalRisks": [
      {
        "riskId": "RISK-01",
        "severity": "low" | "medium" | "high" | "critical",
        "description": "Descrição técnica do risco",
        "mitigationStrategy": "Estratégia concreta de mitigação (>= 25 chars)"
      }
    ],
    "liveWebSources": [],
    "incorporatedFeedbackNotes": "Opcional, obrigatório se houver feedback humano"
  }
- Nunca use emojis, nunca use TODO/TBD/placeholder, nunca invente nomes genéricos como "Concorrente A". Use concorrentes reais do mercado pertinente ao escopo.
- Idioma: Português (Brasil).`,
      userPrompt: `Objetivo da Tarefa:\n${objective}${feedbackSection}\n\nFontes reais coletadas da Web:\n${JSON.stringify(uniqueSources, null, 2)}\n\n${primaryPageExcerpt}`,
    });

    const content: ResearchArtifactContent = {
      ...llmResult.data,
      liveWebSources: uniqueSources,
    };

    // 4. Persiste relatório legível em Markdown no workspace
    const mdLines = [
      `# Pesquisa de Mercado e Produto`,
      ``,
      `## Resumo Executivo`,
      content.executiveSummary,
      ``,
      `## Recomendação de Posicionamento`,
      `- **Proposta de Valor:** ${content.positioningRecommendation.valueProposition}`,
      `- **Perfil de Cliente Ideal (ICP):** ${content.positioningRecommendation.idealCustomerProfile}`,
      `- **Estratégia de Preço:** ${content.positioningRecommendation.pricingStrategyRecommendation}`,
      ``,
      `## Concorrentes Analisados`,
      ...content.competitors.map(
        (c) =>
          `### ${c.name} (${c.websiteOrSource})\n- **Preço:** ${c.pricingModel}\n- **Segmento:** ${c.targetSegment}\n- **Vantagem Competitiva Nossa:** ${c.ourEdge}`
      ),
    ].join('\n');

    await input.tools.useTool('workspace_write_file', {
      projectId: input.projectId,
      relativePath: 'research/market_research.md',
      content: mdLines,
    });

    return {
      artifactName: 'market_and_product_research',
      content: content as unknown as Record<string, unknown>,
      tokensUsed: llmResult.tokensUsed,
    };
  }

  public validate(
    output: PodExecutionOutput,
    input: PodExecutionInput
  ): DeterministicValidationResult {
    const errors: string[] = [];
    const parsed = ResearchArtifactContentSchema.safeParse(output.content);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(`Schema [${issue.path.join('.')}]: ${issue.message}`);
      }
      return { valid: false, errors };
    }

    const data = parsed.data;

    const reqIds = new Set<string>();
    for (const req of data.functionalRequirements) {
      if (reqIds.has(req.reqId)) {
        errors.push(`reqId duplicado: ${req.reqId}`);
      }
      reqIds.add(req.reqId);
    }

    const riskIds = new Set<string>();
    for (const risk of data.technicalRisks) {
      if (riskIds.has(risk.riskId)) {
        errors.push(`riskId duplicado: ${risk.riskId}`);
      }
      riskIds.add(risk.riskId);
    }

    const serialized = JSON.stringify(data);
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(serialized)) {
        errors.push(
          `Artefato contém termo proibido ou genérico (${pattern.source}).`
        );
      }
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

    return { valid: errors.length === 0, errors };
  }
}
