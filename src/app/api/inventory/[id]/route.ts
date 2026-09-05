import { NextRequest, NextResponse } from 'next/server';
import { inventoryService } from '@omnikes/services/inventory.service';

// Helper function to get organizationId from request
// TODO: Replace with proper authentication system
function getOrganizationId(request: NextRequest): string {
  const orgId = request.headers.get('x-organization-id');
  if (!orgId) {
    throw new Error('Organization ID header is required');
  }
  return orgId;
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
    const organizationId = getOrganizationId(request);
    const inventory = await inventoryService.getById(id, organizationId);

    return NextResponse.json(inventory);
  } catch (error) {
    if (error instanceof Error && error.message === 'Organization ID header is required') {
      return NextResponse.json(
        { error: 'Organization ID header is required' },
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
