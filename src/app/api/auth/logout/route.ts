import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@omnikes/services/auth.service';
import { getSessionToken } from '@omnikes/lib/auth';

/**
 * POST /api/auth/logout
 * Revoke the current session
 */
export async function POST(request: NextRequest) {
  try {
    const token = getSessionToken(request);

    if (token) {
      await authService.logout(token);
    }

    const response = NextResponse.json({ success: true });
    response.cookies.delete('auth_token');

    return response;
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
}
