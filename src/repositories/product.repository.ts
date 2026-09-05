import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

export class ProductRepository {
  /**
   * Create a new product
   */
  async create(data: Prisma.ProductCreateInput) {
    return prisma.product.create({
      data,
      include: {
        variants: true,
      },
    });
  }

  /**
   * Find a product by ID within an organization
   */
  async findById(id: string, organizationId: string) {
    return prisma.product.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        variants: true,
      },
    });
  }

  /**
   * Find a product by ID (without organization check - use with caution)
   */
  async findByIdUnsafe(id: string) {
    return prisma.product.findUnique({
      where: { id },
      include: {
        variants: true,
      },
    });
  }

  /**
   * List products for an organization with optional filters
   */
  async listByOrganization(organizationId: string, options: {
    search?: string;
    category?: string;
    isActive?: boolean;
    skip?: number;
    take?: number;
  } = {}) {
    const { search, category, isActive, skip = 0, take = 50 } = options;

    const where: Prisma.ProductWhereInput = {
      organizationId,
    };

    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    if (category) {
      where.category = category;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          variants: true,
        },
        skip,
        take,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.product.count({ where }),
    ]);

    return {
      products,
      total,
      skip,
      take,
    };
  }

  /**
   * Update a product
   */
  async update(id: string, organizationId: string, data: Prisma.ProductUpdateInput) {
    return prisma.product.updateMany({
      where: {
        id,
        organizationId,
      },
      data,
    });
  }

  /**
   * Soft delete/deactivate a product
   */
  async deactivate(id: string, organizationId: string) {
    return prisma.product.updateMany({
      where: {
        id,
        organizationId,
      },
      data: {
        isActive: false,
      },
    });
  }

  /**
   * Reactivate a product
   */
  async activate(id: string, organizationId: string) {
    return prisma.product.updateMany({
      where: {
        id,
        organizationId,
      },
      data: {
        isActive: true,
      },
    });
  }

  /**
   * Check if a product belongs to an organization
   */
  async belongsToOrganization(productId: string, organizationId: string): Promise<boolean> {
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        organizationId,
      },
      select: { id: true },
    });

    return !!product;
  }
}

export const productRepository = new ProductRepository();
