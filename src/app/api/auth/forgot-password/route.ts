import { NextRequest, NextResponse } from 'next/server';
import { passwordResetService, RateLimitError } from '@omnikes/services/password-reset.service';
import { getClientIP } from '@omnikes/lib/rate-limiter';
import { z } from 'zod';

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

/**
 * POST /api/auth/forgot-password
 * Request a password reset for an email
 * Rate limited by IP to prevent abuse
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = forgotPasswordSchema.parse(body);

    const ipAddress = getClientIP(request.headers);

    const result = await passwordResetService.requestPasswordReset(
      validatedData.email,
      ipAddress
    );

    return NextResponse.json(result);
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
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: 'Failed to request password reset' },
      { status: 500 }
    );
  }
}
