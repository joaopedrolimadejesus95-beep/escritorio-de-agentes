import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  try {
    for (const file of files) {
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf-8');
      await client.query(sql);
      console.log(`[DB] Migration aplicada com sucesso: ${file}`);
    }
  } finally {
    client.release();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => pool.end())
    .catch((err) => {
      console.error('[DB] Falha ao rodar migrations:', err);
      process.exit(1);
    });
}
