import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { pool } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { OfficeStateMachine } from './orchestrator/stateMachine.js';
import { ResearchPod } from './pods/researchPod.js';
import {
  DesignPod,
  EngineeringPod,
  GrowthPod,
} from './pods/departmentPods.js';
import {
  createOfficeSocketServer,
  getProjectRoom,
} from './server/socketServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_OUTPUTS_DIR = path.resolve(__dirname, '../../workspace_outputs');

const PORT = Number(process.env.PORT ?? 4000);

const CreateProjectSchema = z.object({
  title: z.string().min(3),
  rawScope: z.string().min(10),
  tokenBudget: z.number().int().positive().optional(),
});

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? JSON.parse(raw) : {};
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  data: unknown
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

export async function startServer(): Promise<void> {
  await runMigrations();

  const stateMachine = new OfficeStateMachine();

  // Registra os Pods Especialistas (Executor + Validador Determinístico)
  stateMachine.registerPod(new ResearchPod());
  stateMachine.registerPod(new DesignPod());
  stateMachine.registerPod(new EngineeringPod());
  stateMachine.registerPod(new GrowthPod());

  const httpServer = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {});
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    try {
      // GET / - Status raiz da API para quem abrir http://localhost:4000 no navegador
      if (req.method === 'GET' && url.pathname === '/') {
        sendJson(res, 200, {
          service: 'AI Office 3D — DAG Orchestrator Backend',
          status: 'online',
          frontendUrl: 'http://localhost:5173',
          endpoints: ['GET /api/health', 'GET /api/projects', 'POST /api/projects'],
        });
        return;
      }

      // GET /workspace/:projectId/* - Serve os arquivos reais (HTML, CSS, JS, Markdown, JSON) construídos pelos agentes
      if (req.method === 'GET' && url.pathname.startsWith('/workspace/')) {
        const relativeReq = decodeURIComponent(
          url.pathname.replace(/^\/workspace\//, '')
        );
        const safePath = path
          .normalize(relativeReq)
          .replace(/^(\.\.(\/|\\|$))+/, '');
        const fullFilePath = path.join(WORKSPACE_OUTPUTS_DIR, safePath);

        if (!fullFilePath.startsWith(WORKSPACE_OUTPUTS_DIR)) {
          sendJson(res, 403, { error: 'Acesso negado fora do workspace' });
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
            const contentType =
              mimeMap[ext] ?? 'text/plain; charset=utf-8';
            const content = await fs.readFile(fullFilePath);
            res.writeHead(200, {
              'Content-Type': contentType,
              'Access-Control-Allow-Origin': '*',
            });
            res.end(content);
            return;
          }
        } catch {
          sendJson(res, 404, { error: 'Arquivo do workspace não encontrado' });
          return;
        }
      }

      // GET /api/health
      if (req.method === 'GET' && url.pathname === '/api/health') {
        sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
        return;
      }

      // GET /api/projects - Lista projetos existentes (ou cria um demo se vazio)
      if (req.method === 'GET' && url.pathname === '/api/projects') {
        const result = await pool.query(
          `SELECT id, title, raw_scope, status, token_budget, tokens_used, created_at
           FROM projects
           ORDER BY created_at DESC
           LIMIT 20`
        );
        sendJson(res, 200, { projects: result.rows });
        return;
      }

      // POST /api/projects - Cria e planeja um novo projeto no DAG
      if (req.method === 'POST' && url.pathname === '/api/projects') {
        const body = await readJsonBody(req);
        const parsed = CreateProjectSchema.safeParse(body);
        if (!parsed.success) {
          sendJson(res, 400, {
            error: 'Payload inválido',
            issues: parsed.error.issues,
          });
          return;
        }

        const project = await stateMachine.createAndPlanProject(parsed.data);
        const snapshot = await stateMachine.getOfficeSnapshot(project.id);
        io.to(getProjectRoom(project.id)).emit('OFFICE_SNAPSHOT', snapshot);

        sendJson(res, 201, { project, snapshot });
        return;
      }

      sendJson(res, 404, { error: 'Rota não encontrada' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[HTTP Error]:', message);
      sendJson(res, 500, { error: message });
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
