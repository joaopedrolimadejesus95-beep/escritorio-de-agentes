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
// 2. FERRAMENTAS REAIS DE INTERNET & SISTEMA
// ============================================================================

/**
 * Tool 1: `web_search`
 * Consulta a internet em tempo real (Wikipedia OpenSearch + HackerNews Algolia API + DuckDuckGo Instant Answer)
 * para trazer dados reais, artigos técnicos, produtos e tendências sobre o escopo do projeto.
 */
export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  source: 'wikipedia' | 'hackernews' | 'duckduckgo';
}

const WebSearchInputSchema = z.object({
  query: z.string().min(2).max(150),
  limit: z.number().int().min(1).max(10).default(5),
});

export const WebSearchTool: AgentToolDefinition<
  z.infer<typeof WebSearchInputSchema>,
  { query: string; results: WebSearchResultItem[]; fetchedAt: string }
> = {
  name: 'web_search',
  description:
    'Pesquisa na internet em tempo real (Artigos Técnicos, HackerNews, Wikipedia e DuckDuckGo) sobre tecnologias, mercado e concorrentes.',
  allowedDepartments: ['director', 'research', 'design', 'engineering', 'growth'],
  inputSchema: WebSearchInputSchema,
  async execute({ query, limit }) {
    const results: WebSearchResultItem[] = [];
    const encoded = encodeURIComponent(query);

    // 1. HackerNews Algolia Search API (Excelente para benchmarks de SaaS, engenharia e startups reais)
    try {
      const hnRes = await fetch(
        `https://hn.algolia.com/api/v1/search?query=${encoded}&tags=story&hitsPerPage=${Math.min(limit, 4)}`,
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
            results.push({
              title: hit.title,
              url:
                hit.url ||
                `https://news.ycombinator.com/item?id=${hit.objectID ?? ''}`,
              snippet: `Discussão técnica verificada (${hit.points ?? 0} pts, ${hit.num_comments ?? 0} comentários).`,
              source: 'hackernews',
            });
          }
        }
      }
    } catch {
      // Continua para as próximas fontes se houver timeout
    }

    // 2. Wikipedia REST Search API (Conceitos de domínio e mercado)
    try {
      const wikiRes = await fetch(
        `https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&utf8=&format=json&srlimit=3`,
        {
          headers: { 'User-Agent': 'AIOfficeOrchestrator/1.0' },
          signal: AbortSignal.timeout(4500),
        }
      );
      if (wikiRes.ok) {
        const wikiData = (await wikiRes.json()) as {
          query?: {
            search?: Array<{ title: string; snippet: string }>;
          };
        };
        for (const item of wikiData.query?.search ?? []) {
          const cleanSnippet = item.snippet.replace(/<[^>]+>/g, '');
          results.push({
            title: item.title,
            url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
            snippet: cleanSnippet,
            source: 'wikipedia',
          });
        }
      }
    } catch {
      // Continua
    }

    // 3. DuckDuckGo Instant Answer API
    try {
      const ddgRes = await fetch(
        `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (ddgRes.ok) {
        const ddgData = (await ddgRes.json()) as {
          AbstractText?: string;
          AbstractURL?: string;
          Heading?: string;
        };
        if (ddgData.AbstractText && ddgData.AbstractURL) {
          results.push({
            title: ddgData.Heading || query,
            url: ddgData.AbstractURL,
            snippet: ddgData.AbstractText,
            source: 'duckduckgo',
          });
        }
      }
    } catch {
      // Continua
    }

    const finalResults = results.slice(0, limit);
    return {
      data: {
        query,
        results: finalResults,
        fetchedAt: new Date().toISOString(),
      },
      summary: `Internet Search ("${query}"): ${finalResults.length} fontes reais encontradas (${finalResults.map((r) => r.source).join(', ') || 'cache local'})`,
    };
  },
};

/**
 * Tool 2: `http_fetch_page`
 * Acessa uma URL real na internet via HTTP/HTTPS, extrai título, metadados e texto limpo.
 */
const HttpFetchInputSchema = z.object({
  url: z.string().url(),
  maxChars: z.number().int().min(200).max(8000).default(2000),
});

export const HttpFetchPageTool: AgentToolDefinition<
  z.infer<typeof HttpFetchInputSchema>,
  {
    url: string;
    status: number;
    title: string;
    textExcerpt: string;
    fetchedAt: string;
  }
> = {
  name: 'http_fetch_page',
  description:
    'Faz requisição HTTP GET em tempo real para qualquer página ou API pública da internet e extrai seu conteúdo textual.',
  allowedDepartments: ['research', 'design', 'engineering', 'growth'],
  inputSchema: HttpFetchInputSchema,
  async execute({ url, maxChars }) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; AIOfficeAgentBot/1.0; +http://localhost:5173)',
          Accept: 'text/html,application/json,text/plain,*/*',
        },
        signal: AbortSignal.timeout(5500),
      });

      const rawText = await response.text();
      const titleMatch = rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch?.[1]?.trim() || url;

      // Remove scripts, styles e tags HTML
      const cleanedText = rawText
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxChars);

      return {
        data: {
          url,
          status: response.status,
          title,
          textExcerpt: cleanedText,
          fetchedAt: new Date().toISOString(),
        },
        summary: `HTTP GET ${url} -> Status ${response.status} ("${title.slice(0, 50)}", ${cleanedText.length} chars extraídos)`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        data: {
          url,
          status: 0,
          title: 'Unreachable or timed out',
          textExcerpt: `Falha de rede ao acessar ${url}: ${msg}`,
          fetchedAt: new Date().toISOString(),
        },
        summary: `HTTP GET ${url} -> Timeout/Erro tratado (${msg})`,
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
  limit: z.number().int().min(1).max(5).default(3),
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
    'Consulta a API oficial do GitHub em tempo real para descobrir bibliotecas, arquiteturas de referência e repositórios populares.',
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
            'User-Agent': 'AIOfficeOrchestrator/1.0',
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
      // Fallback caso rate-limit da API pública seja atingido
    }

    return {
      data: { topic, repositories },
      summary: `GitHub API ("${topic}"): ${repositories.length} repositórios analisados (${repositories.map((r) => `${r.fullName} ★${r.stars}`).join(', ') || 'nenhum'})`,
    };
  },
};

/**
 * Tool 4: `npm_package_radar`
 * Consulta o registro oficial do NPM (registry.npmjs.org) em tempo real para descobrir
 * pacotes, bibliotecas, versões atuais, downloads/score e CDN links para uso pelos agentes.
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
    'Pesquisa pacotes e bibliotecas reais no registro oficial do NPM (registry.npmjs.org) e gera URLs de CDN prontas para uso.',
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
            description: pkg.description ?? 'Biblioteca NPM verificada',
            npmUrl:
              pkg.links?.npm ?? `https://www.npmjs.com/package/${pkg.name}`,
            cdnUrl: `https://cdn.jsdelivr.net/npm/${pkg.name}@${pkg.version}`,
          });
        }
      }
    } catch {
      // Fallback silencioso em caso de timeout
    }

    return {
      data: { query, packages },
      summary: `NPM Registry ("${query}"): ${packages.length} bibliotecas verificadas (${packages.map((p) => `${p.name}@${p.version}`).join(', ') || 'nenhuma'})`,
    };
  },
};

/**
 * Tool 5: `workspace_write_file`
 * Permite que os Pods escrevam arquivos reais (Markdown, especificações, JSON, código) em disco
 * dentro do diretório sandboxed `workspace_outputs/<projectId>/`.
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
    'Salva artefatos reais (relatórios .md, contratos .json, diagramas, código) no diretório sandboxed workspace_outputs do projeto.',
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
      summary: `Arquivo salvo em disco: workspace_outputs/${projectId}/${safeRelative} (${bytesWritten} bytes)`,
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
