import { NextRequest, NextResponse } from 'next/server';
import {
  requireCurrentOrganizationId,
  requireAuthenticatedUser,
  requirePermission,
} from '@omnikes/lib/auth';
import { storeSchema } from '@omnikes/lib/validation';
import { adminStoreService } from '@omnikes/services/admin-store.service';

function authError(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (error.message.startsWith('Permission required') || error.message === 'Global store administration required') {
    return NextResponse.json({ error: 'Permission required' }, { status: 403 });
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'store.update');
    const actor = await requireAuthenticatedUser(request);
    const { id } = await params;
    const body = storeSchema.partial().omit({ organizationId: true }).parse(await request.json());

    const store = await adminStoreService.update(organizationId, actor.id, id, body);
    return NextResponse.json({ store });
  } catch (error) {
    const auth = authError(error);
    if (auth) return auth;
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input data', details: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'Store not found or access denied') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error && error.message.includes('already exists')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Admin store PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update store' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'store.deactivate');
    const actor = await requireAuthenticatedUser(request);
    const { id } = await params;

    const store = await adminStoreService.setActive(organizationId, actor.id, id, false);
    return NextResponse.json({ store });
  } catch (error) {
    const auth = authError(error);
    if (auth) return auth;
    if (error instanceof Error && error.message === 'Store not found or access denied') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Admin store DELETE error:', error);
    return NextResponse.json({ error: 'Failed to deactivate store' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'store.activate');
    const actor = await requireAuthenticatedUser(request);
    const { id } = await params;

    const store = await adminStoreService.setActive(organizationId, actor.id, id, true);
    return NextResponse.json({ store });
  } catch (error) {
    const auth = authError(error);
    if (auth) return auth;
    if (error instanceof Error && error.message === 'Store not found or access denied') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error('Admin store activate error:', error);
    return NextResponse.json({ error: 'Failed to activate store' }, { status: 500 });
  }
}
