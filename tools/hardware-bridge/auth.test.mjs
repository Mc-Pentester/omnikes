import { expect, test } from 'vitest';
import { createHmac, randomUUID } from 'node:crypto';
import { isAuthorizedBridgeRequest, isOriginAllowed, isRequestOriginAllowed, verifyBridgeToken } from './auth.mjs';

process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN = 'test-master-secret-for-omnikes-bridge-0123456789';
process.env.OMNIKES_HARDWARE_BRIDGE_ORGANIZATION_ID = 'org-a';

function makeToken(overrides = {}, now = 1_800_000_000) {
  const claims = {
    iss: 'omnikes',
    sub: 'omnikes-user-session',
    org: 'org-a',
    aud: 'omnikes-hardware-bridge',
    iat: now,
    exp: now + 300,
    jti: randomUUID(),
    ...overrides,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const unsigned = `v1.${payload}`;
  const signature = createHmac('sha256', process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN)
    .update(unsigned)
    .digest('base64url');
  return `${unsigned}.${signature}`;
}

test('accepts a valid signed token', () => {
  const token = makeToken();
  const claims = verifyBridgeToken(token, 1_800_000_001);
  expect(claims.org).toBe('org-a');
});

test('rejects a token issued for another organization', () => {
  const token = makeToken({ org: 'org-b' });
  expect(isAuthorizedBridgeRequest({ headers: { authorization: `Bearer ${token}` } })).toBe(false);
});

test('rejects authorization when the bridge organization is not configured', () => {
  const token = makeToken();
  const previous = process.env.OMNIKES_HARDWARE_BRIDGE_ORGANIZATION_ID;
  delete process.env.OMNIKES_HARDWARE_BRIDGE_ORGANIZATION_ID;
  expect(isAuthorizedBridgeRequest({ headers: { authorization: `Bearer ${token}` } })).toBe(false);
  process.env.OMNIKES_HARDWARE_BRIDGE_ORGANIZATION_ID = previous;
});


test('allows an explicitly configured browser origin', () => {
  const allowedOrigins = new Set(['http://localhost:3000']);
  expect(isOriginAllowed('http://localhost:3000', allowedOrigins)).toBe(true);
});

test('rejects an unconfigured browser origin', () => {
  const allowedOrigins = new Set(['http://localhost:3000']);
  expect(isOriginAllowed('http://evil.example', allowedOrigins)).toBe(false);
});

test('allows requests with no Origin header for native/local clients', () => {
  const allowedOrigins = new Set(['http://localhost:3000']);
  expect(isRequestOriginAllowed({ headers: {} }, allowedOrigins)).toBe(true);
});

test('rejects requests with a forbidden Origin header', () => {
  const allowedOrigins = new Set(['http://localhost:3000']);
  expect(isRequestOriginAllowed({ headers: { origin: 'http://evil.example' } }, allowedOrigins)).toBe(false);
});

test('rejects the raw master secret', () => {
  const req = { headers: { authorization: `Bearer ${process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN}` } };
  expect(isAuthorizedBridgeRequest(req)).toBe(false);
});

test('rejects an expired token', () => {
  expect(verifyBridgeToken(makeToken({}, 1_800_000_000), 1_800_000_300)).toBe(false);
});

test('rejects a tampered signature', () => {
  const token = makeToken();
  const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
  expect(verifyBridgeToken(tampered, 1_800_000_001)).toBe(false);
});

test('rejects an invalid audience', () => {
  expect(verifyBridgeToken(makeToken({ aud: 'wrong' }), 1_800_000_001)).toBe(false);
});

test('rotation invalidates previously issued tokens', () => {
  const token = makeToken();
  process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN = 'rotated-master-secret-for-omnikes-bridge-9876543210';
  expect(verifyBridgeToken(token, 1_800_000_001)).toBe(false);
});
