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
 * GET /api/inventory
 * List inventories for an organization
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = getOrganizationId(request);
    const { searchParams } = new URL(request.url);
    
    const storeId = searchParams.get('storeId') || undefined;
    const skip = parseInt(searchParams.get('skip') || '0');
    const take = parseInt(searchParams.get('take') || '50');

    const result = await inventoryService.listByOrganization(organizationId, {
      storeId,
      skip,
      take,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Organization ID header is required') {
      return NextResponse.json(
        { error: 'Organization ID header is required' },
        { status: 401 }
      );
    }
    
    console.error('Error listing inventory:', error);
    return NextResponse.json(
      { error: 'Failed to list inventory' },
      { status: 500 }
    );
  }
}
