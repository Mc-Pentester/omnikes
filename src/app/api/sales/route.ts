import { NextRequest, NextResponse } from 'next/server';
import { saleService } from '@omnikes/services/sale.service';

function getOrganizationId(request: NextRequest): string {
  const orgId = request.headers.get('x-organization-id');
  if (!orgId) {
    throw new Error('Organization ID header is required');
  }
  return orgId;
}

/**
 * GET /api/sales
 * List sales for an organization
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = getOrganizationId(request);
    const { searchParams } = new URL(request.url);
    
    const storeId = searchParams.get('storeId') || undefined;
    const status = searchParams.get('status') || undefined;
    const customerId = searchParams.get('customerId') || undefined;
    const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
    const skip = parseInt(searchParams.get('skip') || '0');
    const take = parseInt(searchParams.get('take') || '50');

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
    if (error instanceof Error && error.message === 'Organization ID header is required') {
      return NextResponse.json(
        { error: 'Organization ID header is required' },
        { status: 401 }
      );
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
    const organizationId = getOrganizationId(request);
    const body = await request.json();

    const result = await saleService.create(organizationId, body);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Organization ID header is required') {
      return NextResponse.json(
        { error: 'Organization ID header is required' },
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
