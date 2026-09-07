import { NextRequest, NextResponse } from 'next/server';
import { proformaService } from '@omnikes/services/proforma.service';
import { requireCurrentOrganizationId } from '@omnikes/lib/auth';

/**
 * GET /api/proformas
 * List proformas for an organization
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    const { searchParams } = new URL(request.url);
    
    const storeId = searchParams.get('storeId') || undefined;
    const status = searchParams.get('status') || undefined;
    const customerId = searchParams.get('customerId') || undefined;
    const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
    const skip = parseInt(searchParams.get('skip') || '0');
    const take = parseInt(searchParams.get('take') || '50');

    const result = await proformaService.list(organizationId, {
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
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    console.error('Error listing proformas:', error);
    return NextResponse.json(
      { error: 'Failed to list proformas' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/proformas
 * Create a new proforma
 */
export async function POST(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    const body = await request.json();

    const result = await proformaService.create(organizationId, body);

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
    
    console.error('Error creating proforma:', error);
    return NextResponse.json(
      { error: 'Failed to create proforma' },
      { status: 500 }
    );
  }
}
