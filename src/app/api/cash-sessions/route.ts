import { NextRequest, NextResponse } from 'next/server';
import { cashService } from '@omnikes/services/cash.service';
import { getAuthenticatedUser, requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';
import { ZodError } from 'zod';

export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'cash.read');
    const storeId = new URL(request.url).searchParams.get('storeId');
    if (!storeId) return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
    await requireStoreAccess(request, storeId);
    return NextResponse.json(await cashService.getOpenSession(organizationId, storeId));
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
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
    await requirePermission(request, 'cash.open');
    const body = await request.json();
    await requireStoreAccess(request, body.storeId);
    return NextResponse.json(await cashService.open(organizationId, user.id, body), { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: 'Invalid request data', details: error.issues }, { status: 400 });
    if (error instanceof Error && error.message.includes('already open')) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && error.message.includes('Authentication')) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (error instanceof Error && error.message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    if (error instanceof Error && error.message === 'Not authorized to access this store') return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed to open cash session' }, { status: 500 });
  }
}
