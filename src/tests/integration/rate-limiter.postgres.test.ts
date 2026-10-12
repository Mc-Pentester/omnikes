import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { checkRateLimit, resetRateLimit } from '@omnikes/lib/rate-limiter';

describe('rate limiter PostgreSQL concurrency proof', () => {
  const identifier = `postgres-integration:${randomUUID()}`;

  afterAll(async () => {
    await resetRateLimit(identifier);
    await prisma.$disconnect();
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
