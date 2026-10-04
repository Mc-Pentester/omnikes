import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { isAuthorizedBridgeRequest, verifyBridgeToken } from './auth.mjs';

process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN = 'test-master-secret-for-omnikes-bridge-0123456789';

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
  assert.equal(claims.org, 'org-a');
});

test('rejects the raw master secret', () => {
  const req = { headers: { authorization: `Bearer ${process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN}` } };
  assert.equal(isAuthorizedBridgeRequest(req), false);
});

test('rejects an expired token', () => {
  assert.equal(verifyBridgeToken(makeToken({}, 1_800_000_000), 1_800_000_300), false);
});

test('rejects a tampered signature', () => {
  const token = makeToken();
  const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
  assert.equal(verifyBridgeToken(tampered, 1_800_000_001), false);
});

test('rejects an invalid audience', () => {
  assert.equal(verifyBridgeToken(makeToken({ aud: 'wrong' }), 1_800_000_001), false);
});

test('rotation invalidates previously issued tokens', () => {
  const token = makeToken();
  process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN = 'rotated-master-secret-for-omnikes-bridge-9876543210';
  assert.equal(verifyBridgeToken(token, 1_800_000_001), false);
});
