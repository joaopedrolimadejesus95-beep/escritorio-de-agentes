import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeRateLimitBackoffMs,
  formatLLMErrorMessage,
  isHardQuotaExhausted,
  isRateLimitError,
  parseRetryDelayMs,
} from './llmService.js';

test('parseRetryDelayMs extracts retry seconds and bounds backoff safely', () => {
  assert.equal(parseRetryDelayMs('{"error":{"code":429,"retryDelay":"18s"}}'), 18_000);
  assert.equal(parseRetryDelayMs('Please retry in 45s'), 20_000);
  assert.equal(parseRetryDelayMs('Please retry in 0.5s'), 1500);
  assert.equal(parseRetryDelayMs('Unknown error'), null);
  assert.equal(computeRateLimitBackoffMs('HTTP 429 Too Many Requests'), 12_000);
});

test('isRateLimitError and isHardQuotaExhausted classify 429 errors accurately', () => {
  const rpmMsg = '{"error":{"code":429,"message":"You exceeded your current quota, retry in 14s"}}';
  const dailyMsg = '{"error":{"code":429,"message":"Quota exceeded for metric: GenerateRequestsPerDay, limit: 0"}}';

  assert.equal(isRateLimitError(rpmMsg), true);
  assert.equal(isHardQuotaExhausted(rpmMsg), false);

  assert.equal(isRateLimitError(dailyMsg), true);
  assert.equal(isHardQuotaExhausted(dailyMsg), true);

  const formattedRpm = formatLLMErrorMessage(rpmMsg);
  const formattedDaily = formatLLMErrorMessage(dailyMsg);
  assert.match(formattedRpm, /429/);
  assert.match(formattedRpm, /~14s/);
  assert.equal(isRateLimitError(formattedDaily), true);
  assert.equal(isHardQuotaExhausted(formattedDaily), true);
});
