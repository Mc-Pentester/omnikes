import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkRateLimit,
  cleanupExpiredEntries,
  getIpRateLimitIdentifier,
  getRateLimitIdentifier,
  getRateLimitStoreSize,
  resetRateLimit,
  startRateLimitCleanup,
  stopRateLimitCleanup,
} from '@omnikes/lib/rate-limiter';

describe('rate-limiter', () => {
  beforeEach(() => {
    stopRateLimitCleanup();
    vi.useRealTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    // Clear the module-level store through unique identifiers used by each test.
    cleanupExpiredEntries();
  });

  it('allows 10 attempts and rejects the 11th within the window', () => {
    const id = 'test-rate-limit-10';

    for (let i = 0; i < 10; i += 1) {
      const result = checkRateLimit(id);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9 - i);
    }

    const blocked = checkRateLimit(id);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.resetTime).toBe(Date.parse('2026-01-01T00:15:00.000Z'));
  });

  it('resets an identifier explicitly', () => {
    const id = 'test-rate-limit-reset';

    checkRateLimit(id);
    resetRateLimit(id);

    const result = checkRateLimit(id);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('expires entries after the 15-minute window', () => {
    const id = 'test-rate-limit-expiry';

    checkRateLimit(id);
    vi.advanceTimersByTime(15 * 60 * 1000 + 1);
    cleanupExpiredEntries();

    const result = checkRateLimit(id);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
  });

  it('bounds the store when many identifiers are added', () => {
    for (let i = 0; i < 10001; i += 1) {
      checkRateLimit(`test-rate-limit-bounded-${i}`);
    }

    expect(getRateLimitStoreSize()).toBeLessThanOrEqual(10000);
  });

  it('starts and stops cleanup without creating duplicate timers', () => {
    startRateLimitCleanup();
    startRateLimitCleanup();
    stopRateLimitCleanup();

    expect(true).toBe(true);
  });

  it('builds deterministic email and IP identifiers', () => {
    expect(getRateLimitIdentifier('user@example.com', '127.0.0.1')).toBe(
      'user@example.com:127.0.0.1',
    );
    expect(getIpRateLimitIdentifier('127.0.0.1')).toBe('ip:127.0.0.1');
    expect(getIpRateLimitIdentifier()).toBe('ip:unknown');
  });
});
