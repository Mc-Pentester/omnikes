import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';
import { prisma } from '@omnikes/lib/prisma';
import { roundMoney } from '@omnikes/lib/money';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    await requirePermission(request, 'credit.history.view');

    const { id, paymentId } = await params;
    const payment = await prisma.creditPayment.findFirst({
      where: { id: paymentId, saleCreditId: id, organizationId: user.organizationId },
      include: {
        refunds: {
          where: { status: 'COMPLETED' },
          select: { id: true, amount: true, method: true, reference: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        receivedByUser: { select: { id: true, name: true, email: true } },
        saleCredit: {
          include: {
            sale: { select: { id: true, orderNumber: true, currencyCode: true, currencySymbol: true } },
            customer: { select: { id: true, name: true, phone: true } },
            store: { select: { id: true, name: true, code: true, address: true, city: true, country: true, phone: true, email: true } },
            payments: { select: { amount: true } },
            adjustments: { select: { amount: true } },
          },
        },
      },
    });
    if (!payment) return NextResponse.json({ error: 'Credit payment not found' }, { status: 404 });
    await requireStoreAccess(request, payment.storeId);

    const refundedAmount = roundMoney(payment.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0));
    const outstanding = roundMoney(Math.max(
      0,
      Number(payment.saleCredit.amount)
        - payment.saleCredit.payments.reduce((sum, item) => sum + Number(item.amount), 0)
        - payment.saleCredit.adjustments.reduce((sum, item) => sum + Number(item.amount), 0),
    ));

    return NextResponse.json({
      payment: {
        id: payment.id,
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference,
        createdAt: payment.createdAt,
        refundedAmount,
        refunds: payment.refunds,
      },
      credit: { id: payment.saleCredit.id, amount: payment.saleCredit.amount, dueAt: payment.saleCredit.dueAt, outstanding },
      sale: payment.saleCredit.sale,
      customer: payment.saleCredit.customer,
      store: payment.saleCredit.store,
      receivedByUser: payment.receivedByUser,
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Permission required')) {
      return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    }
    if (error instanceof Error && error.message === 'Not authorized to access this store') {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('Error loading customer credit payment receipt:', error);
    return NextResponse.json({ error: 'Failed to load credit payment receipt' }, { status: 500 });
  }
}
