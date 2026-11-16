import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { saleService } from '@omnikes/services/sale.service';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'sale.update');
    const existingSale = await saleService.getById(id, organizationId);
    await requireStoreAccess(request, existingSale.storeId);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    return NextResponse.json(await saleService.syncItems(id, organizationId, body));
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: 'Invalid request data', details: error.issues }, { status: 400 });
    if (error instanceof Error && (error.message.includes('Authentication') || error.message.includes('Invalid or expired session'))) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (error instanceof Error && error.message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    if (error instanceof Error && error.message === 'Not authorized to access this store') return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof Error && error.message === 'Sale not found or access denied') return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof Error && error.message.includes('Discount cannot exceed')) return NextResponse.json({ error: error.message }, { status: 422 });
    if (error instanceof Error && (error.message.includes('only be modified') || error.message.includes('Duplicate product variants'))) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Error && error.message === 'Product variant not found or access denied') return NextResponse.json({ error: error.message }, { status: 404 });
    console.error('Error synchronizing POS cart:', error);
    return NextResponse.json({ error: 'Failed to synchronize POS cart' }, { status: 500 });
  }
}
