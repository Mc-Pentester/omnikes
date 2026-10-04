import { NextRequest, NextResponse } from 'next/server';
import { registrationService, RateLimitError } from '@omnikes/services/registration.service';
import { getClientIP } from '@omnikes/lib/rate-limiter';
import { registrationSchema } from '@omnikes/lib/validation';
import { z } from 'zod';

/**
 * POST /api/auth/register
 * Register a new user with a new organization
 * Creates: Organization, User, ADMIN Role, UserRole, Session
 * Returns: authenticated user with session cookie
 * Rate limited by IP to prevent mass registration
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate input
    const validatedData = registrationSchema.parse(body);

    const ipAddress = getClientIP(request.headers);
    const userAgent = request.headers.get('user-agent') || undefined;

    // Remove confirmPassword before passing to service
    const registrationData = {
      organizationName: validatedData.organizationName,
      name: validatedData.name,
      email: validatedData.email,
      password: validatedData.password,
    };

    const result = await registrationService.register(
      registrationData,
      ipAddress,
      userAgent
    );

    // Set token as HTTP-only cookie
    const response = NextResponse.json({
      user: result.user,
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
      
      // Add Retry-After header if reset time is available
      if (error.resetTime) {
        const retryAfterSeconds = Math.ceil((error.resetTime - Date.now()) / 1000);
        if (retryAfterSeconds > 0) {
          response.headers.set('Retry-After', retryAfterSeconds.toString());
        }
      }
      
      return response;
    }

    if (error instanceof Error) {
      // Check for email already used error
      if (error.message === 'Cette adresse email est déjà utilisée') {
        return NextResponse.json(
          { error: error.message },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}
