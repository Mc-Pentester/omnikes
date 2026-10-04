import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const TOKEN_VERSION = 'v1';
const ISSUER = 'omnikes';
const AUDIENCE = 'omnikes-hardware-bridge';
const TOKEN_TTL_SECONDS = 5 * 60;
const MIN_SECRET_LENGTH = 32;

type BridgeTokenClaims = {
  iss: typeof ISSUER;
  sub: string;
  org: string;
  aud: typeof AUDIENCE;
  iat: number;
  exp: number;
  jti: string;
};

function getSecret(): string {
  const secret = process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN?.trim() ?? '';
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error('OMNIKES_HARDWARE_BRIDGE_TOKEN must be at least 32 characters');
  }
  return secret;
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function sign(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

export function issueHardwareBridgeToken(organizationId: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  if (!organizationId) throw new Error('Organization is required');

  const claims: BridgeTokenClaims = {
    iss: ISSUER,
    sub: 'omnikes-user-session',
    org: organizationId,
    aud: AUDIENCE,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_TTL_SECONDS,
    jti: randomUUID(),
  };

  const payload = base64Url(JSON.stringify(claims));
  const unsigned = `${TOKEN_VERSION}.${payload}`;
  return `${unsigned}.${sign(unsigned, getSecret())}`;
}

export function verifyHardwareBridgeToken(
  token: string,
  expectedOrganizationId?: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): BridgeTokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
    throw new Error('Invalid hardware bridge token');
  }

  const [version, payload, signature] = parts;
  if (!payload || !signature) throw new Error('Invalid hardware bridge token');

  const expectedSignature = sign(`${version}.${payload}`, getSecret());
  const actual = Buffer.from(signature, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');

  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Invalid hardware bridge token signature');
  }

  let claims: BridgeTokenClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as BridgeTokenClaims;
  } catch {
    throw new Error('Invalid hardware bridge token payload');
  }

  if (
    claims.iss !== ISSUER ||
    claims.aud !== AUDIENCE ||
    claims.sub !== 'omnikes-user-session' ||
    typeof claims.org !== 'string' ||
    !claims.org ||
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.exp) ||
    typeof claims.jti !== 'string' ||
    !claims.jti
  ) {
    throw new Error('Invalid hardware bridge token claims');
  }

  if (claims.exp <= nowSeconds || claims.iat > nowSeconds + 30 || claims.exp - claims.iat > TOKEN_TTL_SECONDS) {
    throw new Error('Hardware bridge token expired or invalid');
  }

  if (expectedOrganizationId && claims.org !== expectedOrganizationId) {
    throw new Error('Hardware bridge token organization mismatch');
  }

  return claims;
}

export const hardwareBridgeTokenConfig = {
  issuer: ISSUER,
  audience: AUDIENCE,
  ttlSeconds: TOKEN_TTL_SECONDS,
};
