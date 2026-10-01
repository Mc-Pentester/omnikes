import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentOrganizationId, requirePermission, requireAuthenticatedUser } from '@omnikes/lib/auth';
import { validatePagination } from '@omnikes/lib/pagination';
import { adminUserCreateSchema } from '@omnikes/lib/validation';
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

export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'user.read');

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim() || undefined;
    const { skip, take } = validatePagination(searchParams.get('skip'), searchParams.get('take'));

    const result = await adminUserService.list(organizationId, search);
    return NextResponse.json({
      ...result,
      users: result.users.slice(skip, skip + take),
      pagination: {
        skip,
        take,
        total: result.users.length,
      },
    });
  } catch (error) {
    const auth = authError(error);
    if (auth) return auth;
    if (error instanceof Error && (error.name === 'ZodError' || error.message.startsWith('Invalid skip') || error.message.startsWith('Invalid take'))) {
      return NextResponse.json({ error: 'Invalid request', details: error.message }, { status: 400 });
    }
    console.error('Admin users GET error:', error);
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'user.create');
    const actor = await requireAuthenticatedUser(request);
    const body = adminUserCreateSchema.parse(await request.json());

    const user = await adminUserService.create(organizationId, body, actor.id);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    const auth = authError(error);
    if (auth) return auth;
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input data', details: error.message }, { status: 400 });
    }
    if (error instanceof Error && (
      error.message === 'A user with this email already exists' ||
      error.message === 'Global role cannot be assigned to a specific store' ||
      error.message === 'Role not found' ||
      error.message.includes('outside the current organization') ||
      error.message.includes('Store not found') ||
      error.message.includes('Role is not scoped')
    )) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Admin users POST error:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
