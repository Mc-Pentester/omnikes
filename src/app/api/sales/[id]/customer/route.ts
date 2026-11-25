import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess, requireSubscriptionCapability } from '@omnikes/lib/auth';
import { saleService } from '@omnikes/services/sale.service';
import { saleCustomerAssignSchema } from '@omnikes/lib/validation';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'sale.customer.assign');
    await requireSubscriptionCapability(request, 'pos.sales', 'WRITE');
    await requirePermission(request, 'customer.read');

    const existingSale = await saleService.getById(id, organizationId);
    if (existingSale.storeId) await requireStoreAccess(request, existingSale.storeId);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const { customerId } = saleCustomerAssignSchema.parse(body);
    const sale = await saleService.update(id, organizationId, { customerId });
    if (!sale) return NextResponse.json({ error: 'Sale not found or access denied' }, { status: 404 });
    return NextResponse.json({ id: sale.id, customerId: sale.customerId });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Subscription entitlement required:')) return NextResponse.json({ error: error.message }, { status: 402 });
    if (error instanceof ZodError) {
      return NextResponse.json({ error: 'Invalid customer assignment', details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('Permission required')) {
      return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Not authorized to access this store') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Sale not found or access denied') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'Invalid customer') {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes('only be modified')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Error assigning sale customer:', error);
    return NextResponse.json({ error: 'Failed to assign customer' }, { status: 500 });
  }
}
