import { NextRequest, NextResponse } from 'next/server';

/**
 * Security Middleware for OmniKès
 * Handles CSRF protection and security headers
 */

// Allowed origins for development
const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

/**
 * Get the expected origin based on the request
 * Uses Host header (not x-forwarded-* to prevent spoofing)
 */
function getExpectedOrigin(request: NextRequest): string {
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  return `${protocol}://${host}`;
}

/**
 * Validate request origin against expected origin
 * Returns true if origin is valid, false otherwise
 */
function isValidOrigin(request: NextRequest): boolean {
  const method = request.method;

  // Skip validation for safe methods
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

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
  // This prevents requests from tools that don't send these headers
  return false;
}

/**
 * Build Content Security Policy
 * Based on actual usage: Google Fonts, inline scripts/styles for Next.js
 */
function getCSP(): string {
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'", // Keep inline support for current Next.js runtime; eval is not permitted
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // Google Fonts
    "font-src 'self' https://fonts.gstatic.com", // Google Fonts
    "img-src 'self' data: blob:", // Images, blobs for uploads
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ];

  return directives.join('; ');
}

/**
 * Apply security headers to response
 */
function applySecurityHeaders(response: NextResponse, request: NextRequest): NextResponse {
  // Content Security Policy
  response.headers.set('Content-Security-Policy', getCSP());

  // Anti-clickjacking
  response.headers.set('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Referrer Policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy (camera not used in OmniKès)
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // HSTS only in production HTTPS
  if (process.env.NODE_ENV === 'production' && request.headers.get('x-forwarded-proto') === 'https') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  }

  return response;
}

export function middleware(request: NextRequest) {
  // CSRF validation for state-changing methods
  if (!isValidOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin' },
      { status: 403 }
    );
  }

  // Handle OPTIONS preflight
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
  }

  // Apply security headers to all responses
  const response = NextResponse.next();
  return applySecurityHeaders(response, request);
}

export const config = {
  matcher: [
    // Apply to all API routes
    '/api/:path*',
    // Apply to all pages
    '/:path*',
  ],
};
