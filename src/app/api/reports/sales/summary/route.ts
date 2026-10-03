import { NextRequest, NextResponse } from 'next/server';
import { parseReportDateParam } from '@omnikes/lib/date-validation';
import { z } from 'zod';
import { salesReportService } from '@omnikes/services/sales-report.service';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess, getAuthorizedStoreIds } from '@omnikes/lib/auth';
import { salesReportSummarySchema } from '@omnikes/lib/validation';

/**
 * GET /api/reports/sales/summary
 * Get summary statistics for completed sales
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'report.read');

    const { searchParams } = new URL(request.url);

    const startDate = parseReportDateParam(searchParams.get('startDate'));
    const endDate = parseReportDateParam(searchParams.get('endDate'), true);
    const storeId = searchParams.get('storeId') || undefined;

    const validatedData = salesReportSummarySchema.parse({
      startDate,
      endDate,
      storeId,
    });

    // If storeId is provided, verify store access
    if (storeId) {
      await requireStoreAccess(request, storeId);
    }

    const authorizedStoreIds = await getAuthorizedStoreIds(request);

    const result = await salesReportService.getSummary(organizationId, { ...validatedData, authorizedStoreIds });

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

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid report parameters' },
        { status: 400 }
      );
    }

    console.error('Error getting sales summary:', error);
    return NextResponse.json(
      { error: 'Failed to get sales summary' },
      { status: 500 }
    );
  }
}
