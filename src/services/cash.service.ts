import { Prisma } from '@prisma/client';
import { prisma } from '@omnikes/lib/prisma';
import { cashSessionOpenSchema, cashSessionCloseSchema, cashMovementSchema } from '@omnikes/lib/validation';
import { roundMoney } from '@omnikes/lib/money';
import { storeService } from '@omnikes/services/store.service';

export class CashService {
  async getOpenSession(organizationId: string, storeId: string) {
    return prisma.cashSession.findFirst({
      where: { organizationId, storeId, status: 'OPEN' },
      include: { openedByUser: { select: { id: true, name: true, email: true } } },
      orderBy: { openedAt: 'desc' },
    });
  }

  async open(organizationId: string, openedBy: string, input: unknown) {
    const data = cashSessionOpenSchema.parse(input);
    await storeService.validateStoreBelongsToOrganization(data.storeId, organizationId);
    try {
      return await prisma.$transaction(async (tx) => {
      const existing = await tx.cashSession.findFirst({
        where: { organizationId, storeId: data.storeId, status: 'OPEN' },
        select: { id: true },
      });
      if (existing) throw new Error('A cash session is already open for this store');
      return tx.cashSession.create({ data: { organizationId, storeId: data.storeId, openedBy, openingAmount: data.openingAmount } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new Error('A cash session is already open for this store');
      }
      throw error;
    }
  }

  async getById(organizationId: string, sessionId: string) {
    return prisma.cashSession.findFirst({
      where: { id: sessionId, organizationId },
      include: {
        openedByUser: { select: { id: true, name: true, email: true } },
        closedByUser: { select: { id: true, name: true, email: true } },
        movements: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async summary(organizationId: string, sessionId: string) {
    const session = await this.getById(organizationId, sessionId);
    if (!session) throw new Error('Cash session not found');
    const rows = await prisma.cashMovement.groupBy({
      by: ['type'],
      where: { organizationId, cashSessionId: sessionId },
      _sum: { amount: true },
    });
    let expected = Number(session.openingAmount);
    const totals: Record<string, number> = {};
    for (const row of rows) totals[row.type] = Number(row._sum.amount ?? 0);
    expected = roundMoney(expected + (totals.SALE_CASH ?? 0) + (totals.CASH_IN ?? 0) - (totals.CASH_OUT ?? 0) - (totals.REFUND ?? 0));
    return {
      session,
      openingAmount: Number(session.openingAmount),
      cashSales: totals.SALE_CASH ?? 0,
      cashIn: totals.CASH_IN ?? 0,
      cashOut: totals.CASH_OUT ?? 0,
      refunds: totals.REFUND ?? 0,
      expectedAmount: expected,
      countedAmount: session.countedAmount === null ? null : Number(session.countedAmount),
      difference: session.difference === null ? null : Number(session.difference),
    };
  }

  async addMovement(organizationId: string, storeId: string, sessionId: string, createdBy: string, input: unknown) {
    const data = cashMovementSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string; storeId: string; status: string }>>`
        SELECT id, "storeId", status FROM cash_sessions
        WHERE id = ${sessionId} AND "organizationId" = ${organizationId}
        FOR UPDATE
      `;
      if (!locked.length) throw new Error('Cash session not found');
      if (locked[0].storeId !== storeId) throw new Error('Cash session does not belong to this store');
      if (locked[0].status !== 'OPEN') throw new Error('Cash session is already closed');
      return tx.cashMovement.create({
        data: { organizationId, storeId, cashSessionId: sessionId, createdBy, type: data.type, amount: data.amount, referenceType: 'MANUAL', note: data.note },
      });
    });
  }

  async close(organizationId: string, sessionId: string, closedBy: string, input: unknown) {
    const data = cashSessionCloseSchema.parse(input);
    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; storeId: string; openingAmount: number }>>`
        SELECT id, "storeId", "openingAmount" FROM cash_sessions
        WHERE id = ${sessionId} AND "organizationId" = ${organizationId}
        FOR UPDATE
      `;
      if (!rows.length) throw new Error('Cash session not found');
      const aggregates = await tx.cashMovement.groupBy({ by: ['type'], where: { organizationId, cashSessionId: sessionId }, _sum: { amount: true } });
      let expected = Number(rows[0].openingAmount);
      for (const a of aggregates) {
        const amount = Number(a._sum.amount ?? 0);
        if (a.type === 'SALE_CASH' || a.type === 'CASH_IN') expected += amount;
        if (a.type === 'CASH_OUT' || a.type === 'REFUND') expected -= amount;
      }
      expected = roundMoney(expected);
      return tx.cashSession.update({
        where: { id: sessionId },
        data: { status: 'CLOSED', closedBy, countedAmount: data.countedAmount, expectedAmount: expected, difference: roundMoney(data.countedAmount - expected), closedAt: new Date() },
      });
    });
  }
}
export const cashService = new CashService();
