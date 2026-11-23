import { pool } from '../db/pool.js';
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  parseCookies,
  verifyPassword,
} from '../security/security.js';

export interface AuthUserDTO {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

function mapUserRow(row: Record<string, any>): AuthUserDTO {
  return {
    id: String(row.id),
    name: String(row.name),
    email: String(row.email),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

async function createSessionForUser(userId: string): Promise<string> {
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await pool.query(
    `DELETE FROM sessions WHERE user_id = $1 AND expires_at < NOW()`,
    [userId]
  );

  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt.toISOString()]
  );

  return rawToken;
}

export async function registerUser(params: {
  name: string;
  email: string;
  password: string;
}): Promise<{ user: AuthUserDTO; sessionToken: string }> {
  const cleanName = params.name.trim();
  const cleanEmail = params.email.trim().toLowerCase();

  const existing = await pool.query(
    `SELECT id FROM users WHERE email = $1`,
    [cleanEmail]
  );
  if (existing.rows.length > 0) {
    throw new Error('Já existe uma conta cadastrada com este e-mail.');
  }

  const passwordHash = await hashPassword(params.password);
  const res = await pool.query(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, name, email, created_at`,
    [cleanName, cleanEmail, passwordHash]
  );

  const user = mapUserRow(res.rows[0]);
  const sessionToken = await createSessionForUser(user.id);
  return { user, sessionToken };
}

export async function loginUser(params: {
  email: string;
  password: string;
}): Promise<{ user: AuthUserDTO; sessionToken: string }> {
  const cleanEmail = params.email.trim().toLowerCase();
  const res = await pool.query(
    `SELECT id, name, email, password_hash, created_at
     FROM users
     WHERE email = $1`,
    [cleanEmail]
  );

  if (res.rows.length === 0) {
    throw new Error('E-mail ou senha inválidos.');
  }

  const row = res.rows[0];
  const valid = await verifyPassword(params.password, String(row.password_hash));
  if (!valid) {
    throw new Error('E-mail ou senha inválidos.');
  }

  const user = mapUserRow(row);
  const sessionToken = await createSessionForUser(user.id);
  return { user, sessionToken };
}

export async function getUserByCookieHeader(
  cookieHeader?: string | null
): Promise<AuthUserDTO | null> {
  const cookies = parseCookies(cookieHeader);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (!rawToken || rawToken.length < 16) return null;

  const tokenHash = hashSessionToken(rawToken);
  const res = await pool.query(
    `SELECT u.id, u.name, u.email, u.created_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );

  if (res.rows.length === 0) return null;
  return mapUserRow(res.rows[0]);
}

export async function logoutByCookieHeader(
  cookieHeader?: string | null
): Promise<void> {
  const cookies = parseCookies(cookieHeader);
  const rawToken = cookies[SESSION_COOKIE_NAME];
  if (!rawToken) return;

  const tokenHash = hashSessionToken(rawToken);
  await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash]);
}
