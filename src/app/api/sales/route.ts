import { NextRequest, NextResponse } from 'next/server';
import { saleService } from '@omnikes/services/sale.service';
import { requireCurrentOrganizationId } from '@omnikes/lib/auth';
import { validatePagination } from '@omnikes/lib/pagination';
import { parseDateRange } from '@omnikes/lib/date-validation';

/**
 * GET /api/sales
 * List sales for an organization
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    const { searchParams } = new URL(request.url);
    
    const storeId = searchParams.get('storeId') || undefined;
    const status = searchParams.get('status') || undefined;
    const customerId = searchParams.get('customerId') || undefined;
    
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
    const body = await request.json();

    const result = await saleService.create(organizationId, body);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
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
