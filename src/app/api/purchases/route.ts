import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentOrganizationId, requirePermission, requireAuthenticatedUser } from '@omnikes/lib/auth';
import { purchaseService } from '@omnikes/services/purchase.service';

function authErrorResponse(error: unknown) {
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
    await requirePermission(request, 'purchase.read');
    const { searchParams } = new URL(request.url);
    const purchases = await purchaseService.list(organizationId, {
      storeId: searchParams.get('storeId') || undefined,
      supplierId: searchParams.get('supplierId') || undefined,
      status: searchParams.get('status') || undefined,
      search: searchParams.get('search') || undefined,
      skip: searchParams.get('skip') ?? undefined,
      take: searchParams.get('take') ?? undefined,
    });
    return NextResponse.json(purchases);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid purchase parameters' }, { status: 400 });
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    console.error('Error listing purchases:', error);
    return NextResponse.json({ error: 'Failed to list purchases' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'purchase.manage');
    const purchase = await purchaseService.create(organizationId, user.id, await request.json());
    return NextResponse.json(purchase, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid purchase data' }, { status: 400 });
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;
    if (error instanceof Error && error.message.includes('already exists')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Error && /(not found|invalid|cannot be|negative)/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error creating purchase:', error);
    return NextResponse.json({ error: 'Failed to create purchase' }, { status: 500 });
  }
}
