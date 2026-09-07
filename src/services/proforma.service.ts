import { proformaRepository } from '@omnikes/repositories/proforma.repository';
import { productVariantRepository } from '@omnikes/repositories/product-variant.repository';
import { proformaSchema, proformaUpdateSchema, proformaItemSchema, ProformaInput, ProformaUpdateInput, ProformaItemInput } from '@omnikes/lib/validation';
import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

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

    return proformaRepository.create({
      ...validatedData,
      proformaNumber,
      organization: {
        connect: { id: organizationId },
      },
      store: {
        connect: { id: validatedData.storeId },
      },
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

    await proformaRepository.update(id, organizationId, validatedData as Prisma.ProformaUpdateInput);
    
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

    // Calculate total price
    const totalPrice = (validatedData.unitPrice * validatedData.quantity) - validatedData.discount;

    const item = await proformaRepository.createItem({
      ...validatedData,
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

      const quantity = validatedData.quantity ?? item.quantity;
      const unitPrice = validatedData.unitPrice ?? Number(item.unitPrice);
      const discount = validatedData.discount ?? Number(item.discount);

      const totalPrice = (unitPrice * quantity) - discount;

      await proformaRepository.updateItem(itemId, organizationId, {
        ...validatedData,
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
    const grossSubtotal = items.reduce((sum: number, item: any) => {
      const grossLineTotal = Number(item.unitPrice) * item.quantity;
      return sum + grossLineTotal;
    }, 0);

    // Sum of all line discounts
    const discount = items.reduce((sum: number, item: any) => sum + Number(item.discount), 0);

    // Subtotal after discounts
    const subtotal = grossSubtotal - discount;
    
    // Get tax rate from organization's tax configuration
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

    const taxRate = proforma?.organization?.taxConfiguration?.taxRate 
      ? Number(proforma.organization.taxConfiguration.taxRate) 
      : 0.18; // Fallback to 18% if no configuration
    
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    await proformaRepository.update(proformaId, organizationId, {
      subtotal,
      discount,
      tax,
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
   * Generate a unique proforma number
   */
  private generateProformaNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `PF-${timestamp}-${random}`;
  }
}

export const proformaService = new ProformaService();
