import { prisma } from '@omnikes/lib/prisma';
import { returnSchema, ReturnInput } from '@omnikes/lib/validation';
import { recordInventoryMovement, updateInventoryQuantity } from '@omnikes/services/inventory.service';
import { roundMoney } from '@omnikes/lib/money';

export class ReturnService {
  /**
   * Create a return for a sale with partial or complete item returns
   * This operation is atomic: stock restoration and sale item updates happen in one transaction
   */
  async create(organizationId: string, userId: string, data: ReturnInput) {
    const validatedData = returnSchema.parse(data);

    return prisma.$transaction(async (tx) => {
      // Lock the sale row to prevent concurrent returns
      const lockedSaleRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM sales
        WHERE id = ${validatedData.saleId} AND "organizationId" = ${organizationId}
        FOR UPDATE
      `;

      if (lockedSaleRows.length === 0) {
        throw new Error('Sale not found or access denied');
      }

      // Fetch the sale with items, store, and organization info
      const sale = await tx.sale.findUnique({
        where: { id: validatedData.saleId },
        include: {
          items: {
            include: {
              variant: true,
            },
          },
          store: true,
        },
      });

      if (!sale) {
        throw new Error('Sale not found or access denied');
      }

      // Verify store belongs to organization
      if (sale.store.organizationId !== organizationId) {
        throw new Error('Store does not belong to the organization');
      }

      // Only COMPLETED sales can be returned
      if (sale.status !== 'COMPLETED') {
        throw new Error(`Sale cannot be returned from status ${sale.status}. Only COMPLETED sales can be returned.`);
      }

      // Process each return item
      const returnItemsData = [];
      let totalRefunded = 0;

      for (const itemData of validatedData.items) {
        // Find the sale item
        const saleItem = sale.items.find(item => item.id === itemData.saleItemId);
        if (!saleItem) {
          throw new Error(`Sale item ${itemData.saleItemId} not found in this sale`);
        }

        // Calculate available quantity for return
        const availableQuantity = saleItem.quantity - (saleItem.returnedQuantity || 0);
        if (availableQuantity < itemData.quantity) {
          throw new Error(
            `Cannot return ${itemData.quantity} units of ${saleItem.variant.sku}. ` +
            `Available: ${availableQuantity}, Requested: ${itemData.quantity}`
          );
        }

        // Lock the inventory row for this variant
        const inventoryRows = await tx.$queryRaw<Array<{
          id: string;
          quantity: number;
          reservedQuantity: number;
        }>>`
          SELECT i.id, i.quantity, i."reservedQuantity"
          FROM inventories i
          WHERE i."storeId" = ${sale.storeId} AND i."variantId" = ${saleItem.variantId}
          FOR UPDATE
        `;

        if (inventoryRows.length === 0) {
          throw new Error(`Inventory not found for variant ${saleItem.variant.sku}`);
        }

        const inventory = inventoryRows[0];

        // Restore stock
        await updateInventoryQuantity(
          tx,
          inventory.id,
          inventory.quantity + itemData.quantity,
        );

        // Record inventory movement
        await recordInventoryMovement(tx, {
          data: {
            inventoryId: inventory.id,
            type: 'RETURN',
            quantity: itemData.quantity,
            referenceId: validatedData.saleId,
            referenceType: 'SALE',
            notes: `Return for sale ${sale.orderNumber}`,
          },
        });

        // Update sale item returned quantity
        const newReturnedQuantity = (saleItem.returnedQuantity || 0) + itemData.quantity;
        await tx.saleItem.update({
          where: { id: itemData.saleItemId },
          data: { returnedQuantity: newReturnedQuantity },
        });

        // Refund the actual net line value, not the undiscounted catalog price.
        // Allocate sale tax proportionally to the discounted line value so a
        // return neither over-refunds discounts nor silently withholds tax.
        const unitPrice = Number(saleItem.unitPrice);
        const lineNetTotal = Number(saleItem.totalPrice);
        const returnedNetValue = saleItem.quantity > 0
          ? roundMoney((lineNetTotal * itemData.quantity) / saleItem.quantity)
          : 0;
        const saleSubtotal = Number(sale.subtotal);
        const taxRateOnSale = saleSubtotal > 0
          ? Number(sale.tax) / saleSubtotal
          : 0;
        const returnedTax = roundMoney(returnedNetValue * taxRateOnSale);
        const itemRefundAmount = roundMoney(returnedNetValue + returnedTax);
        totalRefunded = roundMoney(totalRefunded + itemRefundAmount);

        returnItemsData.push({
          saleItemId: itemData.saleItemId,
          quantity: itemData.quantity,
          unitPrice,
          totalRefunded: itemRefundAmount,
        });
      }

      // Create the return record
      const createdReturn = await tx.return.create({
        data: {
          organizationId,
          storeId: sale.storeId,
          saleId: validatedData.saleId,
          status: 'COMPLETED',
          totalRefunded,
          reason: validatedData.reason,
          returnedBy: userId,
          items: {
            create: returnItemsData,
          },
        },
        include: {
          items: {
            include: {
              saleItem: {
                include: {
                  variant: {
                    include: {
                      product: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId,
          organizationId,
          storeId: sale.storeId,
          action: 'SALE_RETURNED',
          module: 'sales',
          entityId: validatedData.saleId,
          entityType: 'Sale',
          metadata: {
            returnId: createdReturn.id,
            orderNumber: sale.orderNumber,
            totalRefunded,
            itemCount: returnItemsData.length,
          },
        },
      });

      return createdReturn;
    });
  }

  /**
   * Get a return by ID with organization check
   */
  async getById(id: string, organizationId: string) {
    const returnRecord = await prisma.return.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        items: {
          include: {
            saleItem: {
              include: {
                variant: {
                  include: {
                    product: true,
                  },
                },
              },
            },
          },
        },
        sale: {
          include: {
            customer: true,
          },
        },
      },
    });

    if (!returnRecord) {
      throw new Error('Return not found or access denied');
    }

    return returnRecord;
  }

  /**
   * List returns for an organization
   */
  async list(organizationId: string, options: {
    storeId?: string;
    saleId?: string;
    status?: string;
    skip?: number;
    take?: number;
  } = {}) {
    const where: { organizationId: string; storeId?: string; saleId?: string; status?: string } = { organizationId };

    if (options.storeId) {
      where.storeId = options.storeId;
    }

    if (options.saleId) {
      where.saleId = options.saleId;
    }

    if (options.status) {
      where.status = options.status;
    }

    return prisma.return.findMany({
      where,
      include: {
        sale: {
          select: {
            orderNumber: true,
            status: true,
            total: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: options.skip,
      take: options.take,
    });
  }
}

export const returnService = new ReturnService();
