import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentOrganizationId, requirePermission, requireAuthenticatedUser } from '@omnikes/lib/auth';
import { adminUserUpdateSchema } from '@omnikes/lib/validation';
import { adminUserService } from '@omnikes/services/admin-user.service';

function authError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (error.message.startsWith('Permission required')) {
    return NextResponse.json({ error: 'Permission required' }, { status: 403 });
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'user.update');
    const actor = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const body = adminUserUpdateSchema.parse(await request.json());

    const user = await adminUserService.update(organizationId, id, body, actor.id);
    return NextResponse.json({ user });
  } catch (error) {
    const auth = authError(error);
    if (auth) return auth;
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input data', details: error.message }, { status: 400 });
    }
    if (error instanceof Error && (
      error.message === 'User not found' ||
      error.message === 'A user with this email already exists' ||
      error.message === 'You cannot deactivate your own account' ||
      error.message === 'Global role cannot be assigned to a specific store' ||
      error.message === 'Role not found' ||
      error.message.includes('outside the current organization') ||
      error.message.includes('Store not found') ||
      error.message.includes('Role is not scoped')
    )) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Admin user PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
