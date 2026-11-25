import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedStoreIds, getAuthenticatedUser, requirePermission } from '@omnikes/lib/auth';
import { prisma } from '@omnikes/lib/prisma';

/**
 * GET /api/returns/eligible-sales
 * Returns completed sales in the user's organization/store scope, including
 * returned quantities and the return history needed by the returns workspace.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    await requirePermission(request, 'sale.read');

    const url = new URL(request.url);
    const search = url.searchParams.get('search')?.trim();
    const requestedTake = Number(url.searchParams.get('take') || 100);
    const take = Number.isFinite(requestedTake) ? Math.min(100, Math.max(1, Math.trunc(requestedTake))) : 100;
    const authorizedStoreIds = await getAuthorizedStoreIds(request);

    const sales = await prisma.sale.findMany({
      where: {
        organizationId: user.organizationId,
        status: 'COMPLETED',
        ...(authorizedStoreIds ? { storeId: { in: authorizedStoreIds } } : {}),
        ...(search ? {
          OR: [
            { orderNumber: { contains: search, mode: 'insensitive' } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
          ],
        } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        subtotal: true,
        tax: true,
        total: true,
        currencyCode: true,
        currencySymbol: true,
        storeId: true,
        store: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, phone: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            returnedQuantity: true,
            totalPrice: true,
            variant: {
              select: {
                id: true,
                sku: true,
                product: { select: { name: true } },
              },
            },
          },
        },
        returns: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            reason: true,
            totalRefunded: true,
            createdAt: true,
            items: {
              select: {
                id: true,
                quantity: true,
                totalRefunded: true,
                saleItem: { select: { id: true, variant: { select: { sku: true, product: { select: { name: true } } } } } },
              },
            },
          },
        },
      },
    });

    const eligibleSales = sales.filter((sale) => sale.items.some((item) => item.quantity > (item.returnedQuantity || 0)));
    const recentReturns = sales.flatMap((sale) => sale.returns.map((returnRecord) => ({
      ...returnRecord,
      sale: {
        id: sale.id,
        orderNumber: sale.orderNumber,
        customerName: sale.customer?.name || 'Client comptoir',
        currencyCode: sale.currencyCode,
        currencySymbol: sale.currencySymbol,
        storeName: sale.store.name,
      },
    }))).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 50);

    return NextResponse.json({ sales: eligibleSales, recentReturns });
  } catch (error) {
    if (error instanceof Error && (error.message === 'Authentication required' || error.message === 'Invalid or expired session')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('Permission required')) {
      return NextResponse.json({ error: 'Permission required' }, { status: 403 });
    }
    console.error('Error listing eligible sales for returns:', error);
    return NextResponse.json({ error: 'Failed to load returns workspace' }, { status: 500 });
  }
}
