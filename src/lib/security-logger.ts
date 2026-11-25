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
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_SUCCESS'
  | 'PASSWORD_RESET_FAILED'
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
 * Hash a string for safe logging (first 8 chars for identification)
 */
function hashForLog(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}

/**
 * Mask email for logging (keep domain for context)
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '[INVALID_EMAIL]';
  return `${local.substring(0, 2)}***@${domain}`;
}

/**
 * Mask IP address for logging (keep first two octets for geo context)
 */
function maskIP(ip: string): string {
  const parts = ip.split('.');
  if (parts.length !== 4) return '[INVALID_IP]';
  return `${parts[0]}.${parts[1]}.***.***`;
}

/**
 * Sanitize a value to remove sensitive information
 */
function sanitizeValue(value: unknown, seen = new WeakSet()): unknown {
  // Handle circular references
  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
  }

  if (typeof value === 'string') {
    if (value.includes('@')) return maskEmail(value);
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value)) return maskIP(value);
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      return value.map(item => sanitizeValue(item, seen));
    }
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'email') {
        sanitized[key] = maskEmail(String(val));
      } else if (lowerKey === 'ipaddress' || lowerKey === 'ip') {
        sanitized[key] = maskIP(String(val));
      } else if (lowerKey === 'userid' || lowerKey === 'organizationid') {
        sanitized[key] = hashForLog(String(val));
      } else {
        sanitized[key] = sanitizeValue(val, seen);
      }
    }
    return sanitized;
  }
  return value;
}

/**
 * Log a security event
 * NEVER logs: passwords, tokens, cookies, secrets, DB connection strings
 */
export function logSecurityEvent(event: SecurityEvent): void {
  // Sanitize the entire event to mask sensitive data
  const sanitizedEvent = {
    type: event.type,
    timestamp: event.timestamp,
    userId: event.userId ? hashForLog(event.userId) : undefined,
    email: event.email ? maskEmail(event.email) : undefined,
    organizationId: event.organizationId ? hashForLog(event.organizationId) : undefined,
    ipAddress: event.ipAddress ? maskIP(event.ipAddress) : undefined,
    userAgent: event.userAgent ? `${event.userAgent.substring(0, 50)}...` : undefined,
    details: event.details ? sanitizeValue(event.details) as Record<string, unknown> : undefined,
  };

  // In production, this would go to a secure logging system
  // For now, using console.error for visibility in Next.js terminal
  console.error('[SECURITY]', JSON.stringify(sanitizedEvent));
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

  passwordResetRequested: (userId: string | null, email: string, ipAddress?: string, reason?: string) => {
    logSecurityEvent({
      type: 'PASSWORD_RESET_REQUESTED',
      timestamp: new Date(),
      userId: userId || undefined,
      email,
      ipAddress,
      details: reason ? { reason } : undefined,
    });
  },

  passwordResetSuccess: (userId: string, email: string, ipAddress?: string) => {
    logSecurityEvent({
      type: 'PASSWORD_RESET_SUCCESS',
      timestamp: new Date(),
      userId,
      email,
      ipAddress,
    });
  },

  passwordResetFailed: (userId: string | null, email: string | null, ipAddress?: string, reason?: string) => {
    logSecurityEvent({
      type: 'PASSWORD_RESET_FAILED',
      timestamp: new Date(),
      userId: userId || undefined,
      email: email || undefined,
      ipAddress,
      details: reason ? { reason } : undefined,
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
        attemptedOrganizationId: hashForLog(attemptedOrganizationId),
        actualOrganizationId: hashForLog(actualOrganizationId)
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
      details: { identifier: hashForLog(identifier) },
    });
  },
};
