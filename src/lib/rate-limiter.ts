/**
 * PostgreSQL-backed rate limiter shared by all OmniKès application processes
 * that use the same local database. It does not require Redis or cloud services.
 *
 * Identifiers are SHA-256 hashed before persistence to avoid storing email/IP
 * values in the rate-limit table. PostgreSQL upsert provides atomic increments
 * under concurrent requests and across processes.
 */
import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { prisma } from '@omnikes/lib/prisma';

interface RateLimitRow {
  count: number;
  resetTime: Date;
}

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 10000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

let cleanupTimer: NodeJS.Timeout | null = null;

function hashIdentifier(identifier: string): string {
  return createHash('sha256').update(identifier).digest('hex');
}

export function startRateLimitCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    void cleanupExpiredEntries().catch((error: unknown) => {
      console.error('Rate-limit cleanup failed:', error instanceof Error ? error.message : 'unknown error');
    });
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref?.();
}

export function stopRateLimitCleanup(): void {
  if (!cleanupTimer) return;
  clearInterval(cleanupTimer);
  cleanupTimer = null;
}

/**
 * Atomically increments one quota in PostgreSQL. The extra count is capped at
 * MAX_ATTEMPTS + 1 so repeated blocked requests cannot grow the counter forever.
 */
export async function checkRateLimit(identifier: string, maxAttempts = MAX_ATTEMPTS): Promise<{
  allowed: boolean;
  remaining: number;
  resetTime?: number;
}> {
  const key = hashIdentifier(identifier);
  const rows = await prisma.$queryRaw<RateLimitRow[]>`
    INSERT INTO "rate_limit_buckets" ("id", "identifier", "count", "resetTime", "updatedAt")
    VALUES (${randomUUID()}, ${key}, 1, NOW() + (${WINDOW_MS} * INTERVAL '1 millisecond'), NOW())
    ON CONFLICT ("identifier") DO UPDATE
    SET
      "count" = CASE
        WHEN "rate_limit_buckets"."resetTime" <= NOW() THEN 1
        WHEN "rate_limit_buckets"."count" < ${maxAttempts + 1}
          THEN "rate_limit_buckets"."count" + 1
        ELSE "rate_limit_buckets"."count"
      END,
      "resetTime" = CASE
        WHEN "rate_limit_buckets"."resetTime" <= NOW()
          THEN NOW() + (${WINDOW_MS} * INTERVAL '1 millisecond')
        ELSE "rate_limit_buckets"."resetTime"
      END,
      "updatedAt" = NOW()
    RETURNING "count", "resetTime"
  `;

  const entry = rows[0];
  if (!entry) throw new Error('Rate limiter failed to return a quota result');

  return {
    allowed: entry.count <= maxAttempts,
    remaining: Math.max(0, maxAttempts - entry.count),
    resetTime: new Date(entry.resetTime).getTime(),
  };
}

export async function resetRateLimit(identifier: string): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM "rate_limit_buckets" WHERE "identifier" = ${hashIdentifier(identifier)}
  `;
}

/**
 * Stable account-level quota key, independent of the source IP. Callers should
 * apply a separate getIpRateLimitIdentifier quota when an IP is available.
 */
export function getAccountRateLimitIdentifier(accountIdentifier: string, scope = 'auth'): string {
  const normalizedIdentifier = accountIdentifier.trim().toLowerCase();
  return `account:${scope}:${normalizedIdentifier}`;
}

export function getIpRateLimitIdentifier(ipAddress?: string, scope = 'auth'): string {
  return ipAddress ? `ip:${scope}:${ipAddress}` : `ip:${scope}:unknown`;
}

/**
 * Only trust forwarding headers when the deployment explicitly trusts a proxy.
 * The proxy must overwrite these headers, not append to attacker-supplied values.
 * Invalid IP values are ignored rather than becoming attacker-controlled keys.
 */
export function getClientIP(headers: Headers): string | undefined {
  if (process.env.TRUSTED_PROXY !== 'true') return undefined;

  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const clientIP = forwardedFor.split(',')[0]?.trim();
    return clientIP && isIP(clientIP) ? clientIP : undefined;
  }

  const realIP = headers.get('x-real-ip')?.trim();
  return realIP && isIP(realIP) ? realIP : undefined;
}

/** Remove expired buckets and enforce a hard storage ceiling. */
export async function cleanupExpiredEntries(): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM "rate_limit_buckets"
    WHERE "id" IN (
      SELECT "id"
      FROM "rate_limit_buckets"
      WHERE "resetTime" <= NOW()
      ORDER BY "resetTime" ASC
      LIMIT 2000
    )
  `;

  await prisma.$executeRaw`
    DELETE FROM "rate_limit_buckets"
    WHERE "id" IN (
      SELECT "id"
      FROM "rate_limit_buckets"
      ORDER BY "resetTime" ASC
      LIMIT GREATEST((SELECT COUNT(*) FROM "rate_limit_buckets") - ${MAX_ENTRIES}, 0)
    )
  `;
}
