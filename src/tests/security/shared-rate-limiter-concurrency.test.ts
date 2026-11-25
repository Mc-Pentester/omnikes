import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  checkRateLimit,
  getAccountRateLimitIdentifier,
  resetRateLimit,
} from '@omnikes/lib/rate-limiter';

const databaseDescribe = process.env.DATABASE_URL ? describe : describe.skip;

databaseDescribe('shared PostgreSQL rate limiter', () => {
  it('enforces one atomic quota across concurrent callers sharing the database', async () => {
    const identifier = getAccountRateLimitIdentifier(
      `rate-limit-concurrency-${randomUUID()}`,
      'integration-test',
    );

    try {
      // Concurrent calls exercise PostgreSQL's ON CONFLICT atomic increment.
      // Separate application processes use this same persistent bucket.
      const results = await Promise.all(
        Array.from({ length: 20 }, () => checkRateLimit(identifier, 10)),
      );

      expect(results.filter((result) => result.allowed)).toHaveLength(10);
      expect(results.filter((result) => !result.allowed)).toHaveLength(10);
      expect(results.every((result) => result.remaining >= 0)).toBe(true);
    } finally {
      await resetRateLimit(identifier);
    }
  });
});
