import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

export class StoreRepository {
  /**
   * List stores for an organization
   */
  async listByOrganization(organizationId: string, options: {
    isActive?: boolean;
    skip?: number;
    take?: number;
  } = {}) {
    const { isActive, skip = 0, take = 50 } = options;

    const where: Prisma.StoreWhereInput = {
      organizationId,
    };

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const [stores, total] = await Promise.all([
      prisma.store.findMany({
        where,
        skip,
        take,
        orderBy: {
          name: 'asc',
        },
      }),
      prisma.store.count({ where }),
    ]);

    return {
      stores,
      total,
      skip,
      take,
    };
  }

  /**
   * Find a store by ID with organization check
   */
  async findById(id: string, organizationId: string) {
    return prisma.store.findFirst({
      where: {
        id,
        organizationId,
      },
    });
  }

  /**
   * Find a store by code with organization check
   */
  async findByCode(code: string, organizationId: string) {
    return prisma.store.findFirst({
      where: {
        code,
        organizationId,
      },
    });
  }

  /**
   * Check if a store belongs to an organization
   */
  async belongsToOrganization(storeId: string, organizationId: string): Promise<boolean> {
    const store = await prisma.store.findFirst({
      where: {
        id: storeId,
        organizationId,
      },
      select: { id: true },
    });

    return !!store;
  }

  /**
   * Create a new store
   */
  async create(data: Prisma.StoreCreateInput) {
    return prisma.store.create({
      data,
    });
  }

  /**
   * Update a store
   */
  async update(id: string, organizationId: string, data: Prisma.StoreUpdateInput) {
    return prisma.store.updateMany({
      where: {
        id,
        organizationId,
      },
      data,
    });
  }

  /**
   * Deactivate a store (soft delete)
   */
  async deactivate(id: string, organizationId: string) {
    return prisma.store.updateMany({
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
   * Activate a store
   */
  async activate(id: string, organizationId: string) {
    return prisma.store.updateMany({
      where: {
        id,
        organizationId,
      },
      data: {
        isActive: true,
      },
    });
  }
}

export const storeRepository = new StoreRepository();
