import { NextRequest, NextResponse } from 'next/server';
import { requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';
import { supplierPaymentService } from '@omnikes/services/supplier-payment.service';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'supplier.payment.read');
    const { id: supplierId } = await context.params;
    const { searchParams } = new URL(request.url);
    return NextResponse.json(await supplierPaymentService.supplierBalance(
      organizationId,
      supplierId,
      searchParams.get('storeId') || undefined,
    ));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Permission required')) {
      return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    }
    if (error instanceof Error && /Authentication required|Invalid or expired session/.test(error.message)) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to calculate supplier balance' }, { status: 500 });
  }
}
