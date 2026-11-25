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
    const take = Math.min(100, Math.max(1, Number(url.searchParams.get('take') || 50)));
    const skip = Math.max(0, Number(url.searchParams.get('skip') || 0));
    const canViewHistory = await prisma.rolePermission.findFirst({
      where: {
        role: { userRoles: { some: { userId: user.id } } },
        permission: { code: 'credit.history.view' },
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

    const [credits, total] = await Promise.all([
      prisma.saleCredit.findMany({
        where,
        skip,
        take,
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        include: {
          customer: { select: { id: true, name: true, phone: true, creditLimit: true } },
          sale: { select: { id: true, orderNumber: true, total: true, currencyCode: true, currencySymbol: true, status: true } },
          payments: { select: { id: true, amount: true, method: true, reference: true, createdAt: true, receivedBy: true } },
          adjustments: { select: { id: true, amount: true, reason: true, createdAt: true } },
          authorizedByUser: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.saleCredit.count({ where }),
    ]);

    const rows = credits.map((credit) => {
      const paid = roundMoney(credit.payments.reduce((sum, payment) => sum + Number(payment.amount), 0));
      const adjusted = roundMoney(credit.adjustments.reduce((sum, adjustment) => sum + Number(adjustment.amount), 0));
      const outstanding = roundMoney(Math.max(0, Number(credit.amount) - paid - adjusted));
      const { payments, adjustments, ...rest } = credit;
      return {
        ...rest,
        paid,
        adjusted,
        adjustments,
        outstanding,
        overdue: credit.status === 'AUTHORIZED' && outstanding > 0 && credit.dueAt < new Date(),
        ...(canViewHistory ? { payments } : {}),
      };
    });

    const totalsByCurrency = rows.reduce<Record<string, { credit: number; paid: number; outstanding: number; overdue: number }>>((acc, row) => {
      const currency = row.sale.currencyCode;
      acc[currency] ??= { credit: 0, paid: 0, outstanding: 0, overdue: 0 };
      acc[currency].credit = roundMoney(acc[currency].credit + Number(row.amount));
      acc[currency].paid = roundMoney(acc[currency].paid + row.paid);
      acc[currency].outstanding = roundMoney(acc[currency].outstanding + row.outstanding);
      if (row.overdue) acc[currency].overdue = roundMoney(acc[currency].overdue + row.outstanding);
      return acc;
    }, {});

    return NextResponse.json({ credits: rows, total, skip, take, totalsByCurrency });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Permission required')) return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    if (error instanceof Error && error.message === 'Not authorized to access this store') return NextResponse.json({ error: error.message }, { status: 403 });
    console.error('Error listing customer credits:', error);
    return NextResponse.json({ error: 'Failed to list customer credits' }, { status: 500 });
  }
}
