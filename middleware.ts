import { NextRequest, NextResponse } from 'next/server';

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

function getExpectedOrigin(request: NextRequest): string {
  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'http';
  return `${protocol}://${host}`;
}

function isValidOrigin(request: NextRequest): boolean {
  const method = request.method;

  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return true;
  }

  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  if (process.env.NODE_ENV === 'development') {
    if (origin && DEV_ORIGINS.includes(origin)) {
      return true;
    }
    if (referer && DEV_ORIGINS.some(dev => referer.startsWith(dev))) {
      return true;
    }
  }

  if (origin) {
    return origin === getExpectedOrigin(request);
  }

  if (referer) {
    try {
      return new URL(referer).origin === getExpectedOrigin(request);
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Build a per-request CSP nonce.
 * Next.js can propagate this nonce to its generated inline scripts when
 * it is provided through the x-nonce request header.
 */
function createCspNonce(): string {
  return btoa(crypto.randomUUID());
}

function getCSP(nonce: string): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ];

  return directives.join('; ');
}

function applySecurityHeaders(
  response: NextResponse,
  request: NextRequest,
  nonce: string
): NextResponse {
  response.headers.set('Content-Security-Policy', getCSP(nonce));
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (
    process.env.NODE_ENV === 'production' &&
    request.headers.get('x-forwarded-proto') === 'https'
  ) {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  }

  return response;
}

export function middleware(request: NextRequest) {
  if (!isValidOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin' },
      { status: 403 }
    );
  }

  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    response.headers.set(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    );
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    return response;
  }

  const nonce = createCspNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  return applySecurityHeaders(response, request, nonce);
}

export const config = {
  matcher: [
    '/api/:path*',
    '/:path*',
  ],
};
