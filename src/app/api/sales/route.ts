import { NextRequest, NextResponse } from 'next/server';
import { saleService } from '@omnikes/services/sale.service';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';
import { validatePagination } from '@omnikes/lib/pagination';
import { parseDateRange } from '@omnikes/lib/date-validation';

// Simple CUID validation (basic format check)
function isValidCuid(id: string): boolean {
  return /^[a-z0-9]{24,}$/.test(id);
}

/**
 * GET /api/sales
 * List sales for an organization
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'sale.read');

    const { searchParams } = new URL(request.url);

    const storeId = searchParams.get('storeId') || undefined;
    const status = searchParams.get('status') || undefined;
    const customerId = searchParams.get('customerId') || undefined;
    const search = searchParams.get('search') || undefined;
    const paymentMethod = searchParams.get('paymentMethod') || undefined;

    // Validate CUID format for optional parameters if provided
    if (storeId && !isValidCuid(storeId)) {
      return NextResponse.json(
        { error: 'Invalid storeId format' },
        { status: 400 }
      );
    }

    if (customerId && !isValidCuid(customerId)) {
      return NextResponse.json(
        { error: 'Invalid customerId format' },
        { status: 400 }
      );
    }

    // If storeId is provided, verify store access
    if (storeId) {
      await requireStoreAccess(request, storeId);
    }

    const { startDate, endDate } = parseDateRange(
      searchParams.get('startDate'),
      searchParams.get('endDate')
    );

    const { skip, take } = validatePagination(
      searchParams.get('skip'),
      searchParams.get('take')
    );

    const result = await saleService.list(organizationId, {
      storeId,
      status,
      customerId,
      search,
      paymentMethod,
      startDate,
      endDate,
      skip,
      take,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      if (error.message === 'Permission required: sale.read' || error.message.startsWith('Permission required')) {
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

      if (error.message.includes('Invalid skip') || error.message.includes('Invalid take') ||
          error.message.includes('Invalid date') || error.message.includes('Invalid date range')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    console.error('Error listing sales:', error);
    return NextResponse.json(
      { error: 'Failed to list sales' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sales
 * Create a new sale
 */
export async function POST(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'sale.create');

    // Protect against invalid JSON
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // Verify store access before creating sale
    if (body.storeId) {
      await requireStoreAccess(request, body.storeId);
    }

    const result = await saleService.create(organizationId, body);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && (error.message === 'Permission required: sale.create' || error.message.startsWith('Permission required'))) {
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

    if (error instanceof Error && error.message.includes('validation')) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error('Error creating sale:', error);
    return NextResponse.json(
      { error: 'Failed to create sale' },
      { status: 500 }
    );
  }
}
