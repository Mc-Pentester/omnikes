import { NextRequest, NextResponse } from 'next/server';
import { saleService } from '@omnikes/services/sale.service';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';

// Simple CUID validation (basic format check)
function isValidCuid(id: string): boolean {
  return /^[a-z0-9]{24,}$/.test(id);
}

/**
 * GET /api/sales/[id]
 * Get a single sale
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate CUID format
    if (!isValidCuid(id)) {
      return NextResponse.json(
        { error: 'Invalid sale ID format' },
        { status: 400 }
      );
    }

    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'sale.read');

    const sale = await saleService.getById(id, organizationId);

    // Verify store access
    if (sale.storeId) {
      await requireStoreAccess(request, sale.storeId);
    }

    return NextResponse.json(sale);
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && (error.message === 'Permission required: sale.read' || error.message.startsWith('Permission required'))) {
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

    console.error('Error getting sale:', error);
    return NextResponse.json(
      { error: 'Failed to get sale' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/sales/[id]
 * Update a sale
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate CUID format
    if (!isValidCuid(id)) {
      return NextResponse.json(
        { error: 'Invalid sale ID format' },
        { status: 400 }
      );
    }

    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'sale.update');

    // Get existing sale to verify store access
    const existingSale = await saleService.getById(id, organizationId);
    if (existingSale.storeId) {
      await requireStoreAccess(request, existingSale.storeId);
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

    const sale = await saleService.update(id, organizationId, body);

    return NextResponse.json(sale);
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

    if (error instanceof Error && error.message === 'Sale not found or access denied') {
      return NextResponse.json(
        { error: 'Sale not found or access denied' },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error('Error updating sale:', error);
    return NextResponse.json(
      { error: 'Failed to update sale' },
      { status: 500 }
    );
  }
}
