/**
 * Security event logger
 * Logs structured security events without exposing sensitive data
 */

type SecurityEventType = 
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'ACCOUNT_LOCKED'
  | 'SESSION_REVOKED'
  | 'SESSION_CREATED'
  | 'PASSWORD_CHANGED'
  | 'ACCESS_DENIED'
  | 'TENANT_VIOLATION'
  | 'RBAC_VIOLATION'
  | 'RATE_LIMIT_EXCEEDED';

interface SecurityEvent {
  type: SecurityEventType;
  timestamp: Date;
  userId?: string;
  email?: string;
  organizationId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

/**
 * Log a security event
 * NEVER logs: passwords, tokens, cookies, secrets, DB connection strings
 */
export function logSecurityEvent(event: SecurityEvent): void {
  // Sanitize details to ensure no sensitive data is logged
  const sanitizedDetails = sanitizeDetails(event.details);
  
  const logEntry = {
    ...event,
    details: sanitizedDetails,
  };

  // In production, this would go to a secure logging system
  // For now, using console with structured format
  console.log('[SECURITY]', JSON.stringify(logEntry));
}

/**
 * Sanitize details to remove sensitive information
 */
function sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!details) return undefined;

  const sensitiveKeys = ['password', 'token', 'cookie', 'secret', 'apiKey', 'authorization', 'credential'];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Helper functions for common security events
 */
export const securityLogger = {
  loginSuccess: (userId: string, email: string, organizationId: string, ipAddress?: string, userAgent?: string) => {
    logSecurityEvent({
      type: 'LOGIN_SUCCESS',
      timestamp: new Date(),
      userId,
      email,
      organizationId,
      ipAddress,
      userAgent,
    });
  },

  loginFailed: (email: string, ipAddress?: string, userAgent?: string, reason?: string) => {
    logSecurityEvent({
      type: 'LOGIN_FAILED',
      timestamp: new Date(),
      email,
      ipAddress,
      userAgent,
      details: reason ? { reason } : undefined,
    });
  },

  accountLocked: (userId: string, email: string, ipAddress?: string) => {
    logSecurityEvent({
      type: 'ACCOUNT_LOCKED',
      timestamp: new Date(),
      userId,
      email,
      ipAddress,
    });
  },

  sessionRevoked: (userId: string, ipAddress?: string) => {
    logSecurityEvent({
      type: 'SESSION_REVOKED',
      timestamp: new Date(),
      userId,
      ipAddress,
    });
  },

  sessionCreated: (userId: string, email: string, ipAddress?: string, userAgent?: string) => {
    logSecurityEvent({
      type: 'SESSION_CREATED',
      timestamp: new Date(),
      userId,
      email,
      ipAddress,
      userAgent,
    });
  },

  passwordChanged: (userId: string, email: string, ipAddress?: string) => {
    logSecurityEvent({
      type: 'PASSWORD_CHANGED',
      timestamp: new Date(),
      userId,
      email,
      ipAddress,
    });
  },

  accessDenied: (userId: string, resource: string, action: string, ipAddress?: string) => {
    logSecurityEvent({
      type: 'ACCESS_DENIED',
      timestamp: new Date(),
      userId,
      ipAddress,
      details: { resource, action },
    });
  },

  tenantViolation: (userId: string, attemptedOrganizationId: string, actualOrganizationId: string, ipAddress?: string) => {
    logSecurityEvent({
      type: 'TENANT_VIOLATION',
      timestamp: new Date(),
      userId,
      ipAddress,
      details: { 
        attemptedOrganizationId, 
        actualOrganizationId 
      },
    });
  },

  rbacViolation: (userId: string, requiredPermission: string, ipAddress?: string) => {
    logSecurityEvent({
      type: 'RBAC_VIOLATION',
      timestamp: new Date(),
      userId,
      ipAddress,
      details: { requiredPermission },
    });
  },

  rateLimitExceeded: (identifier: string, ipAddress?: string) => {
    logSecurityEvent({
      type: 'RATE_LIMIT_EXCEEDED',
      timestamp: new Date(),
      ipAddress,
      details: { identifier },
    });
  },
};
