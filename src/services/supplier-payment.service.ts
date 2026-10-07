import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';
import { supplierPaymentCreateSchema, supplierPaymentListQuerySchema } from '@omnikes/lib/validation';

export class SupplierPaymentService {
  async list(organizationId: string, input: unknown) {
    const q = supplierPaymentListQuerySchema.parse(input);
    const where: Prisma.SupplierPaymentWhereInput = {
      organizationId,
      ...(q.supplierId ? { supplierId: q.supplierId } : {}),
      ...(q.purchaseId ? { purchaseId: q.purchaseId } : {}),
      ...(q.storeId ? { storeId: q.storeId } : {}),
    };

    const [payments, total] = await Promise.all([
      prisma.supplierPayment.findMany({
        where,
        include: { supplier: true, purchase: { select: { id: true, reference: true, total: true } }, createdByUser: { select: { id: true, name: true } } },
        orderBy: { paidAt: 'desc' },
        skip: q.skip,
        take: q.take,
      }),
      prisma.supplierPayment.count({ where }),
    ]);
    return { payments, total };
  }

  async create(organizationId: string, userId: string, input: unknown) {
    const data = supplierPaymentCreateSchema.parse(input);
    const amount = new Prisma.Decimal(data.amount);

    return prisma.$transaction(async (tx) => {
      const [store, supplier] = await Promise.all([
        tx.store.findFirst({ where: { id: data.storeId, organizationId, isActive: true }, select: { id: true } }),
        tx.supplier.findFirst({ where: { id: data.supplierId, organizationId, isActive: true }, select: { id: true } }),
      ]);
      if (!store) throw new Error('Store not found or access denied');
      if (!supplier) throw new Error('Supplier not found or access denied');

      if (data.method === 'CASH') {
        if (!data.cashSessionId) throw new Error('An open cash session is required for CASH supplier payments');
        const session = await tx.cashSession.findFirst({
          where: { id: data.cashSessionId, organizationId, storeId: data.storeId, status: 'OPEN' },
          select: { id: true },
        });
        if (!session) throw new Error('Open cash session not found or access denied');
      } else if (data.cashSessionId) {
        throw new Error('cashSessionId is only valid for CASH payments');
      }

      const purchaseId = data.purchaseId;
      if (purchaseId) {
        const purchase = await tx.purchase.findFirst({
          where: { id: purchaseId, organizationId, storeId: data.storeId, supplierId: data.supplierId },
          select: { id: true, total: true, status: true },
        });
        if (!purchase) throw new Error('Purchase not found or does not belong to the supplier/store');
        if (!['ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(purchase.status)) throw new Error('Purchase is not payable in its current status');

        await tx.$queryRaw`SELECT "id" FROM "purchases" WHERE "id" = ${purchase.id} FOR UPDATE`;
        const paid = await tx.supplierPayment.aggregate({ where: { purchaseId: purchase.id }, _sum: { amount: true } });
        const outstanding = purchase.total.minus(paid._sum.amount ?? new Prisma.Decimal(0));
        if (amount.gt(outstanding)) throw new Error('Payment exceeds purchase outstanding balance');
      } else {
        await tx.$queryRaw`SELECT "id" FROM "purchases" WHERE "organizationId" = ${organizationId} AND "storeId" = ${data.storeId} AND "supplierId" = ${data.supplierId} AND "status" <> 'CANCELLED' FOR UPDATE`;
        const purchases = await tx.purchase.findMany({
          where: { organizationId, storeId: data.storeId, supplierId: data.supplierId, status: { not: 'CANCELLED' } },
          select: { id: true, total: true },
        });
        const totalPurchases = purchases.reduce((sum, p) => sum.plus(p.total), new Prisma.Decimal(0));
        const paid = await tx.supplierPayment.aggregate({ where: { organizationId, storeId: data.storeId, supplierId: data.supplierId }, _sum: { amount: true } });
        const outstanding = totalPurchases.minus(paid._sum.amount ?? new Prisma.Decimal(0));
        if (amount.gt(outstanding)) throw new Error('Payment exceeds supplier outstanding balance');
      }

      const payment = await tx.supplierPayment.create({
        data: {
          organizationId,
          storeId: data.storeId,
          supplierId: data.supplierId,
          purchaseId,
          cashSessionId: data.cashSessionId,
          createdBy: userId,
          amount,
          method: data.method,
          reference: data.reference,
          note: data.note,
          paidAt: data.paidAt,
        },
        include: { supplier: true, purchase: { select: { id: true, reference: true, total: true } } },
      });

      if (data.method === 'CASH') {
        await tx.cashMovement.create({
          data: {
            organizationId,
            storeId: data.storeId,
            cashSessionId: data.cashSessionId!,
            createdBy: userId,
            type: 'CASH_OUT',
            amount,
            referenceType: 'SUPPLIER_PAYMENT',
            note: data.note ?? `Supplier payment ${payment.id}`,
          },
        });
      }

      return payment;
    });
  }

  async supplierBalance(organizationId: string, supplierId: string, storeId?: string) {
    const purchases = await prisma.purchase.findMany({
      where: { organizationId, supplierId, ...(storeId ? { storeId } : {}), status: { not: 'CANCELLED' } },
      select: { total: true },
    });
    const payments = await prisma.supplierPayment.aggregate({
      where: { organizationId, supplierId, ...(storeId ? { storeId } : {}) },
      _sum: { amount: true },
    });
    const totalPurchases = purchases.reduce((sum, p) => sum.plus(p.total), new Prisma.Decimal(0));
    const totalPaid = payments._sum.amount ?? new Prisma.Decimal(0);
    return { totalPurchases, totalPaid, balance: totalPurchases.minus(totalPaid) };
  }
}

export const supplierPaymentService = new SupplierPaymentService();
