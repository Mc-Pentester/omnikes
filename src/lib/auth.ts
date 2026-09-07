import { NextRequest } from 'next/server';
import { authService } from '@omnikes/services/auth.service';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  organizationId: string;
  organizationName: string;
}

/**
 * Get session token from request
 * Looks for token in Authorization header (Bearer token) or cookie
 */
export function getSessionToken(request: NextRequest): string | null {
  // Try Authorization header first
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Try cookie
  const token = request.cookies.get('auth_token')?.value;
  if (token) {
    return token;
  }

  return null;
}

/**
 * Get authenticated user from request
 * Returns null if not authenticated
 */
export async function getAuthenticatedUser(request: NextRequest): Promise<AuthenticatedUser | null> {
  const token = getSessionToken(request);

  if (!token) {
    return null;
  }

  try {
    const sessionData = await authService.validateSession(token);
    return sessionData.user;
  } catch (error) {
    return null;
  }
}

/**
 * Get authenticated user from request
 * Throws error if not authenticated
 */
export async function requireAuthenticatedUser(request: NextRequest): Promise<AuthenticatedUser> {
  const token = getSessionToken(request);

  if (!token) {
    throw new Error('Authentication required');
  }

  try {
    const sessionData = await authService.validateSession(token);
    return sessionData.user;
  } catch (error) {
    throw new Error('Invalid or expired session');
  }
}

/**
 * Get current organization ID from authenticated user
 */
export async function getCurrentOrganizationId(request: NextRequest): Promise<string | null> {
  const user = await getAuthenticatedUser(request);
  return user?.organizationId || null;
}

/**
 * Get current organization ID from authenticated user
 * Throws error if not authenticated
 */
export async function requireCurrentOrganizationId(request: NextRequest): Promise<string> {
  const user = await requireAuthenticatedUser(request);
  return user.organizationId;
}

/**
 * Get current organization from authenticated user
 */
export async function getCurrentOrganization(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return null;

  return {
    id: user.organizationId,
    name: user.organizationName,
  };
}
