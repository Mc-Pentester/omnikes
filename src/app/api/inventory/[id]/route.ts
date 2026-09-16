import { NextRequest, NextResponse } from 'next/server';
import { inventoryService } from '@omnikes/services/inventory.service';
import { requireCurrentOrganizationId } from '@omnikes/lib/auth';

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
    const organizationId = await requireCurrentOrganizationId(request);
    const inventory = await inventoryService.getById(id, organizationId);

    return NextResponse.json(inventory);
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
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
