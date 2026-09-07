import { NextRequest, NextResponse } from 'next/server';
import { salesReportService } from '@omnikes/services/sales-report.service';
import { salesReportStoreSchema } from '@omnikes/lib/validation';
import { requireCurrentOrganizationId } from '@omnikes/lib/auth';

/**
 * GET /api/reports/sales/by-store
 * Get sales aggregated by store
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    const { searchParams } = new URL(request.url);
    
    const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;

    const validatedData = salesReportStoreSchema.parse({
      startDate,
      endDate,
    });

    const result = await salesReportService.getSalesByStore(organizationId, validatedData);

    return NextResponse.json(result);
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
    
    console.error('Error getting sales by store:', error);
    return NextResponse.json(
      { error: 'Failed to get sales by store' },
      { status: 500 }
    );
  }
}
