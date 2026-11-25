import { saleRepository } from '@omnikes/repositories/sale.repository';
import { productVariantRepository } from '@omnikes/repositories/product-variant.repository';
import { storeService } from '@omnikes/services/store.service';
import { saleSchema, saleUpdateSchema, saleItemSchema, paymentSchema, saleCreditSchema, SaleInput, SaleUpdateInput, SaleItemInput, PaymentInput, SaleCreditInput } from '@omnikes/lib/validation';
import { prisma } from '@omnikes/lib/prisma';
import { Prisma, SaleItem, Payment } from '@prisma/client';
import { z } from 'zod';
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
          isActive: true,
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

    const initialTaxRate = organization?.taxEnabled === true ? Number(organization.taxRate) : 0;
    const applyTax = organization?.taxEnabled === true && validatedData.applyTax !== false;

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
      applyTax,
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
    invalidateCreditApproval = true,
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

    // Any edit to a pending sale invalidates its prior manager approval.
    // The sale can be re-approved after the cashier finishes the edits.
    const invalidated = invalidateCreditApproval ? await tx.saleCredit.updateMany({
      where: { saleId, status: 'APPROVED_PENDING_COMPLETION' },
      data: { status: 'INVALIDATED' },
    }) : { count: 0 };
    if (invalidated.count > 0) {
      await tx.auditLog.create({
        data: {
          organizationId,
          action: 'CUSTOMER_CREDIT_APPROVAL_INVALIDATED',
          module: 'credit',
          entityId: saleId,
          entityType: 'Sale',
          metadata: { reason: 'PENDING_SALE_MODIFIED' },
        },
      });
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
        where: { id: validatedData.customerId, organizationId, isActive: true },
        select: { id: true },
      });
      if (!customer) throw new Error('Invalid customer');
    }

    return prisma.$transaction(async (tx) => {
      const invalidatesCreditApproval = ['customerId', 'storeId', 'applyTax', 'discount', 'subtotal', 'tax', 'total']
        .some((field) => Object.prototype.hasOwnProperty.call(validatedData, field));
      await this.lockPendingSale(tx, id, organizationId, invalidatesCreditApproval);
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
   * Replace a pending POS cart atomically; failures preserve the previous cart.
   * All line prices are reloaded from the organization-scoped product catalog.
   */
  async syncItems(saleId: string, organizationId: string, input: unknown) {
    const schema = z.object({
      applyTax: z.boolean(),
      discount: z.number().finite().nonnegative().max(1000000000).refine((value) => Math.round(value * 100) === value * 100, 'Discount must have at most 2 decimal places').default(0),
      items: z.array(z.object({
        variantId: z.string().cuid(),
        quantity: z.number().int().positive(),
      }).strict()).max(500),
    }).strict().superRefine((data, ctx) => {
      const ids = data.items.map((item) => item.variantId);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: 'custom', path: ['items'], message: 'Duplicate product variants are not allowed' });
      }
    });
    const data = schema.parse(input);
    const pricedItems = await Promise.all(data.items.map(async (item) => {
      const variant = await productVariantRepository.findByIdWithOrganizationCheck(item.variantId, organizationId);
      if (!variant) throw new Error('Product variant not found or access denied');
      const unitPrice = roundMoney(getStoredUnitPrice(Number(variant.price), variant.saleUnit ?? 'UNIT'));
      return { variantId: item.variantId, quantity: item.quantity, unitPrice, grossTotal: roundMoney(unitPrice * item.quantity) };
    }));

    const grossSubtotal = roundMoney(pricedItems.reduce((sum, item) => sum + item.grossTotal, 0));
    if (data.discount > grossSubtotal) throw new Error('Discount cannot exceed sale subtotal');
    const discount = roundMoney(data.discount);
    const grossCents = pricedItems.map((item) => Math.round(item.grossTotal * 100));
    const totalGrossCents = grossCents.reduce((sum, value) => sum + value, 0);
    const discountCents = Math.round(discount * 100);
    const totalGrossCentsBigInt = BigInt(totalGrossCents);
    const discountCentsBigInt = BigInt(discountCents);
    const proportionalShares = grossCents.map((value) => {
      const numerator = discountCentsBigInt * BigInt(value);
      return {
        wholeCents: totalGrossCents > 0 ? Number(numerator / totalGrossCentsBigInt) : 0,
        remainder: totalGrossCents > 0 ? numerator % totalGrossCentsBigInt : BigInt(0),
      };
    });
    const lineDiscountCents = proportionalShares.map((share) => share.wholeCents);
    let remainingDiscountCents = discountCents - lineDiscountCents.reduce((sum, value) => sum + value, 0);
    const remainderOrder = proportionalShares
      .map((share, index) => ({ index, remainder: share.remainder }))
      .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
    for (const entry of remainderOrder) {
      if (remainingDiscountCents <= 0) break;
      if (lineDiscountCents[entry.index] < grossCents[entry.index]) {
        lineDiscountCents[entry.index] += 1;
        remainingDiscountCents -= 1;
      }
    }
    if (remainingDiscountCents !== 0) throw new Error('Discount allocation failed');

    return prisma.$transaction(async (tx) => {
      await this.lockPendingSale(tx, saleId, organizationId);
      await tx.sale.update({ where: { id: saleId }, data: { applyTax: data.applyTax } });
      await tx.saleItem.deleteMany({ where: { saleId } });
      for (let index = 0; index < pricedItems.length; index += 1) {
        const item = pricedItems[index];
        const lineDiscount = lineDiscountCents[index] / 100;
        const lineNetCents = grossCents[index] - lineDiscountCents[index];
        await tx.saleItem.create({
          data: {
            saleId,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: lineDiscount,
            totalPrice: lineNetCents / 100,
          },
        });
      }
      await this.recalculateTotalsInTransaction(tx, saleId, organizationId);
      return tx.sale.findFirst({
        where: { id: saleId, organizationId },
        include: { items: { include: { variant: { include: { product: true } } } } },
      });
    });
  }

  /**
   * Recalculate totals transactionally so callers never persist a partial
   * item/totals update. Mutations already inside a transaction use the helper.
   */
  async recalculateTotals(saleId: string, organizationId: string) {
    const items = await saleRepository.listItems(saleId, organizationId);
    const subtotal = roundMoney(items.reduce((sum: number, item: SaleItem) => sum + Number(item.totalPrice) + Number(item.discount), 0));
    const discount = roundMoney(items.reduce((sum: number, item: SaleItem) => sum + Number(item.discount), 0));

    const sale = await prisma.sale.findFirst({
      where: { id: saleId, organizationId },
      include: { organization: { include: { taxConfiguration: true } } },
    });

    const effectiveRate = sale?.applyTax && sale.organization?.taxEnabled === true
      ? Number(sale.organization.taxRate)
      : 0;
    const taxableSubtotal = roundMoney(subtotal - discount);
    const tax = roundMoney(taxableSubtotal * effectiveRate);
    const total = roundMoney(taxableSubtotal + tax);

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
    const subtotal = roundMoney(items.reduce((sum, item) => sum + Number(item.totalPrice) + Number(item.discount), 0));
    const discount = roundMoney(items.reduce((sum, item) => sum + Number(item.discount), 0));

    const sale = await tx.sale.findFirst({
      where: { id: saleId, organizationId },
      include: { organization: { include: { taxConfiguration: true } } },
    });
    if (!sale) throw new Error('Sale not found or access denied');

    const effectiveRate = sale.applyTax && sale.organization?.taxEnabled === true ? Number(sale.organization.taxRate) : 0;
    const taxableSubtotal = roundMoney(subtotal - discount);
    const tax = roundMoney(taxableSubtotal * effectiveRate);
    const total = roundMoney(taxableSubtotal + tax);

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
  async complete(saleId: string, organizationId: string, completedBy?: string) {
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

      const authorizedCredit = sale.saleCredit && ['AUTHORIZED', 'APPROVED_PENDING_COMPLETION'].includes(sale.saleCredit.status)
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

      // The approved credit becomes an actual receivable only in the same
      // transaction that finalizes the sale and deducts stock.
      if (sale.saleCredit?.status === 'APPROVED_PENDING_COMPLETION') {
        await tx.saleCredit.update({
          where: { id: sale.saleCredit.id },
          data: { status: 'AUTHORIZED' },
        });
        await tx.auditLog.create({
          data: {
            userId: completedBy ?? sale.saleCredit.authorizedBy,
            organizationId,
            storeId: sale.storeId,
            action: 'CUSTOMER_CREDIT_RECEIVABLE_CREATED',
            module: 'credit',
            entityId: sale.saleCredit.id,
            entityType: 'SaleCredit',
            newValues: {
              status: 'AUTHORIZED',
              amount: Number(sale.saleCredit.amount),
              dueAt: sale.saleCredit.dueAt.toISOString(),
            },
            metadata: {
              saleId,
              orderNumber: sale.orderNumber,
              approvedBy: sale.saleCredit.authorizedBy,
              finalizedBy: completedBy ?? null,
            },
          },
        });
      }

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
          saleCredit: { include: { payments: true, adjustments: true } },
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
      let cancellationCreditAdjustment = 0;
      let cancellationCredit = sale.saleCredit;
      if (oldStatus === 'COMPLETED' && sale.saleCredit?.status === 'AUTHORIZED') {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM sale_credits
          WHERE id = ${sale.saleCredit.id} AND "organizationId" = ${organizationId}
          FOR UPDATE
        `;
        cancellationCredit = await tx.saleCredit.findFirst({
          where: { id: sale.saleCredit.id, organizationId },
          include: { payments: true, adjustments: true },
        });
      }

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

      await tx.sale.update({
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

      if (oldStatus === 'PENDING' && sale.saleCredit?.status === 'APPROVED_PENDING_COMPLETION') {
        await tx.saleCredit.update({
          where: { id: sale.saleCredit.id },
          data: { status: 'CANCELLED' },
        });
      } else if (oldStatus === 'COMPLETED' && cancellationCredit?.status === 'AUTHORIZED') {
        const paidOnCredit = roundMoney(cancellationCredit.payments.reduce((sum, payment) => sum + Number(payment.amount), 0));
        const alreadyAdjusted = roundMoney(cancellationCredit.adjustments.reduce((sum, adjustment) => sum + Number(adjustment.amount), 0));
        cancellationCreditAdjustment = roundMoney(Math.max(0, Number(cancellationCredit.amount) - paidOnCredit - alreadyAdjusted));
        if (cancellationCreditAdjustment > 0) {
          await tx.creditAdjustment.create({
            data: {
              organizationId,
              storeId: sale.storeId,
              saleCreditId: cancellationCredit.id,
              processedBy: cancelledBy,
              amount: cancellationCreditAdjustment,
              reason: \`Full cancellation of sale \${sale.orderNumber}\`,
            },
          });
          await tx.saleCredit.update({
            where: { id: cancellationCredit.id },
            data: { status: 'SETTLED' },
          });
        }
      }

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
            creditDebtAdjustment: cancellationCreditAdjustment,
            authorizedCredit: sale.saleCredit?.status === 'AUTHORIZED'
              ? Number(sale.saleCredit.amount)
              : 0,
          },
        },
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
   * Authorize explicit customer credit for a pending sale.
   */
  async authorizeCredit(saleId: string, organizationId: string, authorizedBy: string, data: SaleCreditInput, expectedStoreId?: string) {
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
      if (expectedStoreId && sale.storeId !== expectedStoreId) {
        throw new Error('Sale store changed during credit approval; please retry');
      }
      if (sale.status !== 'PENDING') {
        throw new Error('Credit can only be authorized for a PENDING sale');
      }
      if (!sale.customerId) {
        throw new Error('A customer is required to authorize credit');
      }
      if (sale.saleCredit && sale.saleCredit.status !== 'INVALIDATED') {
        throw new Error('Credit is already authorized for this sale');
      }

      // Serialize all credit admissions for the same customer so concurrent
      // sales cannot race past an optional customer credit limit.
      const customerLocks = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM customers
        WHERE id = ${validatedData.customerId} AND "organizationId" = ${organizationId}
        FOR UPDATE
      `;
      if (customerLocks.length === 0) throw new Error('Customer not found or access denied');

      const customer = await tx.customer.findFirst({
        where: { id: validatedData.customerId, organizationId },
        select: { id: true, creditLimit: true },
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

      if (customer.creditLimit !== null) {
        const activeCredits = await tx.saleCredit.findMany({
          where: { organizationId, customerId: customer.id, status: { in: ['AUTHORIZED', 'APPROVED_PENDING_COMPLETION'] } },
          select: { amount: true, payments: { select: { amount: true } }, adjustments: { select: { amount: true } } },
        });
        const outstanding = roundMoney(activeCredits.reduce((sum, credit) =>
          sum + Math.max(0, Number(credit.amount) - credit.payments.reduce((paid, payment) => paid + Number(payment.amount), 0) - credit.adjustments.reduce((adjusted, adjustment) => adjusted + Number(adjustment.amount), 0)), 0));
        const projected = roundMoney(outstanding + validatedData.amount);
        if (projected > Number(customer.creditLimit) && !validatedData.note?.trim()) {
          throw new Error(`Customer credit limit exceeded. Outstanding: ${outstanding}, Limit: ${Number(customer.creditLimit)}. A reason is required for manager override.`);
        }
      }

      const organization = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { creditDefaultDueDays: true },
      });
      if (!organization) throw new Error('Organization not found');
      const dueAt = validatedData.dueAt ?? new Date(Date.now() + organization.creditDefaultDueDays * 24 * 60 * 60 * 1000);
      if (dueAt.getTime() <= Date.now()) throw new Error('Credit due date must be in the future');

      const creditData = {
        organizationId,
        storeId: sale.storeId,
        saleId,
        customerId: customer.id,
        amount: validatedData.amount,
        status: 'APPROVED_PENDING_COMPLETION',
        authorizedBy,
        authorizedAt: new Date(),
        note: validatedData.note,
        dueAt,
      };
      const credit = sale.saleCredit?.status === 'INVALIDATED'
        ? await tx.saleCredit.update({
            where: { id: sale.saleCredit.id },
            data: creditData,
            include: { customer: true },
          })
        : await tx.saleCredit.create({
            data: creditData,
            include: { customer: true },
          });

      await tx.auditLog.create({
        data: {
          userId: authorizedBy,
          organizationId,
          storeId: sale.storeId,
          action: 'CUSTOMER_CREDIT_APPROVED',
          module: 'credit',
          entityId: credit.id,
          entityType: 'SaleCredit',
          oldValues: sale.saleCredit ? {
            status: sale.saleCredit.status,
            amount: Number(sale.saleCredit.amount),
            authorizedBy: sale.saleCredit.authorizedBy,
          } : undefined,
          newValues: {
            status: 'APPROVED_PENDING_COMPLETION',
            amount: validatedData.amount,
            customerId: customer.id,
            dueAt: dueAt.toISOString(),
            currencyCode: sale.currencyCode,
          },
          metadata: {
            saleId,
            orderNumber: sale.orderNumber,
            note: validatedData.note ?? null,
            receivableCreated: false,
          },
        },
      });

      return credit;
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

      const authorizedCredit = sale.saleCredit && ['AUTHORIZED', 'APPROVED_PENDING_COMPLETION'].includes(sale.saleCredit.status)
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
