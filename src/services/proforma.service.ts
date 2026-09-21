import { proformaRepository } from '@omnikes/repositories/proforma.repository';
import { productVariantRepository } from '@omnikes/repositories/product-variant.repository';
import { proformaSchema, proformaUpdateSchema, proformaItemSchema, ProformaInput, ProformaUpdateInput, ProformaItemInput } from '@omnikes/lib/validation';
import { prisma } from '@omnikes/lib/prisma';
import { Prisma, ProformaItem } from '@prisma/client';

export class ProformaService {
  /**
   * Create a new proforma (DRAFT)
   */
  async create(organizationId: string, data: ProformaInput) {
    const validatedData = proformaSchema.parse({
      ...data,
      organizationId,
    });

    // Generate proforma number if not provided
    const proformaNumber = validatedData.proformaNumber || this.generateProformaNumber();

    // Get organization's tax configuration for initial tax rate
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { taxConfiguration: true },
    });

    const initialTaxRate = organization?.taxConfiguration?.taxRate
      ? Number(organization.taxConfiguration.taxRate)
      : 0;

    // Verify customer belongs to organization if provided
    if (validatedData.customerId) {
      const customer = await prisma.customer.findFirst({
        where: {
          id: validatedData.customerId,
          organizationId,
        },
      });

      if (!customer) {
        throw new Error('Invalid customer');
      }
    }

    const { organizationId: _, storeId: __, customerId: ___, items, ...dataWithoutIds } = validatedData;

    // Create proforma and items in a transaction
    return prisma.$transaction(async (tx) => {
      const proforma = await tx.proforma.create({
        data: {
          ...dataWithoutIds,
          proformaNumber,
          taxRate: initialTaxRate,
          organization: {
            connect: { id: organizationId },
          },
          store: {
            connect: { id: validatedData.storeId },
          },
          ...(validatedData.customerId
            ? {
                customer: {
                  connect: { id: validatedData.customerId },
                },
              }
            : {}),
        },
        include: {
          store: true,
          customer: true,
          items: {
            include: {
              variant: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
      });

      // Create items if provided
      if (items && items.length > 0) {
        for (const item of items) {
          // Verify variant belongs to organization using transaction client
          const variant = await tx.productVariant.findFirst({
            where: {
              id: item.variantId,
              product: {
                organizationId,
              },
            },
            include: {
              product: true,
            },
          });

          if (!variant) {
            throw new Error('Product variant not found or access denied');
          }

          // Use server-side price
          const serverPrice = Number(variant.price);
          const totalPrice = serverPrice * item.quantity;

          await tx.proformaItem.create({
            data: {
              proformaId: proforma.id,
              variantId: item.variantId,
              quantity: item.quantity,
              unitPrice: serverPrice,
              totalPrice,
              discount: 0,
            },
          });
        }

        // Recalculate totals after items are added
        const updatedProforma = await tx.proforma.findUnique({
          where: { id: proforma.id },
          include: {
            items: true,
          },
        });

        if (updatedProforma) {
          const grossSubtotal = updatedProforma.items.reduce((sum: number, item: any) => {
            return sum + Number(item.unitPrice) * item.quantity;
          }, 0);

          const discount = updatedProforma.items.reduce((sum: number, item: any) => {
            return sum + Number(item.discount);
          }, 0);

          const subtotal = grossSubtotal - discount;

          let tax = 0;
          if (updatedProforma.applyTax) {
            tax = subtotal * initialTaxRate;
          }

          const total = subtotal + tax;

          await tx.proforma.update({
            where: { id: proforma.id },
            data: {
              subtotal,
              tax,
              total,
            },
          });
        }
      }

      return proforma;
    });
  }

  /**
   * Get a proforma by ID with organization check
   */
  async getById(id: string, organizationId: string) {
    const proforma = await proformaRepository.findById(id, organizationId);
    
    if (!proforma) {
      throw new Error('Proforma not found or access denied');
    }

    return proforma;
  }

  /**
   * List proformas for an organization
   */
  async list(organizationId: string, options: {
    storeId?: string;
    status?: string;
    customerId?: string;
    startDate?: Date;
    endDate?: Date;
    skip?: number;
    take?: number;
  } = {}) {
    return proformaRepository.listByOrganization(organizationId, options);
  }

  /**
   * Update a proforma
   */
  async update(id: string, organizationId: string, data: ProformaUpdateInput) {
    const exists = await proformaRepository.belongsToOrganization(id, organizationId);

    if (!exists) {
      throw new Error('Proforma not found or access denied');
    }

    const proforma = await proformaRepository.findById(id, organizationId);

    if (!proforma) {
      throw new Error('Proforma not found or access denied');
    }

    // Check if proforma is modifiable
    if (proforma.status !== 'DRAFT') {
      throw new Error('Only DRAFT proformas can be modified');
    }

    const validatedData = proformaUpdateSchema.parse(data);

    // Explicitly exclude status from update data
    const { customerId, validUntil, notes, subtotal, tax, taxRate, total, discount, applyTax } = validatedData;

    await proformaRepository.update(id, organizationId, {
      ...(customerId !== undefined && { customerId }),
      ...(validUntil !== undefined && { validUntil }),
      ...(notes !== undefined && { notes }),
      ...(subtotal !== undefined && { subtotal }),
      ...(tax !== undefined && { tax }),
      ...(taxRate !== undefined && { taxRate }),
      ...(total !== undefined && { total }),
      ...(discount !== undefined && { discount }),
      ...(applyTax !== undefined && { applyTax }),
    } as Prisma.ProformaUpdateInput);

    return proformaRepository.findById(id, organizationId);
  }

  /**
   * Add an item to a proforma
   */
  async addItem(proformaId: string, organizationId: string, data: ProformaItemInput) {
    const exists = await proformaRepository.belongsToOrganization(proformaId, organizationId);
    
    if (!exists) {
      throw new Error('Proforma not found or access denied');
    }

    const proforma = await proformaRepository.findById(proformaId, organizationId);

    if (!proforma) {
      throw new Error('Proforma not found or access denied');
    }

    // Check if proforma is modifiable
    if (proforma.status !== 'DRAFT') {
      throw new Error('Only DRAFT proformas can be modified');
    }

    const validatedData = proformaItemSchema.parse({
      ...data,
      proformaId,
    });

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

    const item = await proformaRepository.createItem({
      ...validatedData,
      unitPrice: serverPrice, // Use server-side price
      totalPrice,
      proforma: {
        connect: { id: proformaId },
      },
      variant: {
        connect: { id: validatedData.variantId },
      },
    });

    // Recalculate proforma totals
    await this.recalculateTotals(proformaId, organizationId);

    return item;
  }

  /**
   * Update a proforma item
   */
  async updateItem(itemId: string, organizationId: string, data: Partial<ProformaItemInput>) {
    const validatedData = proformaItemSchema.partial().parse(data);

    // Calculate new total if quantity or price changed
    if (validatedData.quantity !== undefined || validatedData.unitPrice !== undefined || validatedData.discount !== undefined) {
      const item = await prisma.proformaItem.findFirst({
        where: { id: itemId },
        include: {
          proforma: true,
          variant: true,
        },
      });

      if (!item || item.proforma.organizationId !== organizationId) {
        throw new Error('Proforma item not found or access denied');
      }

      const proforma = await proformaRepository.findById(item.proformaId, organizationId);

      if (!proforma) {
        throw new Error('Proforma not found or access denied');
      }

      if (proforma.status !== 'DRAFT') {
        throw new Error('Only DRAFT proformas can be modified');
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

      await proformaRepository.updateItem(itemId, organizationId, {
        ...validatedData,
        unitPrice, // Force server-side price
        totalPrice,
      } as Prisma.ProformaItemUpdateInput);

      await this.recalculateTotals(item.proformaId, organizationId);
    } else {
      await proformaRepository.updateItem(itemId, organizationId, validatedData as Prisma.ProformaItemUpdateInput);
    }

    return prisma.proformaItem.findUnique({
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
   * Remove an item from a proforma
   */
  async removeItem(itemId: string, organizationId: string) {
    const item = await prisma.proformaItem.findFirst({
      where: { id: itemId },
      include: {
        proforma: true,
      },
    });

    if (!item || item.proforma.organizationId !== organizationId) {
      throw new Error('Proforma item not found or access denied');
    }

    const proforma = await proformaRepository.findById(item.proformaId, organizationId);

    if (!proforma) {
      throw new Error('Proforma not found or access denied');
    }

    if (proforma.status !== 'DRAFT') {
      throw new Error('Only DRAFT proformas can be modified');
    }

    await proformaRepository.deleteItem(itemId, organizationId);
    await this.recalculateTotals(item.proformaId, organizationId);
  }

  /**
   * Recalculate proforma totals from items
   */
  async recalculateTotals(proformaId: string, organizationId: string) {
    const items = await proformaRepository.listItems(proformaId, organizationId);

    // Calculate gross subtotal (before discounts)
    const grossSubtotal = items.reduce((sum: number, item: ProformaItem) => {
      const grossLineTotal = Number(item.unitPrice) * item.quantity;
      return sum + grossLineTotal;
    }, 0);

    // Sum of all line discounts
    const discount = items.reduce((sum: number, item: ProformaItem) => sum + Number(item.discount), 0);

    // Subtotal after discounts
    const subtotal = grossSubtotal - discount;

    // Get proforma with organization's tax configuration
    const proforma = await prisma.proforma.findUnique({
      where: { id: proformaId },
      include: {
        organization: {
          include: {
            taxConfiguration: true,
          },
        },
      },
    });

    // Apply tax only if applyTax is true and tax configuration exists
    let taxRate = 0;
    let tax = 0;

    if (proforma?.applyTax && proforma?.organization?.taxConfiguration?.taxRate) {
      taxRate = Number(proforma.organization.taxConfiguration.taxRate);
      tax = subtotal * taxRate;
    }

    const total = subtotal + tax;

    await proformaRepository.update(proformaId, organizationId, {
      subtotal,
      discount,
      tax,
      taxRate,
      total,
    });
  }

  /**
   * Validate a proforma (DRAFT -> SENT)
   */
  async validate(proformaId: string, organizationId: string) {
    const exists = await proformaRepository.belongsToOrganization(proformaId, organizationId);
    
    if (!exists) {
      throw new Error('Proforma not found or access denied');
    }

    const proforma = await proformaRepository.findById(proformaId, organizationId);

    if (!proforma) {
      throw new Error('Proforma not found or access denied');
    }

    if (proforma.status !== 'DRAFT') {
      throw new Error('Only DRAFT proformas can be validated');
    }

    // Check if proforma has at least one item
    const items = await proformaRepository.listItems(proformaId, organizationId);
    if (items.length === 0) {
      throw new Error('Proforma must have at least one item to be validated');
    }

    // Recalculate totals
    await this.recalculateTotals(proformaId, organizationId);

    // Update status to SENT
    await proformaRepository.updateStatus(proformaId, organizationId, 'SENT');

    return proformaRepository.findById(proformaId, organizationId);
  }

  /**
   * Accept a proforma (SENT -> ACCEPTED)
   */
  async accept(proformaId: string, organizationId: string) {
    const exists = await proformaRepository.belongsToOrganization(proformaId, organizationId);

    if (!exists) {
      throw new Error('Proforma not found or access denied');
    }

    const proforma = await proformaRepository.findById(proformaId, organizationId);

    if (!proforma) {
      throw new Error('Proforma not found or access denied');
    }

    // Only SENT proformas can be accepted
    if (proforma.status !== 'SENT') {
      throw new Error(`Cannot accept proforma with status ${proforma.status}. Only SENT proformas can be accepted.`);
    }

    // Recalculate totals before accepting
    await this.recalculateTotals(proformaId, organizationId);

    // Update status to ACCEPTED
    await proformaRepository.updateStatus(proformaId, organizationId, 'ACCEPTED');

    return proformaRepository.findById(proformaId, organizationId);
  }

  /**
   * Cancel a proforma
   */
  async cancel(proformaId: string, organizationId: string) {
    const exists = await proformaRepository.belongsToOrganization(proformaId, organizationId);
    
    if (!exists) {
      throw new Error('Proforma not found or access denied');
    }

    const proforma = await proformaRepository.findById(proformaId, organizationId);

    if (!proforma) {
      throw new Error('Proforma not found or access denied');
    }

    if (proforma.status === 'CANCELLED') {
      throw new Error('Proforma is already cancelled');
    }

    if (proforma.status === 'CONVERTED') {
      throw new Error('Cannot cancel a converted proforma');
    }

    // Update status to CANCELLED
    await proformaRepository.updateStatus(proformaId, organizationId, 'CANCELLED');

    return proformaRepository.findById(proformaId, organizationId);
  }

  /**
   * Convert a proforma to a sale (transactional)
   */
  async convert(proformaId: string, organizationId: string) {
    return prisma.$transaction(async (tx) => {
      // Load proforma with items, organization, store, customer
      const proforma = await tx.proforma.findUnique({
        where: { id: proformaId },
        include: {
          organization: true,
          store: true,
          customer: true,
          items: {
            include: {
              variant: true,
            },
          },
        },
      });

      if (!proforma) {
        throw new Error('Proforma not found');
      }

      // Multi-tenant check
      if (proforma.organizationId !== organizationId) {
        throw new Error('Proforma not found or access denied');
      }

      // Status validation: only ACCEPTED can be converted
      if (proforma.status !== 'ACCEPTED') {
        throw new Error(`Cannot convert proforma with status ${proforma.status}. Only ACCEPTED proformas can be converted.`);
      }

      // Double conversion check - check if already converted by looking at convertedSale relation
      const existingSale = await tx.sale.findFirst({
        where: { convertedFromProformaId: proformaId },
      });

      if (existingSale) {
        throw new Error('Proforma has already been converted to a sale');
      }

      // Empty proforma check
      if (proforma.items.length === 0) {
        throw new Error('Cannot convert an empty proforma');
      }

      // Generate order number
      const orderNumber = this.generateOrderNumber();

      // Create sale (using direct data without relations to match repository pattern)
      const sale = await tx.sale.create({
        data: {
          organizationId: proforma.organizationId,
          storeId: proforma.storeId,
          orderNumber,
          customerId: proforma.customerId,
          channel: 'POS',
          status: 'PENDING',
          subtotal: proforma.subtotal,
          tax: proforma.tax,
          taxRate: proforma.taxRate,
          total: proforma.total,
          discount: proforma.discount,
          applyTax: proforma.applyTax,
          notes: proforma.notes,
          convertedFromProformaId: proforma.id,
        },
      });

      // Create sale items
      for (const item of proforma.items) {
        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            variantId: item.variantId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            discount: item.discount,
          },
        });
      }

      // Update proforma status to CONVERTED
      await tx.proforma.update({
        where: { id: proformaId },
        data: { status: 'CONVERTED' },
      });

      // Return the created sale with relations
      return tx.sale.findUnique({
        where: { id: sale.id },
        include: {
          store: true,
          customer: true,
          items: {
            include: {
              variant: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
      });
    });
  }

  /**
   * Generate a unique proforma number
   */
  private generateProformaNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `PF-${timestamp}-${random}`;
  }

  /**
   * Generate a unique order number for conversion
   */
  private generateOrderNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `SALE-${timestamp}-${random}`;
  }
}

export const proformaService = new ProformaService();
