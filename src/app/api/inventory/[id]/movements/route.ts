import { NextRequest, NextResponse } from 'next/server';
import { inventoryService } from '@omnikes/services/inventory.service';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';

// Simple CUID validation (basic format check)
function isValidCuid(id: string): boolean {
  return /^[a-z0-9]{24,}$/.test(id);
}

/**
 * GET /api/inventory/[id]/movements
 * List movements for an inventory
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
        { error: 'Invalid inventory ID format' },
        { status: 400 }
      );
    }

    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'inventory.read');

    // Get inventory to verify store access
    const inventory = await inventoryService.getById(id, organizationId);
    if (inventory.storeId) {
      await requireStoreAccess(request, inventory.storeId);
    }

    const { searchParams } = new URL(request.url);

    const type = searchParams.get('type') || undefined;
    const skip = parseInt(searchParams.get('skip') || '0');
    const take = parseInt(searchParams.get('take') || '50');

    const result = await inventoryService.listMovements(id, organizationId, {
      type,
      skip,
      take,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && (error.message === 'Permission required: inventory.read' || error.message.startsWith('Permission required'))) {
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

    if (error instanceof Error && error.message === 'Inventory not found or access denied') {
      return NextResponse.json(
        { error: 'Inventory not found or access denied' },
        { status: 404 }
      );
    }

    console.error('Error listing movements:', error);
    return NextResponse.json(
      { error: 'Failed to list movements' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inventory/[id]/movements
 * Create a stock movement
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate CUID format
    if (!isValidCuid(id)) {
      return NextResponse.json(
        { error: 'Invalid inventory ID format' },
        { status: 400 }
      );
    }

    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'inventory.adjust');

    // Get inventory to verify store access before creating movement
    const inventory = await inventoryService.getById(id, organizationId);
    if (inventory.storeId) {
      await requireStoreAccess(request, inventory.storeId);
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

    const movement = await inventoryService.createMovement(id, organizationId, body);

    return NextResponse.json(movement, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && (error.message === 'Permission required: inventory.adjust' || error.message.startsWith('Permission required'))) {
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

    if (error instanceof Error && error.message === 'Inventory not found or access denied') {
      return NextResponse.json(
        { error: 'Inventory not found or access denied' },
        { status: 404 }
      );
    }

    if (error instanceof Error && error.message === 'Insufficient stock for this operation') {
      return NextResponse.json(
        { error: 'Insufficient stock for this operation' },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error('Error creating movement:', error);
    return NextResponse.json(
      { error: 'Failed to create movement' },
      { status: 500 }
    );
  }
}
