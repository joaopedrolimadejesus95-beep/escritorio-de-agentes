import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs/promises';
import type http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ENV_LOCAL_PATH = path.resolve(__dirname, '../../.env.local');
export const SESSION_COOKIE_NAME = 'aioffice_sid';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 dias

let masterKeyBuffer: Buffer | null = null;

/**
 * Inicializa ou gera a chave mestra de criptografia (AES-256-GCM, 32 bytes).
 * Nunca fica hardcodada no código-fonte: lê de `APP_ENCRYPTION_KEY` ou grava localmente em `backend/.env.local`.
 */
export async function ensureMasterEncryptionKey(): Promise<Buffer> {
  if (masterKeyBuffer) return masterKeyBuffer;

  const rawEnv = process.env.APP_ENCRYPTION_KEY?.trim();
  if (rawEnv) {
    const parsed = /^[0-9a-fA-F]{64}$/.test(rawEnv)
      ? Buffer.from(rawEnv, 'hex')
      : Buffer.from(rawEnv, 'base64');
    if (parsed.length !== 32) {
      throw new Error(
        'APP_ENCRYPTION_KEY inválida: precisa ter 32 bytes (64 hex chars ou 44 base64 chars).'
      );
    }
    masterKeyBuffer = parsed;
    return parsed;
  }

  // Gera chave criptograficamente segura no primeiro boot e persiste apenas em .env.local
  const generated = crypto.randomBytes(32);
  const hexKey = generated.toString('hex');
  process.env.APP_ENCRYPTION_KEY = hexKey;
  masterKeyBuffer = generated;

  try {
    let existing = '';
    try {
      existing = await fs.readFile(ENV_LOCAL_PATH, 'utf-8');
    } catch {
      existing = '';
    }
    if (!existing.includes('APP_ENCRYPTION_KEY=')) {
      const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
      await fs.writeFile(
        ENV_LOCAL_PATH,
        `${existing}${prefix}APP_ENCRYPTION_KEY=${hexKey}\n`,
        { encoding: 'utf-8', mode: 0o600 }
      );
    }
  } catch (err) {
    console.warn(
      '[Security] Não foi possível salvar APP_ENCRYPTION_KEY em .env.local:',
      err instanceof Error ? err.message : String(err)
    );
  }

  return generated;
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

/**
 * Criptografa uma API key usando AES-256-GCM autenticado + AAD vinculada ao usuário/provedor.
 */
export async function encryptSecret(
  plaintext: string,
  aadContext: string
): Promise<EncryptedPayload> {
  const key = await ensureMasterEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aadContext, 'utf-8'));

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Descriptografa uma API key somente no backend em memória no momento da chamada.
 */
export async function decryptSecret(
  payload: EncryptedPayload,
  aadContext: string
): Promise<string> {
  const key = await ensureMasterEncryptionKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(aadContext, 'utf-8'));
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString('utf-8');
}

// ============================================================================
// HASH DE SENHAS (scrypt + timingSafeEqual) E TOKENS DE SESSÃO
// ============================================================================

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      64,
      { N: 16384, r: 8, p: 1 },
      (err, key) => {
        if (err) reject(err);
        else resolve(key);
      }
    );
  });
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      expected.length,
      { N: 16384, r: 8, p: 1 },
      (err, key) => {
        if (err) reject(err);
        else resolve(key);
      }
    );
  });

  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf-8').digest('hex');
}

export function parseCookies(cookieHeader?: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

export function buildSessionCookieHeader(
  token: string | null,
  maxAgeSeconds: number,
  isHttps: boolean
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token ? encodeURIComponent(token) : ''}`,
    'Path=/',
    'HttpOnly',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
  ];
  if (isHttps) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

// ============================================================================
// SANITIZAÇÃO DE SEGREDOS (IMPEDE VAZAMENTO EM LOGS, DB E ERROS)
// ============================================================================

export function sanitizeSensitiveText(input: string): string {
  return input
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, 'AIza***REDACTED***')
    .replace(/sk-ant-[0-9A-Za-z_-]{16,}/g, 'sk-ant-***REDACTED***')
    .replace(/sk-[0-9A-Za-z_-]{16,}/g, 'sk-***REDACTED***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***REDACTED***')
    .replace(/x-api-key['":\s=]+[A-Za-z0-9._-]+/gi, 'x-api-key=***REDACTED***');
}

// ============================================================================
// RATE LIMITER EM JANELA DESLIZANTE (ANTI BRUTE-FORCE & ANTI ABUSO DE API)
// ============================================================================

export interface RateLimitCheckResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
}

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private lastCleanupAt = Date.now();

  public check(
    bucketKey: string,
    maxRequests: number,
    windowMs: number
  ): RateLimitCheckResult {
    const now = Date.now();
    const cutoff = now - windowMs;

    if (now - this.lastCleanupAt > 5 * 60_000) {
      this.cleanup(now - 60 * 60_000);
      this.lastCleanupAt = now;
    }

    const timestamps = (this.buckets.get(bucketKey) ?? []).filter(
      (ts) => ts > cutoff
    );

    if (timestamps.length >= maxRequests) {
      const oldest = timestamps[0] ?? now;
      const retryAfterSec = Math.max(
        1,
        Math.ceil((oldest + windowMs - now) / 1000)
      );
      this.buckets.set(bucketKey, timestamps);
      return {
        allowed: false,
        limit: maxRequests,
        remaining: 0,
        retryAfterSec,
      };
    }

    timestamps.push(now);
    this.buckets.set(bucketKey, timestamps);

    return {
      allowed: true,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - timestamps.length),
      retryAfterSec: 0,
    };
  }

  private cleanup(minTs: number): void {
    for (const [k, arr] of this.buckets.entries()) {
      const filtered = arr.filter((ts) => ts > minTs);
      if (filtered.length === 0) {
        this.buckets.delete(k);
      } else {
        this.buckets.set(k, filtered);
      }
    }
  }
}

export const globalRateLimiter = new SlidingWindowRateLimiter();

export function getClientIp(req: http.IncomingMessage): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// ============================================================================
// HEADERS DE SEGURANÇA & CORS RESTRITO (CREDENCIAMENTO COM COOKIE HTTPONLY)
// ============================================================================

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
];

export function resolveAllowedCorsOrigin(
  requestOrigin?: string | null
): string | null {
  const envOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowlist = envOrigins.length > 0 ? envOrigins : DEFAULT_ALLOWED_ORIGINS;

  if (!requestOrigin) return allowlist[0] ?? null;
  if (allowlist.includes(requestOrigin)) return requestOrigin;

  for (const pattern of allowlist) {
    if (pattern.startsWith('https://*.') && requestOrigin.startsWith('https://')) {
      const suffix = pattern.slice('https://*'.length); // e.g. ".vercel.app"
      if (requestOrigin.endsWith(suffix)) {
        return requestOrigin;
      }
    }
  }

  return null;
}

export function buildSecurityHeaders(params: {
  requestOrigin?: string | null;
  isApi?: boolean;
}): Record<string, string> {
  const allowedOrigin = resolveAllowedCorsOrigin(params.requestOrigin);
  const headers: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    Vary: 'Origin',
  };

  if (params.isApi) {
    headers['Cache-Control'] = 'no-store';
  }

  if (allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }

  return headers;
}

// ============================================================================
// PROTEÇÃO CONTRA SSRF (BLOQUEIO DE REDES PRIVADAS, LOOPBACK E METADATA)
// ============================================================================

function isPrivateOrReservedIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/i, '');

  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // Link-local / cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // Multicast / reserved
    return false;
  }

  if (net.isIPv6(clean)) {
    const lower = clean.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('fe80:')) return true; // Link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // Unique local
    return false;
  }

  return true;
}

export async function assertSafePublicHttpUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Protocolo não permitido em requisição externa: ${parsed.protocol}`);
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '0.0.0.0'
  ) {
    throw new Error(`Host interno bloqueado por segurança (SSRF): ${host}`);
  }

  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error(`IP privado ou reservado bloqueado (SSRF): ${host}`);
    }
    return parsed;
  }

  const records = await dns.lookup(host, { all: true });
  if (records.length === 0) {
    throw new Error(`Host não resolveu para IP público: ${host}`);
  }
  for (const rec of records) {
    if (isPrivateOrReservedIp(rec.address)) {
      throw new Error(
        `Destino bloqueado por segurança (SSRF -> ${rec.address}).`
      );
    }
  }

  return parsed;
}
