import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { saleService } from '@omnikes/services/sale.service';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess, getAuthenticatedUser } from '@omnikes/lib/auth';
import { prisma } from '@omnikes/lib/prisma';
import { saleCreditSchema } from '@omnikes/lib/validation';

/**
 * POST /api/sales/[id]/credit
 * Authorize explicit customer credit for a PENDING sale.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: saleId } = await params;
    const organizationId = await requireCurrentOrganizationId(request);
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    await requirePermission(request, 'sale.credit');

    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { organizationId: true, storeId: true },
    });

    if (!sale || sale.organizationId !== organizationId) {
      return NextResponse.json({ error: 'Sale not found or access denied' }, { status: 404 });
    }

    await requireStoreAccess(request, sale.storeId);

    const body = await request.json();
    const data = saleCreditSchema.parse(body);

    const credit = await saleService.authorizeCredit(
      saleId,
      organizationId,
      user.id,
      data
    );

    return NextResponse.json(credit, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (error instanceof Error && error.message.startsWith('Permission required')) {
      return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    }

    if (error instanceof Error && error.message === 'Not authorized to access this store') {
      return NextResponse.json({ error: 'Not authorized to access this store' }, { status: 403 });
    }

    if (error instanceof Error && error.message === 'Sale not found or access denied') {
      return NextResponse.json({ error: 'Sale not found or access denied' }, { status: 404 });
    }

    if (error instanceof Error && (
      error.message === 'Credit can only be authorized for a PENDING sale' ||
      error.message === 'A customer is required to authorize credit' ||
      error.message === 'Credit is already authorized for this sale' ||
      error.message === 'Customer not found or access denied' ||
      error.message === 'Credit customer must match the sale customer' ||
      error.message.startsWith('Credit amount exceeds remaining balance')
    )) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error('Error authorizing sale credit:', error);
    return NextResponse.json({ error: 'Failed to authorize sale credit' }, { status: 500 });
  }
}
