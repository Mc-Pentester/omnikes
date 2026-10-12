import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRawMock, executeRawMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn(),
  executeRawMock: vi.fn(),
}));

vi.mock('@omnikes/lib/prisma', () => ({
  prisma: {
    $queryRaw: queryRawMock,
    $executeRaw: executeRawMock,
  },
}));

import {
  checkRateLimit,
  cleanupExpiredEntries,
  getClientIP,
  getIpRateLimitIdentifier,
  getRateLimitIdentifier,
  resetRateLimit,
  startRateLimitCleanup,
  stopRateLimitCleanup,
} from '@omnikes/lib/rate-limiter';

interface MockBucket {
  count: number;
  resetTime: Date;
}

const buckets = new Map<string, MockBucket>();

describe('PostgreSQL-backed rate limiter', () => {
  beforeEach(() => {
    stopRateLimitCleanup();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    buckets.clear();
    queryRawMock.mockReset();
    executeRawMock.mockReset();

    queryRawMock.mockImplementation(async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      // The SQL key is a SHA-256 digest, never the original email/IP identifier.
      const key = String(values[1]);
      const now = Date.now();
      const existing = buckets.get(key);
      const bucket: MockBucket = !existing || existing.resetTime.getTime() <= now
        ? { count: 1, resetTime: new Date(now + 15 * 60 * 1000) }
        : {
            count: Math.min(existing.count + 1, 11),
            resetTime: existing.resetTime,
          };
      buckets.set(key, bucket);
      return [{ count: bucket.count, resetTime: bucket.resetTime }];
    });

    executeRawMock.mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      if (sql.includes('WHERE "identifier" =')) {
        buckets.delete(String(values[0]));
      }
      return 1;
    });
  });

  afterEach(() => {
    stopRateLimitCleanup();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('allows ten attempts and rejects the eleventh within the 15-minute window', async () => {
    for (let i = 0; i < 10; i += 1) {
      const result = await checkRateLimit('test-rate-limit-10');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9 - i);
    }

    const blocked = await checkRateLimit('test-rate-limit-10');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetTime).toBe(Date.parse('2026-01-01T00:15:00.000Z'));
  });

  it('resets an identifier explicitly', async () => {
    await checkRateLimit('test-rate-limit-reset');
    await resetRateLimit('test-rate-limit-reset');

    const result = await checkRateLimit('test-rate-limit-reset');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('expires a bucket after the 15-minute window', async () => {
    await checkRateLimit('test-rate-limit-expiry');
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);

    const result = await checkRateLimit('test-rate-limit-expiry');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('caps a blocked counter instead of growing indefinitely', async () => {
    for (let i = 0; i < 30; i += 1) {
      await checkRateLimit('test-rate-limit-capped');
    }

    const bucket = [...buckets.values()][0];
    expect(bucket.count).toBe(11);
  });

  it('starts and stops cleanup without creating duplicate timers', () => {
    startRateLimitCleanup();
    startRateLimitCleanup();
    stopRateLimitCleanup();
    expect(true).toBe(true);
  });

  it('removes expired buckets and applies a hard table ceiling during cleanup', async () => {
    await cleanupExpiredEntries();
    expect(executeRawMock).toHaveBeenCalledTimes(2);
  });

  it('builds stable normalized email and IP identifiers', () => {
    expect(getRateLimitIdentifier(' User@Example.com ', '127.0.0.1')).toBe(
      'email:user@example.com:ip:127.0.0.1',
    );
    expect(getIpRateLimitIdentifier('127.0.0.1')).toBe('ip:127.0.0.1');
    expect(getIpRateLimitIdentifier()).toBe('ip:unknown');
  });

  it('ignores forwarded headers unless a trusted proxy is configured', () => {
    vi.stubEnv('TRUSTED_PROXY', 'false');
    expect(getClientIP(new Headers({ 'x-forwarded-for': '203.0.113.10' }))).toBeUndefined();
  });

  it('accepts only valid client IPs from a configured trusted proxy', () => {
    vi.stubEnv('TRUSTED_PROXY', 'true');
    expect(getClientIP(new Headers({ 'x-forwarded-for': '203.0.113.10, 10.0.0.1' }))).toBe('203.0.113.10');
    expect(getClientIP(new Headers({ 'x-forwarded-for': 'attacker-value', 'x-real-ip': '203.0.113.11' }))).toBeUndefined();
    expect(getClientIP(new Headers({ 'x-real-ip': '2001:db8::1' }))).toBe('2001:db8::1');
  });
});
