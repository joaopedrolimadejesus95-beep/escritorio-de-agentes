import { z } from 'zod';
import type {
  DepartmentPod,
  DeterministicValidationResult,
  PodExecutionInput,
  PodExecutionOutput,
} from '../orchestrator/stateMachine.js';
import { generateValidatedJson } from '../llm/llmService.js';

// ============================================================================
// 1. CONTRATO DE GROWTH & GO-TO-MARKET (ZOD SCHEMA)
// ============================================================================

export const PricingTierSchema = z.object({
  tierName: z.string().min(2),
  monthlyPrice: z.string().min(2),
  targetCustomer: z.string().min(5),
  includedLimits: z.array(z.string().min(5)).min(2),
});

export const AcquisitionChannelSchema = z.object({
  channel: z.string().min(3),
  tactic: z.string().min(15),
  targetMetric: z.string().min(5),
  estimatedCostLevel: z.enum(['low', 'medium', 'high']),
});

export const GrowthExperimentSchema = z.object({
  hypothesis: z.string().min(15),
  primaryMetric: z.string().min(5),
  executionWindow: z.string().min(3),
});

export const GrowthArtifactContentSchema = z.object({
  schemaVersion: z.literal('2.0'),
  consumedArtifacts: z.array(z.string()).min(1),
  gtmSummary: z.string().min(50),
  northStarMetric: z.string().min(8),
  pricingTiers: z.array(PricingTierSchema).min(3),
  acquisitionChannels: z.array(AcquisitionChannelSchema).min(3),
  experiments: z.array(GrowthExperimentSchema).min(2),
  launchChecklist: z.array(z.string().min(10)).min(4),
  incorporatedFeedbackNotes: z.string().optional(),
});

export type GrowthArtifactContent = z.infer<typeof GrowthArtifactContentSchema>;

// ============================================================================
// 2. POD GROWTH (EXECUTOR REAL + VALIDADOR DETERMINÍSTICO)
// ============================================================================

export class GrowthPod implements DepartmentPod {
  public readonly department = 'growth' as const;

  public async execute(input: PodExecutionInput): Promise<PodExecutionOutput> {
    await input.tools.useTool('web_search', {
      query: `${input.task.objective.slice(0, 55)} go to market SaaS benchmarks`,
      limit: 3,
    });

    const consumedArtifacts = input.dependencyArtifacts.map(
      (d) => `${d.department}/${d.artifactName}@v${d.version}`
    );

    const feedbackSection = input.humanFeedback
      ? `\n\nFEEDBACK HUMANO OBRIGATÓRIO PARA REVISÃO:\n"${input.humanFeedback}"\nAjuste os planos/preços/canais e preencha "incorporatedFeedbackNotes".`
      : '';

    const llmResult = await generateValidatedJson({
      schema: GrowthArtifactContentSchema,
      temperature: 0.25,
      systemInstruction: `Você é um Head of Growth e Estratégia Comercial Sênior.
Com base na pesquisa de mercado, arquitetura e design recebidos, elabore um plano de Go-To-Market, precificação e aquisição realista e acionável.

Retorne exclusivamente JSON válido:
{
  "schemaVersion": "2.0",
  "consumedArtifacts": ["..."],
  "gtmSummary": "Estratégia executiva de lançamento (mín. 50 chars)",
  "northStarMetric": "Métrica norte clara e mensurável",
  "pricingTiers": [
    {
      "tierName": "Starter | Pro | Enterprise",
      "monthlyPrice": "Valor realista (ex: R$ 0 / R$ 149/mês / Sob consulta)",
      "targetCustomer": "Perfil para este plano",
      "includedLimits": ["Limite/benefício 1", "Limite/benefício 2"]
    }
  ],
  "acquisitionChannels": [
    {
      "channel": "Nome do canal",
      "tactic": "Ação prática específica para este produto",
      "targetMetric": "Meta numérica clara",
      "estimatedCostLevel": "low" | "medium" | "high"
    }
  ],
  "experiments": [
    {
      "hypothesis": "Hipótese testável baseada nas dores da pesquisa",
      "primaryMetric": "Métrica de sucesso",
      "executionWindow": "Ex: 14 dias"
    }
  ],
  "launchChecklist": ["Item acionável 1", "Item 2", "Item 3", "Item 4"],
  "incorporatedFeedbackNotes": "Opcional"
}

Regras: zero emojis, zero placeholders, alinhado ao mercado brasileiro/global do escopo. Idioma: Português (Brasil).`,
      userPrompt: `Objetivo:\n${input.task.objective}${feedbackSection}\n\nArtefatos anteriores:\n${JSON.stringify(input.dependencyArtifacts, null, 2)}`,
    });

    const content: GrowthArtifactContent = {
      ...llmResult.data,
      consumedArtifacts:
        consumedArtifacts.length > 0
          ? consumedArtifacts
          : llmResult.data.consumedArtifacts,
    };

    await input.tools.useTool('workspace_write_file', {
      projectId: input.projectId,
      relativePath: 'growth/gtm_strategy.json',
      content: JSON.stringify(content, null, 2),
    });

    return {
      artifactName: 'gtm_and_growth_strategy',
      content: content as unknown as Record<string, unknown>,
      tokensUsed: llmResult.tokensUsed,
    };
  }

  public validate(
    output: PodExecutionOutput,
    input: PodExecutionInput
  ): DeterministicValidationResult {
    const parsed = GrowthArtifactContentSchema.safeParse(output.content);
    if (!parsed.success) {
      return {
        valid: false,
        errors: parsed.error.issues.map(
          (i) => `Schema [${i.path.join('.')}]: ${i.message}`
        ),
      };
    }

    const errors: string[] = [];
    if (/\b(TODO|TBD|FIXME|lorem ipsum|placeholder)\b/i.test(JSON.stringify(parsed.data))) {
      errors.push('O plano de growth contém placeholders proibidos.');
    }
    if (
      input.humanFeedback &&
      (!parsed.data.incorporatedFeedbackNotes ||
        parsed.data.incorporatedFeedbackNotes.trim().length < 10)
    ) {
      errors.push('Feedback humano não documentado em incorporatedFeedbackNotes.');
    }

    return { valid: errors.length === 0, errors };
  }
}
