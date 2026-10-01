import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@omnikes/lib/auth';
import { roleRepository } from '@omnikes/repositories/role.repository';

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const canManageUsers = await roleRepository.hasPermission(user.id, 'user.read');

    return NextResponse.json({
      user: {
        ...user,
        canManageUsers,
      },
    });
  } catch (error) {
    console.error('Get current user error:', error);
    return NextResponse.json(
      { error: 'Failed to get current user' },
      { status: 500 }
    );
  }
}
