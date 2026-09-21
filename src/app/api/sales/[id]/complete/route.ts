import { NextRequest, NextResponse } from 'next/server';
import { saleService } from '@omnikes/services/sale.service';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';

/**
 * POST /api/sales/[id]/complete
 * Complete a sale (deducts stock)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'sale.complete');

    // Get sale to verify store access before completion
    const sale = await saleService.getById(id, organizationId);
    if (sale.storeId) {
      await requireStoreAccess(request, sale.storeId);
    }

    const completedSale = await saleService.complete(id, organizationId);

    return NextResponse.json(completedSale);
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && (error.message === 'Permission required: sale.complete' || error.message.startsWith('Permission required'))) {
      return NextResponse.json(
        { error: 'Permission required' },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message === 'Not authorized to access this store') {
      return NextResponse.json(
        { error: 'Not authorized to access this store' },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message === 'Sale not found or access denied') {
      return NextResponse.json(
        { error: 'Sale not found or access denied' },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message === 'Sale is already completed') {
      return NextResponse.json(
        { error: 'Sale is already completed' },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message.startsWith('Insufficient stock')) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    console.error('Error completing sale:', error);
    return NextResponse.json(
      { error: 'Failed to complete sale' },
      { status: 500 }
    );
  }
}
