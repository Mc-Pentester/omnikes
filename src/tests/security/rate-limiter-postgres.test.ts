import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { checkRateLimit, resetRateLimit } from '@omnikes/lib/rate-limiter';

// CI provisions PostgreSQL and applies migrations before the test suite.
// Local runs without a configured DB remain self-contained.
const canUsePostgres = process.env.CI === 'true' && Boolean(process.env.DATABASE_URL);

describe.skipIf(!canUsePostgres)('rate limiter PostgreSQL concurrency proof', () => {
  const identifier = `postgres-integration:${randomUUID()}`;

  afterAll(async () => {
    await resetRateLimit(identifier);
  });

  it('enforces one atomic quota for concurrent requests sharing the database', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => checkRateLimit(identifier)),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(10);
    expect(results.filter((result) => !result.allowed)).toHaveLength(2);
    expect(results.every((result) => result.remaining >= 0)).toBe(true);
  });
});
