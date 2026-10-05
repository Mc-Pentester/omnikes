import { NextRequest, NextResponse } from 'next/server';
import { passwordResetService } from '@omnikes/services/password-reset.service';
import { z } from 'zod';
import { getClientIP } from '@omnikes/lib/rate-limiter';

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * POST /api/auth/reset-password
 * Reset password using a valid token
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = resetPasswordSchema.parse(body);

    const result = await passwordResetService.resetPassword(
      validatedData.token,
      validatedData.newPassword,
      getClientIP(request.headers),
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error('Reset password error:', error);
    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    );
  }
}
