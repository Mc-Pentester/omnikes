import { NextRequest } from 'next/server';
import { authService } from '@omnikes/services/auth.service';
import { roleRepository } from '@omnikes/repositories/role.repository';

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
  } catch {
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
  } catch {
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

/**
 * Require user to have a specific permission
 * Throws error if not authenticated or lacks permission
 */
export async function requirePermission(request: NextRequest, permissionCode: string): Promise<void> {
  const user = await requireAuthenticatedUser(request);
  const hasPermission = await roleRepository.hasPermission(user.id, permissionCode);
  
  if (!hasPermission) {
    throw new Error(`Permission required: ${permissionCode}`);
  }
}

/**
 * Require user to have any of the specified permissions
 * Throws error if not authenticated or lacks all permissions
 */
export async function requireAnyPermission(request: NextRequest, permissionCodes: string[]): Promise<void> {
  const user = await requireAuthenticatedUser(request);
  const hasAnyPermission = await roleRepository.hasAnyPermission(user.id, permissionCodes);
  
  if (!hasAnyPermission) {
    throw new Error(`One of the following permissions required: ${permissionCodes.join(', ')}`);
  }
}

/**
 * Require user to have a specific role
 * Throws error if not authenticated or lacks role
 */
export async function requireRole(request: NextRequest, roleName: string): Promise<void> {
  const user = await requireAuthenticatedUser(request);
  const hasRole = await roleRepository.hasRole(user.id, roleName);
  
  if (!hasRole) {
    throw new Error(`Role required: ${roleName}`);
  }
}

/**
 * Require user to be authorized to access a specific store
 * Throws error if not authenticated or not authorized for the store
 */
export async function requireStoreAccess(request: NextRequest, storeId: string): Promise<void> {
  const user = await requireAuthenticatedUser(request);
  const canAccess = await roleRepository.canAccessStore(user.id, storeId);
  
  if (!canAccess) {
    throw new Error('Not authorized to access this store');
  }
}

/**
 * Get authorized store IDs for the authenticated user
 * Returns null if user has global access (all stores in organization)
 * Returns array of store IDs if user is scoped to specific stores
 */
export async function getAuthorizedStoreIds(request: NextRequest): Promise<string[] | null> {
  const user = await requireAuthenticatedUser(request);
  return roleRepository.getAuthorizedStoreIds(user.id);
}
