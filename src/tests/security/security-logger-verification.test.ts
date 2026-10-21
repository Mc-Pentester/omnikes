/**
 * Verification test for security logger functionality
 * Verifies that security events are actually logged
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { securityLogger } from '@omnikes/lib/security-logger';

describe('Security Logger Verification', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should log LOGIN_SUCCESS event', () => {
    securityLogger.loginSuccess('user123', 'admin.a@omnikes.test', 'org456', '192.168.1.100', 'Mozilla/5.0');

    const logCalls = (console.error as any).mock.calls;
    expect(logCalls.length).toBeGreaterThan(0);

    const logOutput = JSON.stringify(logCalls);
    expect(logOutput).toContain('[SECURITY]');
    expect(logOutput).toContain('LOGIN_SUCCESS');
  });

  it('should log LOGIN_FAILED event', () => {
    securityLogger.loginFailed('admin.a@omnikes.test', '192.168.1.100', 'Mozilla/5.0', 'Invalid password');

    const logCalls = (console.error as any).mock.calls;
    expect(logCalls.length).toBeGreaterThan(0);

    const logOutput = JSON.stringify(logCalls);
    expect(logOutput).toContain('[SECURITY]');
    expect(logOutput).toContain('LOGIN_FAILED');
  });

  it('should log ACCOUNT_LOCKED event', () => {
    securityLogger.accountLocked('user123', 'admin.a@omnikes.test', '192.168.1.100');

    const logCalls = (console.error as any).mock.calls;
    expect(logCalls.length).toBeGreaterThan(0);

    const logOutput = JSON.stringify(logCalls);
    expect(logOutput).toContain('[SECURITY]');
    expect(logOutput).toContain('ACCOUNT_LOCKED');
  });

  it('should log SESSION_CREATED event', () => {
    securityLogger.sessionCreated('user123', 'admin.a@omnikes.test', '192.168.1.100', 'Mozilla/5.0');

    const logCalls = (console.error as any).mock.calls;
    expect(logCalls.length).toBeGreaterThan(0);

    const logOutput = JSON.stringify(logCalls);
    expect(logOutput).toContain('[SECURITY]');
    expect(logOutput).toContain('SESSION_CREATED');
  });

  it('should log SESSION_REVOKED event', () => {
    securityLogger.sessionRevoked('user123', '192.168.1.100');

    const logCalls = (console.error as any).mock.calls;
    expect(logCalls.length).toBeGreaterThan(0);

    const logOutput = JSON.stringify(logCalls);
    expect(logOutput).toContain('[SECURITY]');
    expect(logOutput).toContain('SESSION_REVOKED');
  });

  it('should log RATE_LIMIT_EXCEEDED event', () => {
    securityLogger.rateLimitExceeded('admin.a@omnikes.test', '192.168.1.100');

    const logCalls = (console.error as any).mock.calls;
    expect(logCalls.length).toBeGreaterThan(0);

    const logOutput = JSON.stringify(logCalls);
    expect(logOutput).toContain('[SECURITY]');
    expect(logOutput).toContain('RATE_LIMIT_EXCEEDED');
  });
});
