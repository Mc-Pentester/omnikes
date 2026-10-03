import { NextRequest, NextResponse } from 'next/server';
import { parseReportDateParam } from '@omnikes/lib/date-validation';
import { z } from 'zod';
import { salesReportService } from '@omnikes/services/sales-report.service';
import { salesReportStoreSchema } from '@omnikes/lib/validation';
import { requireCurrentOrganizationId, requirePermission, getAuthorizedStoreIds } from '@omnikes/lib/auth';

/**
 * GET /api/reports/sales/by-store
 * Get sales aggregated by store
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'report.read');

    const { searchParams } = new URL(request.url);

    const startDate = parseReportDateParam(searchParams.get('startDate'));
    const endDate = parseReportDateParam(searchParams.get('endDate'), true);

    const validatedData = salesReportStoreSchema.parse({
      startDate,
      endDate,
    });

    // Get authorized store IDs for scoped users
    const authorizedStoreIds = await getAuthorizedStoreIds(request);

    const result = await salesReportService.getSalesByStore(organizationId, validatedData, authorizedStoreIds);

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

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    console.error('Error getting sales by store:', error);
    return NextResponse.json(
      { error: 'Failed to get sales by store' },
      { status: 500 }
    );
  }
}
