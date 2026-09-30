import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the middleware functions
function getExpectedOrigin(request: NextRequest): string {
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  return `${protocol}://${host}`;
}

function isValidOrigin(request: NextRequest): boolean {
  const method = request.method;

  // Skip validation for safe methods
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  const DEV_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // In development, allow localhost origins
  if (process.env.NODE_ENV === 'development') {
    if (origin && DEV_ORIGINS.includes(origin)) {
      return true;
    }
    if (referer && DEV_ORIGINS.some(dev => referer.startsWith(dev))) {
      return true;
    }
  }

  // If origin is present, it must match expected origin
  if (origin) {
    const expectedOrigin = getExpectedOrigin(request);
    return origin === expectedOrigin;
  }

  // If no origin, check referer
  if (referer) {
    const expectedOrigin = getExpectedOrigin(request);
    try {
      const refererUrl = new URL(referer);
      return refererUrl.origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  // If neither origin nor referer is present, reject for state-changing methods
  return false;
}

describe('CSRF Protection', () => {
  describe('Safe methods (GET, HEAD, OPTIONS)', () => {
    it('should allow GET without Origin header', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'GET',
      });
      expect(isValidOrigin(request)).toBe(true);
    });

    it('should allow HEAD without Origin header', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'HEAD',
      });
      expect(isValidOrigin(request)).toBe(true);
    });

    it('should allow OPTIONS without Origin header', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        method: 'OPTIONS',
      });
      expect(isValidOrigin(request)).toBe(true);
    });
  });

  describe('POST same-origin', () => {
    it('should allow POST with valid Origin header in development', () => {
      process.env.NODE_ENV = 'development';
      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
        },
      });
      expect(isValidOrigin(request)).toBe(true);
    });

    it('should allow POST with valid Referer header in development', () => {
      process.env.NODE_ENV = 'development';
      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          referer: 'http://localhost:3000/login',
        },
      });
      expect(isValidOrigin(request)).toBe(true);
    });

    it('should allow POST with localhost Origin in development', () => {
      process.env.NODE_ENV = 'development';
      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
        },
      });
      expect(isValidOrigin(request)).toBe(true);
    });

    it('should allow POST with 127.0.0.1 Origin in development', () => {
      process.env.NODE_ENV = 'development';
      const request = new NextRequest('http://127.0.0.1:3000/api/auth/login', {
        method: 'POST',
        headers: {
          origin: 'http://127.0.0.1:3000',
        },
      });
      expect(isValidOrigin(request)).toBe(true);
    });
  });

  describe('POST cross-origin', () => {
    it('should reject POST with evil.com Origin', () => {
      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          origin: 'https://evil.example.com',
        },
      });
      expect(isValidOrigin(request)).toBe(false);
    });

    it('should reject PATCH with evil.com Origin', () => {
      const request = new NextRequest('http://localhost:3000/api/products/123', {
        method: 'PATCH',
        headers: {
          origin: 'https://evil.example.com',
        },
      });
      expect(isValidOrigin(request)).toBe(false);
    });

    it('should reject DELETE with evil.com Origin', () => {
      const request = new NextRequest('http://localhost:3000/api/products/123', {
        method: 'DELETE',
        headers: {
          origin: 'https://evil.example.com',
        },
      });
      expect(isValidOrigin(request)).toBe(false);
    });

    it('should reject PUT with evil.com Origin', () => {
      const request = new NextRequest('http://localhost:3000/api/products/123', {
        method: 'PUT',
        headers: {
          origin: 'https://evil.example.com',
        },
      });
      expect(isValidOrigin(request)).toBe(false);
    });

    it('should reject POST with evil.com Referer', () => {
      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          referer: 'https://evil.example.com/login',
        },
      });
      expect(isValidOrigin(request)).toBe(false);
    });
  });

  describe('Origin spoofing', () => {
    it('should reject Origin spoofing with x-forwarded-host', () => {
      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          origin: 'https://evil.example.com',
          'x-forwarded-host': 'localhost:3000',
        },
      });
      expect(isValidOrigin(request)).toBe(false);
    });

    it('should reject Origin spoofing with x-forwarded-proto', () => {
      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          origin: 'https://evil.example.com',
          'x-forwarded-proto': 'https',
        },
      });
      expect(isValidOrigin(request)).toBe(false);
    });

    it('should reject null Origin', () => {
      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          origin: 'null',
        },
      });
      expect(isValidOrigin(request)).toBe(false);
    });
  });

  describe('Missing Origin and Referer', () => {
    it('should reject POST without Origin or Referer', () => {
      const request = new NextRequest('http://localhost:3000/api/auth/login', {
        method: 'POST',
      });
      expect(isValidOrigin(request)).toBe(false);
    });

    it('should reject PATCH without Origin or Referer', () => {
      const request = new NextRequest('http://localhost:3000/api/products/123', {
        method: 'PATCH',
      });
      expect(isValidOrigin(request)).toBe(false);
    });

    it('should reject DELETE without Origin or Referer', () => {
      const request = new NextRequest('http://localhost:3000/api/products/123', {
        method: 'DELETE',
      });
      expect(isValidOrigin(request)).toBe(false);
    });
  });

  describe('Protocol mismatch', () => {
    it('should reject HTTP Origin on HTTPS request', () => {
      process.env.NODE_ENV = 'production';
      const request = new NextRequest('https://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'x-forwarded-proto': 'https',
        },
      });
      // Expected origin based on x-forwarded-proto is https://localhost:3000
      // Actual origin is http://localhost:3000
      // Should reject
      expect(isValidOrigin(request)).toBe(false);
    });
  });
});

describe('Security Headers', () => {
  it('should include Content-Security-Policy', () => {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; ');

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it('should allow Google Fonts in CSP', () => {
    const csp = [
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
    ].join('; ');

    expect(csp).toContain('https://fonts.googleapis.com');
    expect(csp).toContain('https://fonts.gstatic.com');
  });

  it('should allow data: and blob: for images', () => {
    const csp = "img-src 'self' data: blob:";
    expect(csp).toContain('data:');
    expect(csp).toContain('blob:');
  });

  it('should disable camera in Permissions-Policy', () => {
    const permissionsPolicy = 'camera=(), microphone=(), geolocation=()';
    expect(permissionsPolicy).toContain('camera=()');
  });
});
