import { NextRequest, NextResponse } from 'next/server';
import { authService } from '@omnikes/services/auth.service';
import { getSessionToken } from '@omnikes/lib/auth';
import { errorLogger } from '@omnikes/lib/error-logger';

/**
 * POST /api/auth/logout
 * Revoke the current session and always clear the browser cookie.
 */
export async function POST(request: NextRequest) {
  const token = getSessionToken(request);

  try {
    if (token) {
      await authService.logout(token);
    }

    const response = NextResponse.json({ success: true });
    response.cookies.delete('auth_token');
    return response;
  } catch (error) {
    errorLogger.auth(error, { endpoint: 'POST /api/auth/logout' });
    const response = NextResponse.json({ error: 'Logout failed' }, { status: 500 });
    // Even if persistence is temporarily unavailable, do not leave the browser
    // holding a cookie that the user explicitly asked to clear.
    response.cookies.delete('auth_token');
    return response;
  }
}
