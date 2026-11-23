import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertSafePublicHttpUrl,
  decryptSecret,
  encryptSecret,
  hashPassword,
  sanitizeSensitiveText,
  SlidingWindowRateLimiter,
  verifyPassword,
} from './security.js';

test('AES-256-GCM encryptSecret / decryptSecret is user-AAD bound and tamper-evident', async () => {
  process.env.APP_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const secret = 'sk-ant-api03-example-secret-token-value-123456';
  const payload = await encryptSecret(secret, 'user-A:anthropic');

  assert.notEqual(payload.ciphertext, secret);
  const decrypted = await decryptSecret(payload, 'user-A:anthropic');
  assert.equal(decrypted, secret);

  // Tentar descriptografar no contexto de outro usuário deve falhar (AAD mismatch)
  await assert.rejects(() => decryptSecret(payload, 'user-B:anthropic'));

  // Adulteração de authTag deve falhar
  await assert.rejects(() =>
    decryptSecret({ ...payload, tag: Buffer.alloc(16, 1).toString('base64') }, 'user-A:anthropic')
  );
});

test('scrypt hashPassword / verifyPassword validates correctly', async () => {
  const hash = await hashPassword('SenhaForte!2026');
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(await verifyPassword('SenhaForte!2026', hash), true);
  assert.equal(await verifyPassword('SenhaErrada!2026', hash), false);
  assert.equal(await verifyPassword('anything', 'invalid-hash'), false);
});

test('SlidingWindowRateLimiter enforces maximum requests cap', () => {
  const limiter = new SlidingWindowRateLimiter();
  assert.equal(limiter.check('ip:1.2.3.4', 3, 60_000).allowed, true);
  assert.equal(limiter.check('ip:1.2.3.4', 3, 60_000).allowed, true);
  assert.equal(limiter.check('ip:1.2.3.4', 3, 60_000).allowed, true);

  const blocked = limiter.check('ip:1.2.3.4', 3, 60_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSec >= 1);
});

test('sanitizeSensitiveText redacts Gemini, Anthropic, OpenAI and Bearer tokens', () => {
  const raw =
    'Erro Gemini AIzaSyDummyKeyExample1234567890 e sk-ant-api03-secret1234567890 e Bearer abc.def.ghi';
  const clean = sanitizeSensitiveText(raw);
  assert.ok(!clean.includes('AIzaSyDummyKey'));
  assert.ok(!clean.includes('sk-ant-api03'));
  assert.ok(!clean.includes('abc.def.ghi'));
  assert.ok(clean.includes('***REDACTED***'));
});

test('assertSafePublicHttpUrl blocks SSRF targets (localhost, metadata, private IPs)', async () => {
  for (const dangerous of [
    'http://localhost:4000/api/health',
    'http://127.0.0.1:5432/',
    'http://169.254.169.254/latest/meta-data/',
    'http://192.168.0.1/admin',
    'http://10.0.0.5:8080/',
    'file:///etc/passwd',
  ]) {
    await assert.rejects(() => assertSafePublicHttpUrl(dangerous));
  }
});
