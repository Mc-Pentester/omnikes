import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, getAuthorizedStoreIds, requirePermission, requireStoreAccess } from '@omnikes/lib/auth';
import { prisma } from '@omnikes/lib/prisma';
import { roundMoney } from '@omnikes/lib/money';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    await requirePermission(request, 'credit.view');

    const url = new URL(request.url);
    const storeId = url.searchParams.get('storeId') || undefined;
    const customerId = url.searchParams.get('customerId') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const overdueOnly = url.searchParams.get('overdue') === 'true';
    const requestedTake = Number(url.searchParams.get('take') || 50);
    const requestedSkip = Number(url.searchParams.get('skip') || 0);
    const take = Number.isFinite(requestedTake) ? Math.min(100, Math.max(1, Math.trunc(requestedTake))) : 50;
    const skip = Number.isFinite(requestedSkip) ? Math.max(0, Math.trunc(requestedSkip)) : 0;
    const canViewHistory = await prisma.rolePermission.findFirst({
      where: {
        role: { userRoles: { some: { userId: user.id } } },
        permission: { code: 'credit.history.view' },
      },
      select: { id: true },
    });
    const canViewReport = await prisma.rolePermission.findFirst({
      where: {
        role: { userRoles: { some: { userId: user.id } } },
        permission: { code: 'credit.report.view' },
      },
      select: { id: true },
    });

    let storeScope: string[] | null = null;
    if (storeId) {
      await requireStoreAccess(request, storeId);
      storeScope = [storeId];
    } else {
      storeScope = await getAuthorizedStoreIds(request);
    }

    const where = {
      organizationId: user.organizationId,
      ...(storeScope ? { storeId: { in: storeScope } } : {}),
      ...(customerId ? { customerId } : {}),
      ...(status ? { status } : { status: { in: ['AUTHORIZED', 'SETTLED'] } }),
      ...(overdueOnly ? { status: 'AUTHORIZED', dueAt: { lt: new Date() } } : {}),
    };

    const [credits, total, reportCredits] = await Promise.all([
      prisma.saleCredit.findMany({
        where,
        skip,
        take,
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        include: {
          customer: { select: { id: true, name: true, phone: true, creditLimit: true } },
          sale: { select: {
            id: true, orderNumber: true, total: true, currencyCode: true, currencySymbol: true, status: true,
            returns: { select: {
              id: true, totalRefunded: true, createdAt: true,
              refunds: { where: { status: 'COMPLETED' }, select: { amount: true } },
              creditAdjustments: { select: { amount: true } },
              creditRefunds: { select: { amount: true } },
            } },
          } },
          payments: { select: { id: true, amount: true, method: true, reference: true, createdAt: true, receivedBy: true } },
          adjustments: { select: { id: true, amount: true, reason: true, createdAt: true, processedByUser: { select: { id: true, name: true, email: true } } } },
          authorizedByUser: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.saleCredit.count({ where }),
      canViewReport ? prisma.saleCredit.findMany({
        where,
        select: {
          amount: true,
          status: true,
          dueAt: true,
          payments: { select: { amount: true } },
          adjustments: { select: { amount: true } },
          sale: { select: { currencyCode: true } },
        },
      }) : Promise.resolve([]),
    ]);

    const rows = credits.map((credit) => {
      const paid = roundMoney(credit.payments.reduce((sum, payment) => sum + Number(payment.amount), 0));
      const adjusted = roundMoney(credit.adjustments.reduce((sum, adjustment) => sum + Number(adjustment.amount), 0));
      const outstanding = roundMoney(Math.max(0, Number(credit.amount) - paid - adjusted));
      const { payments, adjustments, ...rest } = credit;
      const returns = credit.sale.returns.map((returnRecord) => {
        const normalRefunds = returnRecord.refunds.reduce((sum, item) => sum + Number(item.amount), 0);
        const debtAdjustments = returnRecord.creditAdjustments.reduce((sum, item) => sum + Number(item.amount), 0);
        const creditRefunds = returnRecord.creditRefunds.reduce((sum, item) => sum + Number(item.amount), 0);
        return {
          id: returnRecord.id,
          totalRefunded: Number(returnRecord.totalRefunded),
          createdAt: returnRecord.createdAt,
          refundableRemaining: roundMoney(Math.max(0, Number(returnRecord.totalRefunded) - normalRefunds - debtAdjustments - creditRefunds)),
        };
      });
      return {
        ...rest,
        sale: { ...credit.sale, returns },
        paid,
        adjusted,
        outstanding,
        overdue: credit.status === 'AUTHORIZED' && outstanding > 0 && credit.dueAt < new Date(),
        ...(canViewHistory ? { payments, adjustments } : {}),
      };
    });

    const totalsByCurrency = reportCredits.reduce<Record<string, { credit: number; paid: number; adjusted: number; outstanding: number; overdue: number }>>((acc, credit) => {
      const currency = credit.sale.currencyCode;
      const paid = roundMoney(credit.payments.reduce((sum, payment) => sum + Number(payment.amount), 0));
      const adjusted = roundMoney(credit.adjustments.reduce((sum, adjustment) => sum + Number(adjustment.amount), 0));
      const outstanding = roundMoney(Math.max(0, Number(credit.amount) - paid - adjusted));
      const overdue = credit.status === 'AUTHORIZED' && outstanding > 0 && credit.dueAt < new Date();
      acc[currency] ??= { credit: 0, paid: 0, adjusted: 0, outstanding: 0, overdue: 0 };
      acc[currency].credit = roundMoney(acc[currency].credit + Number(credit.amount));
      acc[currency].paid = roundMoney(acc[currency].paid + paid);
      acc[currency].adjusted = roundMoney(acc[currency].adjusted + adjusted);
      acc[currency].outstanding = roundMoney(acc[currency].outstanding + outstanding);
      if (overdue) acc[currency].overdue = roundMoney(acc[currency].overdue + outstanding);
      return acc;
    }, {});

    return NextResponse.json({ credits: rows, total, skip, take, ...(canViewReport ? { totalsByCurrency } : {}) });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    if (error instanceof Error && error.message === 'Not authorized to access this store') return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Error listing customer credits:', error);
    return NextResponse.json({ error: 'Failed to list customer credits' }, { status: 500 });
  }
}
