import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { z } from 'zod';
import { generateValidatedJson } from '../../llm/llmService.js';
import type {
  DepartmentPod,
  DeterministicValidationResult,
  PodExecutionInput,
  PodExecutionOutput,
} from '../../orchestrator/stateMachine.js';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATE_MVP_DIR = path.resolve(
  __dirname,
  '../../../templates/frontend-mvp'
);
export const WORKSPACE_ROOT_DIR = path.resolve(
  __dirname,
  '../../../../workspace_outputs'
);

// ============================================================================
// 1. CONTRATOS ZOD & ALLOWLIST ESTRITA DE CAMINHOS DO BUILDER
// ============================================================================

export const GeneratedFileSchema = z.object({
  path: z
    .string()
    .min(5)
    .max(180)
    .regex(/^[a-zA-Z0-9_\-./]+$/, 'Caminho relativo inválido'),
  content: z.string().min(10, 'Conteúdo do arquivo não pode ser vazio'),
});

export const BuilderFilesBatchSchema = z.object({
  notes: z.string().optional(),
  files: z.array(GeneratedFileSchema).min(1),
});

export const BuilderArtifactContentSchema = z.object({
  schemaVersion: z.literal('2.0'),
  basedOnDependencyArtifacts: z.array(z.string()).default([]),
  summary: z.string().min(20),
  typecheckOk: z.boolean(),
  buildOk: z.boolean(),
  repairRoundsUsed: z.number().int().min(0),
  buildLog: z.string(),
  appRelativeRoot: z.string(),
  files: z.array(GeneratedFileSchema).min(4),
  incorporatedFeedbackNotes: z.string().optional(),
});

export type BuilderArtifactContent = z.infer<
  typeof BuilderArtifactContentSchema
>;

/**
 * Permite escrita SOMENTE dentro de:
 * - src/types/
 * - src/services/
 * - src/components/
 * - src/pages/
 * - src/App.tsx
 * Bloqueando explicitamente package.json, vite.config.ts, tsconfig.json, index.html, main.tsx, index.css e traversal.
 */
export function isAllowedBuilderSourcePath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (
    !normalized ||
    normalized.includes('..') ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    return false;
  }

  if (normalized === 'src/App.tsx') return true;

  return (
    (normalized.startsWith('src/types/') ||
      normalized.startsWith('src/services/') ||
      normalized.startsWith('src/components/') ||
      normalized.startsWith('src/pages/')) &&
    /\.(ts|tsx)$/.test(normalized)
  );
}

// ============================================================================
// 2. HELPERS DE WORKSPACE, /DOCS, BUILD REAL & COLETA DE ARQUIVOS
// ============================================================================

async function copyTemplateWithoutModules(
  srcDir: string,
  destDir: string
): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyTemplateWithoutModules(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function ensureSharedNodeModulesLink(appDir: string): Promise<void> {
  const templateModules = path.join(TEMPLATE_MVP_DIR, 'node_modules');
  const appModules = path.join(appDir, 'node_modules');

  try {
    await fs.lstat(appModules);
    return; // Já existe link/pasta
  } catch {
    // Não existe ainda
  }

  try {
    await fs.access(templateModules);
  } catch {
    throw new Error(
      `Dependências do template base ausentes em "${templateModules}". Execute npm install em backend/templates/frontend-mvp.`
    );
  }

  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
  await fs.symlink(templateModules, appModules, symlinkType);
}

async function runRealTscAndViteBuild(appDir: string): Promise<{
  typecheckOk: boolean;
  buildOk: boolean;
  outputLog: string;
}> {
  const tscBin = path.join(
    TEMPLATE_MVP_DIR,
    'node_modules',
    'typescript',
    'bin',
    'tsc'
  );
  const viteBin = path.join(
    TEMPLATE_MVP_DIR,
    'node_modules',
    'vite',
    'bin',
    'vite.js'
  );

  // 1. Typecheck real (npx tsc --noEmit)
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tscBin, '--noEmit'],
      {
        cwd: appDir,
        timeout: 45_000,
        maxBuffer: 1024 * 1024,
      }
    );
    void stdout;
    void stderr;
  } catch (err: any) {
    const out = [err?.stdout, err?.stderr, err?.message]
      .filter(Boolean)
      .join('\n')
      .trim();
    return {
      typecheckOk: false,
      buildOk: false,
      outputLog: `TypeScript (tsc --noEmit) falhou:\n${out.slice(0, 3500)}`,
    };
  }

  // 2. Build real de produção (vite build)
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [viteBin, 'build'],
      {
        cwd: appDir,
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      }
    );
    const combined = [stdout, stderr].filter(Boolean).join('\n').trim();
    return {
      typecheckOk: true,
      buildOk: true,
      outputLog: combined.slice(0, 1500) || 'tsc --noEmit e vite build OK',
    };
  } catch (err: any) {
    const out = [err?.stdout, err?.stderr, err?.message]
      .filter(Boolean)
      .join('\n')
      .trim();
    return {
      typecheckOk: true,
      buildOk: false,
      outputLog: `Vite Build falhou:\n${out.slice(0, 3500)}`,
    };
  }
}

async function collectAppFilesSnapshot(
  appDir: string
): Promise<Array<{ path: string; content: string }>> {
  const collected: Array<{ path: string; content: string }> = [];

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        const rel = path.relative(appDir, fullPath).replace(/\\/g, '/');
        const content = await fs.readFile(fullPath, 'utf-8');
        collected.push({ path: rel, content });
      }
    }
  }

  await walk(appDir);
  return collected.sort((a, b) => a.path.localeCompare(b.path));
}

async function writeAllowlistedFiles(
  appDir: string,
  files: Array<{ path: string; content: string }>
): Promise<string[]> {
  const written: string[] = [];
  for (const file of files) {
    const rel = file.path.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!isAllowedBuilderSourcePath(rel)) {
      throw new Error(
        `Builder bloqueado ao tentar escrever fora das pastas permitidas: "${rel}"`
      );
    }
    const target = path.resolve(appDir, rel);
    if (!target.startsWith(appDir + path.sep)) {
      throw new Error(`Path traversal bloqueado em "${rel}".`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.content, 'utf-8');
    written.push(rel);
  }
  return written;
}

// ============================================================================
// 3. POD BUILDER (MVP REACT + VITE + TAILWIND + LOCALSTORAGE + /DOCS + BUILD)
// ============================================================================

export class BuilderPod implements DepartmentPod {
  public readonly department = 'builder' as const;

  public async execute(input: PodExecutionInput): Promise<PodExecutionOutput> {
    const appDir = path.join(WORKSPACE_ROOT_DIR, input.projectId, 'app');

    // 1. Preparação limpa do workspace a partir do template fixo
    try {
      await fs.unlink(path.join(appDir, 'node_modules'));
    } catch {
      // Sem junction prévia
    }
    await fs.rm(appDir, { recursive: true, force: true });
    await copyTemplateWithoutModules(TEMPLATE_MVP_DIR, appDir);
    await ensureSharedNodeModulesLink(appDir);

    const depNames = input.dependencyArtifacts.map(
      (d) => `${d.department}/${d.artifactName}@v${d.version}`
    );

    const researchArt = input.dependencyArtifacts.find(
      (d) => d.department === 'research'
    )?.content as Record<string, any> | undefined;
    const engArt = input.dependencyArtifacts.find(
      (d) => d.department === 'engineering'
    )?.content as Record<string, any> | undefined;
    const designArt = input.dependencyArtifacts.find(
      (d) => d.department === 'design'
    )?.content as Record<string, any> | undefined;
    const growthArt = input.dependencyArtifacts.find(
      (d) => d.department === 'growth'
    )?.content as Record<string, any> | undefined;

    // 2. Pasta /docs consolidada dentro do MVP
    await this.writeDocsFolder(appDir, {
      objective: input.task.objective,
      researchArt,
      engArt,
      growthArt,
    });

    const feedbackSection = input.humanFeedback
      ? `\n\nFEEDBACK HUMANO OBRIGATÓRIO PARA REVISÃO:\n"${input.humanFeedback}"\nAplique os ajustes pedidos e documente em "notes".`
      : '';

    let totalTokens = 0;

    // ------------------------------------------------------------------------
    // PASSO 1: Camada de Dados (`src/types/domain.ts`, `src/services/seed.ts`, `src/services/api.ts`)
    // ------------------------------------------------------------------------
    const compactArch = {
      objective: input.task.objective,
      entities: engArt?.databaseModel?.entities ?? [],
      sqlSchema: String(engArt?.databaseModel?.sqlSchema ?? '').slice(0, 3500),
      apiContracts: engArt?.apiContracts ?? [],
      functionalRequirements: (researchArt?.functionalRequirements ?? []).slice(
        0,
        6
      ),
    };

    const step1 = await generateValidatedJson({
      schema: BuilderFilesBatchSchema,
      temperature: 0.2,
      maxTokens: 6144,
      systemInstruction: `Você é um Staff TypeScript & Frontend Architect.
Gere a camada de dados tipada e persistida em localStorage para o MVP React + Vite + TypeScript.

Retorne exclusivamente JSON válido:
{
  "notes": "Resumo breve da camada de dados",
  "files": [
    { "path": "src/types/domain.ts", "content": "..." },
    { "path": "src/services/seed.ts", "content": "..." },
    { "path": "src/services/api.ts", "content": "..." }
  ]
}

Regras obrigatórias:
1. Gere EXATAMENTE estes 3 arquivos: "src/types/domain.ts", "src/services/seed.ts" e "src/services/api.ts".
2. Em "src/services/api.ts", implemente funções assíncronas completas de CRUD (listar, buscar, criar, atualizar, deletar + resetar seed se necessário) usando localStorage com namespace único por projeto, fáceis de trocar por fetch() no futuro.
3. Os dados iniciais em "src/services/seed.ts" devem ser 100% realistas para o nicho em Português (Brasil) — zero Lorem Ipsum ou TODO.
4. TypeScript estrito (strict: true): todos os imports relativos corretos, sem "any" solto nem erros de tipo.`,
      userPrompt: `Contexto da Arquitetura e Contratos:\n${JSON.stringify(compactArch, null, 2)}${feedbackSection}`,
      extraValidator: (res) => this.validateBatchPaths(res, [
        'src/types/domain.ts',
        'src/services/seed.ts',
        'src/services/api.ts',
      ]),
    });

    totalTokens += step1.tokensUsed;
    await writeAllowlistedFiles(appDir, step1.data.files);

    // ------------------------------------------------------------------------
    // PASSO 2: Interface Funcional (`src/components/*`, `src/pages/*`, `src/App.tsx`)
    // ------------------------------------------------------------------------
    const designSummaryContext = {
      designSummary: designArt?.designSummary ?? '',
      colorPalette: designArt?.colorPalette ?? [],
      typography: designArt?.typography ?? {},
      screens: Array.isArray(designArt?.screens)
        ? designArt.screens.map((s: any) => ({
            screenKey: s.screenKey,
            title: s.title,
            route: s.route,
            purpose: s.purpose,
            htmlReferenceExcerpt: String(s.htmlCode ?? '').slice(0, 1400),
          }))
        : [],
    };

    const dataLayerSource = step1.data.files
      .map((f) => `// === ${f.path} ===\n${f.content}`)
      .join('\n\n');

    const step2 = await generateValidatedJson({
      schema: BuilderFilesBatchSchema,
      temperature: 0.25,
      maxTokens: 12288,
      systemInstruction: `Você é um Principal React + Tailwind UI Engineer.
Com base no Design System / telas do departamento de Design e na camada de dados já gerada no Passo 1, construa um Frontend MVP 100% funcional em React 18 + TypeScript + Tailwind CSS + lucide-react.

Retorne exclusivamente JSON válido:
{
  "notes": "Resumo das telas e componentes construídos",
  "files": [
    { "path": "src/components/...", "content": "..." },
    { "path": "src/pages/...", "content": "..." },
    { "path": "src/App.tsx", "content": "..." }
  ]
}

Regras obrigatórias:
1. Permitido escrever APENAS em "src/components/*.tsx", "src/pages/*.tsx" e "src/App.tsx". NUNCA inclua package.json, index.html, main.tsx, vite.config.ts ou tsconfig.json.
2. "src/App.tsx" MUST exportar default ("export default function App()") e oferecer navegação funcional entre as telas (abas/sidebar) sem precisar de react-router-dom (use estado React).
3. Conecte todas as telas às funções assíncronas reais de "src/services/api.ts" para criar, listar, filtrar/buscar, editar e excluir registros com persistência em localStorage (ao recarregar com F5 os dados continuam salvos).
4. Pacotes disponíveis APENAS: "react", "react-dom", "lucide-react" e os módulos locais em "src/types/", "src/services/", "src/components/", "src/pages/". NUNCA importe bibliotecas não instaladas (sem axios, recharts, react-router-dom, framer-motion, etc.).
5. Estética limpa e responsiva com Tailwind CSS, usando ícones de "lucide-react" (sem emojis) e textos reais em Português (Brasil).
6. Garanta 100% de compatibilidade com TypeScript strict (sem imports faltando, sem props inválidas, sem variáveis não declaradas).`,
      userPrompt: `Objetivo do MVP:\n${input.task.objective}${feedbackSection}\n\nCamada de Dados Gerada (USE exatamente estes tipos e assinaturas de funções):\n${dataLayerSource}\n\nDesign System & Telas de Referência:\n${JSON.stringify(designSummaryContext, null, 2)}`,
      extraValidator: (res) => {
        const errs = this.validateBatchPaths(res, ['src/App.tsx']);
        if (
          !res.files.some(
            (f) =>
              f.path.replace(/\\/g, '/') === 'src/App.tsx' &&
              /export\s+default\s+/.test(f.content)
          )
        ) {
          errs.push('src/App.tsx precisa ter "export default".');
        }
        return errs;
      },
    });

    totalTokens += step2.tokensUsed;
    await writeAllowlistedFiles(appDir, step2.data.files);

    // ------------------------------------------------------------------------
    // PASSO 3: Validador Real (`tsc --noEmit` + `vite build`) + Autocorreção até maxAttempts
    // ------------------------------------------------------------------------
    let repairRoundsUsed = 0;
    const maxRepairRounds = Math.max(1, input.task.maxAttempts);
    let buildCheck = await runRealTscAndViteBuild(appDir);

    while ((!buildCheck.typecheckOk || !buildCheck.buildOk) && repairRoundsUsed < maxRepairRounds) {
      repairRoundsUsed++;

      await input.tools.useTool('workspace_write_file', {
        projectId: input.projectId,
        relativePath: `app/docs/build_repair_attempt_${repairRoundsUsed}.log`,
        content: buildCheck.outputLog,
      });

      const currentSrcFiles = await this.readEditableSourceFiles(appDir);
      const repair = await generateValidatedJson({
        schema: BuilderFilesBatchSchema,
        temperature: 0.15,
        maxTokens: 10240,
        systemInstruction: `Você é um Senior TypeScript Build Fixer.
O projeto React + Vite + TypeScript falhou no "tsc --noEmit" ou "vite build".
Analise o erro exato e retorne APENAS os arquivos que precisam de correção em JSON estrito:
{
  "notes": "O que foi corrigido",
  "files": [
    { "path": "src/...", "content": "conteúdo completo corrigido do arquivo" }
  ]
}
Regras:
- Só são permitidos caminhos em src/types/, src/services/, src/components/, src/pages/ e src/App.tsx.
- Só use imports de "react", "lucide-react" ou módulos locais existentes.
- Retorne o conteúdo COMPLETO de cada arquivo alterado (nunca trechos parciais).`,
        userPrompt: `Erros de compilação/build:\n\`\`\`\n${buildCheck.outputLog}\n\`\`\`\n\nArquivos atuais do projeto:\n${currentSrcFiles
          .map((f) => `// === ${f.path} ===\n${f.content}`)
          .join('\n\n')}`,
        extraValidator: (res) => this.validateBatchPaths(res, []),
      });

      totalTokens += repair.tokensUsed;
      await writeAllowlistedFiles(appDir, repair.data.files);
      buildCheck = await runRealTscAndViteBuild(appDir);
    }

    if (!buildCheck.typecheckOk || !buildCheck.buildOk) {
      throw new Error(
        `Build do MVP falhou após ${repairRoundsUsed} tentativa(s) de autocorreção:\n${buildCheck.outputLog}`
      );
    }

    const allFiles = await collectAppFilesSnapshot(appDir);
    const content: BuilderArtifactContent = {
      schemaVersion: '2.0',
      basedOnDependencyArtifacts:
        depNames.length > 0 ? depNames : ['standalone_builder'],
      summary: `Frontend MVP React + Vite + TypeScript + Tailwind construído em workspace_outputs/${input.projectId}/app com CRUD em localStorage, pasta /docs e build de produção aprovado.`,
      typecheckOk: buildCheck.typecheckOk,
      buildOk: buildCheck.buildOk,
      repairRoundsUsed,
      buildLog: buildCheck.outputLog,
      appRelativeRoot: `workspace_outputs/${input.projectId}/app`,
      files: allFiles,
      ...(step2.data.notes
        ? { incorporatedFeedbackNotes: input.humanFeedback ? step2.data.notes : undefined }
        : {}),
    };

    return {
      artifactName: 'frontend_mvp_project',
      content: content as unknown as Record<string, unknown>,
      tokensUsed: totalTokens,
    };
  }

  public validate(
    output: PodExecutionOutput,
    _input: PodExecutionInput
  ): DeterministicValidationResult {
    const parsed = BuilderArtifactContentSchema.safeParse(output.content);
    if (!parsed.success) {
      return {
        valid: false,
        errors: parsed.error.issues.map(
          (i) => `Schema [${i.path.join('.')}]: ${i.message}`
        ),
      };
    }

    const errors: string[] = [];
    if (!parsed.data.typecheckOk) {
      errors.push('TypeScript check (tsc --noEmit) não foi aprovado.');
    }
    if (!parsed.data.buildOk) {
      errors.push('Build Vite de produção (npm run build) não foi aprovado.');
    }

    const paths = new Set(parsed.data.files.map((f) => f.path));
    for (const required of [
      'package.json',
      'src/App.tsx',
      'src/services/api.ts',
      'docs/README.md',
    ]) {
      if (!paths.has(required)) {
        errors.push(`Arquivo obrigatório ausente no pacote MVP: ${required}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private validateBatchPaths(
    batch: z.infer<typeof BuilderFilesBatchSchema>,
    requiredPaths: string[]
  ): string[] {
    const errs: string[] = [];
    const seen = new Set<string>();
    for (const file of batch.files) {
      const normalized = file.path.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!isAllowedBuilderSourcePath(normalized)) {
        errs.push(
          `Caminho não permitido "${file.path}". Use apenas src/types/, src/services/, src/components/, src/pages/ ou src/App.tsx.`
        );
      }
      seen.add(normalized);
    }
    for (const req of requiredPaths) {
      if (!seen.has(req)) {
        errs.push(`Arquivo obrigatório ausente nesta etapa: "${req}".`);
      }
    }
    return errs;
  }

  private async readEditableSourceFiles(
    appDir: string
  ): Promise<Array<{ path: string; content: string }>> {
    const snapshot = await collectAppFilesSnapshot(appDir);
    return snapshot.filter((f) => isAllowedBuilderSourcePath(f.path));
  }

  private async writeDocsFolder(
    appDir: string,
    params: {
      objective: string;
      researchArt?: Record<string, any>;
      engArt?: Record<string, any>;
      growthArt?: Record<string, any>;
    }
  ): Promise<void> {
    const docsDir = path.join(appDir, 'docs');
    await fs.mkdir(docsDir, { recursive: true });

    const competitors = Array.isArray(params.researchArt?.competitors)
      ? params.researchArt!.competitors
      : [];
    const positioning = params.researchArt?.positioningRecommendation;
    const pricingTiers = Array.isArray(params.growthArt?.pricingTiers)
      ? params.growthArt!.pricingTiers
      : [];
    const channels = Array.isArray(params.growthArt?.acquisitionChannels)
      ? params.growthArt!.acquisitionChannels
      : [];

    const readme = [
      `# MVP — Documentação Consolidada`,
      ``,
      `## Objetivo do Produto`,
      params.objective,
      ``,
      `## Como Rodar Localmente`,
      '```bash',
      'npm install',
      'npm run dev',
      '```',
      ``,
      `> Persistência atual: camada em \`src/services/api.ts\` usando \`localStorage\`, preparada para troca rápida por \`fetch()\` apontando para o backend real.`,
      ``,
      `## Pesquisa de Mercado`,
      params.researchArt?.executiveSummary ?? 'Não disponível.',
      positioning
        ? `\n- **Proposta de Valor:** ${positioning.valueProposition}\n- **ICP:** ${positioning.idealCustomerProfile}\n- **Precificação Sugerida:** ${positioning.pricingStrategyRecommendation}`
        : '',
      competitors.length > 0
        ? `\n### Concorrentes Analisados\n` +
          competitors
            .map((c: any) => `- **${c.name}** (${c.pricingModel}): ${c.ourEdge}`)
            .join('\n')
        : '',
      ``,
      `## Estratégia de Growth & Go-To-Market`,
      params.growthArt?.gtmSummary ?? 'Não disponível.',
      params.growthArt?.northStarMetric
        ? `\n- **North Star Metric:** ${params.growthArt.northStarMetric}`
        : '',
      pricingTiers.length > 0
        ? `\n### Planos & Preços\n` +
          pricingTiers
            .map(
              (t: any) =>
                `- **${t.tierName}** (${t.monthlyPrice}): ${t.targetCustomer}`
            )
            .join('\n')
        : '',
      channels.length > 0
        ? `\n### Canais de Aquisição\n` +
          channels
            .map((ch: any) => `- **${ch.channel}**: ${ch.tactic} (${ch.targetMetric})`)
            .join('\n')
        : '',
      ``,
      `## Artefatos Técnicos em \`/docs\``,
      `- [docs/architecture.mmd](./architecture.mmd) — Diagrama Mermaid da arquitetura`,
      `- [docs/schema.sql](./schema.sql) — DDL PostgreSQL`,
    ]
      .filter((line) => line !== undefined)
      .join('\n');

    await fs.writeFile(path.join(docsDir, 'README.md'), readme, 'utf-8');
    await fs.writeFile(
      path.join(docsDir, 'architecture.mmd'),
      String(
        params.engArt?.mermaidFlowDiagram ??
          'flowchart TD\n  UI["Frontend MVP"] --> API["Backend API"] --> DB["PostgreSQL"]'
      ),
      'utf-8'
    );
    await fs.writeFile(
      path.join(docsDir, 'schema.sql'),
      String(
        params.engArt?.databaseModel?.sqlSchema ??
          '-- Schema SQL não informado pela etapa de arquitetura.'
      ),
      'utf-8'
    );
  }
}
