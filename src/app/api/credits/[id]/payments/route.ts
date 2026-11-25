import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@omnikes/lib/prisma';
import { getAuthenticatedUser, requirePermission, requireStoreAccess, requireSubscriptionCapability } from '@omnikes/lib/auth';
import { creditPaymentSchema, idempotencyKeySchema } from '@omnikes/lib/validation';
import { roundMoney } from '@omnikes/lib/money';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    await requirePermission(request, 'credit.history.view');
    const { id } = await params;
    const credit = await prisma.saleCredit.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { id: true, storeId: true },
    });
    if (!credit) return NextResponse.json({ error: 'Credit not found' }, { status: 404 });
    await requireStoreAccess(request, credit.storeId);
    const payments = await prisma.creditPayment.findMany({
      where: { saleCreditId: id, organizationId: user.organizationId },
      orderBy: { createdAt: 'desc' },
      include: { receivedByUser: { select: { id: true, name: true, email: true } } },
    });
    return NextResponse.json(payments);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    if (error instanceof Error && error.message === 'Not authorized to access this store') return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: 'Failed to load credit payment history' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    await requirePermission(request, 'credit.payment.receive');
    await requireSubscriptionCapability(request, 'customers.credit', 'WRITE');

    const { id } = await params;
    const key = idempotencyKeySchema.parse(request.headers.get('Idempotency-Key'));
    const data = creditPaymentSchema.parse(await request.json());

    const existing = await prisma.creditPayment.findUnique({
      where: { organizationId_idempotencyKey: { organizationId: user.organizationId, idempotencyKey: key } },
    });
    if (existing) {
      if (existing.saleCreditId !== id || existing.receivedBy !== user.id ||
          Number(existing.amount) !== data.amount || existing.method !== data.method ||
          (existing.reference ?? null) !== (data.reference ?? null)) {
        return NextResponse.json({ error: 'Idempotency-Key already used with different credit payment data' }, { status: 409 });
      }
      await requireStoreAccess(request, existing.storeId);
      return NextResponse.json(existing);
    }

    const creditForAccess = await prisma.saleCredit.findFirst({
      where: { id, organizationId: user.organizationId },
      select: { storeId: true, saleId: true },
    });
    if (!creditForAccess) return NextResponse.json({ error: 'Credit not found' }, { status: 404 });
    await requireStoreAccess(request, creditForAccess.storeId);

    const result = await prisma.$transaction(async (tx) => {
      // Use the same sale -> credit lock order as returns and cancellations.
      // This prevents deadlocks when cash movements reference the source sale.
      const lockedSale = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM sales
        WHERE id = ${creditForAccess.saleId} AND "organizationId" = ${user.organizationId}
        FOR UPDATE
      `;
      if (!lockedSale.length) throw new Error('Credit not found');

      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM sale_credits
        WHERE id = ${id} AND "organizationId" = ${user.organizationId}
        FOR UPDATE
      `;
      if (!locked.length) throw new Error('Credit not found');
      const credit = await tx.saleCredit.findFirst({
        where: { id, organizationId: user.organizationId },
        include: { payments: true, adjustments: true, sale: { select: { orderNumber: true, status: true, currencyCode: true } } },
      });
      if (!credit) throw new Error('Credit not found');
      if (credit.status !== 'AUTHORIZED') throw new Error('Credit is not open for payment');

      const paid = roundMoney(credit.payments.reduce((sum, p) => sum + Number(p.amount), 0));
      const adjusted = roundMoney(credit.adjustments.reduce((sum, item) => sum + Number(item.amount), 0));
      const outstanding = roundMoney(Number(credit.amount) - paid - adjusted);
      if (data.amount > outstanding) throw new Error(`Payment exceeds outstanding credit balance: ${outstanding}`);

      let cashSessionId: string | null = null;
      if (data.method === 'CASH') {
        const session = await tx.cashSession.findFirst({
          where: { organizationId: user.organizationId, storeId: credit.storeId, status: 'OPEN' },
          select: { id: true },
        });
        if (!session) throw new Error('An open cash session is required for CASH credit payments');
        cashSessionId = session.id;
      }

      const payment = await tx.creditPayment.create({
        data: {
          organizationId: user.organizationId,
          storeId: credit.storeId,
          saleCreditId: credit.id,
          receivedBy: user.id,
          cashSessionId,
          amount: data.amount,
          method: data.method,
          reference: data.reference,
          idempotencyKey: key,
        },
      });

      if (cashSessionId) {
        await tx.cashMovement.create({
          data: {
            organizationId: user.organizationId,
            storeId: credit.storeId,
            cashSessionId,
            createdBy: user.id,
            type: 'CASH_IN',
            amount: data.amount,
            referenceId: credit.saleId,
            referenceType: 'CUSTOMER_CREDIT_PAYMENT',
            note: `Customer credit repayment for sale ${credit.sale.orderNumber}`,
          },
        });
      }

      if (roundMoney(paid + data.amount + adjusted) >= Number(credit.amount)) {
        await tx.saleCredit.update({ where: { id: credit.id }, data: { status: 'SETTLED' } });
      }

      await tx.auditLog.create({
        data: {
          userId: user.id,
          organizationId: user.organizationId,
          storeId: credit.storeId,
          action: 'CUSTOMER_CREDIT_PAYMENT_RECEIVED',
          module: 'credit',
          entityId: credit.id,
          entityType: 'SaleCredit',
          metadata: {
            paymentId: payment.id,
            amount: data.amount,
            method: data.method,
            currencyCode: credit.sale.currencyCode,
            outstandingBefore: outstanding,
          },
        },
      });

      return { ...payment, outstandingAfter: roundMoney(outstanding - data.amount), currencyCode: credit.sale.currencyCode };
    }, { isolationLevel: 'Serializable' });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid credit payment data', details: error.issues }, { status: 400 });
    if (error instanceof Error && error.message.startsWith('Subscription entitlement required:')) return NextResponse.json({ error: error.message }, { status: 402 });
    if (error instanceof Error && error.message === 'Authentication required') return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof Error && error.message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    if (error instanceof Error && error.message === 'Not authorized to access this store') return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof Error && (error.message === 'Credit not found')) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof Error && (error.message === 'Credit is not open for payment' || error.message.startsWith('Payment exceeds outstanding') || error.message.startsWith('An open cash session'))) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return NextResponse.json({ error: 'Credit payment request already processed; retry with the same idempotency key' }, { status: 409 });
    console.error('Error receiving customer credit payment:', error);
    return NextResponse.json({ error: 'Failed to receive customer credit payment' }, { status: 500 });
  }
}
