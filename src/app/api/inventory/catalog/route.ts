import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { getAuthorizedStoreIds, requireCurrentOrganizationId, requirePermission } from '@omnikes/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const organizationId = await requireCurrentOrganizationId(request);
    await requirePermission(request, 'inventory.read');
    const authorizedStoreIds = await getAuthorizedStoreIds(request);

    if (authorizedStoreIds !== null && authorizedStoreIds.length === 0) {
      return NextResponse.json({ inventory: [] });
    }

    const storeWhere = {
      organizationId,
      isActive: true,
      ...(authorizedStoreIds !== null ? { id: { in: authorizedStoreIds } } : {}),
    };

    const [stores, variants] = await Promise.all([
      prisma.store.findMany({
        where: storeWhere,
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.productVariant.findMany({
        where: {
          isActive: true,
          product: { organizationId, isActive: true },
        },
        include: {
          product: { select: { id: true, name: true } },
          inventories: {
            where: {
              store: {
                organizationId,
                isActive: true,
                ...(authorizedStoreIds !== null ? { id: { in: authorizedStoreIds } } : {}),
              },
            },
            select: { id: true, storeId: true, quantity: true, reservedQuantity: true },
          },
        },
        orderBy: { sku: 'asc' },
      }),
    ]);

    const inventory = stores.flatMap((store) =>
      variants.map((variant) => {
        const existing = variant.inventories.find((item) => item.storeId === store.id);
        return {
          id: existing?.id ?? null,
          storeId: store.id,
          variantId: variant.id,
          quantity: existing?.quantity ?? 0,
          reservedQuantity: existing?.reservedQuantity ?? 0,
          variant: {
            id: variant.id,
            sku: variant.sku,
            price: variant.price,
            product: variant.product,
          },
          store,
        };
      }),
    );

    return NextResponse.json({ inventory });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Authentication required' || error.message === 'Invalid or expired session') {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      if (error.message.startsWith('Permission required')) {
        return NextResponse.json({ error: 'Permission required' }, { status: 403 });
      }
    }
    console.error('Error listing inventory catalog:', error);
    return NextResponse.json({ error: 'Failed to list inventory catalog' }, { status: 500 });
  }
}
