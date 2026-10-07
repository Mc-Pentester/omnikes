import { prisma } from '@omnikes/lib/prisma';
import { refundSchema, RefundInput } from '@omnikes/lib/validation';
import { roundMoney } from '@omnikes/lib/money';

export class RefundService {
  /**
   * Process a refund for a payment
   * This operation is atomic: payment update and refund record happen in one transaction
   */
  async process(organizationId: string, userId: string, data: RefundInput) {
    const validatedData = refundSchema.parse(data);

    return prisma.$transaction(async (tx) => {
      // Lock the payment row
      const lockedPaymentRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT p.id
        FROM payments p
        INNER JOIN sales s ON s.id = p."saleId"
        WHERE p.id = ${validatedData.paymentId} AND s."organizationId" = ${organizationId}
        FOR UPDATE
      `;

      if (lockedPaymentRows.length === 0) {
        throw new Error('Payment not found or access denied');
      }

      // Fetch the payment with sale info
      const payment = await tx.payment.findUnique({
        where: { id: validatedData.paymentId },
        include: {
          sale: {
            include: {
              store: true,
            },
          },
        },
      });

      if (!payment) {
        throw new Error('Payment not found or access denied');
      }

      // Verify store belongs to organization
      if (payment.sale.store.organizationId !== organizationId) {
        throw new Error('Store does not belong to the organization');
      }

      // Calculate remaining refundable amount
      const paidAmount = Number(payment.amount);
      const alreadyRefunded = Number(payment.refundedAmount || 0);
      const remainingRefundable = roundMoney(paidAmount - alreadyRefunded);

      if (validatedData.amount > remainingRefundable) {
        throw new Error(
          `Refund amount exceeds remaining refundable amount. ` +
          `Paid: ${paidAmount}, Already refunded: ${alreadyRefunded}, ` +
          `Remaining: ${remainingRefundable}, Requested: ${validatedData.amount}`
        );
      }

      // Create the refund record
      const refund = await tx.refund.create({
        data: {
          paymentId: validatedData.paymentId,
          amount: validatedData.amount,
          method: payment.method,
          reference: validatedData.reference,
          status: 'COMPLETED',
          processedBy: userId,
        },
      });

      // Update payment refunded amount
      const newRefundedAmount = roundMoney(alreadyRefunded + validatedData.amount);
      await tx.payment.update({
        where: { id: validatedData.paymentId },
        data: {
          refundedAmount: newRefundedAmount,
          status: newRefundedAmount >= paidAmount ? 'REFUNDED' : 'COMPLETED',
        },
      });

      // For CASH refunds, create a cash movement
      if (payment.method === 'CASH') {
        // Find the open cash session for this store
        const cashSession = await tx.cashSession.findFirst({
          where: {
            organizationId,
            storeId: payment.sale.storeId,
            status: 'OPEN',
          },
          select: { id: true },
        });

        if (!cashSession) {
          throw new Error('An open cash session is required for CASH refunds');
        }

        await tx.cashMovement.create({
          data: {
            organizationId,
            storeId: payment.sale.storeId,
            cashSessionId: cashSession.id,
            createdBy: userId,
            type: 'REFUND',
            amount: validatedData.amount,
            referenceId: payment.saleId, // Reference the sale, not the refund
            referenceType: 'SALE',
            note: `Refund for payment ${payment.reference || payment.id}`,
          },
        });
      }

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId,
          organizationId,
          storeId: payment.sale.storeId,
          action: 'PAYMENT_REFUNDED',
          module: 'payments',
          entityId: validatedData.paymentId,
          entityType: 'Payment',
          metadata: {
            refundId: refund.id,
            refundAmount: validatedData.amount,
            paymentMethod: payment.method,
            totalRefunded: newRefundedAmount,
          },
        },
      });

      return refund;
    });
  }

  /**
   * Get a refund by ID with organization check
   */
  async getById(id: string, organizationId: string) {
    const refund = await prisma.refund.findFirst({
      where: { id },
      include: {
        payment: {
          include: {
            sale: {
              select: {
                orderNumber: true,
                storeId: true,
              },
            },
          },
        },
      },
    });

    if (!refund) {
      throw new Error('Refund not found');
    }

    // Verify organization through the payment's sale
    const sale = await prisma.sale.findUnique({
      where: { id: refund.payment.saleId },
      select: { organizationId: true },
    });

    if (!sale || sale.organizationId !== organizationId) {
      throw new Error('Refund not found or access denied');
    }

    return refund;
  }

  /**
   * List refunds for an organization
   */
  async list(organizationId: string, options: {
    paymentId?: string;
    status?: string;
    skip?: number;
    take?: number;
  } = {}) {
    const where: { paymentId?: string; status?: string } = {};

    if (options.paymentId) {
      where.paymentId = options.paymentId;
    }

    if (options.status) {
      where.status = options.status;
    }

    // Filter by organization through payment's sale
    const refunds = await prisma.refund.findMany({
      where,
      include: {
        payment: {
          include: {
            sale: {
              select: {
                organizationId: true,
                orderNumber: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: options.skip,
      take: options.take,
    });

    // Filter by organization in memory (since there's no direct relation)
    return refunds.filter(refund => refund.payment.sale.organizationId === organizationId);
  }
}

export const refundService = new RefundService();
