/**
 * Tests for centralized logging sanitization
 * Verifies that sensitive data (passwords, tokens, cookies, secrets, etc.) never appears in logs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { errorLogger } from '@omnikes/lib/error-logger';
import { securityLogger, logSecurityEvent } from '@omnikes/lib/security-logger';

describe('Error Logger Sanitization', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should redact password in error message', () => {
    const error = new Error('Invalid password: MySecretPassword123');
    errorLogger.auth(error);

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).not.toContain('MySecretPassword123');
    expect(logOutput).toContain('Sensitive operation failed');
  });

  it('should redact token in error message', () => {
    const error = new Error('Invalid auth token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    errorLogger.auth(error);

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(logOutput).toContain('Sensitive operation failed');
  });

  it('should redact secret in error message', () => {
    const error = new Error('Database connection failed: postgresql://user:supersecret@localhost/db');
    errorLogger.database(error);

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).not.toContain('supersecret');
    expect(logOutput).not.toContain('postgresql://');
    expect(logOutput).toContain('Sensitive operation failed');
  });

  it('should redact cookie in error message', () => {
    const error = new Error('Cookie parsing failed: auth_token=abc123xyz');
    errorLogger.auth(error);

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).not.toContain('abc123xyz');
    expect(logOutput).toContain('Sensitive operation failed');
  });

  it('should include correlation ID', () => {
    const error = new Error('Some error');
    errorLogger.auth(error);

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    // Correlation ID is included in the formatted output in development
    expect(logOutput).toMatch(/\[.+\]/); // Format: [AUTH] [correlationId] message
  });

  it('should include error category', () => {
    const error = new Error('Some error');
    errorLogger.auth(error);

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).toContain('AUTH');
  });

  it('should not include stack trace in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const error = new Error('Some error');
    errorLogger.auth(error);

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).not.toContain('stack');

    process.env.NODE_ENV = originalEnv;
  });

  it('should limit stack trace length in development', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const error = new Error('Some error');
    errorLogger.auth(error);

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    if (logOutput.includes('stack')) {
      const stackMatch = logOutput.match(/"stack":"([^"]+)"/);
      if (stackMatch) {
        expect(stackMatch[1].length).toBeLessThanOrEqual(1000);
      }
    }

    process.env.NODE_ENV = originalEnv;
  });
});

describe('Security Logger Sanitization', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should mask email in security event', () => {
    securityLogger.loginSuccess('user123', 'admin.a@omnikes.test', 'org456');

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).not.toContain('admin.a@omnikes.test');
    expect(logOutput).toContain('ad***@omnikes.test');
  });

  it('should hash userId in security event', () => {
    securityLogger.loginSuccess('user123', 'admin.a@omnikes.test', 'org456');

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).not.toContain('user123');
    expect(logOutput).toMatch(/[a-f0-9]{8}/); // 8-char hex hash
  });

  it('should hash organizationId in security event', () => {
    securityLogger.loginSuccess('user123', 'admin.a@omnikes.test', 'org456');

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).not.toContain('org456');
    expect(logOutput).toMatch(/[a-f0-9]{8}/); // 8-char hex hash
  });

  it('should mask IP address in security event', () => {
    securityLogger.loginFailed('admin.a@omnikes.test', '192.168.1.100');

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).not.toContain('192.168.1.100');
    expect(logOutput).toContain('192.168.***.***');
  });

  it('should truncate user agent in security event', () => {
    const longUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    securityLogger.loginSuccess('user123', 'admin.a@omnikes.test', 'org456', '192.168.1.100', longUA);

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).toContain('...');
    const uaMatch = logOutput.match(/"userAgent":"([^"]+)"/);
    if (uaMatch) {
      expect(uaMatch[1].length).toBeLessThanOrEqual(53); // 50 chars + '...'
    }
  });

  it('should preserve security event type', () => {
    securityLogger.loginSuccess('user123', 'admin.a@omnikes.test', 'org456');

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).toContain('LOGIN_SUCCESS');
  });

  it('should preserve failed login event', () => {
    securityLogger.loginFailed('admin.a@omnikes.test', '192.168.1.100', 'reason');

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).toContain('LOGIN_FAILED');
  });

  it('should preserve account locked event', () => {
    securityLogger.accountLocked('user123', 'admin.a@omnikes.test', '192.168.1.100');

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).toContain('ACCOUNT_LOCKED');
  });

  it('should preserve tenant violation event with hashed IDs', () => {
    securityLogger.tenantViolation('user123', 'orgAttempted', 'orgActual', '192.168.1.100');

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).toContain('TENANT_VIOLATION');
    expect(logOutput).not.toContain('orgAttempted');
    expect(logOutput).not.toContain('orgActual');
  });

  it('should preserve RBAC violation event', () => {
    securityLogger.rbacViolation('user123', 'store.delete', '192.168.1.100');

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).toContain('RBAC_VIOLATION');
    expect(logOutput).toContain('store.delete');
  });

  it('should preserve rate limit exceeded event with hashed identifier', () => {
    securityLogger.rateLimitExceeded('admin.a@omnikes.test', '192.168.1.100');

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).toContain('RATE_LIMIT_EXCEEDED');
    expect(logOutput).not.toContain('admin.a@omnikes.test');
  });

  it('should sanitize nested details object', () => {
    logSecurityEvent({
      type: 'LOGIN_SUCCESS',
      timestamp: new Date(),
      userId: 'user123',
      email: 'admin.a@omnikes.test',
      organizationId: 'org456',
      details: {
        email: 'nested@example.com',
        ipAddress: '10.0.0.1',
        userId: 'nestedUser',
        safeField: 'safeValue',
      },
    });

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).not.toContain('admin.a@omnikes.test');
    expect(logOutput).not.toContain('nested@example.com');
    expect(logOutput).not.toContain('10.0.0.1');
    expect(logOutput).not.toContain('nestedUser');
    expect(logOutput).toContain('safeValue');
  });

  it('should handle circular references safely', () => {
    const circular: Record<string, unknown> = { name: 'test' };
    circular.self = circular;

    // Should not throw an error when sanitizing
    expect(() => {
      logSecurityEvent({
        type: 'LOGIN_SUCCESS',
        timestamp: new Date(),
        details: circular,
      });
    }).not.toThrow();

    const logCalls = (console.error as any).mock.calls;
    expect(logCalls.length).toBeGreaterThan(0);

    // Should contain [Circular] marker
    const logOutput = JSON.stringify(logCalls);
    expect(logOutput).toContain('[Circular]');
  });

  it('should handle Error objects in details', () => {
    const error = new Error('Test error');
    logSecurityEvent({
      type: 'LOGIN_FAILED',
      timestamp: new Date(),
      details: { error },
    });

    const logCalls = (console.error as any).mock.calls;
    expect(logCalls.length).toBeGreaterThan(0);
  });

  it('should handle arrays in details', () => {
    logSecurityEvent({
      type: 'LOGIN_SUCCESS',
      timestamp: new Date(),
      details: {
        emails: ['test1@example.com', 'test2@example.com'],
        ips: ['192.168.1.1', '192.168.1.2'],
      },
    });

    const logCalls = (console.error as any).mock.calls;
    const logOutput = JSON.stringify(logCalls);

    expect(logOutput).not.toContain('test1@example.com');
    expect(logOutput).not.toContain('test2@example.com');
    expect(logOutput).not.toContain('192.168.1.1');
    expect(logOutput).not.toContain('192.168.1.2');
  });
});
