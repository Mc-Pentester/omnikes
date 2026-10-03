import { timingSafeEqual } from 'node:crypto';

const MIN_TOKEN_LENGTH = 32;

export function getConfiguredBridgeToken() {
  const token = process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN?.trim() ?? '';
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new Error('OMNIKES_HARDWARE_BRIDGE_TOKEN must be at least 32 characters');
  }
  return token;
}

export function isAuthorizedBridgeRequest(req) {
  const configured = process.env.OMNIKES_HARDWARE_BRIDGE_TOKEN?.trim() ?? '';
  if (configured.length < MIN_TOKEN_LENGTH) return false;

  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) return false;

  const supplied = header.slice(7).trim();
  const expected = Buffer.from(configured, 'utf8');
  const actual = Buffer.from(supplied, 'utf8');

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
