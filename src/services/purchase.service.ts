import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';
import { purchaseCreateSchema, purchaseListQuerySchema, purchaseReceiveSchema } from '@omnikes/lib/validation';

const purchaseInclude = {
  supplier: true,
  store: true,
  createdByUser: { select: { id: true, name: true, email: true } },
  items: { include: { variant: { include: { product: true } } } },
} satisfies Prisma.PurchaseInclude;

export class PurchaseService {
  async list(organizationId: string, input: unknown) {
    const query = purchaseListQuerySchema.parse(input);
    const where: Prisma.PurchaseWhereInput = {
      organizationId,
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { reference: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        include: purchaseInclude,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      prisma.purchase.count({ where }),
    ]);

    return { purchases, total };
  }

  async getById(id: string, organizationId: string) {
    return prisma.purchase.findFirst({
      where: { id, organizationId },
      include: purchaseInclude,
    });
  }

  async create(organizationId: string, userId: string, input: unknown) {
    const data = purchaseCreateSchema.parse(input);

    return prisma.$transaction(async (tx) => {
      const [store, supplier] = await Promise.all([
        tx.store.findFirst({ where: { id: data.storeId, organizationId, isActive: true }, select: { id: true } }),
        tx.supplier.findFirst({ where: { id: data.supplierId, organizationId, isActive: true }, select: { id: true } }),
      ]);
      if (!store) throw new Error('Store not found or access denied');
      if (!supplier) throw new Error('Supplier not found or access denied');

      const variants = await tx.productVariant.findMany({
        where: {
          id: { in: data.items.map((item) => item.variantId) },
          product: { organizationId },
          isActive: true,
        },
        select: { id: true },
      });
      const variantIds = new Set(variants.map((variant) => variant.id));
      if (variantIds.size !== new Set(data.items.map((item) => item.variantId)).size) {
        throw new Error('One or more purchase variants are invalid or outside the organization');
      }

      const subtotal = data.items.reduce(
        (sum, item) => sum.plus(new Prisma.Decimal(item.unitCost).mul(item.orderedQuantity)),
        new Prisma.Decimal(0),
      );
      const total = subtotal.plus(data.tax).minus(data.discount);
      if (total.isNegative()) throw new Error('Purchase total cannot be negative');

      return tx.purchase.create({
        data: {
          organizationId,
          storeId: data.storeId,
          supplierId: data.supplierId,
          reference: data.reference,
          status: 'DRAFT',
          subtotal,
          tax: new Prisma.Decimal(data.tax),
          discount: new Prisma.Decimal(data.discount),
          total,
          notes: data.notes,
          createdBy: userId,
          items: {
            create: data.items.map((item) => ({
              variantId: item.variantId,
              orderedQuantity: item.orderedQuantity,
              unitCost: new Prisma.Decimal(item.unitCost),
              totalCost: new Prisma.Decimal(item.unitCost).mul(item.orderedQuantity),
            })),
          },
        },
        include: purchaseInclude,
      });
    });
  }

  async order(id: string, organizationId: string) {
    const result = await prisma.purchase.updateMany({
      where: { id, organizationId, status: 'DRAFT' },
      data: { status: 'ORDERED', orderedAt: new Date() },
    });
    if (!result.count) throw new Error('Purchase not found or cannot be ordered');
    return this.getById(id, organizationId);
  }

  async cancel(id: string, organizationId: string) {
    const result = await prisma.purchase.updateMany({
      where: {
        id,
        organizationId,
        status: { in: ['DRAFT', 'ORDERED'] },
      },
      data: { status: 'CANCELLED' },
    });
    if (!result.count) throw new Error('Purchase not found or cannot be cancelled');
    return this.getById(id, organizationId);
  }

  async receive(id: string, organizationId: string, input: unknown) {
    const data = purchaseReceiveSchema.parse(input);

    return prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id, organizationId },
        include: { items: true },
      });
      if (!purchase) throw new Error('Purchase not found or access denied');
      if (purchase.status === 'CANCELLED') throw new Error('Cancelled purchases cannot be received');
      if (purchase.status === 'RECEIVED') throw new Error('Purchase is already fully received');

      const itemMap = new Map(purchase.items.map((item) => [item.id, item]));
      for (const received of data.items) {
        const item = itemMap.get(received.purchaseItemId);
        if (!item) throw new Error('Purchase item not found');
        const remaining = item.orderedQuantity - item.receivedQuantity;
        if (received.quantity > remaining) {
          throw new Error(`Cannot receive more than remaining quantity for purchase item ${item.id}`);
        }

        let existingInventory = await tx.inventory.findUnique({
          where: { storeId_variantId: { storeId: purchase.storeId, variantId: item.variantId } },
          select: { id: true },
        });

        if (!existingInventory) {
          try {
            existingInventory = await tx.inventory.create({
              data: {
                storeId: purchase.storeId,
                variantId: item.variantId,
                quantity: 0,
                reservedQuantity: 0,
              },
              select: { id: true },
            });
          } catch (error) {
            if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
              throw error;
            }
            existingInventory = await tx.inventory.findUnique({
              where: { storeId_variantId: { storeId: purchase.storeId, variantId: item.variantId } },
              select: { id: true },
            });
          }
        }

        if (!existingInventory) throw new Error('Inventory row could not be initialized');

        const locked = await tx.$queryRaw<Array<{ id: string; quantity: number; reservedQuantity: number }>>`
          SELECT "id", "quantity", "reservedQuantity"
          FROM "inventories"
          WHERE "id" = ${existingInventory.id}
          FOR UPDATE
        `;
        if (!locked[0]) throw new Error('Inventory row could not be locked');

        await tx.inventory.update({
          where: { id: locked[0].id },
          data: { quantity: locked[0].quantity + received.quantity },
        });

        await tx.inventoryMovement.create({
          data: {
            inventoryId: locked[0].id,
            type: 'PURCHASE',
            quantity: received.quantity,
            referenceId: purchase.id,
            referenceType: 'PURCHASE',
            notes: `Receipt of purchase ${purchase.reference}`,
          },
        });

        await tx.purchaseItem.update({
          where: { id: item.id },
          data: { receivedQuantity: item.receivedQuantity + received.quantity },
        });
      }

      const updatedItems = await tx.purchaseItem.findMany({ where: { purchaseId: purchase.id } });
      const fullyReceived = updatedItems.every((item) => item.receivedQuantity === item.orderedQuantity);
      const partiallyReceived = updatedItems.some((item) => item.receivedQuantity > 0);

      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          status: fullyReceived ? 'RECEIVED' : partiallyReceived ? 'PARTIALLY_RECEIVED' : purchase.status,
          ...(fullyReceived ? { receivedAt: new Date() } : {}),
        },
      });

      return tx.purchase.findUnique({ where: { id: purchase.id }, include: purchaseInclude });
    });
  }
}

export const purchaseService = new PurchaseService();
