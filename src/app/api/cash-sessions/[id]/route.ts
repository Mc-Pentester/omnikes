import { NextRequest, NextResponse } from 'next/server';
import { cashService } from '@omnikes/services/cash.service';
import { getAuthenticatedUser, requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';
import { ZodError } from 'zod';

function idFrom(request: NextRequest) {
  const parts = new URL(request.url).pathname.split('/');
  return parts[parts.length - 1];
}

export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'cash.read');
    const id = idFrom(request);
    const session = await cashService.getById(organizationId, id);
    if (!session) return NextResponse.json({ error: 'Cash session not found' }, { status: 404 });
    await requireStoreAccess(request, session.storeId);
    return NextResponse.json(await cashService.summary(organizationId, id));
  } catch (error) {
    if (error instanceof Error && error.message.includes('Authentication')) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (error instanceof Error && error.message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    if (error instanceof Error && error.message === 'Not authorized to access this store') return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load cash session' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const id = idFrom(request);
    const session = await cashService.getById(organizationId, id);
    if (!session) return NextResponse.json({ error: 'Cash session not found' }, { status: 404 });
    await requireStoreAccess(request, session.storeId);
    const body = await request.json();
    const action = body.action;
    if (action === 'movement') {
      await requirePermission(request, 'cash.movement');
      return NextResponse.json(await cashService.addMovement(organizationId, session.storeId, id, user.id, body), { status: 201 });
    }
    if (action === 'close') {
      await requirePermission(request, 'cash.close');
      return NextResponse.json(await cashService.close(organizationId, id, user.id, body), { status: 200 });
    }
    return NextResponse.json({ error: 'Unsupported cash session action' }, { status: 400 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: 'Invalid request data', details: error.issues }, { status: 400 });
    if (error instanceof Error && (error.message.includes('already closed') || error.message.includes('already open'))) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && error.message.includes('Authentication')) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (error instanceof Error && error.message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    if (error instanceof Error && error.message === 'Not authorized to access this store') return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed to update cash session' }, { status: 500 });
  }
}
