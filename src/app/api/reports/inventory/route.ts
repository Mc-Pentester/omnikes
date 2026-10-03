import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseReportDateParam } from '@omnikes/lib/date-validation';
import {
  getAuthorizedStoreIds,
  requireCurrentOrganizationId,
  requirePermission,
  requireStoreAccess,
} from '@omnikes/lib/auth';
import { inventoryReportService } from '@omnikes/services/inventory-report.service';

const querySchema = z.object({
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  storeId: z.string().cuid().optional(),
  lowStockThreshold: z.coerce.number().int().min(0).max(1000000).default(5),
});

export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'report.read');

    const { searchParams } = new URL(request.url);
    const startDate = parseReportDateParam(searchParams.get('startDate'));
    const endDate = parseReportDateParam(searchParams.get('endDate'), true);
    const storeId = searchParams.get('storeId') || undefined;
    const lowStockThreshold = searchParams.get('lowStockThreshold') || undefined;

    const validated = querySchema.parse({
      startDate,
      endDate,
      storeId,
      ...(lowStockThreshold !== undefined ? { lowStockThreshold } : {}),
    });

    if (validated.storeId) {
      await requireStoreAccess(request, validated.storeId);
    }

    const authorizedStoreIds = await getAuthorizedStoreIds(request);

    const result = await inventoryReportService.getReport(organizationId, {
      ...validated,
      authorizedStoreIds,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'Authentication required' ||
        error.message === 'Invalid or expired session')
    ) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (
      error instanceof Error &&
      (error.message === 'Permission required: report.read' ||
        error.message.startsWith('Permission required'))
    ) {
      return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    }

    if (error instanceof Error && error.message === 'Not authorized to access this store') {
      return NextResponse.json({ error: 'Not authorized to access this store' }, { status: 403 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid report parameters' }, { status: 400 });
    }

    console.error('Error getting inventory report:', error);
    return NextResponse.json({ error: 'Failed to get inventory report' }, { status: 500 });
  }
}
