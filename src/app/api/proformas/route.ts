import { NextRequest, NextResponse } from 'next/server';
import { proformaService } from '@omnikes/services/proforma.service';
import { requireCurrentOrganizationId, requireStoreAccess, requirePermission } from '@omnikes/lib/auth';
import { validatePagination } from '@omnikes/lib/pagination';
import { parseDateRange } from '@omnikes/lib/date-validation';
import { ZodError } from 'zod';

/**
 * GET /api/proformas
 * List proformas for an organization
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'proforma.read');

    const { searchParams } = new URL(request.url);

    const storeId = searchParams.get('storeId') || undefined;
    const status = searchParams.get('status') || undefined;
    const customerId = searchParams.get('customerId') || undefined;

    // If a specific store is requested, verify access
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
    if (error instanceof Error) {
      if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      if (error.message === 'Not authorized to access this store') {
        return NextResponse.json(
          { error: 'Not authorized to access this store' },
          { status: 403 }
        );
      }

      if (error.message.startsWith('Permission required')) {
        return NextResponse.json(
          { error: 'Permission required' },
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
    await requirePermission(request, 'proforma.create');

    const body = await request.json();

    // Verify store access if storeId is provided
    if (body.storeId) {
      await requireStoreAccess(request, body.storeId);
    }

    const result = await proformaService.create(organizationId, body);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message === 'Not authorized to access this store') {
      return NextResponse.json(
        { error: 'Not authorized to access this store' },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message.startsWith('Permission required')) {
      return NextResponse.json(
        { error: 'Permission required' },
        { status: 403 }
      );
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.flatten() },
        { status: 400 }
      );
    }

    if (error instanceof Error && (error.message.includes('validation') || error.message.includes('not found') || error.message.includes('does not belong'))) {
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
