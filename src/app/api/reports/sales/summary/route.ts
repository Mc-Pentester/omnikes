import { NextRequest, NextResponse } from 'next/server';
import { salesReportService } from '@omnikes/services/sales-report.service';
import { requireCurrentOrganizationId } from '@omnikes/lib/auth';

/**
 * GET /api/reports/sales/summary
 * Get summary statistics for completed sales
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    const { searchParams } = new URL(request.url);
    
    const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
    const storeId = searchParams.get('storeId') || undefined;

    const result = await salesReportService.getSummary(organizationId, {
      startDate,
      endDate,
      storeId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    console.error('Error getting sales summary:', error);
    return NextResponse.json(
      { error: 'Failed to get sales summary' },
      { status: 500 }
    );
  }
}
