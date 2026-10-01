import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { prisma } from '@omnikes/lib/prisma';
import { saleService } from '@omnikes/services/sale.service';
import { requireCurrentOrganizationId, requirePermission, requireStoreAccess, getAuthenticatedUser } from '@omnikes/lib/auth';
import { paymentSchema } from '@omnikes/lib/validation';

/**
 * GET /api/sales/[id]/payments
 * List payments for a sale
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'payment.read');

    // Get sale to verify store access
    const sale = await saleService.getById(id, organizationId);
    if (sale.storeId) {
      await requireStoreAccess(request, sale.storeId);
    }

    const payments = await saleService.getPayments(id, organizationId);

    return NextResponse.json(payments);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && (error.message === 'Permission required: payment.read' || error.message.startsWith('Permission required'))) {
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

    if (error instanceof Error && (error.message === 'Sale is already completed' || error.message === 'Sale is cancelled')) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message === 'Sale not found or access denied') {
      return NextResponse.json(
        { error: 'Sale not found or access denied' },
        { status: 404 }
      );
    }

    console.error('Error listing payments:', error);
    return NextResponse.json(
      { error: 'Failed to list payments' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sales/[id]/payments
 * Add a payment to a sale with idempotency
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
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    await requirePermission(request, 'payment.create');

    // Get idempotency key
    const idempotencyKey = request.headers.get('Idempotency-Key');
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: 'Idempotency-Key header is required' },
        { status: 400 }
      );
    }

    // Parse payment data
    const body = await request.json();
    const paymentData = paymentSchema.parse(body);

    // Check for existing idempotency record
    const existingIdempotency = await prisma.paymentIdempotency.findUnique({
      where: {
        organizationId_key: {
          organizationId,
          key: idempotencyKey,
        },
      },
    });

    if (existingIdempotency) {
      // Check if key was used for a different organization
      if (existingIdempotency.organizationId !== organizationId) {
        return NextResponse.json(
          { error: 'Idempotency-Key already used for a different organization' },
          { status: 409 }
        );
      }

      // Check if key was used for a different sale
      if (existingIdempotency.saleId !== saleId) {
        return NextResponse.json(
          { error: 'Idempotency-Key already used for a different sale' },
          { status: 409 }
        );
      }

      // Check if key was used by a different user
      if (existingIdempotency.userId !== user.id) {
        return NextResponse.json(
          { error: 'Idempotency-Key already used by a different user' },
          { status: 409 }
        );
      }

      // Return cached result if completed
      if (existingIdempotency.status === 'COMPLETED') {
        return NextResponse.json(
          JSON.parse(existingIdempotency.responseBody || '{}'),
          { status: existingIdempotency.responseStatus || 200 }
        );
      }

      // If failed, allow retry
      if (existingIdempotency.status === 'FAILED') {
        // Delete failed record to allow retry
        await prisma.paymentIdempotency.delete({
          where: { id: existingIdempotency.id },
        });
      } else {
        // Still processing - return conflict
        return NextResponse.json(
          { error: 'Payment operation already in progress' },
          { status: 409 }
        );
      }
    }

    // Fetch sale to verify store access before transaction
    const saleForAccessCheck = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { storeId: true, organizationId: true },
    });

    if (!saleForAccessCheck) {
      return NextResponse.json(
        { error: 'Sale not found' },
        { status: 404 }
      );
    }

    // Verify organization
    if (saleForAccessCheck.organizationId !== organizationId) {
      return NextResponse.json(
        { error: 'Sale not found or access denied' },
        { status: 404 }
      );
    }

    // Verify store access (RBAC store scope)
    if (saleForAccessCheck.storeId) {
      try {
        await requireStoreAccess(request, saleForAccessCheck.storeId);
      } catch {
        return NextResponse.json(
          { error: 'Not authorized to access this store' },
          { status: 403 }
        );
      }
    }

    // Execute atomic payment transaction with idempotency
    const result = await prisma.$transaction(async (tx) => {
      // Create idempotency record with PROCESSING status
      const idempotencyRecord = await tx.paymentIdempotency.create({
        data: {
          organizationId,
          userId: user.id,
          saleId,
          key: idempotencyKey,
          status: 'PROCESSING',
        },
      });

      // Lock the sale row so payment and credit authorization cannot
      // calculate coverage concurrently from the same balance.
      const lockedSaleRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM sales
        WHERE id = ${saleId} AND "organizationId" = ${organizationId}
        FOR UPDATE
      `;

      if (lockedSaleRows.length === 0) {
        throw new Error('Sale not found or access denied');
      }

      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: {
          payments: true,
          saleCredit: true,
        },
      });

      if (!sale) {
        throw new Error('Sale not found');
      }

      // Verify organization (re-verify inside transaction for consistency)
      if (sale.organizationId !== organizationId) {
        throw new Error('Sale not found or access denied');
      }

      // Verify store belongs to organization (tenant boundary)
      if (sale.storeId) {
        const storeAccess = await tx.store.findUnique({
          where: { id: sale.storeId },
          include: { organization: true },
        });
        if (!storeAccess || storeAccess.organizationId !== organizationId) {
          throw new Error('Not authorized to access this store');
        }
      }

      // Payments may only be added while the sale is awaiting financial
      // coverage. COMPLETED and CANCELLED are terminal states.
      if (sale.status === 'COMPLETED') {
        throw new Error('Sale is already completed');
      }

      if (sale.status === 'CANCELLED') {
        throw new Error('Sale is cancelled');
      }

      // Financial coverage must use the same rule as sale.complete():
      // completed real payments + explicitly authorized customer credit.
      const totalPaid = sale.payments
        .filter(p => p.status === 'COMPLETED' && p.method !== 'CREDIT')
        .reduce((sum: number, p) => sum + Number(p.amount), 0);

      const authorizedCredit = sale.saleCredit?.status === 'AUTHORIZED'
        ? Number(sale.saleCredit.amount)
        : 0;

      const remainingAmount = Number(sale.total) - totalPaid - authorizedCredit;

      // Payment.CREDIT is rejected by paymentSchema. Only real payment
      // methods can consume the remaining financial balance after credit.
      if (Number(paymentData.amount) > remainingAmount) {
        throw new Error(`Payment amount exceeds remaining balance. Remaining: ${remainingAmount}, Attempted: ${paymentData.amount}`);
      }

      // Validate payment amount is positive
      if (Number(paymentData.amount) <= 0) {
        throw new Error('Payment amount must be positive');
      }

      // Create payment
      const payment = await tx.payment.create({
        data: {
          saleId,
          method: paymentData.method,
          amount: paymentData.amount,
          reference: paymentData.reference || `PAY-${Date.now()}`,
          status: paymentData.status || 'COMPLETED',
        },
      });

      // Update idempotency record with success
      await tx.paymentIdempotency.update({
        where: { id: idempotencyRecord.id },
        data: {
          status: 'COMPLETED',
          responseStatus: 201,
          responseBody: JSON.stringify(payment),
        },
      });

      return payment;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      );
    }

    // Handle idempotency failure
    if (error instanceof Error && error.message.includes('Idempotency-Key')) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 }
      );
    }

    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message.startsWith('Permission required')) {
      return NextResponse.json(
        { error: 'Permission required' },
        { status: 403 }
      );
    }

    if (error instanceof Error && error.message === 'Sale not found or access denied') {
      return NextResponse.json(
        { error: 'Sale not found or access denied' },
        { status: 404 }
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

    console.error('Error adding payment:', error);
    return NextResponse.json(
      { error: 'Failed to add payment' },
      { status: 500 }
    );
  }
}
