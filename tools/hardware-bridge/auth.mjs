import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_VERSION = 'v1';
const ISSUER = 'omnikes';
const AUDIENCE = 'omnikes-hardware-bridge';
const MIN_SECRET_LENGTH = 32;

function getMasterSecret() {
  const secret = process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN?.trim() ?? '';
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error('OMNIKES_HARDWARE_BRIDGE_TOKEN must be at least 32 characters');
  }
  return secret;
}

function getExpectedOrganizationId() {
  const organizationId = process.env.OMNIKES_HARDWARE_BRIDGE_ORGANIZATION_ID?.trim() ?? '';
  if (!organizationId) {
    throw new Error('OMNIKES_HARDWARE_BRIDGE_ORGANIZATION_ID must be configured');
  }
  return organizationId;
}

function sign(input, secret) {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

export function verifyBridgeToken(token, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return false;

  const [version, payload, signature] = parts;
  const expected = Buffer.from(sign(`${version}.${payload}`, getMasterSecret()), 'utf8');
  const actual = Buffer.from(signature, 'utf8');

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return false;
  }

  if (
    claims?.iss !== ISSUER ||
    claims?.aud !== AUDIENCE ||
    claims?.sub !== 'omnikes-user-session' ||
    typeof claims?.org !== 'string' ||
    claims.org.length === 0 ||
    !Number.isInteger(claims?.iat) ||
    !Number.isInteger(claims?.exp) ||
    typeof claims?.jti !== 'string' ||
    claims.jti.length === 0
  ) {
    return false;
  }

  if (claims.exp <= nowSeconds || claims.iat > nowSeconds + 30 || claims.exp - claims.iat > 300) {
    return false;
  }

  return claims;
}

export function getConfiguredBridgeToken() {
  throw new Error('Raw hardware bridge master secrets are no longer accepted');
}

export function isAuthorizedBridgeRequest(req) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) return false;

  const supplied = header.slice(7).trim();
  if (!supplied) return false;

  try {
    const claims = verifyBridgeToken(supplied);
    return claims.org === getExpectedOrganizationId();
  } catch {
    return false;
  }
}
