import { NextRequest, NextResponse } from 'next/server';
import { saleService } from '@omnikes/services/sale.service';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';

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
    await requirePermission(request, 'sale.update');

    // Get sale to verify store access before updating item
    const sale = await saleService.getById(id, organizationId);
    if (sale.storeId) {
      await requireStoreAccess(request, sale.storeId);
    }

    // Protect against invalid JSON
    let body;
    try {
      body = await request.json();
    } catch (jsonError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const item = await saleService.updateItem(itemId, organizationId, body);

    return NextResponse.json(item);
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && (error.message === 'Permission required: sale.update' || error.message.startsWith('Permission required'))) {
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
    await requirePermission(request, 'sale.update');

    // Get sale to verify store access before removing item
    const sale = await saleService.getById(id, organizationId);
    if (sale.storeId) {
      await requireStoreAccess(request, sale.storeId);
    }

    await saleService.removeItem(itemId, organizationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && (error.message === 'Permission required: sale.update' || error.message.startsWith('Permission required'))) {
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
