import { saleRepository } from '@omnikes/repositories/sale.repository';
import { productVariantRepository } from '@omnikes/repositories/product-variant.repository';
import { storeService } from '@omnikes/services/store.service';
import { saleSchema, saleUpdateSchema, saleItemSchema, paymentSchema, SaleInput, SaleUpdateInput, SaleItemInput, PaymentInput } from '@omnikes/lib/validation';
import { prisma } from '@omnikes/lib/prisma';
import { Prisma, SaleItem, Payment } from '@prisma/client';

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

    // Generate order number if not provided
    const orderNumber = validatedData.orderNumber || this.generateOrderNumber();

    return saleRepository.create({
      ...validatedData,
      orderNumber,
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
    status?: string;
    startDate?: Date;
    endDate?: Date;
    customerId?: string;
    skip?: number;
    take?: number;
  } = {}) {
    return saleRepository.listByOrganization(organizationId, options);
  }

  /**
   * Update a sale
   */
  async update(id: string, organizationId: string, data: SaleUpdateInput) {
    const exists = await saleRepository.belongsToOrganization(id, organizationId);
    
    if (!exists) {
      throw new Error('Sale not found or access denied');
    }

    const validatedData = saleUpdateSchema.parse(data);

    // CRITICAL: If storeId is being updated, validate it belongs to the organization
    if (validatedData.storeId) {
      await storeService.validateStoreBelongsToOrganization(validatedData.storeId, organizationId);
    }

    await saleRepository.update(id, organizationId, validatedData as Prisma.SaleUpdateInput);
    
    return saleRepository.findById(id, organizationId);
  }

  /**
   * Add an item to a sale
   */
  async addItem(saleId: string, organizationId: string, data: SaleItemInput) {
    const exists = await saleRepository.belongsToOrganization(saleId, organizationId);
    
    if (!exists) {
      throw new Error('Sale not found or access denied');
    }

    let validatedData;
    try {
      validatedData = saleItemSchema.parse(data);
    } catch (validationError) {
      throw validationError;
    }

    // Verify variant belongs to organization
    const variant = await productVariantRepository.findByIdWithOrganizationCheck(
      validatedData.variantId,
      organizationId
    );

    if (!variant) {
      throw new Error('Product variant not found or access denied');
    }

    // INVARIANT: quantity must be > 0
    if (validatedData.quantity <= 0) {
      throw new Error('Quantity must be greater than 0');
    }

    // INVARIANT: Use server-side price, do not trust client
    const serverPrice = Number(variant.price);
    const quantity = validatedData.quantity;
    const discount = validatedData.discount || 0;

    // INVARIANT: discount cannot exceed gross amount
    const grossAmount = serverPrice * quantity;
    if (discount > grossAmount) {
      throw new Error('Discount cannot exceed gross amount');
    }

    // INVARIANT: line total must never be negative
    const totalPrice = grossAmount - discount;
    if (totalPrice < 0) {
      throw new Error('Line total cannot be negative');
    }
    
    const item = await saleRepository.createItem({
      quantity: validatedData.quantity,
      unitPrice: serverPrice, // Use server-side price
      totalPrice,
      discount: validatedData.discount,
      sale: {
        connect: { id: saleId },
      },
      variant: {
        connect: { id: validatedData.variantId },
      },
    });

    // Recalculate sale totals
    await this.recalculateTotals(saleId, organizationId);

    return item;
  }

  /**
   * Update a sale item
   */
  async updateItem(itemId: string, organizationId: string, data: Partial<SaleItemInput>) {
    const validatedData = saleItemSchema.partial().parse(data);

    // Calculate new total if quantity or price changed
    if (validatedData.quantity !== undefined || validatedData.unitPrice !== undefined || validatedData.discount !== undefined) {
      const item = await prisma.saleItem.findFirst({
        where: { id: itemId },
        include: {
          sale: true,
          variant: true,
        },
      });

      if (!item || item.sale.organizationId !== organizationId) {
        throw new Error('Sale item not found or access denied');
      }

      // INVARIANT: quantity must be > 0
      const quantity = validatedData.quantity ?? item.quantity;
      if (quantity <= 0) {
        throw new Error('Quantity must be greater than 0');
      }

      // INVARIANT: Use server-side price from variant, do not trust client
      const unitPrice = validatedData.unitPrice !== undefined 
        ? Number(item.variant.price) // Always use server price if client tries to change it
        : Number(item.unitPrice);
      const discount = validatedData.discount ?? Number(item.discount);

      // INVARIANT: discount cannot exceed gross amount
      const grossAmount = unitPrice * quantity;
      if (discount > grossAmount) {
        throw new Error('Discount cannot exceed gross amount');
      }

      // INVARIANT: line total must never be negative
      const totalPrice = grossAmount - discount;
      if (totalPrice < 0) {
        throw new Error('Line total cannot be negative');
      }

      await saleRepository.updateItem(itemId, organizationId, {
        ...validatedData,
        unitPrice, // Force server-side price
        totalPrice,
      } as Prisma.SaleItemUpdateInput);

      await this.recalculateTotals(item.saleId, organizationId);
    } else {
      await saleRepository.updateItem(itemId, organizationId, validatedData as Prisma.SaleItemUpdateInput);
    }

    return prisma.saleItem.findUnique({
      where: { id: itemId },
      include: {
        variant: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  /**
   * Remove an item from a sale
   */
  async removeItem(itemId: string, organizationId: string) {
    const item = await prisma.saleItem.findFirst({
      where: { id: itemId },
      include: {
        sale: true,
      },
    });

    if (!item || item.sale.organizationId !== organizationId) {
      throw new Error('Sale item not found or access denied');
    }

    await saleRepository.deleteItem(itemId, organizationId);
    await this.recalculateTotals(item.saleId, organizationId);
  }

  /**
   * Recalculate sale totals from items
   */
  async recalculateTotals(saleId: string, organizationId: string) {
    const items = await saleRepository.listItems(saleId, organizationId);

    const subtotal = items.reduce((sum: number, item: SaleItem) => sum + Number(item.totalPrice), 0);
    const discount = items.reduce((sum: number, item: SaleItem) => sum + Number(item.discount), 0);
    
    // Get tax rate from organization's tax configuration
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        organization: {
          include: {
            taxConfiguration: true,
          },
        },
      },
    });

    const configuredRate = sale?.organization?.taxConfiguration?.taxRate;
    // Use nullish coalescing to allow configured 0 to remain 0
    const taxRate = (configuredRate !== null && configuredRate !== undefined)
      ? Number(configuredRate)
      : 0.18; // Fallback to 18% if no configuration
    
    const tax = subtotal * taxRate;
    const total = subtotal + tax - discount;

    console.log('[TOTAL FORENSIC SERVER] Recalculation:', {
      saleId,
      numberOfItems: items.length,
      subtotal,
      discount,
      configuredRate,
      taxRate,
      tax,
      total,
      items: items.map(item => ({
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        totalPrice: Number(item.totalPrice),
      })),
    });

    await saleRepository.update(saleId, organizationId, {
      subtotal,
      discount,
      tax,
      total,
    });
  }

  /**
   * Complete a sale (transactional - deducts stock)
   */
  async complete(saleId: string, organizationId: string) {
    const exists = await saleRepository.belongsToOrganization(saleId, organizationId);
    
    if (!exists) {
      throw new Error('Sale not found or access denied');
    }

    return prisma.$transaction(async () => {
      // Get sale with items and payments
      const sale = await prisma.sale.findUnique({
        where: { id: saleId },
        include: {
          items: {
            include: {
              variant: true,
            },
          },
          payments: true,
        },
      });

      if (!sale) {
        throw new Error('Sale not found');
      }

      if (sale.status === 'COMPLETED') {
        throw new Error('Sale is already completed');
      }

      // Verify payment amount
      const totalPaid = sale.payments
        .filter(p => p.status === 'COMPLETED')
        .reduce((sum: number, p: Payment) => sum + Number(p.amount), 0);

      if (totalPaid < Number(sale.total)) {
        // Allow CREDIT method as partial payment
        const hasCreditPayment = sale.payments.some((p: Payment) => p.method === 'CREDIT');
        if (!hasCreditPayment) {
          throw new Error(`Insufficient payment. Required: ${sale.total}, Paid: ${totalPaid}`);
        }
      }

      // Verify and lock inventory for each item
      for (const item of sale.items) {
        const inventory = await prisma.$queryRaw<Array<{ id: string; quantity: number; reservedQuantity: number }>>`
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

        // Deduct stock
        await prisma.inventory.update({
          where: { id: currentInventory.id },
          data: {
            quantity: currentInventory.quantity - item.quantity,
          },
        });

        // Create SALE movement
        await prisma.inventoryMovement.create({
          data: {
            inventoryId: currentInventory.id,
            type: 'SALE',
            quantity: -item.quantity,
            referenceId: saleId,
            referenceType: 'SALE',
            notes: `Sale ${sale.orderNumber}`,
          },
        });
      }

      // Update sale status
      await prisma.sale.update({
        where: { id: saleId },
        data: { status: 'COMPLETED' },
      });

      return saleRepository.findById(saleId, organizationId);
    });
  }

  /**
   * Cancel a sale (transactional - restores stock if completed)
   */
  async cancel(saleId: string, organizationId: string) {
    const exists = await saleRepository.belongsToOrganization(saleId, organizationId);
    
    if (!exists) {
      throw new Error('Sale not found or access denied');
    }

    return prisma.$transaction(async () => {
      const sale = await prisma.sale.findUnique({
        where: { id: saleId },
        include: {
          items: {
            include: {
              variant: true,
            },
          },
        },
      });

      if (!sale) {
        throw new Error('Sale not found');
      }

      if (sale.status === 'CANCELLED') {
        throw new Error('Sale is already cancelled');
      }

      // If sale was completed, restore stock
      if (sale.status === 'COMPLETED') {
        for (const item of sale.items) {
          const inventory = await prisma.$queryRaw<Array<{ id: string; quantity: number }>>`
            SELECT id, quantity
            FROM inventories
            WHERE "storeId" = ${sale.storeId} AND "variantId" = ${item.variantId}
            FOR UPDATE
          `;

          if (inventory && inventory.length > 0) {
            const currentInventory = inventory[0];

            await prisma.inventory.update({
              where: { id: currentInventory.id },
              data: {
                quantity: currentInventory.quantity + item.quantity,
              },
            });

            // Create RETURN movement
            await prisma.inventoryMovement.create({
              data: {
                inventoryId: currentInventory.id,
                type: 'RETURN',
                quantity: item.quantity,
                referenceId: saleId,
                referenceType: 'SALE',
                notes: `Cancelled sale ${sale.orderNumber}`,
              },
            });
          }
        }
      }

      // Update sale status
      await prisma.sale.update({
        where: { id: saleId },
        data: { status: 'CANCELLED' },
      });

      return saleRepository.findById(saleId, organizationId);
    });
  }

  /**
   * Add a payment to a sale
   */
  async addPayment(saleId: string, organizationId: string, data: PaymentInput) {
    const exists = await saleRepository.belongsToOrganization(saleId, organizationId);
    
    if (!exists) {
      throw new Error('Sale not found or access denied');
    }

    const validatedData = paymentSchema.parse(data);

    // INVARIANT: payment amount must be positive
    if (validatedData.amount <= 0) {
      throw new Error('Payment amount must be positive');
    }

    // INVARIANT: Check payment doesn't exceed sale total (unless CREDIT method)
    const sale = await saleRepository.findById(saleId, organizationId);
    
    if (!sale) {
      throw new Error('Sale not found or access denied');
    }
    
    const totalPaid = await saleRepository.getTotalPaid(saleId, organizationId);
    const remainingAmount = Number(sale.total) - totalPaid;

    if (validatedData.method !== 'CREDIT' && validatedData.amount > remainingAmount) {
      throw new Error(`Payment amount exceeds remaining balance. Remaining: ${remainingAmount}, Attempted: ${validatedData.amount}`);
    }

    const payment = await saleRepository.createPayment({
      method: validatedData.method,
      amount: validatedData.amount,
      reference: validatedData.reference,
      status: validatedData.status,
      sale: {
        connect: { id: saleId },
      },
    });

    return payment;
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
    
    return Number(sale.total) - totalPaid;
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
