/**
 * Centralized error logger for application errors
 * Sanitizes error messages to avoid exposing sensitive data
 */

type ErrorCategory = 'AUTH' | 'DATABASE' | 'RATE_LIMIT' | 'NETWORK' | 'VALIDATION' | 'UNKNOWN';

interface ErrorLogEntry {
  category: ErrorCategory;
  timestamp: Date;
  correlationId: string;
  message: string;
  details?: Record<string, unknown>;
}

function generateCorrelationId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

/**
 * Sanitize error to remove sensitive information
 */
function sanitizeError(error: unknown): { message: string; details?: Record<string, unknown> } {
  if (error instanceof Error) {
    const message = error.message;
    const stack = error.stack;

    // Check for sensitive patterns in message
    const sensitivePatterns = [
      /password/i,
      /token/i,
      /secret/i,
      /api[_-]?key/i,
      /authorization/i,
      /credential/i,
      /cookie/i,
      /session/i,
      /jwt/i,
      /auth[_-]?token/i,
      /connection/i,
      /database/i,
      /db[_-]?url/i,
    ];

    const isSensitive = sensitivePatterns.some(pattern => pattern.test(message));

    if (isSensitive) {
      return {
        message: 'Sensitive operation failed',
        details: { type: error.name },
      };
    }

    // In production, don't include stack traces
    if (process.env.NODE_ENV === 'production') {
      return {
        message,
        details: { type: error.name },
      };
    }

    // In development, include stack for debugging
    return {
      message,
      details: {
        type: error.name,
        stack: stack?.substring(0, 1000), // Limit stack trace length
      },
    };
  }

  if (typeof error === 'string') {
    const isSensitive = /password|token|secret|api[_-]?key|authorization|credential|cookie|session|jwt|auth[_-]?token|connection|database|db[_-]?url/i.test(error);
    return {
      message: isSensitive ? 'Sensitive operation failed' : error,
    };
  }

  return {
    message: 'Unknown error occurred',
  };
}

/**
 * Log an error with sanitization
 */
export function logError(category: ErrorCategory, error: unknown, context?: Record<string, unknown>): void {
  const { message, details } = sanitizeError(error);
  const correlationId = generateCorrelationId();

  const logEntry: ErrorLogEntry = {
    category,
    timestamp: new Date(),
    correlationId,
    message,
    details: context ? { ...context, ...details } : details,
  };

  // In production, use structured JSON logging
  // In development, use readable format
  if (process.env.NODE_ENV === 'production') {
    console.error(JSON.stringify(logEntry));
  } else {
    console.error(`[${category}] [${correlationId}] ${message}`, details);
  }
}

/**
 * Convenience functions for common error categories
 */
export const errorLogger = {
  auth: (error: unknown, context?: Record<string, unknown>) => logError('AUTH', error, context),
  database: (error: unknown, context?: Record<string, unknown>) => logError('DATABASE', error, context),
  rateLimit: (error: unknown, context?: Record<string, unknown>) => logError('RATE_LIMIT', error, context),
  network: (error: unknown, context?: Record<string, unknown>) => logError('NETWORK', error, context),
  validation: (error: unknown, context?: Record<string, unknown>) => logError('VALIDATION', error, context),
  unknown: (error: unknown, context?: Record<string, unknown>) => logError('UNKNOWN', error, context),
};
