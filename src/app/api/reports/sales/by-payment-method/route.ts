import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { salesReportService } from '@omnikes/services/sales-report.service';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';
import { salesReportPaymentMethodSchema } from '@omnikes/lib/validation';

/**
 * GET /api/reports/sales/by-payment-method
 * Get sales aggregated by payment method
 */
export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'report.read');

    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
    const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;
    const storeId = searchParams.get('storeId') || undefined;

    const validatedData = salesReportPaymentMethodSchema.parse({
      startDate,
      endDate,
      storeId,
    });

    // If storeId is provided, verify store access
    if (storeId) {
      await requireStoreAccess(request, storeId);
    }

    const result = await salesReportService.getSalesByPaymentMethod(organizationId, validatedData);

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

    console.error('Error getting sales by payment method:', error);
    return NextResponse.json(
      { error: 'Failed to get sales by payment method' },
      { status: 500 }
    );
  }
}
