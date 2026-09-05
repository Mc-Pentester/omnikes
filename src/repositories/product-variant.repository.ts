import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

export class ProductVariantRepository {
  /**
   * Create a new product variant
   */
  async create(data: Prisma.ProductVariantCreateInput) {
    return prisma.productVariant.create({
      data,
    });
  }

  /**
   * Find a variant by ID
   */
  async findById(id: string) {
    return prisma.productVariant.findUnique({
      where: { id },
      include: {
        product: true,
      },
    });
  }

  /**
   * Find a variant by ID with organization check
   */
  async findByIdWithOrganizationCheck(id: string, organizationId: string) {
    return prisma.productVariant.findFirst({
      where: {
        id,
        product: {
          organizationId,
        },
      },
      include: {
        product: true,
      },
    });
  }

  /**
   * List variants for a product
   */
  async listByProduct(productId: string, options: {
    isActive?: boolean;
    skip?: number;
    take?: number;
  } = {}) {
    const { isActive, skip = 0, take = 50 } = options;

    const where: Prisma.ProductVariantWhereInput = {
      productId,
    };

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [variants, total] = await Promise.all([
      prisma.productVariant.findMany({
        where,
        skip,
        take,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.productVariant.count({ where }),
    ]);

    return {
      variants,
      total,
      skip,
      take,
    };
  }

  /**
   * List variants for an organization (via product)
   */
  async listByOrganization(organizationId: string, options: {
    search?: string;
    isActive?: boolean;
    skip?: number;
    take?: number;
  } = {}) {
    const { search, isActive, skip = 0, take = 50 } = options;

    const where: Prisma.ProductVariantWhereInput = {
      product: {
        organizationId,
      },
    };

    if (search) {
      where.OR = [
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [variants, total] = await Promise.all([
      prisma.productVariant.findMany({
        where,
        include: {
          product: true,
        },
        skip,
        take,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.productVariant.count({ where }),
    ]);

    return {
      variants,
      total,
      skip,
      take,
    };
  }

  /**
   * Update a variant
   */
  async update(id: string, organizationId: string, data: Prisma.ProductVariantUpdateInput) {
    return prisma.productVariant.updateMany({
      where: {
        id,
        product: {
          organizationId,
        },
      },
      data,
    });
  }

  /**
   * Soft delete/deactivate a variant
   */
  async deactivate(id: string, organizationId: string) {
    return prisma.productVariant.updateMany({
      where: {
        id,
        product: {
          organizationId,
        },
      },
      data: {
        isActive: false,
      },
    });
  }

  /**
   * Reactivate a variant
   */
  async activate(id: string, organizationId: string) {
    return prisma.productVariant.updateMany({
      where: {
        id,
        product: {
          organizationId,
        },
      },
      data: {
        isActive: true,
      },
    });
  }

  /**
   * Find variant by SKU
   */
  async findBySku(sku: string) {
    return prisma.productVariant.findUnique({
      where: { sku },
      include: {
        product: true,
      },
    });
  }

  /**
   * Find variant by barcode
   */
  async findByBarcode(barcode: string) {
    return prisma.productVariant.findFirst({
      where: { barcode },
      include: {
        product: true,
      },
    });
  }

  /**
   * Check if a variant belongs to an organization (via product)
   */
  async belongsToOrganization(variantId: string, organizationId: string): Promise<boolean> {
    const variant = await prisma.productVariant.findFirst({
      where: {
        id: variantId,
        product: {
          organizationId,
        },
      },
      select: { id: true },
    });

    return !!variant;
  }

  /**
   * Check if SKU is unique (excluding current variant)
   */
  async isSkuUnique(sku: string, excludeId?: string): Promise<boolean> {
    const existing = await prisma.productVariant.findFirst({
      where: {
        sku,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    return !existing;
  }
}

export const productVariantRepository = new ProductVariantRepository();
