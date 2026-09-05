import { NextRequest, NextResponse } from 'next/server';
import { saleService } from '@omnikes/services/sale.service';

function getOrganizationId(request: NextRequest): string {
  const orgId = request.headers.get('x-organization-id');
  if (!orgId) {
    throw new Error('Organization ID header is required');
  }
  return orgId;
}

/**
 * POST /api/sales/[id]/cancel
 * Cancel a sale (restores stock if completed)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = getOrganizationId(request);

    const sale = await saleService.cancel(id, organizationId);

    return NextResponse.json(sale);
  } catch (error) {
    if (error instanceof Error && error.message === 'Organization ID header is required') {
      return NextResponse.json(
        { error: 'Organization ID header is required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === 'Sale not found or access denied') {
      return NextResponse.json(
        { error: 'Sale not found or access denied' },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message === 'Sale is already cancelled') {
      return NextResponse.json(
        { error: 'Sale is already cancelled' },
        { status: 409 }
      );
    }
    
    console.error('Error cancelling sale:', error);
    return NextResponse.json(
      { error: 'Failed to cancel sale' },
      { status: 500 }
    );
  }
}
