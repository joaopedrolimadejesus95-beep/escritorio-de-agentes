import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { z } from 'zod';
import {
  getUserByCookieHeader,
  loginUser,
  logoutByCookieHeader,
  registerUser,
} from './auth/authService.js';
import { pool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import {
  deleteUserLLMConfig,
  getLLMStatus,
  LLMNotConfiguredError,
  loadLocalEnvFile,
  saveUserLLMConfig,
} from './llm/llmService.js';
import { OfficeStateMachine } from './orchestrator/stateMachine.js';
import { BuilderPod } from './pods/builder/builderPod.js';
import { DesignPod } from './pods/designPod.js';
import { EngineeringPod } from './pods/engineeringPod.js';
import { GrowthPod } from './pods/growthPod.js';
import { ResearchPod } from './pods/researchPod.js';
import {
  buildSecurityHeaders,
  buildSessionCookieHeader,
  getClientIp,
  globalRateLimiter,
  sanitizeSensitiveText,
  SESSION_TTL_SECONDS,
} from './security/security.js';
import {
  createOfficeSocketServer,
  getProjectRoom,
} from './server/socketServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_OUTPUTS_DIR = path.resolve(__dirname, '../../../workspace_outputs');
const PORT = Number(process.env.PORT ?? 4000);
const MAX_JSON_BODY_BYTES = 64 * 1024; // 64 KB máx por requisição JSON

const RegisterSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome (mín. 2 caracteres)').max(80),
  email: z.string().trim().email('E-mail inválido').max(160),
  password: z
    .string()
    .min(8, 'A senha precisa ter pelo menos 8 caracteres')
    .max(128),
});

const LoginSchema = z.object({
  email: z.string().trim().email('E-mail inválido').max(160),
  password: z.string().min(1, 'Informe sua senha').max(128),
});

const CreateProjectSchema = z.object({
  title: z.string().trim().min(3).max(120),
  rawScope: z.string().trim().min(10).max(4000),
  tokenBudget: z.number().int().positive().max(200_000).optional(),
});

const SaveLLMSettingsSchema = z.object({
  provider: z.enum(['gemini', 'anthropic', 'openai', 'ollama']),
  model: z.string().trim().min(2).max(120),
  apiKey: z.string().max(400).optional(),
  baseUrl: z.string().url().max(300).optional(),
  persistInDb: z.boolean().optional().default(true),
});

class PayloadTooLargeError extends Error {
  constructor() {
    super('Corpo da requisição excedeu o limite máximo permitido (64 KB).');
  }
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      throw new PayloadTooLargeError();
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  statusCode: number,
  data: unknown,
  extraHeaders: Record<string, string | string[]> = {}
): void {
  const secHeaders = buildSecurityHeaders({
    requestOrigin: req.headers.origin,
    isApi: true,
  });
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...secHeaders,
    ...extraHeaders,
  });
  res.end(JSON.stringify(data));
}

function isRequestHttps(req: http.IncomingMessage): boolean {
  const proto = req.headers['x-forwarded-proto'];
  return proto === 'https';
}

export async function startServer(): Promise<void> {
  await loadLocalEnvFile();
  await runMigrations();

  await pool.query(
    `UPDATE tasks SET status = 'ready', updated_at = NOW() WHERE status = 'running'`
  );

  const stateMachine = new OfficeStateMachine();
  stateMachine.registerPod(new ResearchPod());
  stateMachine.registerPod(new DesignPod());
  stateMachine.registerPod(new EngineeringPod());
  stateMachine.registerPod(new GrowthPod());
  stateMachine.registerPod(new BuilderPod());

  const httpServer = http.createServer(async (req, res) => {
    const secHeaders = buildSecurityHeaders({
      requestOrigin: req.headers.origin,
      isApi: req.url?.startsWith('/api/'),
    });

    if (req.method === 'OPTIONS') {
      res.writeHead(204, secHeaders);
      res.end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const clientIp = getClientIp(req);

    // Rate limit global por IP para proteger contra flood / DoS
    const globalCheck = globalRateLimiter.check(
      `http_global:${clientIp}`,
      120,
      60_000
    );
    if (!globalCheck.allowed) {
      sendJson(
        req,
        res,
        429,
        {
          error: `Muitas requisições. Aguarde ${globalCheck.retryAfterSec}s e tente novamente.`,
        },
        { 'Retry-After': String(globalCheck.retryAfterSec) }
      );
      return;
    }

    try {
      const authUser = await getUserByCookieHeader(req.headers.cookie);
      const isHttps = isRequestHttps(req);

      // GET /
      if (req.method === 'GET' && url.pathname === '/') {
        sendJson(req, res, 200, {
          service: 'AI Office 3D — DAG Orchestrator Backend',
          status: 'online',
          endpoints: [
            'GET /api/health',
            'POST /api/auth/register',
            'POST /api/auth/login',
            'POST /api/auth/logout',
            'GET /api/auth/me',
            'GET /api/projects',
            'POST /api/projects',
          ],
        });
        return;
      }

      // =====================================================================
      // ROTAS DE AUTENTICAÇÃO REAL (Cadastro, Login, Sessão, Logout)
      // =====================================================================

      if (req.method === 'GET' && url.pathname === '/api/auth/me') {
        sendJson(req, res, 200, { user: authUser });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/register') {
        const regRate = globalRateLimiter.check(
          `auth_register:${clientIp}`,
          8,
          15 * 60_000
        );
        if (!regRate.allowed) {
          sendJson(
            req,
            res,
            429,
            {
              error: `Muitas tentativas de cadastro. Tente novamente em ${regRate.retryAfterSec}s.`,
            },
            { 'Retry-After': String(regRate.retryAfterSec) }
          );
          return;
        }

        const body = await readJsonBody(req);
        const parsed = RegisterSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(req, res, 400, {
            error: parsed.error.issues.map((i) => i.message).join(' · '),
          });
          return;
        }

        const { user, sessionToken } = await registerUser(parsed.data);
        const cookie = buildSessionCookieHeader(
          sessionToken,
          SESSION_TTL_SECONDS,
          isHttps
        );
        sendJson(req, res, 201, { user }, { 'Set-Cookie': cookie });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/login') {
        const body = await readJsonBody(req);
        const parsed = LoginSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(req, res, 400, {
            error: parsed.error.issues.map((i) => i.message).join(' · '),
          });
          return;
        }

        const loginRate = globalRateLimiter.check(
          `auth_login:${clientIp}:${parsed.data.email.toLowerCase()}`,
          10,
          15 * 60_000
        );
        if (!loginRate.allowed) {
          sendJson(
            req,
            res,
            429,
            {
              error: `Muitas tentativas de login. Aguarde ${loginRate.retryAfterSec}s.`,
            },
            { 'Retry-After': String(loginRate.retryAfterSec) }
          );
          return;
        }

        const { user, sessionToken } = await loginUser(parsed.data);
        const cookie = buildSessionCookieHeader(
          sessionToken,
          SESSION_TTL_SECONDS,
          isHttps
        );
        sendJson(req, res, 200, { user }, { 'Set-Cookie': cookie });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
        await logoutByCookieHeader(req.headers.cookie);
        const clearCookie = buildSessionCookieHeader(null, 0, isHttps);
        sendJson(req, res, 200, { ok: true }, { 'Set-Cookie': clearCookie });
        return;
      }

      // =====================================================================
      // WORKSPACE ESTÁTICO ISOLADO POR DONO DO PROJETO + SANDBOX CSP
      // =====================================================================

      if (req.method === 'GET' && url.pathname.startsWith('/workspace/')) {
        if (!authUser) {
          sendJson(req, res, 401, { error: 'Faça login para visualizar arquivos do workspace.' });
          return;
        }

        const relativeReq = decodeURIComponent(
          url.pathname.replace(/^\/workspace\//, '')
        );
        const safePath = path
          .normalize(relativeReq)
          .replace(/^(\.\.(\/|\\|$))+/, '');
        const projectIdSegment = safePath.split(/[\\/]/)[0] ?? '';

        if (!z.string().uuid().safeParse(projectIdSegment).success) {
          sendJson(req, res, 400, { error: 'Identificador de projeto inválido.' });
          return;
        }

        await stateMachine.assertProjectAccess(projectIdSegment, authUser.id);

        const fullFilePath = path.join(WORKSPACE_OUTPUTS_DIR, safePath);
        if (!fullFilePath.startsWith(WORKSPACE_OUTPUTS_DIR)) {
          sendJson(req, res, 403, { error: 'Acesso negado fora do workspace' });
          return;
        }

        try {
          const stat = await fs.stat(fullFilePath);
          if (stat.isFile()) {
            const ext = path.extname(fullFilePath).toLowerCase();
            const mimeMap: Record<string, string> = {
              '.html': 'text/html; charset=utf-8',
              '.css': 'text/css; charset=utf-8',
              '.js': 'application/javascript; charset=utf-8',
              '.json': 'application/json; charset=utf-8',
              '.md': 'text/markdown; charset=utf-8',
            };
            const contentType = mimeMap[ext] ?? 'text/plain; charset=utf-8';
            const content = await fs.readFile(fullFilePath);
            res.writeHead(200, {
              'Content-Type': contentType,
              'X-Content-Type-Options': 'nosniff',
              'Content-Security-Policy': "sandbox allow-scripts; default-src 'self' https://cdn.tailwindcss.com 'unsafe-inline' 'unsafe-eval';",
              'Cache-Control': 'no-store',
            });
            res.end(content);
            return;
          }
        } catch {
          sendJson(req, res, 404, { error: 'Arquivo do workspace não encontrado' });
          return;
        }
      }

      // GET /api/health
      if (req.method === 'GET' && url.pathname === '/api/health') {
        const llm = await getLLMStatus(authUser?.id ?? null);
        sendJson(req, res, 200, {
          status: 'ok',
          authenticated: Boolean(authUser),
          llm,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // =====================================================================
      // COFRE DE CHAVES DE IA POR USUÁRIO (AES-256-GCM ou MEMÓRIA DE SESSÃO)
      // =====================================================================

      if (req.method === 'GET' && url.pathname === '/api/settings/llm') {
        const status = await getLLMStatus(authUser?.id ?? null);
        sendJson(req, res, 200, status);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/settings/llm') {
        if (!authUser) {
          sendJson(req, res, 401, {
            code: 'AUTH_REQUIRED',
            error: 'Entre ou crie uma conta para conectar sua API key com isolamento criptografado.',
          });
          return;
        }

        const keyRate = globalRateLimiter.check(
          `llm_settings:${authUser.id}`,
          20,
          60_000
        );
        if (!keyRate.allowed) {
          sendJson(req, res, 429, {
            error: `Muitas alterações de chave. Aguarde ${keyRate.retryAfterSec}s.`,
          });
          return;
        }

        const body = await readJsonBody(req);
        const parsed = SaveLLMSettingsSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(req, res, 400, {
            error: 'Configuração de IA inválida',
            issues: parsed.error.issues,
          });
          return;
        }
        if (parsed.data.provider !== 'ollama' && !parsed.data.apiKey?.trim()) {
          sendJson(req, res, 400, {
            error: `Informe uma API Key válida para o provedor ${parsed.data.provider}.`,
          });
          return;
        }

        const status = await saveUserLLMConfig({
          userId: authUser.id,
          config: {
            provider: parsed.data.provider,
            model: parsed.data.model,
            apiKey: parsed.data.apiKey,
            baseUrl: parsed.data.baseUrl,
          },
          persistInDb: parsed.data.persistInDb,
        });
        sendJson(req, res, 200, status);
        return;
      }

      if (req.method === 'DELETE' && url.pathname === '/api/settings/llm') {
        if (!authUser) {
          sendJson(req, res, 401, { error: 'Sessão não autenticada.' });
          return;
        }
        const status = await deleteUserLLMConfig(authUser.id);
        sendJson(req, res, 200, status);
        return;
      }

      // =====================================================================
      // PROJETOS & HISTÓRICO PRIVADO DO USUÁRIO
      // =====================================================================

      if (req.method === 'GET' && url.pathname === '/api/projects') {
        if (!authUser) {
          sendJson(req, res, 200, { projects: [] });
          return;
        }
        const projects = await stateMachine.listUserProjects(authUser.id);
        sendJson(req, res, 200, { projects });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/api/projects') {
        if (!authUser) {
          sendJson(req, res, 401, {
            code: 'AUTH_REQUIRED',
            error: 'Entre ou crie uma conta para iniciar e salvar seu histórico de projetos.',
          });
          return;
        }

        const createRate = globalRateLimiter.check(
          `create_project:${authUser.id}`,
          8,
          60_000
        );
        if (!createRate.allowed) {
          sendJson(
            req,
            res,
            429,
            {
              error: `Limite de criação de projetos atingido (máx 8/min). Aguarde ${createRate.retryAfterSec}s.`,
            },
            { 'Retry-After': String(createRate.retryAfterSec) }
          );
          return;
        }

        const body = await readJsonBody(req);
        const parsed = CreateProjectSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(req, res, 400, {
            error: 'Payload inválido',
            issues: parsed.error.issues,
          });
          return;
        }

        const project = await stateMachine.createAndPlanProject({
          userId: authUser.id,
          ...parsed.data,
        });
        const snapshot = await stateMachine.getOfficeSnapshot(project.id);
        io.to(getProjectRoom(project.id)).emit('OFFICE_SNAPSHOT', snapshot);

        sendJson(req, res, 201, { project, snapshot });
        return;
      }

      // GET /api/projects/:id/export - Exporta MVP completo em .zip (sem node_modules/dist)
      const exportMatch = url.pathname.match(
        /^\/api\/projects\/([0-9a-f-]+)\/export$/i
      );
      if (req.method === 'GET' && exportMatch) {
        if (!authUser) {
          sendJson(req, res, 401, {
            code: 'AUTH_REQUIRED',
            error: 'Faça login para exportar o código do seu projeto.',
          });
          return;
        }

        const projectId = exportMatch[1];
        if (!z.string().uuid().safeParse(projectId).success) {
          sendJson(req, res, 400, { error: 'Identificador de projeto inválido.' });
          return;
        }

        await stateMachine.assertProjectAccess(projectId, authUser.id);
        const project = await stateMachine.getProject(projectId);

        const appDir = path.join(WORKSPACE_OUTPUTS_DIR, projectId, 'app');
        if (!appDir.startsWith(WORKSPACE_OUTPUTS_DIR)) {
          sendJson(req, res, 403, { error: 'Acesso negado fora do workspace.' });
          return;
        }

        try {
          const stat = await fs.stat(appDir);
          if (!stat.isDirectory()) {
            throw new Error('App directory missing');
          }
        } catch {
          sendJson(req, res, 404, {
            error:
              'MVP ainda não construído para este projeto. Aguarde a conclusão da etapa Builder.',
          });
          return;
        }

        const zip = new JSZip();
        async function appendDirToZip(dir: string) {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (
              entry.isSymbolicLink() ||
              entry.name === 'node_modules' ||
              entry.name === 'dist'
            ) {
              continue;
            }
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              await appendDirToZip(fullPath);
            } else {
              const rel = path.relative(appDir, fullPath).replace(/\\/g, '/');
              const data = await fs.readFile(fullPath);
              zip.file(rel, data);
            }
          }
        }

        await appendDirToZip(appDir);

        const slug =
          project.title
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 50) || 'ai-office-mvp';

        res.writeHead(200, {
          ...secHeaders,
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${slug}.zip"`,
          'Cache-Control': 'no-store',
        });

        await new Promise<void>((resolve, reject) => {
          zip
            .generateNodeStream({
              type: 'nodebuffer',
              streamFiles: true,
              compression: 'DEFLATE',
            })
            .on('error', reject)
            .pipe(res)
            .on('finish', resolve)
            .on('error', reject);
        });
        return;
      }

      sendJson(req, res, 404, { error: 'Rota não encontrada' });
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        sendJson(req, res, 413, { error: error.message });
        return;
      }
      if (error instanceof SyntaxError) {
        sendJson(req, res, 400, { error: 'JSON inválido no corpo da requisição.' });
        return;
      }
      if (error instanceof LLMNotConfiguredError) {
        sendJson(req, res, 428, {
          code: error.code,
          error: error.message,
        });
        return;
      }
      const message = sanitizeSensitiveText(
        error instanceof Error ? error.message : String(error)
      );
      if (message.startsWith('Acesso negado')) {
        sendJson(req, res, 403, { error: message });
        return;
      }
      if (
        message.includes('E-mail ou senha inválidos') ||
        message.includes('Já existe uma conta cadastrada')
      ) {
        sendJson(req, res, 400, { error: message });
        return;
      }
      console.error('[HTTP Error]:', message);
      sendJson(req, res, 500, { error: message });
    }
  });

  const io = createOfficeSocketServer(httpServer, stateMachine);

  httpServer.listen(PORT, () => {
    console.log(
      `[AI Office Backend] Servidor HTTP + Socket.io rodando em http://localhost:${PORT}`
    );
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('[AI Office Backend] Erro fatal na inicialização:', err);
    process.exit(1);
  });
}
