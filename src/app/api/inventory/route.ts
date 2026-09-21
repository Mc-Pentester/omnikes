import { NextRequest, NextResponse } from 'next/server';
import { inventoryService } from '@omnikes/services/inventory.service';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';
import { validatePagination } from '@omnikes/lib/pagination';

/**
 * GET /api/inventory
 * List inventories for an organization
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'inventory.read');

    const { searchParams } = new URL(request.url);

    const storeId = searchParams.get('storeId') || undefined;

    // If storeId is provided, verify store access
    if (storeId) {
      await requireStoreAccess(request, storeId);
    }

    const { skip, take } = validatePagination(
      searchParams.get('skip'),
      searchParams.get('take')
    );

    const result = await inventoryService.listByOrganization(organizationId, {
      storeId,
      skip,
      take,
    });

    // Map to match frontend expectation
    return NextResponse.json({
      inventory: result.inventories,
      total: result.total,
      skip: result.skip,
      take: result.take,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      if (error.message === 'Permission required: inventory.read' || error.message.startsWith('Permission required')) {
        return NextResponse.json(
          { error: 'Permission required' },
          { status: 403 }
        );
      }

      if (error.message === 'Not authorized to access this store') {
        return NextResponse.json(
          { error: 'Not authorized to access this store' },
          { status: 403 }
        );
      }

      if (error.message.includes('Invalid skip') || error.message.includes('Invalid take')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    console.error('Error listing inventory:', error);
    return NextResponse.json(
      { error: 'Failed to list inventory' },
      { status: 500 }
    );
  }
}
