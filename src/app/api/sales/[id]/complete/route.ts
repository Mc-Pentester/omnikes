import { NextRequest, NextResponse } from 'next/server';
import { saleService } from '@omnikes/services/sale.service';
import { requireCurrentOrganizationId } from '@omnikes/lib/auth';

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

    const sale = await saleService.complete(id, organizationId);

    return NextResponse.json(sale);
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
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
