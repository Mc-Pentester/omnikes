import { NextRequest, NextResponse } from 'next/server';
import { saleService } from '@omnikes/services/sale.service';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';

/**
 * GET /api/sales/[id]/items
 * List items for a sale
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'sale.read');

    const sale = await saleService.getById(id, organizationId);

    // Verify store access
    if (sale.storeId) {
      await requireStoreAccess(request, sale.storeId);
    }

    return NextResponse.json(sale.items);
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

    console.error('Error listing items:', error);
    return NextResponse.json(
      { error: 'Failed to list items' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sales/[id]/items
 * Add an item to a sale
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'sale.update');

    // Get sale to verify store access before adding item
    const sale = await saleService.getById(id, organizationId);
    if (sale.storeId) {
      await requireStoreAccess(request, sale.storeId);
    }

    let body;
    // Protect against invalid JSON
    try {
      body = await request.json();
    } catch (jsonError) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const item = await saleService.addItem(id, organizationId, body);

    return NextResponse.json(item, { status: 201 });
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

    if (error instanceof Error && error.message === 'Product variant not found or access denied') {
      return NextResponse.json(
        { error: 'Product variant not found or access denied' },
        { status: 404 }
      );
    }

    // Handle Zod validation errors
    if (error && typeof error === 'object' && 'issues' in error) {
      const validationError = error as { issues: Array<{ message: string; path: (string | number)[] }> };
      return NextResponse.json(
        { error: `Validation error: ${validationError.issues.map(i => i.message).join(', ')}` },
        { status: 400 }
      );
    }

    if (error instanceof Error && (error.message.includes('validation') || error.message.includes('must be'))) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error('Error adding item:', error);
    return NextResponse.json(
      { error: 'Failed to add item' },
      { status: 500 }
    );
  }
}
