import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentOrganizationId, requirePermission, requireAuthenticatedUser } from '@omnikes/lib/auth';
import { adminRoleUpdateSchema } from '@omnikes/lib/validation';
import { adminRoleService } from '@omnikes/services/admin-role.service';

function mapError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (error.message.startsWith('Permission required')) {
    return NextResponse.json({ error: 'Permission required' }, { status: 403 });
  }
  if (
    error.message.includes('Role not found') ||
    error.message.includes('Store not found') ||
    error.message.includes('requires a store') ||
    error.message.includes('cannot be assigned to a store') ||
    error.message.includes('already exists') ||
    error.message.includes('permission') ||
    error.message.includes('Permission')
  ) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'role.update');
    const actor = await requireAuthenticatedUser(request);
    const { id } = await context.params;
    const body = adminRoleUpdateSchema.parse(await request.json());
    const role = await adminRoleService.update(organizationId, id, body, actor.id);
    return NextResponse.json({ role });
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input data', details: error.message }, { status: 400 });
    }
    const mapped = mapError(error);
    if (mapped) return mapped;
    console.error('Admin roles PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }
}
