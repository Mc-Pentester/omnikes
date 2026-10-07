import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuthenticatedUser, requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';
import { supplierPaymentService } from '@omnikes/services/supplier-payment.service';

function authErrorResponse(error: unknown) {
  if (!(error instanceof Error)) return null;
  if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (error.message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'supplier.payment.read');
    const { searchParams } = new URL(request.url);
    return NextResponse.json(await supplierPaymentService.list(organizationId, {
      supplierId: searchParams.get('supplierId') || undefined,
      purchaseId: searchParams.get('purchaseId') || undefined,
      storeId: searchParams.get('storeId') || undefined,
      skip: searchParams.get('skip') ?? undefined,
      take: searchParams.get('take') ?? undefined,
    }));
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid payment parameters' }, { status: 400 });
    const auth = authErrorResponse(error); if (auth) return auth;
    return NextResponse.json({ error: 'Failed to list supplier payments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'supplier.payment.manage');
    return NextResponse.json(await supplierPaymentService.create(organizationId, user.id, await request.json()), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid payment data' }, { status: 400 });
    const auth = authErrorResponse(error); if (auth) return auth;
    if (error instanceof Error && /(not found|exceeds|requires|only valid|cancelled|access denied|outstanding)/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error creating supplier payment:', error);
    return NextResponse.json({ error: 'Failed to create supplier payment' }, { status: 500 });
  }
}
