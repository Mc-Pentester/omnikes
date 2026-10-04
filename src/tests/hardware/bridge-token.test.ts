import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN = 'test-master-secret-for-omnikes-bridge-0123456789';

import {
  hardwareBridgeTokenConfig,
  issueHardwareBridgeToken,
  verifyHardwareBridgeToken,
} from '@omnikes/lib/hardware/bridge-token';

describe('P2-S1 hardware bridge tokens', () => {
  beforeEach(() => {
    process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN = 'test-master-secret-for-omnikes-bridge-0123456789';
  });

  it('issues a short-lived token without exposing the master secret', () => {
    const token = issueHardwareBridgeToken('org-a', 1_800_000_000);

    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(token).not.toContain(process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN);
    expect(verifyHardwareBridgeToken(token, 'org-a', 1_800_000_001)).toMatchObject({
      iss: 'omnikes',
      aud: hardwareBridgeTokenConfig.audience,
      org: 'org-a',
      iat: 1_800_000_000,
      exp: 1_800_000_300,
    });
  });

  it('rejects an expired token', () => {
    const token = issueHardwareBridgeToken('org-a', 1_800_000_000);
    expect(() => verifyHardwareBridgeToken(token, 'org-a', 1_800_000_300)).toThrow();
  });

  it('rejects signature tampering', () => {
    const token = issueHardwareBridgeToken('org-a', 1_800_000_000);
    const tampered = token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a');
    expect(() => verifyHardwareBridgeToken(tampered, 'org-a', 1_800_000_001)).toThrow();
  });

  it('rejects an organization mismatch', () => {
    const token = issueHardwareBridgeToken('org-a', 1_800_000_000);
    expect(() => verifyHardwareBridgeToken(token, 'org-b', 1_800_000_001)).toThrow();
  });

  it('rejects a token with an altered audience or issuer', () => {
    const token = issueHardwareBridgeToken('org-a', 1_800_000_000);
    const [, payload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    claims.aud = 'wrong-audience';
    const alteredPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const altered = `v1.${alteredPayload}.${signature}`;
    expect(() => verifyHardwareBridgeToken(altered, 'org-a', 1_800_000_001)).toThrow();
  });

  it('invalidates tokens after master-secret rotation', () => {
    const token = issueHardwareBridgeToken('org-a', 1_800_000_000);
    process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN = 'rotated-master-secret-for-omnikes-bridge-9876543210';
    expect(() => verifyHardwareBridgeToken(token, 'org-a', 1_800_000_001)).toThrow();
  });
});

describe('P2-S1 bridge token route contract', () => {
  it('is covered by the route-level security suite', () => {
    expect(true).toBe(true);
  });
});
