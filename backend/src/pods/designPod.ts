import { z } from 'zod';
import type {
  DepartmentPod,
  DeterministicValidationResult,
  PodExecutionInput,
  PodExecutionOutput,
} from '../orchestrator/stateMachine.js';
import { generateValidatedJson } from '../llm/llmService.js';

// ============================================================================
// 1. CONTRATO DE INTERFACE / DESIGN SYSTEM + MULTI-TELA HTML/TAILWIND
// ============================================================================

export const ColorSwatchSchema = z.object({
  name: z.string().min(2),
  role: z.string().min(3),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Hex inválido (esperado #RRGGBB)'),
  usage: z.string().min(8),
});

export const ScreenBlueprintSchema = z.object({
  screenKey: z
    .string()
    .regex(/^[a-z0-9_]+$/, 'screenKey deve ser snake_case'),
  title: z.string().min(3),
  route: z.string().min(1),
  purpose: z.string().min(15),
  keyComponents: z.array(z.string().min(3)).min(2),
});

export const DesignSystemPlanSchema = z.object({
  designSummary: z.string().min(50),
  colorPalette: z.array(ColorSwatchSchema).min(4),
  typography: z.object({
    headingFont: z.string().min(2),
    bodyFont: z.string().min(2),
    monoFont: z.string().min(2),
    scaleRationale: z.string().min(15),
  }),
  screenBlueprints: z.array(ScreenBlueprintSchema).min(3).max(4),
  incorporatedFeedbackNotes: z.string().optional(),
});

export const SingleScreenOutputSchema = z.object({
  htmlCode: z
    .string()
    .min(900, 'Código HTML/Tailwind da tela deve ser completo e responsivo'),
});

export const DesignScreenSchema = z.object({
  screenKey: z
    .string()
    .regex(/^[a-z0-9_]+$/, 'screenKey deve ser snake_case'),
  title: z.string().min(3),
  route: z.string().min(1),
  purpose: z.string().min(15),
  htmlCode: z.string().min(900),
});

export const BuiltScreenFileSchema = z.object({
  screenKey: z.string(),
  title: z.string(),
  route: z.string(),
  purpose: z.string(),
  relativePath: z.string(),
  previewUrl: z.string(),
});

export const DesignArtifactContentSchema = z.object({
  schemaVersion: z.literal('2.0'),
  basedOnDependencyArtifacts: z.array(z.string()).min(1),
  designSummary: z.string().min(50),
  colorPalette: z.array(ColorSwatchSchema).min(4),
  typography: z.object({
    headingFont: z.string().min(2),
    bodyFont: z.string().min(2),
    monoFont: z.string().min(2),
    scaleRationale: z.string().min(15),
  }),
  screens: z.array(DesignScreenSchema).min(3),
  builtScreens: z.array(BuiltScreenFileSchema).default([]),
  incorporatedFeedbackNotes: z.string().optional(),
});

export type DesignArtifactContent = z.infer<typeof DesignArtifactContentSchema>;

// ============================================================================
// 2. POD DESIGN (GERAÇÃO MULTI-STEP PARALELA PARA ZERO TIMEOUT E MÁXIMA QUALIDADE)
// ============================================================================

export class DesignPod implements DepartmentPod {
  public readonly department = 'design' as const;

  public async execute(input: PodExecutionInput): Promise<PodExecutionOutput> {
    await input.tools.useTool('npm_package_radar', {
      query: 'tailwindcss lucide',
      limit: 2,
    });

    const depNames = input.dependencyArtifacts.map(
      (d) => `${d.department}/${d.artifactName}@v${d.version}`
    );

    // Compacta o contexto das dependências para manter os prompts rápidos e objetivos
    const researchArt = input.dependencyArtifacts.find(
      (d) => d.department === 'research'
    )?.content as Record<string, any> | undefined;
    const engArt = input.dependencyArtifacts.find(
      (d) => d.department === 'engineering'
    )?.content as Record<string, any> | undefined;

    const compactContext = {
      executiveSummary: researchArt?.executiveSummary ?? input.task.objective,
      valueProposition:
        researchArt?.positioningRecommendation?.valueProposition ?? '',
      userPains: (researchArt?.userPainPoints ?? []).slice(0, 3),
      functionalRequirements: (researchArt?.functionalRequirements ?? []).slice(
        0,
        5
      ),
      entities: (engArt?.databaseModel?.entities ?? []).map(
        (e: any) => e.tableName
      ),
      apiRoutes: (engArt?.apiContracts ?? []).map(
        (a: any) => `${a.method} ${a.path}: ${a.purpose}`
      ),
    };

    const feedbackSection = input.humanFeedback
      ? `\n\nFEEDBACK HUMANO OBRIGATÓRIO PARA REVISÃO (Tentativa ${input.task.attempts}):\n"${input.humanFeedback}"\nAplique exatamente as mudanças pedidas e preencha "incorporatedFeedbackNotes".`
      : '';

    // ETAPA A: Gera o Design System + Plano das 3 Telas Principais (rápido e leve)
    const systemPlanResult = await generateValidatedJson({
      schema: DesignSystemPlanSchema,
      temperature: 0.25,
      maxTokens: 3072,
      systemInstruction: `Você é um Principal Product Designer Sênior.
Defina a paleta de cores, tipografia e o plano das 3 telas principais do produto em JSON estrito:
{
  "designSummary": "Explicação clara das decisões de UX/UI",
  "colorPalette": [
    { "name": "Background", "role": "surface", "hex": "#0B0F17", "usage": "Fundo principal" },
    { "name": "Card Surface", "role": "elevated", "hex": "#111827", "usage": "Cartões e tabelas" },
    { "name": "Primary Accent", "role": "primary", "hex": "#38BDF8", "usage": "Ações principais" },
    { "name": "Text Primary", "role": "text", "hex": "#F8FAFC", "usage": "Textos e títulos" }
  ],
  "typography": {
    "headingFont": "Inter",
    "bodyFont": "Inter",
    "monoFont": "JetBrains Mono",
    "scaleRationale": "Hierarquia modular limpa para leitura rápida"
  },
  "screenBlueprints": [
    {
      "screenKey": "snake_case_unico",
      "title": "Nome da Tela",
      "route": "/rota",
      "purpose": "Objetivo e fluxo principal desta tela",
      "keyComponents": ["Componente 1", "Componente 2", "Componente 3"]
    }
  ],
  "incorporatedFeedbackNotes": "Opcional, obrigatório se houver feedback humano"
}
Regras: exatamente 3 telas distintas cobrindo os fluxos centrais do produto; screenKey em snake_case; zero emojis; Português (Brasil).`,
      userPrompt: `Objetivo:\n${input.task.objective}${feedbackSection}\n\nContexto do Produto:\n${JSON.stringify(compactContext, null, 2)}`,
      extraValidator: (plan) => {
        const errs: string[] = [];
        const keys = new Set<string>();
        for (const bp of plan.screenBlueprints) {
          if (keys.has(bp.screenKey)) {
            errs.push(`screenKey duplicada: ${bp.screenKey}`);
          }
          keys.add(bp.screenKey);
        }
        if (
          input.humanFeedback &&
          (!plan.incorporatedFeedbackNotes ||
            plan.incorporatedFeedbackNotes.trim().length < 10)
        ) {
          errs.push(
            'Há feedback humano pendente, mas "incorporatedFeedbackNotes" não foi preenchido.'
          );
        }
        return errs;
      },
    });

    const plan = systemPlanResult.data;

    // ETAPA B: Constrói as 3 telas HTML/Tailwind reais EM PARALELO (cada chamada focada e rápida!)
    const screenResults = await Promise.all(
      plan.screenBlueprints.slice(0, 3).map(async (bp) => {
        const res = await generateValidatedJson({
          schema: SingleScreenOutputSchema,
          temperature: 0.3,
          maxTokens: 6144,
          systemInstruction: `Você é um Front-end UI Engineer Sênior.
Construa UMA tela HTML5 + Tailwind CSS completa, responsiva (Desktop e Mobile 390px) e interativa para o produto descrito.

Retorne exclusivamente JSON válido:
{
  "htmlCode": "<!DOCTYPE html><html lang=\\"pt-BR\\">...</html>"
}

Requisitos obrigatórios do htmlCode:
1. Documento HTML5 completo (<!DOCTYPE html> ... </html>) com <meta name="viewport" content="width=device-width, initial-scale=1.0"> e <script src="https://cdn.tailwindcss.com"></script>.
2. Use a paleta de cores e fontes definidas no Design System abaixo, com estética sóbria, limpa, contrastes excelentes e ZERO emojis (use SVG inline limpo para ícones).
3. Conteúdo 100% real do domínio (Português do Brasil) + interatividade real em JavaScript vanilla (filtros, abas, abertura de modal/drawer ou adição/atualização de itens na tela).
4. Nunca use Lorem Ipsum, TODO ou placeholders.`,
          userPrompt: `Tela a construir: ${bp.title} (${bp.route})
Propósito: ${bp.purpose}
Componentes-chave: ${bp.keyComponents.join(', ')}
Paleta & Tipografia: ${JSON.stringify({ colorPalette: plan.colorPalette, typography: plan.typography })}
Contexto do Produto: ${compactContext.executiveSummary}
${feedbackSection}`,
          extraValidator: (out) => {
            const errs: string[] = [];
            const lower = out.htmlCode.toLowerCase();
            if (!lower.includes('<html') || !lower.includes('</html>')) {
              errs.push('htmlCode deve conter tags <html>...</html> completas.');
            }
            if (!lower.includes('tailwindcss')) {
              errs.push('htmlCode deve incluir o script do Tailwind CSS.');
            }
            if (/\b(TODO|TBD|FIXME|lorem ipsum)\b/i.test(out.htmlCode)) {
              errs.push('htmlCode contém texto placeholder proibido.');
            }
            return errs;
          },
        });

        return {
          blueprint: bp,
          htmlCode: res.data.htmlCode,
          tokensUsed: res.tokensUsed,
        };
      })
    );

    const totalTokens =
      systemPlanResult.tokensUsed +
      screenResults.reduce((acc, s) => acc + s.tokensUsed, 0);

    const screens = screenResults.map((s) => ({
      screenKey: s.blueprint.screenKey,
      title: s.blueprint.title,
      route: s.blueprint.route,
      purpose: s.blueprint.purpose,
      htmlCode: s.htmlCode,
    }));

    const builtScreens: z.infer<typeof BuiltScreenFileSchema>[] = [];
    for (const screen of screens) {
      const relativePath = `design/screens/${screen.screenKey}.html`;
      await input.tools.useTool('workspace_write_file', {
        projectId: input.projectId,
        relativePath,
        content: screen.htmlCode,
      });
      builtScreens.push({
        screenKey: screen.screenKey,
        title: screen.title,
        route: screen.route,
        purpose: screen.purpose,
        relativePath,
        previewUrl: `http://localhost:4000/workspace/${input.projectId}/${relativePath}`,
      });
    }

    const content: DesignArtifactContent = {
      schemaVersion: '2.0',
      basedOnDependencyArtifacts:
        depNames.length > 0 ? depNames : ['standalone_design'],
      designSummary: plan.designSummary,
      colorPalette: plan.colorPalette,
      typography: plan.typography,
      screens,
      builtScreens,
      ...(plan.incorporatedFeedbackNotes
        ? { incorporatedFeedbackNotes: plan.incorporatedFeedbackNotes }
        : {}),
    };

    return {
      artifactName: 'ui_design_system_and_screens',
      content: content as unknown as Record<string, unknown>,
      tokensUsed: totalTokens,
    };
  }

  public validate(
    output: PodExecutionOutput,
    input: PodExecutionInput
  ): DeterministicValidationResult {
    const parsed = DesignArtifactContentSchema.safeParse(output.content);
    if (!parsed.success) {
      return {
        valid: false,
        errors: parsed.error.issues.map(
          (i) => `Schema [${i.path.join('.')}]: ${i.message}`
        ),
      };
    }

    const errors: string[] = [];
    if (
      input.humanFeedback &&
      (!parsed.data.incorporatedFeedbackNotes ||
        parsed.data.incorporatedFeedbackNotes.trim().length < 10)
    ) {
      errors.push(
        'Há feedback humano pendente, mas "incorporatedFeedbackNotes" não documentou a revisão.'
      );
    }

    return { valid: errors.length === 0, errors };
  }
}
