import { createHmac, randomBytes } from 'crypto';

// Cached secret to avoid repeated environment access
let cachedSecret: string | null = null;

/**
 * Reset cached secret (for testing only)
 * @internal
 */
export function _resetSecretCache(): void {
  cachedSecret = null;
}

/**
 * Get and validate SESSION_SECRET
 * Throws error if secret is missing or too short
 */
function getSessionSecret(): string {
  if (cachedSecret) {
    return cachedSecret;
  }

  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error('SESSION_SECRET is required. Please set it in your environment variables.');
  }

  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters long for security.');
  }

  // Prevent using known placeholder values
  const forbiddenSecrets = [
    'default-secret-change-in-production',
    'default-secret-change-me',
    'your-secret-key-here',
    'generate-with-openssl-rand-base64-32-change-in-production',
  ];

  if (forbiddenSecrets.includes(secret)) {
    throw new Error('SESSION_SECRET must be changed from the default placeholder value.');
  }

  cachedSecret = secret;
  return secret;
}

/**
 * Hash a session token using HMAC-SHA-256
 * The raw token is never stored, only its hash
 */
export function hashToken(token: string): string {
  const secret = getSessionSecret();
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
