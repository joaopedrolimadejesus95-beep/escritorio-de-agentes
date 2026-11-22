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

export const DesignScreenSchema = z.object({
  screenKey: z
    .string()
    .regex(/^[a-z0-9_]+$/, 'screenKey deve ser snake_case'),
  title: z.string().min(3),
  route: z.string().min(1),
  purpose: z.string().min(15),
  htmlCode: z.string().min(1200, 'Código HTML/Tailwind da tela deve ser completo e funcional'),
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
// 2. POD DESIGN (EXECUTOR REAL QUE CONSTRÓI TELAS HTML + TAILWIND RESPONSIVAS)
// ============================================================================

export class DesignPod implements DepartmentPod {
  public readonly department = 'design' as const;

  public async execute(input: PodExecutionInput): Promise<PodExecutionOutput> {
    // 1. Verifica pacote de ícones / design tokens real no NPM
    await input.tools.useTool('npm_package_radar', {
      query: 'tailwindcss lucide',
      limit: 2,
    });

    const depNames = input.dependencyArtifacts.map(
      (d) => `${d.department}/${d.artifactName}@v${d.version}`
    );

    const feedbackSection = input.humanFeedback
      ? `\n\nFEEDBACK HUMANO OBRIGATÓRIO PARA REVISÃO (Tentativa ${input.task.attempts}):\n"${input.humanFeedback}"\nReescreva as telas e tokens para atender exatamente ao feedback e preencha "incorporatedFeedbackNotes".`
      : '';

    const llmResult = await generateValidatedJson({
      schema: DesignArtifactContentSchema,
      temperature: 0.3,
      maxTokens: 16384,
      systemInstruction: `Você é um Principal Product Designer e Front-end UI Engineer Sênior.
Com base nos artefatos de Pesquisa e Arquitetura recebidos, projete o Design System e construa 3 TELAS REAIS COMPLETAS do produto em HTML5 + Tailwind CSS (via CDN) + JavaScript vanilla interativo.

Retorne exclusivamente JSON válido no formato:
{
  "schemaVersion": "2.0",
  "basedOnDependencyArtifacts": ["..."],
  "designSummary": "Explicação clara das decisões visuais e de experiência do usuário",
  "colorPalette": [
    { "name": "Background", "role": "surface", "hex": "#0B0F17", "usage": "Fundo principal sóbrio" },
    { "name": "Card Surface", "role": "elevated", "hex": "#111827", "usage": "Cartões e painéis" },
    { "name": "Primary Accent", "role": "primary", "hex": "#3B82F6", "usage": "Ações principais e estados ativos" },
    { "name": "Text Primary", "role": "text", "hex": "#F8FAFC", "usage": "Títulos e dados principais" }
  ],
  "typography": {
    "headingFont": "Inter",
    "bodyFont": "Inter",
    "monoFont": "JetBrains Mono",
    "scaleRationale": "Hierarquia modular limpa com alta legibilidade em dashboards e mobile"
  },
  "screens": [
    {
      "screenKey": "dashboard_principal",
      "title": "Dashboard Operacional",
      "route": "/app",
      "purpose": "Visão geral dos indicadores e ações diárias do usuário",
      "htmlCode": "<!DOCTYPE html><html lang=\\"pt-BR\\">...</html>"
    }
  ],
  "builtScreens": [],
  "incorporatedFeedbackNotes": "Opcional, obrigatório se houver feedback humano"
}

REGRAS CRÍTICAS PARA CADA "htmlCode":
1. Cada uma das 3 telas DEVE ser um documento HTML5 completo e autocontido (<!DOCTYPE html> ... </html>) com <meta name="viewport" content="width=device-width, initial-scale=1.0">, incluindo:
   <script src="https://cdn.tailwindcss.com"></script>
   e Google Fonts (Inter + JetBrains Mono).
2. Design visual de nível excepcional: estética sóbria, moderna, dark mode refinado (estilo Linear / Vercel / Stripe), espaçamento generoso, bordas sutis (border-slate-800), contraste excelente e ZERO emojis no código HTML (use SVG inline limpo quando precisar de ícones).
3. Responsividade real: use classes responsivas do Tailwind (sm:, md:, lg:, grid-cols-1 md:grid-cols-3, menu/barra adaptável) para que a tela fique impecável tanto em Desktop quanto em Mobile (390px).
4. Conteúdo 100% real do domínio pedido pelo usuário — dados realistas, formulários/filtros/abas ou modais funcionando com JavaScript vanilla, nunca Lorem Ipsum ou placeholders.
5. As 3 telas devem representar visões distintas e essenciais do produto (ex: Tela 1 = Dashboard/Visão Geral, Tela 2 = Fluxo Principal/Operação/Criação, Tela 3 = Detalhe/Configurações/Relatório).
6. Idioma da UI: Português (Brasil).`,
      userPrompt: `Objetivo da Tarefa:\n${input.task.objective}${feedbackSection}\n\nArtefatos das dependências diretas (Pesquisa e Arquitetura):\n${JSON.stringify(input.dependencyArtifacts, null, 2)}`,
      extraValidator: (data) => this.validateDesignRules(data, input),
    });

    // Salva cada tela HTML real no workspace e monta os links de preview
    const builtScreens: z.infer<typeof BuiltScreenFileSchema>[] = [];
    for (const screen of llmResult.data.screens) {
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
      ...llmResult.data,
      basedOnDependencyArtifacts:
        depNames.length > 0 ? depNames : llmResult.data.basedOnDependencyArtifacts,
      builtScreens,
    };

    return {
      artifactName: 'ui_design_system_and_screens',
      content: content as unknown as Record<string, unknown>,
      tokensUsed: llmResult.tokensUsed,
    };
  }

  private validateDesignRules(
    data: DesignArtifactContent,
    input: PodExecutionInput
  ): string[] {
    const errors: string[] = [];

    const keys = new Set<string>();
    for (const screen of data.screens) {
      if (keys.has(screen.screenKey)) {
        errors.push(`screenKey duplicada: ${screen.screenKey}`);
      }
      keys.add(screen.screenKey);

      const htmlLower = screen.htmlCode.toLowerCase();
      if (!htmlLower.includes('<html') || !htmlLower.includes('</html>')) {
        errors.push(
          `A tela "${screen.screenKey}" não possui documento HTML completo.`
        );
      }
      if (!htmlLower.includes('tailwindcss')) {
        errors.push(
          `A tela "${screen.screenKey}" deve incluir Tailwind CSS (<script src="https://cdn.tailwindcss.com"></script>).`
        );
      }
      if (/\b(TODO|TBD|FIXME|lorem ipsum)\b/i.test(screen.htmlCode)) {
        errors.push(
          `A tela "${screen.screenKey}" contém texto placeholder (TODO/TBD/lorem ipsum).`
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

    return errors;
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

    const errors = this.validateDesignRules(parsed.data, input);
    return { valid: errors.length === 0, errors };
  }
}
