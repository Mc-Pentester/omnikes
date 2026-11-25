import { prisma } from '@omnikes/lib/prisma';
import { creditRefundSchema, CreditRefundInput } from '@omnikes/lib/validation';
import { roundMoney } from '@omnikes/lib/money';

export class CreditRefundService {
  async process(organizationId: string, userId: string, saleCreditId: string, data: CreditRefundInput, idempotencyKey: string) {
    const input = creditRefundSchema.parse(data);
    const access = await prisma.saleCredit.findFirst({
      where: { id: saleCreditId, organizationId },
      select: { saleId: true },
    });
    if (!access) throw new Error('Credit not found');

    return prisma.$transaction(async (tx) => {
      const saleLock = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM sales WHERE id = ${access.saleId} AND "organizationId" = ${organizationId} FOR UPDATE
      `;
      if (!saleLock.length) throw new Error('Credit not found');
      const creditLock = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM sale_credits WHERE id = ${saleCreditId} AND "organizationId" = ${organizationId} FOR UPDATE
      `;
      if (!creditLock.length) throw new Error('Credit not found');

      const replay = await tx.creditRefund.findUnique({
        where: { organizationId_idempotencyKey: { organizationId, idempotencyKey } },
      });
      if (replay) {
        if (replay.saleCreditId !== saleCreditId || replay.returnId !== input.returnId ||
            replay.creditPaymentId !== input.paymentId || Number(replay.amount) !== input.amount ||
            (replay.reference ?? null) !== (input.reference ?? null) || replay.processedBy !== userId) {
          throw new Error('Idempotency key already used for a different credit refund');
        }
        return replay;
      }

      const credit = await tx.saleCredit.findFirst({
        where: { id: saleCreditId, organizationId },
        include: { payments: { select: { amount: true } }, adjustments: { select: { amount: true } } },
      });
      if (!credit) throw new Error('Credit not found');

      const returnLock = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM returns WHERE id = ${input.returnId} AND "organizationId" = ${organizationId} FOR UPDATE
      `;
      if (!returnLock.length) throw new Error('Return not found or access denied');

      const paymentLock = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM credit_payments
        WHERE id = ${input.paymentId} AND "organizationId" = ${organizationId} FOR UPDATE
      `;
      if (!paymentLock.length) throw new Error('Credit payment not found or access denied');

      const [returnRecord, payment] = await Promise.all([
        tx.return.findFirst({ where: { id: input.returnId, organizationId } }),
        tx.creditPayment.findFirst({ where: { id: input.paymentId, organizationId } }),
      ]);
      if (!returnRecord || returnRecord.status !== 'COMPLETED' || returnRecord.saleId !== credit.saleId || returnRecord.storeId !== credit.storeId) {
        throw new Error('Return does not belong to this customer credit');
      }
      if (!payment || payment.saleCreditId !== saleCreditId || payment.storeId !== credit.storeId) {
        throw new Error('Credit payment does not belong to this customer credit');
      }

      const paidTotal = roundMoney(credit.payments.reduce((sum, item) => sum + Number(item.amount), 0));
      const adjustedTotal = roundMoney(credit.adjustments.reduce((sum, item) => sum + Number(item.amount), 0));
      const outstandingDebt = roundMoney(Math.max(0, Number(credit.amount) - paidTotal - adjustedTotal));
      if (outstandingDebt > 0) {
        throw new Error('Outstanding customer credit must be reduced before refunding repayments');
      }

      const [normalRefunds, creditAdjustments, priorCreditRefunds] = await Promise.all([
        tx.refund.aggregate({ where: { returnId: input.returnId, status: 'COMPLETED' }, _sum: { amount: true } }),
        tx.creditAdjustment.aggregate({ where: { returnId: input.returnId }, _sum: { amount: true } }),
        tx.creditRefund.aggregate({ where: { returnId: input.returnId, organizationId }, _sum: { amount: true } }),
      ]);
      const alreadyAllocated = roundMoney(
        Number(normalRefunds._sum.amount || 0) +
        Number(creditAdjustments._sum.amount || 0) +
        Number(priorCreditRefunds._sum.amount || 0)
      );
      const returnRemaining = roundMoney(Number(returnRecord.totalRefunded) - alreadyAllocated);
      const paymentRemaining = roundMoney(Number(payment.amount) - Number(payment.refundedAmount));
      if (input.amount > returnRemaining || input.amount > paymentRemaining) {
        throw new Error(`Credit refund exceeds remaining refundable amount (return: ${returnRemaining}, payment: ${paymentRemaining})`);
      }

      let cashSessionId: string | null = null;
      if (payment.method === 'CASH') {
        const session = await tx.cashSession.findFirst({
          where: { organizationId, storeId: credit.storeId, status: 'OPEN' },
          select: { id: true },
        });
        if (!session) throw new Error('An open cash session is required for CASH credit refunds');
        cashSessionId = session.id;
      }

      const refund = await tx.creditRefund.create({
        data: {
          organizationId,
          storeId: credit.storeId,
          saleCreditId,
          creditPaymentId: payment.id,
          returnId: returnRecord.id,
          processedBy: userId,
          amount: input.amount,
          method: payment.method,
          reference: input.reference,
          idempotencyKey,
          status: 'COMPLETED',
        },
      });
      await tx.creditPayment.update({
        where: { id: payment.id },
        data: { refundedAmount: roundMoney(Number(payment.refundedAmount) + input.amount) },
      });

      if (cashSessionId) {
        await tx.cashMovement.create({
          data: {
            organizationId,
            storeId: credit.storeId,
            cashSessionId,
            createdBy: userId,
            type: 'REFUND',
            amount: input.amount,
            referenceId: credit.saleId,
            referenceType: 'CUSTOMER_CREDIT_REFUND',
            note: `Refund ${refund.id} for credit repayment ${payment.id}`,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId,
          organizationId,
          storeId: credit.storeId,
          action: 'CUSTOMER_CREDIT_REFUNDED',
          module: 'credit',
          entityId: refund.id,
          entityType: 'CreditRefund',
          metadata: {
            saleCreditId,
            creditPaymentId: payment.id,
            returnId: returnRecord.id,
            amount: input.amount,
            method: payment.method,
            paymentRefundedTotal: roundMoney(Number(payment.refundedAmount) + input.amount),
          },
        },
      });
      return refund;
    }, { isolationLevel: 'Serializable' });
  }
}
export const creditRefundService = new CreditRefundService();
