import pg from 'pg';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface QueryResult<TRow = any> {
  rows: TRow[];
  rowCount: number;
}

export interface DbClient {
  query<TRow = any>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<TRow>>;
  release(): void;
}

function isTcpPortOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(600);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

class HybridPgPool {
  private pgPool: pg.Pool | null = null;
  private pglite: PGlite | null = null;
  private initPromise: Promise<void> | null = null;
  private txMutex: Promise<void> = Promise.resolve();

  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      const connStr =
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/ai_office';
      const parsedUrl = new URL(connStr);
      const host = parsedUrl.hostname || 'localhost';
      const port = Number(parsedUrl.port || 5432);

      const hasExternalPg = await isTcpPortOpen(host, port);
      if (hasExternalPg) {
        const candidatePool = new Pool({
          connectionString: connStr,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 3000,
        });
        try {
          const testClient = await candidatePool.connect();
          testClient.release();
          this.pgPool = candidatePool;
          console.log(`[DB] Conectado ao PostgreSQL externo em ${host}:${port}`);
          return;
        } catch (err) {
          await candidatePool.end().catch(() => {});
          console.warn(
            `[DB] PostgreSQL em ${host}:${port} recusou credenciais padrão (defina DATABASE_URL para usá-lo). Usando PostgreSQL embarcado (PGlite)...`
          );
        }
      }

      const dataDir = path.resolve(__dirname, '../../.pgdata');
      this.pglite = new PGlite(dataDir);
      await this.pglite.waitReady;
      console.log(
        `[DB] Motor PostgreSQL embarcado (PGlite WASM) ativo em ${dataDir}`
      );
    })();

    return this.initPromise;
  }

  public async query<TRow = any>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<TRow>> {
    await this.ensureInitialized();
    if (this.pgPool) {
      const res = await this.pgPool.query(sql, params);
      return {
        rows: res.rows as TRow[],
        rowCount: res.rowCount ?? res.rows.length,
      };
    }

    if (params.length === 0 && sql.includes(';')) {
      await this.pglite!.exec(sql);
      return { rows: [], rowCount: 0 };
    }
    const res = await this.pglite!.query<TRow>(sql, params);
    return {
      rows: res.rows,
      rowCount: res.affectedRows ?? res.rows.length,
    };
  }

  public async connect(): Promise<DbClient> {
    await this.ensureInitialized();
    if (this.pgPool) {
      const client = await this.pgPool.connect();
      return {
        query: async <TRow = Record<string, any>>(
          sql: string,
          params: unknown[] = []
        ) => {
          const res = await client.query(sql, params);
          return {
            rows: res.rows as TRow[],
            rowCount: res.rowCount ?? res.rows.length,
          };
        },
        release: () => client.release(),
      };
    }

    // Serializa transações quando usando PGlite single-connection
    let releaseLock!: () => void;
    const prevMutex = this.txMutex;
    this.txMutex = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    await prevMutex;

    return {
      query: async <TRow = Record<string, any>>(
        sql: string,
        params: unknown[] = []
      ) => {
        const trimmed = sql.trim().toUpperCase();
        if (
          trimmed === 'BEGIN' ||
          trimmed === 'COMMIT' ||
          trimmed === 'ROLLBACK'
        ) {
          await this.pglite!.exec(sql);
          return { rows: [], rowCount: 0 };
        }
        if (params.length === 0 && sql.includes(';')) {
          await this.pglite!.exec(sql);
          return { rows: [], rowCount: 0 };
        }
        const res = await this.pglite!.query<TRow>(sql, params);
        return {
          rows: res.rows,
          rowCount: res.affectedRows ?? res.rows.length,
        };
      },
      release: () => {
        releaseLock();
      },
    };
  }

  public async end(): Promise<void> {
    if (this.pgPool) {
      await this.pgPool.end();
    }
    if (this.pglite) {
      await this.pglite.close();
    }
  }
}

export const pool = new HybridPgPool();

export async function withTransaction<T>(
  fn: (client: DbClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
