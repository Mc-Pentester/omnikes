import { NextRequest, NextResponse } from 'next/server';
import { salesReportService } from '@omnikes/services/sales-report.service';
import { salesReportPeriodSchema } from '@omnikes/lib/validation';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';

/**
 * GET /api/reports/sales/by-period
 * Get sales aggregated by period (day, week, month)
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'report.read');

    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
    const storeId = searchParams.get('storeId') || undefined;
    const granularity = (searchParams.get('granularity') as 'day' | 'week' | 'month') || 'day';

    // If storeId is provided, verify store access
    if (storeId) {
      await requireStoreAccess(request, storeId);
    }

    const validatedData = salesReportPeriodSchema.parse({
      startDate,
      endDate,
      storeId,
      granularity,
    });

    const result = await salesReportService.getSalesByPeriod(organizationId, validatedData);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && (error.message === 'Permission required: report.read' || error.message.startsWith('Permission required'))) {
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

    console.error('Error getting sales by period:', error);
    return NextResponse.json(
      { error: 'Failed to get sales by period' },
      { status: 500 }
    );
  }
}
