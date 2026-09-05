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
 * GET /api/inventory/[id]/movements
 * List movements for an inventory
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = getOrganizationId(request);
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
    const organizationId = getOrganizationId(request);
    const body = await request.json();

    const movement = await inventoryService.createMovement(id, organizationId, body);

    return NextResponse.json(movement, { status: 201 });
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
