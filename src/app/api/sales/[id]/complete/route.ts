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
 * POST /api/sales/[id]/complete
 * Complete a sale (deducts stock)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = getOrganizationId(request);

    const sale = await saleService.complete(id, organizationId);

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
