import { NextRequest, NextResponse } from 'next/server';
import { authService, RateLimitError } from '@omnikes/services/auth.service';
import { roleRepository } from '@omnikes/repositories/role.repository';
import { getClientIP } from '@omnikes/lib/rate-limiter';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /api/auth/login
 * Authenticate user and return session token
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = loginSchema.parse(body);

    const ipAddress = getClientIP(request.headers);
    const userAgent = request.headers.get('user-agent') || undefined;

    const result = await authService.login(
      validatedData.email,
      validatedData.password,
      ipAddress,
      userAgent
    );

    const canAuthorizeCredit = await roleRepository.hasPermission(
      result.user.id,
      'sale.credit'
    );

    // Set token as HTTP-only cookie
    const response = NextResponse.json({
      user: {
        ...result.user,
        canAuthorizeCredit,
      },
      expiresAt: result.expiresAt,
    });

    response.cookies.set('auth_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: result.expiresAt,
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof RateLimitError) {
      const response = NextResponse.json(
        { error: error.message },
        { status: 429 }
      );
      
      if (error.resetTime) {
        const retryAfterSeconds = Math.ceil((error.resetTime - Date.now()) / 1000);
        if (retryAfterSeconds > 0) {
          response.headers.set('Retry-After', retryAfterSeconds.toString());
        }
      }
      
      return response;
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}