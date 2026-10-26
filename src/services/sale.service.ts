import { saleRepository } from '@omnikes/repositories/sale.repository';
import { productVariantRepository } from '@omnikes/repositories/product-variant.repository';
import { storeService } from '@omnikes/services/store.service';
import { saleSchema, saleUpdateSchema, saleItemSchema, paymentSchema, saleCreditSchema, SaleInput, SaleUpdateInput, SaleItemInput, PaymentInput, SaleCreditInput } from '@omnikes/lib/validation';
import { prisma } from '@omnikes/lib/prisma';
import { Prisma, SaleItem, Payment } from '@prisma/client';
import { roundMoney } from '@omnikes/lib/money';
import { recordInventoryMovement, updateInventoryQuantity } from '@omnikes/services/inventory.service';

const SALE_UNIT_TO_GRAMS: Record<string, number> = {
  G: 1,
  KG: 1000,
  LB: 453.59237,
  OZ: 28.349523125,
};

function getStoredUnitPrice(price: number, saleUnit: string): number {
  if (saleUnit === 'UNIT') return price;
  const gramsPerUnit = SALE_UNIT_TO_GRAMS[saleUnit];
  if (!gramsPerUnit) throw new Error(`Unsupported product sale unit: ${saleUnit}`);
  return price / gramsPerUnit;
}

export class SaleService {
  /**
   * Create a new sale (DRAFT/PENDING)
   */
  async create(organizationId: string, data: SaleInput) {
    const validatedData = saleSchema.parse({
      ...data,
      organizationId,
    });

    // CRITICAL: Validate that the store belongs to the organization
    await storeService.validateStoreBelongsToOrganization(validatedData.storeId, organizationId);

    // Customer references are tenant-scoped. Never allow a sale in one
    // organization to attach a customer belonging to another organization.
    if (validatedData.customerId) {
      const customer = await prisma.customer.findFirst({
        where: {
          id: validatedData.customerId,
          organizationId,
        },
        select: { id: true },
      });

      if (!customer) {
        throw new Error('Invalid customer');
      }
    }

    // Generate order number if not provided
    // Get tax configuration for initial tax rate
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { taxConfiguration: true },
    });

    const configuredRate = organization?.taxConfiguration?.taxRate;
    const initialTaxRate = (validatedData.applyTax !== false && configuredRate !== null && configuredRate !== undefined)
      ? Number(configuredRate)
      : 0;

    // Financial totals are server-owned. A newly created sale has no trusted
    // line totals yet; they are recalculated from server-priced items as items are added.
    // Do not persist client-supplied subtotal, tax, total, or discount as authoritative values.
    const initialTax = 0;
    const initialTotal = 0;

    return saleRepository.create({
      ...validatedData,
      subtotal: 0,
      discount: 0,
      tax: initialTax,
      taxRate: initialTaxRate,
      total: initialTotal,
      organization: {
        connect: { id: organizationId },
      },
      store: {
        connect: { id: validatedData.storeId },
      },
    });
  }

  /**
   * Get a sale by ID with organization check
   */
  async getById(id: string, organizationId: string) {
    const sale = await saleRepository.findById(id, organizationId);
    
    if (!sale) {
      throw new Error('Sale not found or access denied');
    }

    return sale;
  }

  /**
   * List sales for an organization
   */
  async list(organizationId: string, options: {
    storeId?: string;
    authorizedStoreIds?: string[] | null;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    customerId?: string;
    search?: string;
    paymentMethod?: string;
    skip?: number;
    take?: number;
  } = {}) {
    return saleRepository.listByOrganization(organizationId, options);
  }

  /**
   * Serialize edits against checkout/finalization using the same PostgreSQL sale-row lock.
   * The status is read only after the lock is acquired, inside the transaction.
   */
  private async lockPendingSale(
    tx: Prisma.TransactionClient,
    saleId: string,
    organizationId: string,
  ) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM sales
      WHERE id = ${saleId} AND "organizationId" = ${organizationId}
      FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new Error('Sale not found or access denied');
    }

    const sale = await tx.sale.findFirst({
      where: { id: saleId, organizationId },
      select: { id: true, status: true },
    });
    if (!sale) throw new Error('Sale not found or access denied');
    if (sale.status !== 'PENDING') {
      throw new Error('Sale can only be modified while PENDING');
    }
  }

  /**
   * Update a sale under the same row lock used by checkout.
   */
  async update(id: string, organizationId: string, data: SaleUpdateInput) {
    const validatedData = saleUpdateSchema.parse(data);

    if (validatedData.storeId) {
      await storeService.validateStoreBelongsToOrganization(validatedData.storeId, organizationId);
    }
    if (validatedData.customerId !== undefined && validatedData.customerId !== null) {
      const customer = await prisma.customer.findFirst({
        where: { id: validatedData.customerId, organizationId },
        select: { id: true },
      });
      if (!customer) throw new Error('Invalid customer');
    }

    return prisma.$transaction(async (tx) => {
      await this.lockPendingSale(tx, id, organizationId);
      await tx.sale.update({
        where: { id },
        data: validatedData as Prisma.SaleUpdateInput,
      });
      if (validatedData.applyTax !== undefined) {
        await this.recalculateTotalsInTransaction(tx, id, organizationId);
      }
      return tx.sale.findFirst({ where: { id, organizationId } });
    });
  }

  /**
   * Add a sale item atomically while holding the sale row lock.
   */
  async addItem(saleId: string, organizationId: string, data: SaleItemInput) {
    const validatedData = saleItemSchema.parse(data);
    const variant = await productVariantRepository.findByIdWithOrganizationCheck(
      validatedData.variantId, organizationId,
    );
    if (!variant) throw new Error('Product variant not found or access denied');
    if (validatedData.quantity <= 0) throw new Error('Quantity must be greater than 0');

    const serverPrice = roundMoney(getStoredUnitPrice(Number(variant.price), variant.saleUnit ?? 'UNIT'));
    const discount = roundMoney(validatedData.discount || 0);
    const grossAmount = serverPrice * validatedData.quantity;
    if (discount > grossAmount) throw new Error('Discount cannot exceed gross amount');
    const totalPrice = roundMoney(grossAmount - discount);
    if (totalPrice < 0) throw new Error('Line total cannot be negative');

    return prisma.$transaction(async (tx) => {
      await this.lockPendingSale(tx, saleId, organizationId);
      const item = await tx.saleItem.create({
        data: {
          saleId,
          variantId: validatedData.variantId,
          quantity: validatedData.quantity,
          unitPrice: serverPrice,
          discount: validatedData.discount ?? 0,
          totalPrice,
        },
      });
      await this.recalculateTotalsInTransaction(tx, saleId, organizationId);
      return item;
    });
  }

  /**
   * Update a sale item atomically under the parent sale lock.
   */
  async updateItem(itemId: string, organizationId: string, data: Partial<SaleItemInput>, expectedSaleId: string) {
    const validatedData = saleItemSchema.partial().parse(data);
    const itemLookup = await prisma.saleItem.findFirst({
      where: { id: itemId, saleId: expectedSaleId, sale: { id: expectedSaleId, organizationId } },
      select: { saleId: true },
    });
    if (!itemLookup) throw new Error('Sale item not found or access denied');

    return prisma.$transaction(async (tx) => {
      await this.lockPendingSale(tx, itemLookup.saleId, organizationId);
      const item = await tx.saleItem.findFirst({
        where: { id: itemId, saleId: itemLookup.saleId },
        include: { variant: true },
      });
      if (!item) throw new Error('Sale item not found or access denied');

      const quantity = validatedData.quantity ?? item.quantity;
      if (quantity <= 0) throw new Error('Quantity must be greater than 0');
      const unitPrice = validatedData.unitPrice !== undefined
        ? roundMoney(getStoredUnitPrice(Number(item.variant.price), item.variant.saleUnit ?? 'UNIT'))
        : roundMoney(Number(item.unitPrice));
      const discount = roundMoney(validatedData.discount ?? Number(item.discount));
      const grossAmount = unitPrice * quantity;
      if (discount > grossAmount) throw new Error('Discount cannot exceed gross amount');
      const totalPrice = roundMoney(grossAmount - discount);
      if (totalPrice < 0) throw new Error('Line total cannot be negative');

      await tx.saleItem.update({
        where: { id: itemId },
        data: {
          ...(validatedData.quantity !== undefined ? { quantity: validatedData.quantity } : {}),
          ...(validatedData.discount !== undefined ? { discount: validatedData.discount } : {}),
          unitPrice,
          totalPrice,
        },
      });
      await this.recalculateTotalsInTransaction(tx, itemLookup.saleId, organizationId);
      return tx.saleItem.findFirst({
        where: { id: itemId, sale: { organizationId } },
        include: { variant: { include: { product: true } } },
      });
    });
  }

  /**
   * Remove a sale item atomically under the parent sale lock.
   */
  async removeItem(itemId: string, organizationId: string, expectedSaleId: string) {
    const item = await prisma.saleItem.findFirst({
      where: { id: itemId, saleId: expectedSaleId, sale: { id: expectedSaleId, organizationId } },
      select: { id: true, saleId: true },
    });
    if (!item) throw new Error('Sale item not found or access denied');

    await prisma.$transaction(async (tx) => {
      await this.lockPendingSale(tx, item.saleId, organizationId);
      await tx.saleItem.delete({ where: { id: itemId } });
      await this.recalculateTotalsInTransaction(tx, item.saleId, organizationId);
    });
  }

  /**
   * Recalculate totals transactionally so callers never persist a partial
   * item/totals update. Mutations already inside a transaction use the helper.
   */
  async recalculateTotals(saleId: string, organizationId: string) {
    const items = await saleRepository.listItems(saleId, organizationId);
    const subtotal = roundMoney(items.reduce((sum: number, item: SaleItem) => sum + Number(item.totalPrice), 0));
    const discount = roundMoney(items.reduce((sum: number, item: SaleItem) => sum + Number(item.discount), 0));

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizationId },
      include: { organization: { include: { taxConfiguration: true } } },
    });

    const configuredRate = sale?.organization?.taxConfiguration?.taxRate;
    const effectiveRate = (sale?.applyTax !== false && configuredRate !== null && configuredRate !== undefined)
      ? Number(configuredRate)
      : 0;
    const tax = roundMoney(subtotal * effectiveRate);
    const total = roundMoney(subtotal + tax);

    await saleRepository.updateWithTaxRate(saleId, organizationId, {
      subtotal, discount, tax, taxRate: effectiveRate, total,
      applyTax: sale?.applyTax !== false,
    });
  }

  private async recalculateTotalsInTransaction(
    tx: Prisma.TransactionClient,
    saleId: string,
    organizationId: string,
  ) {
    const items = await tx.saleItem.findMany({
      where: { saleId, sale: { organizationId } },
      select: { totalPrice: true, discount: true },
    });
    const subtotal = roundMoney(items.reduce((sum, item) => sum + Number(item.totalPrice), 0));
    const discount = roundMoney(items.reduce((sum, item) => sum + Number(item.discount), 0));

    const sale = await tx.sale.findFirst({
      where: { id: saleId, organizationId },
      include: { organization: { include: { taxConfiguration: true } } },
    });
    if (!sale) throw new Error('Sale not found or access denied');

    const configuredRate = sale.organization?.taxConfiguration?.taxRate;
    const effectiveRate = (sale.applyTax !== false && configuredRate !== null && configuredRate !== undefined)
      ? Number(configuredRate)
      : 0;
    const tax = roundMoney(subtotal * effectiveRate);
    const total = roundMoney(subtotal + tax);

    await tx.sale.update({
      where: { id: saleId },
      data: {
        subtotal,
        discount,
        tax,
        taxRate: effectiveRate,
        total,
        applyTax: sale.applyTax !== false,
      },
    });
  }

  /**
   * Complete a sale (transactional - deducts stock)
   */
  async complete(saleId: string, organizationId: string) {
    return prisma.$transaction(async (tx) => {
      // Lock the sale row so payment/credit/finalization decisions are serialized.
      const lockedSaleRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM sales
        WHERE id = ${saleId} AND "organizationId" = ${organizationId}
        FOR UPDATE
      `;

      if (lockedSaleRows.length === 0) {
        throw new Error('Sale not found or access denied');
      }

      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: {
          items: { include: { variant: true } },
          payments: true,
          saleCredit: true,
        },
      });

      if (!sale) {
        throw new Error('Sale not found or access denied');
      }

      if (sale.status === 'COMPLETED') {
        throw new Error('Sale is already completed');
      }

      if (sale.status !== 'PENDING') {
        throw new Error(`Sale cannot be completed from status ${sale.status}`);
      }

      // Only real completed payments count as money received.
      // Historical Payment.method=CREDIT records are intentionally excluded;
      // new credit must be represented by SaleCredit.
      const totalPaid = roundMoney(sale.payments
        .filter(p => p.status === 'COMPLETED' && p.method !== 'CREDIT')
        .reduce((sum: number, p: Payment) => sum + Number(p.amount), 0));

      const authorizedCredit = sale.saleCredit?.status === 'AUTHORIZED'
        ? roundMoney(Number(sale.saleCredit.amount))
        : 0;

      const coverage = totalPaid + authorizedCredit;
      const saleTotal = roundMoney(Number(sale.total));

      if (coverage < saleTotal) {
        throw new Error(
          `Insufficient financial coverage. Required: ${sale.total}, Paid: ${totalPaid}, Authorized credit: ${authorizedCredit}`
        );
      }

      // Verify and lock inventory for each item. Stock movement and status
      // update remain inside this same transaction and roll back together.
      for (const item of sale.items) {
        const inventory = await tx.$queryRaw<Array<{ id: string; quantity: number; reservedQuantity: number }>>`
          SELECT id, quantity, "reservedQuantity"
          FROM inventories
          WHERE "storeId" = ${sale.storeId} AND "variantId" = ${item.variantId}
          FOR UPDATE
        `;

        if (!inventory || inventory.length === 0) {
          throw new Error(`Inventory not found for variant ${item.variant.sku}`);
        }

        const currentInventory = inventory[0];
        const available = currentInventory.quantity - currentInventory.reservedQuantity;

        if (available < item.quantity) {
          throw new Error(`Insufficient stock for ${item.variant.sku}. Available: ${available}, Required: ${item.quantity}`);
        }

        await updateInventoryQuantity(
          tx,
          currentInventory.id,
          currentInventory.quantity - item.quantity,
        );

        await recordInventoryMovement(tx,{
          data: {
            inventoryId: currentInventory.id,
            type: 'SALE',
            quantity: item.quantity,
            referenceId: saleId,
            referenceType: 'SALE',
            notes: `Sale ${sale.orderNumber}`,
          },
        });
      }

      await tx.sale.update({
        where: { id: saleId },
        data: { status: 'COMPLETED' },
      });

      return tx.sale.findUnique({
        where: { id: saleId },
        include: {
          store: true,
          customer: true,
          items: { include: { variant: { include: { product: true } } } },
          payments: true,
          saleCredit: true,
        },
      });
    });
  }

  /**
   * Cancel a sale without deleting it.
   *
   * PENDING:
   * - No stock was deducted, so no stock reversal is created.
   *
   * COMPLETED:
   * - Restore the sold quantities atomically.
   * - Create RETURN inventory movements.
   *
   * Payments and credits are deliberately preserved as historical records.
   * This operation is a cancellation, not a refund/settlement operation.
   */
  async cancel(saleId: string, organizationId: string, cancelledBy: string) {
    return prisma.$transaction(async (tx) => {
      // Serialize cancellation against completion/payment/finalization.
      const lockedSaleRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM sales
        WHERE id = ${saleId} AND "organizationId" = ${organizationId}
        FOR UPDATE
      `;

      if (lockedSaleRows.length === 0) {
        throw new Error('Sale not found or access denied');
      }

      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: {
          items: {
            include: {
              variant: true,
            },
          },
          payments: true,
          saleCredit: true,
        },
      });

      if (!sale) {
        throw new Error('Sale not found or access denied');
      }

      if (sale.status === 'CANCELLED') {
        throw new Error('Sale is already cancelled');
      }

      if (sale.status !== 'PENDING' && sale.status !== 'COMPLETED') {
        throw new Error(`Sale cannot be cancelled from status ${sale.status}`);
      }

      const oldStatus = sale.status;

      // Only a COMPLETED sale has previously deducted stock.
      // Lock every affected inventory row before restoring quantities.
      if (oldStatus === 'COMPLETED') {
        for (const item of sale.items) {
          const inventoryRows = await tx.$queryRaw<Array<{
            id: string;
            quantity: number;
            reservedQuantity: number;
          }>>`
            SELECT id, quantity, "reservedQuantity"
            FROM inventories
            WHERE "storeId" = ${sale.storeId} AND "variantId" = ${item.variantId}
            FOR UPDATE
          `;

          if (inventoryRows.length === 0) {
            throw new Error(`Inventory not found for variant ${item.variant.sku}`);
          }

          const inventory = inventoryRows[0];

          await updateInventoryQuantity(
            tx,
            inventory.id,
            inventory.quantity + item.quantity,
          );

          await recordInventoryMovement(tx,{
            data: {
              inventoryId: inventory.id,
              type: 'RETURN',
              quantity: item.quantity,
              referenceId: saleId,
              referenceType: 'SALE',
              notes: `Cancelled sale ${sale.orderNumber}`,
            },
          });
        }
      }

      const cancelledSale = await tx.sale.update({
        where: { id: saleId },
        data: { status: 'CANCELLED' },
        include: {
          store: true,
          customer: true,
          items: {
            include: {
              variant: {
                include: { product: true },
              },
            },
          },
          payments: true,
          saleCredit: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: cancelledBy,
          organizationId,
          storeId: sale.storeId,
          action: 'SALE_CANCELLED',
          module: 'sales',
          entityId: saleId,
          entityType: 'Sale',
          oldValues: {
            status: oldStatus,
          },
          newValues: {
            status: 'CANCELLED',
          },
          metadata: {
            orderNumber: sale.orderNumber,
            stockRestored: oldStatus === 'COMPLETED',
            paymentCount: sale.payments.length,
            authorizedCredit: sale.saleCredit?.status === 'AUTHORIZED'
              ? Number(sale.saleCredit.amount)
              : 0,
          },
        },
      });

      return cancelledSale;
    });
  }

  /**
   * Authorize explicit customer credit for a pending sale.
   */
  async authorizeCredit(saleId: string, organizationId: string, authorizedBy: string, data: SaleCreditInput) {
    const validatedData = saleCreditSchema.parse(data);

    return prisma.$transaction(async (tx) => {
      const lockedSaleRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM sales
        WHERE id = ${saleId} AND "organizationId" = ${organizationId}
        FOR UPDATE
      `;

      if (lockedSaleRows.length === 0) {
        throw new Error('Sale not found or access denied');
      }

      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: { payments: true, saleCredit: true },
      });

      if (!sale) {
        throw new Error('Sale not found or access denied');
      }
      if (sale.status !== 'PENDING') {
        throw new Error('Credit can only be authorized for a PENDING sale');
      }
      if (!sale.customerId) {
        throw new Error('A customer is required to authorize credit');
      }
      if (sale.saleCredit) {
        throw new Error('Credit is already authorized for this sale');
      }

      const customer = await tx.customer.findFirst({
        where: { id: validatedData.customerId, organizationId },
        select: { id: true },
      });
      if (!customer) {
        throw new Error('Customer not found or access denied');
      }
      if (customer.id !== sale.customerId) {
        throw new Error('Credit customer must match the sale customer');
      }

      const totalPaid = sale.payments
        .filter(p => p.status === 'COMPLETED' && p.method !== 'CREDIT')
        .reduce((sum: number, p: Payment) => sum + Number(p.amount), 0);
      const remaining = roundMoney(Number(sale.total) - totalPaid);

      if (validatedData.amount > remaining) {
        throw new Error(`Credit amount exceeds remaining balance. Remaining: ${remaining}, Attempted: ${validatedData.amount}`);
      }

      return tx.saleCredit.create({
        data: {
          organizationId,
          storeId: sale.storeId,
          saleId,
          customerId: customer.id,
          amount: validatedData.amount,
          status: 'AUTHORIZED',
          authorizedBy,
          note: validatedData.note,
        },
        include: { customer: true },
      });
    });
  }

  /**
   * Add a payment to a sale
   */
  async addPayment(saleId: string, organizationId: string, data: PaymentInput) {
    const validatedData = paymentSchema.parse(data);

    // CREDIT is intentionally absent from paymentSchema. Historical CREDIT
    // rows remain readable, but new credit must use SaleCredit.

    // INVARIANT: payment amount must be positive
    if (validatedData.amount <= 0) {
      throw new Error('Payment amount must be positive');
    }

    // Payment admission is serialized at the service layer as well as at the
    // API layer. This prevents two callers from both observing the same
    // remaining balance and creating an overpayment.
    return prisma.$transaction(async (tx) => {
      const lockedSaleRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM sales
        WHERE id = ${saleId} AND "organizationId" = ${organizationId}
        FOR UPDATE
      `;

      if (lockedSaleRows.length === 0) {
        throw new Error('Sale not found or access denied');
      }

      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: {
          payments: true,
          saleCredit: true,
        },
      });

      if (!sale) {
        throw new Error('Sale not found or access denied');
      }

      // Only completed real payments reduce the monetary balance. An
      // authorized SaleCredit covers the remainder and must therefore be
      // deducted before admitting another real payment.
      const totalPaid = roundMoney(sale.payments
        .filter(p => p.status === 'COMPLETED' && p.method !== 'CREDIT')
        .reduce((sum: number, p: Payment) => sum + Number(p.amount), 0));

      const authorizedCredit = sale.saleCredit?.status === 'AUTHORIZED'
        ? roundMoney(Number(sale.saleCredit.amount))
        : 0;

      const remainingAmount = roundMoney(
        Number(sale.total) - totalPaid - authorizedCredit
      );

      if (remainingAmount < 0) {
        throw new Error(`Sale financial coverage is already exceeded. Remaining: ${remainingAmount}`);
      }

      if (validatedData.amount > remainingAmount) {
        throw new Error(`Payment amount exceeds remaining balance. Remaining: ${remainingAmount}, Attempted: ${validatedData.amount}`);
      }

      return tx.payment.create({
        data: {
          method: validatedData.method,
          amount: validatedData.amount,
          reference: validatedData.reference,
          status: validatedData.status,
          sale: {
            connect: { id: saleId },
          },
        },
        include: {
          sale: true,
        },
      });
    });
  }

  /**
   * Get payments for a sale
   */
  async getPayments(saleId: string, organizationId: string) {
    const exists = await saleRepository.belongsToOrganization(saleId, organizationId);
    
    if (!exists) {
      throw new Error('Sale not found or access denied');
    }

    return saleRepository.listPayments(saleId, organizationId);
  }

  /**
   * Get total paid for a sale
   */
  async getTotalPaid(saleId: string, organizationId: string) {
    const exists = await saleRepository.belongsToOrganization(saleId, organizationId);
    
    if (!exists) {
      throw new Error('Sale not found or access denied');
    }

    return saleRepository.getTotalPaid(saleId, organizationId);
  }

  /**
   * Get remaining amount to pay
   */
  async getRemainingAmount(saleId: string, organizationId: string) {
    const sale = await saleRepository.findById(saleId, organizationId);
    
    if (!sale) {
      throw new Error('Sale not found or access denied');
    }
    
    const totalPaid = await saleRepository.getTotalPaid(saleId, organizationId);
    
    return roundMoney(Number(sale.total) - roundMoney(totalPaid));
  }

  /**
   * Generate a unique order number
   */
  private generateOrderNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `SALE-${timestamp}-${random}`;
  }
}

export const saleService = new SaleService();
