/**
 * Simple in-memory rate limiter for login attempts
 * Tracks attempts by email and IP address
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

const MAX_ATTEMPTS = 10; // Maximum attempts per window
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes window

/**
 * Check if rate limit is exceeded for a given identifier
 * Returns true if limit is exceeded, false otherwise
 */
export function checkRateLimit(identifier: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // Clean up expired entries
  if (entry && entry.resetTime < now) {
    rateLimitStore.delete(identifier);
  }

  const currentEntry = rateLimitStore.get(identifier) || { count: 0, resetTime: now + WINDOW_MS };

  if (currentEntry.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }

  currentEntry.count++;
  rateLimitStore.set(identifier, currentEntry);

  return { allowed: true, remaining: MAX_ATTEMPTS - currentEntry.count };
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
 * Clean up expired entries (call periodically to prevent memory leaks)
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}
