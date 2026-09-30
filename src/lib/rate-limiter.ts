/**
 * Bounded in-memory rate limiter for security-sensitive endpoints
 * Tracks attempts by identifier (email, IP, or combination)
 * Features:
 * - Bounded memory with MAX_ENTRIES
 * - Automatic periodic cleanup
 * - Safe client IP extraction
 * - 429 support with Retry-After
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const MAX_ATTEMPTS = 10; // Maximum attempts per window
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
const MAX_ENTRIES = 10000; // Maximum number of entries to prevent unbounded memory growth
const CLEANUP_INTERVAL_MS = 60 * 1000; // Cleanup every minute

let cleanupTimer: NodeJS.Timeout | null = null;

/**
 * Start automatic cleanup of expired entries
 * Call this during application initialization
 */
export function startRateLimitCleanup(): void {
  if (cleanupTimer) {
    return; // Already started
  }
  cleanupTimer = setInterval(() => {
    cleanupExpiredEntries();
  }, CLEANUP_INTERVAL_MS);
}

/**
 * Stop automatic cleanup
 * Call this during application shutdown
 */
export function stopRateLimitCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Check if rate limit is exceeded for a given identifier
 * Returns detailed information including reset time for Retry-After header
 */
export function checkRateLimit(identifier: string): {
  allowed: boolean;
  remaining: number;
  resetTime?: number;
} {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // Clean up expired entries on access
  if (entry && entry.resetTime < now) {
    rateLimitStore.delete(identifier);
  }

  const currentEntry = rateLimitStore.get(identifier) || { count: 0, resetTime: now + WINDOW_MS };

  if (currentEntry.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, resetTime: currentEntry.resetTime };
  }

  currentEntry.count++;
  rateLimitStore.set(identifier, currentEntry);

  // Enforce maximum entries by evicting oldest if needed
  if (rateLimitStore.size > MAX_ENTRIES) {
    evictOldestEntries();
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - currentEntry.count, resetTime: currentEntry.resetTime };
}

/**
 * Reset rate limit for a given identifier (e.g., after successful login)
 */
export function resetRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
}

/**
 * Get combined identifier from email and IP
 */
export function getRateLimitIdentifier(email: string, ipAddress?: string): string {
  return ipAddress ? `${email}:${ipAddress}` : email;
}

/**
 * Get IP-based identifier for registration or IP-only rate limiting
 */
export function getIpRateLimitIdentifier(ipAddress?: string): string {
  return ipAddress ? `ip:${ipAddress}` : 'ip:unknown';
}

/**
 * Extract client IP address from request headers
 * Does NOT blindly trust x-forwarded-for or x-real-ip
 * Returns undefined if headers are missing or suspicious
 */
export function getClientIP(headers: Headers): string | undefined {
  // In a local-first setup without a trusted proxy, we should be cautious
  // If the app is behind a trusted proxy, configure TRUSTED_PROXY environment variable
  const isTrustedProxy = process.env.TRUSTED_PROXY === 'true';

  if (!isTrustedProxy) {
    // Without trusted proxy, these headers can be spoofed
    // We only use them if we're certain the app is behind a trusted reverse proxy
    // For local-first/desktop deployment, these are often not reliable
    return undefined;
  }

  // When trusted proxy is configured, we can use these headers
  const forwardedFor = headers.get('x-forwarded-for');
  const realIp = headers.get('x-real-ip');

  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs: client, proxy1, proxy2
    // The leftmost IP is the original client
    const ips = forwardedFor.split(',').map(ip => ip.trim());
    return ips[0];
  }

  if (realIp) {
    return realIp;
  }

  return undefined;
}

/**
 * Clean up expired entries
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  let deleted = 0;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
      deleted++;
    }
  }
}

/**
 * Evict oldest entries when limit is exceeded
 * Simple FIFO eviction strategy
 */
function evictOldestEntries(): void {
  const entries = Array.from(rateLimitStore.entries());
  // Sort by resetTime (oldest first)
  entries.sort((a, b) => a[1].resetTime - b[1].resetTime);
  
  // Remove oldest 10% of entries
  const toRemove = Math.ceil(MAX_ENTRIES * 0.1);
  for (let i = 0; i < toRemove && i < entries.length; i++) {
    rateLimitStore.delete(entries[i][0]);
  }
}

/**
 * Get current number of entries (for monitoring)
 */
export function getRateLimitStoreSize(): number {
  return rateLimitStore.size;
}
