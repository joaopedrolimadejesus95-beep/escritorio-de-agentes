import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { DepartmentId, ToolCallLogDTO } from '@ai-office/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_SANDBOX_ROOT = path.resolve(__dirname, '../../../workspace_outputs');

// ============================================================================
// 1. CONTRATO DETERMINÍSTICO DE FERRAMENTAS (AGENT TOOLS)
// ============================================================================

export interface AgentToolDefinition<TInput = any, TOutput = any> {
  readonly name: string;
  readonly description: string;
  readonly allowedDepartments: DepartmentId[];
  readonly inputSchema: z.ZodType<TInput, z.ZodTypeDef, any>;
  execute(input: TInput): Promise<{
    data: TOutput;
    summary: string;
  }>;
}

export interface ToolExecutionReport<TOutput = any> {
  toolName: string;
  data: TOutput;
  log: ToolCallLogDTO;
}

// ============================================================================
// 2. FERRAMENTAS REAIS DE INTERNET & SISTEMA (ZERO EMOJIS, ZERO MOCKS)
// ============================================================================

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  source: 'duckduckgo' | 'wikipedia' | 'hackernews';
}

const WebSearchInputSchema = z.object({
  query: z.string().min(2).max(160),
  limit: z.number().int().min(1).max(12).default(8),
});

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const WebSearchTool: AgentToolDefinition<
  z.infer<typeof WebSearchInputSchema>,
  { query: string; results: WebSearchResultItem[]; fetchedAt: string }
> = {
  name: 'web_search',
  description:
    'Pesquisa na internet em tempo real (DuckDuckGo Web, HackerNews Algolia e Wikipedia PT/EN) para coletar concorrentes, preços, benchmarks e artigos reais.',
  allowedDepartments: ['director', 'research', 'design', 'engineering', 'growth'],
  inputSchema: WebSearchInputSchema,
  async execute({ query, limit }) {
    const results: WebSearchResultItem[] = [];
    const seenUrls = new Set<string>();
    const encoded = encodeURIComponent(query);

    const pushUnique = (item: WebSearchResultItem) => {
      if (!item.url || seenUrls.has(item.url)) return;
      seenUrls.add(item.url);
      results.push(item);
    };

    // 1. DuckDuckGo HTML Search (Resultados reais da Web sobre concorrentes, preços e produtos)
    try {
      const ddgHtmlRes = await fetch(
        `https://html.duckduckgo.com/html/?q=${encoded}`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          },
          signal: AbortSignal.timeout(6000),
        }
      );

      if (ddgHtmlRes.ok) {
        const html = await ddgHtmlRes.text();
        const blockRegex =
          /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>)/gi;
        let match: RegExpExecArray | null;
        let count = 0;
        while ((match = blockRegex.exec(html)) !== null && count < 6) {
          let href = match[1] ?? '';
          const uddgMatch = href.match(/uddg=([^&]+)/);
          if (uddgMatch?.[1]) {
            href = decodeURIComponent(uddgMatch[1]);
          }
          const title = decodeHtmlEntities((match[2] ?? '').replace(/<[^>]+>/g, ''));
          const snippet = decodeHtmlEntities(
            ((match[3] ?? match[4]) ?? '').replace(/<[^>]+>/g, '')
          );
          if (title && href.startsWith('http')) {
            pushUnique({
              title,
              url: href,
              snippet: snippet || title,
              source: 'duckduckgo',
            });
            count++;
          }
        }
      }
    } catch {
      // Segue para as outras fontes em paralelo/fallback
    }

    // 2. HackerNews Algolia Search API (Discussões técnicas, feedbacks reais de usuários e SaaS)
    try {
      const hnRes = await fetch(
        `https://hn.algolia.com/api/v1/search?query=${encoded}&tags=story&hitsPerPage=4`,
        { signal: AbortSignal.timeout(4500) }
      );
      if (hnRes.ok) {
        const hnData = (await hnRes.json()) as {
          hits?: Array<{
            title?: string;
            url?: string;
            objectID?: string;
            points?: number;
            num_comments?: number;
          }>;
        };
        for (const hit of hnData.hits ?? []) {
          if (hit.title) {
            pushUnique({
              title: hit.title,
              url:
                hit.url ||
                `https://news.ycombinator.com/item?id=${hit.objectID ?? ''}`,
              snippet: `Discussão técnica (${hit.points ?? 0} pontos, ${hit.num_comments ?? 0} comentários no HackerNews).`,
              source: 'hackernews',
            });
          }
        }
      }
    } catch {
      // Continua
    }

    // 3. Wikipedia PT + EN Search API
    for (const lang of ['pt', 'en'] as const) {
      if (results.length >= limit) break;
      try {
        const wikiRes = await fetch(
          `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&utf8=&format=json&srlimit=2`,
          {
            headers: { 'User-Agent': 'AIOfficeOrchestrator/2.0' },
            signal: AbortSignal.timeout(4000),
          }
        );
        if (wikiRes.ok) {
          const wikiData = (await wikiRes.json()) as {
            query?: { search?: Array<{ title: string; snippet: string }> };
          };
          for (const item of wikiData.query?.search ?? []) {
            pushUnique({
              title: item.title,
              url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
              snippet: decodeHtmlEntities(item.snippet.replace(/<[^>]+>/g, '')),
              source: 'wikipedia',
            });
          }
        }
      } catch {
        // Continua
      }
    }

    const finalResults = results.slice(0, limit);
    return {
      data: {
        query,
        results: finalResults,
        fetchedAt: new Date().toISOString(),
      },
      summary: `Busca Web ("${query.slice(0, 40)}"): ${finalResults.length} resultados reais coletados`,
    };
  },
};

/**
 * Tool 2: `http_fetch_page`
 * Acessa uma URL real na internet via HTTP/HTTPS, extrai título, meta description e texto limpo.
 */
const HttpFetchInputSchema = z.object({
  url: z.string().url(),
  maxChars: z.number().int().min(200).max(10000).default(3000),
});

export const HttpFetchPageTool: AgentToolDefinition<
  z.infer<typeof HttpFetchInputSchema>,
  {
    url: string;
    status: number;
    title: string;
    metaDescription: string;
    textExcerpt: string;
    fetchedAt: string;
  }
> = {
  name: 'http_fetch_page',
  description:
    'Faz requisição HTTP GET em tempo real para ler conteúdo de páginas de concorrentes, documentações e artigos.',
  allowedDepartments: ['research', 'design', 'engineering', 'growth'],
  inputSchema: HttpFetchInputSchema,
  async execute({ url, maxChars }) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/json,text/plain,*/*',
        },
        signal: AbortSignal.timeout(6000),
      });

      const rawText = await response.text();
      const titleMatch = rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = decodeHtmlEntities(titleMatch?.[1] ?? url);
      const metaMatch = rawText.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
      );
      const metaDescription = decodeHtmlEntities(metaMatch?.[1] ?? '');

      const cleanedText = decodeHtmlEntities(
        rawText
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
      ).slice(0, maxChars);

      return {
        data: {
          url,
          status: response.status,
          title,
          metaDescription,
          textExcerpt: cleanedText,
          fetchedAt: new Date().toISOString(),
        },
        summary: `Leitura HTTP ${response.status} em ${new URL(url).hostname} (${cleanedText.length} caracteres extraídos)`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        data: {
          url,
          status: 0,
          title: 'Inacessível',
          metaDescription: '',
          textExcerpt: `Falha de rede ao acessar ${url}: ${msg}`,
          fetchedAt: new Date().toISOString(),
        },
        summary: `Falha ao ler ${url}: ${msg}`,
      };
    }
  },
};

/**
 * Tool 3: `github_tech_radar`
 * Pesquisa repositórios reais e stacks open-source na API pública do GitHub.
 */
const GithubSearchInputSchema = z.object({
  topic: z.string().min(2).max(100),
  limit: z.number().int().min(1).max(6).default(4),
});

export interface GithubRepoItem {
  fullName: string;
  url: string;
  description: string;
  stars: number;
  language: string | null;
}

export const GithubTechRadarTool: AgentToolDefinition<
  z.infer<typeof GithubSearchInputSchema>,
  { topic: string; repositories: GithubRepoItem[] }
> = {
  name: 'github_tech_radar',
  description:
    'Consulta a API oficial do GitHub em tempo real para descobrir bibliotecas, padrões arquiteturais e repositórios de referência.',
  allowedDepartments: ['research', 'engineering', 'design'],
  inputSchema: GithubSearchInputSchema,
  async execute({ topic, limit }) {
    const encoded = encodeURIComponent(topic);
    const repositories: GithubRepoItem[] = [];

    try {
      const res = await fetch(
        `https://api.github.com/search/repositories?q=${encoded}&sort=stars&order=desc&per_page=${limit}`,
        {
          headers: {
            'User-Agent': 'AIOfficeOrchestrator/2.0',
            Accept: 'application/vnd.github+json',
          },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (res.ok) {
        const json = (await res.json()) as {
          items?: Array<{
            full_name: string;
            html_url: string;
            description: string | null;
            stargazers_count: number;
            language: string | null;
          }>;
        };

        for (const repo of json.items ?? []) {
          repositories.push({
            fullName: repo.full_name,
            url: repo.html_url,
            description: repo.description ?? 'Sem descrição',
            stars: repo.stargazers_count,
            language: repo.language,
          });
        }
      }
    } catch {
      // Rate-limit ou timeout tratado
    }

    return {
      data: { topic, repositories },
      summary: `GitHub Radar ("${topic.slice(0, 35)}"): ${repositories.length} repositórios analisados`,
    };
  },
};

/**
 * Tool 4: `npm_package_radar`
 */
const NpmSearchInputSchema = z.object({
  query: z.string().min(2).max(100),
  limit: z.number().int().min(1).max(6).default(4),
});

export interface NpmPackageItem {
  name: string;
  version: string;
  description: string;
  npmUrl: string;
  cdnUrl: string;
}

export const NpmPackageRadarTool: AgentToolDefinition<
  z.infer<typeof NpmSearchInputSchema>,
  { query: string; packages: NpmPackageItem[] }
> = {
  name: 'npm_package_radar',
  description:
    'Pesquisa pacotes reais no registro oficial do NPM (registry.npmjs.org) e versões atuais.',
  allowedDepartments: ['research', 'design', 'engineering', 'growth'],
  inputSchema: NpmSearchInputSchema,
  async execute({ query, limit }) {
    const encoded = encodeURIComponent(query);
    const packages: NpmPackageItem[] = [];

    try {
      const res = await fetch(
        `https://registry.npmjs.org/-/v1/search?text=${encoded}&size=${limit}`,
        { signal: AbortSignal.timeout(4500) }
      );
      if (res.ok) {
        const json = (await res.json()) as {
          objects?: Array<{
            package: {
              name: string;
              version: string;
              description?: string;
              links?: { npm?: string };
            };
          }>;
        };

        for (const obj of json.objects ?? []) {
          const pkg = obj.package;
          packages.push({
            name: pkg.name,
            version: pkg.version,
            description: pkg.description ?? 'Pacote NPM verificado',
            npmUrl:
              pkg.links?.npm ?? `https://www.npmjs.com/package/${pkg.name}`,
            cdnUrl: `https://cdn.jsdelivr.net/npm/${pkg.name}@${pkg.version}`,
          });
        }
      }
    } catch {
      // Timeout tratado
    }

    return {
      data: { query, packages },
      summary: `NPM Registry ("${query.slice(0, 35)}"): ${packages.length} pacotes verificados`,
    };
  },
};

/**
 * Tool 5: `workspace_write_file`
 */
const WorkspaceWriteInputSchema = z.object({
  projectId: z.string().min(1),
  relativePath: z
    .string()
    .regex(/^[a-zA-Z0-9_\-./]+$/, 'Caminho relativo inválido'),
  content: z.string(),
});

export const WorkspaceWriteFileTool: AgentToolDefinition<
  z.infer<typeof WorkspaceWriteInputSchema>,
  { savedPath: string; bytesWritten: number }
> = {
  name: 'workspace_write_file',
  description:
    'Salva artefatos reais (HTML/Tailwind, SQL, Markdown, contratos) no diretório workspace_outputs do projeto.',
  allowedDepartments: ['research', 'design', 'engineering', 'growth'],
  inputSchema: WorkspaceWriteInputSchema,
  async execute({ projectId, relativePath, content }) {
    const safeRelative = path
      .normalize(relativePath)
      .replace(/^(\.\.(\/|\\|$))+/, '');
    const projectDir = path.join(WORKSPACE_SANDBOX_ROOT, projectId);
    const fullPath = path.join(projectDir, safeRelative);

    if (!fullPath.startsWith(projectDir)) {
      throw new Error('Tentativa de escrita fora do sandbox do projeto bloqueada.');
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    const bytesWritten = Buffer.byteLength(content, 'utf-8');

    return {
      data: {
        savedPath: fullPath,
        bytesWritten,
      },
      summary: `Arquivo gravado: ${safeRelative} (${bytesWritten} bytes)`,
    };
  },
};

// ============================================================================
// 3. REGISTRY & EXECUTOR DE FERRAMENTAS COM AUDITORIA EM TEMPO REAL
// ============================================================================

export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentToolDefinition>();

  constructor() {
    this.register(WebSearchTool);
    this.register(HttpFetchPageTool);
    this.register(GithubTechRadarTool);
    this.register(NpmPackageRadarTool);
    this.register(WorkspaceWriteFileTool);
  }

  public register(tool: AgentToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  public listDepartmentTools(department: DepartmentId): AgentToolDefinition[] {
    return Array.from(this.tools.values()).filter((t) =>
      t.allowedDepartments.includes(department)
    );
  }

  public async invokeTool<TOutput = any>(params: {
    department: DepartmentId;
    toolName: string;
    rawInput: unknown;
    onToolStart?: (toolName: string, input: Record<string, unknown>) => void;
    onToolFinish?: (log: ToolCallLogDTO) => void;
  }): Promise<ToolExecutionReport<TOutput>> {
    const tool = this.tools.get(params.toolName);
    if (!tool) {
      throw new Error(`Ferramenta "${params.toolName}" não está registrada.`);
    }

    if (!tool.allowedDepartments.includes(params.department)) {
      throw new Error(
        `O departamento "${params.department}" não tem permissão para executar a ferramenta "${params.toolName}".`
      );
    }

    const parsedInput = tool.inputSchema.parse(params.rawInput);
    params.onToolStart?.(params.toolName, parsedInput as Record<string, unknown>);

    const startedAt = performance.now();
    try {
      const { data, summary } = await tool.execute(parsedInput);
      const durationMs = Math.round(performance.now() - startedAt);

      const log: ToolCallLogDTO = {
        toolName: params.toolName,
        input: parsedInput as Record<string, unknown>,
        outputSummary: summary,
        durationMs,
        success: true,
        timestamp: new Date().toISOString(),
      };

      params.onToolFinish?.(log);
      return {
        toolName: params.toolName,
        data: data as TOutput,
        log,
      };
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);
      const message = error instanceof Error ? error.message : String(error);

      const log: ToolCallLogDTO = {
        toolName: params.toolName,
        input: parsedInput as Record<string, unknown>,
        outputSummary: `Erro: ${message}`,
        durationMs,
        success: false,
        timestamp: new Date().toISOString(),
      };

      params.onToolFinish?.(log);
      throw error;
    }
  }
}

export const defaultToolRegistry = new AgentToolRegistry();
