import { NextRequest, NextResponse } from 'next/server';
import { inventoryService } from '@omnikes/services/inventory.service';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';

// Simple CUID validation (basic format check)
function isValidCuid(id: string): boolean {
  return /^[a-z0-9]{24,}$/.test(id);
}

/**
 * GET /api/inventory/[id]
 * Get a single inventory record
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

    const inventory = await inventoryService.getById(id, organizationId);

    // Verify store access using the inventory's real storeId
    if (inventory.storeId) {
      await requireStoreAccess(request, inventory.storeId);
    }

    return NextResponse.json(inventory);
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

    console.error('Error getting inventory:', error);
    return NextResponse.json(
      { error: 'Failed to get inventory' },
      { status: 500 }
    );
  }
}
