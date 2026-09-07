import { NextRequest, NextResponse } from 'next/server';
import { saleService } from '@omnikes/services/sale.service';
import { requireCurrentOrganizationId } from '@omnikes/lib/auth';

/**
 * PATCH /api/sales/[id]/items/[itemId]
 * Update a sale item
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const organizationId = await requireCurrentOrganizationId(request);
    const body = await request.json();

    const item = await saleService.updateItem(itemId, organizationId, body);

    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === 'Sale item not found or access denied') {
      return NextResponse.json(
        { error: 'Sale item not found or access denied' },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    
    console.error('Error updating item:', error);
    return NextResponse.json(
      { error: 'Failed to update item' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/sales/[id]/items/[itemId]
 * Remove a sale item
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const organizationId = await requireCurrentOrganizationId(request);

    await saleService.removeItem(itemId, organizationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === 'Sale item not found or access denied') {
      return NextResponse.json(
        { error: 'Sale item not found or access denied' },
        { status: 404 }
      );
    }
    
    console.error('Error removing item:', error);
    return NextResponse.json(
      { error: 'Failed to remove item' },
      { status: 500 }
    );
  }
}
