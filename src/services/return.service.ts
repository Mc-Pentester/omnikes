import { prisma } from '@omnikes/lib/prisma';
import { returnSchema, ReturnInput } from '@omnikes/lib/validation';
import { recordInventoryMovement, updateInventoryQuantity } from '@omnikes/services/inventory.service';
import { roundMoney } from '@omnikes/lib/money';

export class ReturnService {
  /**
   * Create a return for a sale with partial or complete item returns
   * This operation is atomic: stock restoration and sale item updates happen in one transaction
   */
  async create(
    organizationId: string,
    userId: string,
    data: ReturnInput,
    idempotency?: { key: string; requestHash: string },
  ) {
    const validatedData = returnSchema.parse(data);

    try {
      return await prisma.$transaction(async (tx) => {
      // Lock the sale row to prevent concurrent returns
      const lockedSaleRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM sales
        WHERE id = ${validatedData.saleId} AND "organizationId" = ${organizationId}
        FOR UPDATE
      `;

      if (lockedSaleRows.length === 0) {
        throw new Error('Sale not found or access denied');
      }

      // Recheck after locking the sale so concurrent retries cannot process twice.
      if (idempotency) {
        const existing = await tx.return.findFirst({
          where: { organizationId, idempotencyKey: idempotency.key },
          include: {
            items: {
              include: {
                saleItem: { include: { variant: { include: { product: true } } } },
              },
            },
          },
        });
        if (existing) {
          if (existing.idempotencyRequestHash !== idempotency.requestHash) {
            throw new Error('Idempotency-Key already used with different return data');
          }
          return existing;
        }
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

      // Allocate the sale-level tax to its lines in a deterministic order. The
      // cumulative method ensures all line allocations add back to the exact
      // recorded sale tax instead of losing cents through independent rounding.
      const saleTax = roundMoney(Number(sale.tax) || 0);
      const sortedSaleItems = [...sale.items].sort((a, b) => a.id.localeCompare(b.id));
      const saleLineNetTotal = roundMoney(sortedSaleItems.reduce(
        (sum, item) => sum + Number(item.totalPrice),
        0,
      ));
      const lineTaxAllocations = new Map<string, number>();
      let cumulativeLineNet = 0;
      let previouslyAllocatedSaleTax = 0;
      for (const item of sortedSaleItems) {
        cumulativeLineNet = roundMoney(cumulativeLineNet + Number(item.totalPrice));
        const cumulativelyAllocatedTax = saleLineNetTotal > 0
          ? roundMoney(saleTax * cumulativeLineNet / saleLineNetTotal)
          : 0;
        lineTaxAllocations.set(item.id, roundMoney(cumulativelyAllocatedTax - previouslyAllocatedSaleTax));
        previouslyAllocatedSaleTax = cumulativelyAllocatedTax;
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

        // Refund the discounted line amount plus its allocated share of the
        // sale-level tax. Cumulative allocation keeps partial returns cent-safe.
        const lineNetTotal = roundMoney(Number(saleItem.totalPrice));
        const lineTaxTotal = lineTaxAllocations.get(saleItem.id) ?? 0;
        const previousReturnedQuantity = saleItem.returnedQuantity || 0;
        const previouslyAllocatedAmount = roundMoney(
          lineNetTotal * previousReturnedQuantity / saleItem.quantity,
        );
        const newlyAllocatedAmount = roundMoney(
          lineNetTotal * newReturnedQuantity / saleItem.quantity,
        );
        const previouslyAllocatedTax = roundMoney(
          lineTaxTotal * previousReturnedQuantity / saleItem.quantity,
        );
        const newlyAllocatedTax = roundMoney(
          lineTaxTotal * newReturnedQuantity / saleItem.quantity,
        );
        const itemRefundAmount = roundMoney(
          newlyAllocatedAmount - previouslyAllocatedAmount +
          newlyAllocatedTax - previouslyAllocatedTax,
        );
        const unitPrice = roundMoney(itemRefundAmount / itemData.quantity);
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
          ...(idempotency ? {
            idempotencyKey: idempotency.key,
            idempotencyRequestHash: idempotency.requestHash,
          } : {}),
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
    } catch (error) {
      // A concurrent request may win the unique (organization, key) race.
      const isUniqueConstraintError =
        typeof error === 'object' && error !== null && 'code' in error &&
        (error as { code?: string }).code === 'P2002';

      if (idempotency && isUniqueConstraintError) {
        const existing = await prisma.return.findFirst({
          where: { organizationId, idempotencyKey: idempotency.key },
          include: {
            items: {
              include: {
                saleItem: { include: { variant: { include: { product: true } } } },
              },
            },
          },
        });

        if (existing) {
          if (existing.idempotencyRequestHash !== idempotency.requestHash) {
            throw new Error('Idempotency-Key already used with different return data');
          }
          return existing;
        }
      }

      throw error;
    }
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
