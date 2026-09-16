import { createHmac, randomBytes } from 'crypto';

/**
 * Hash a session token using HMAC-SHA-256
 * The raw token is never stored, only its hash
 */
export function hashToken(token: string): string {
  const secret = process.env.SESSION_SECRET || 'default-secret-change-in-production';
  return createHmac('sha256', secret).update(token).digest('hex');
}

/**
 * Generate a cryptographically random session token (64 hex characters)
 */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Constant-time comparison to prevent timing attacks
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}
