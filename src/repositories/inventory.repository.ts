import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

export class InventoryRepository {
  /**
   * Create or get inventory for a store and variant
   * Uses atomic upsert with the unique constraint (storeId, variantId)
   * This prevents race conditions and duplicates
   */
  async findOrCreate(storeId: string, variantId: string, organizationId: string) {
    // Both foreign entities must belong to the current tenant before the
    // composite upsert is allowed to create or return an inventory row.
    const [store, variant] = await Promise.all([
      prisma.store.findFirst({
        where: { id: storeId, organizationId },
        select: { id: true },
      }),
      prisma.productVariant.findFirst({
        where: {
          id: variantId,
          product: { organizationId },
        },
        select: { id: true },
      }),
    ]);

    if (!store || !variant) {
      throw new Error('Store or product variant not found or access denied');
    }

    return prisma.inventory.upsert({
      where: {
        storeId_variantId: {
          storeId,
          variantId,
        },
      },
      create: {
        storeId,
        variantId,
        quantity: 0,
        reservedQuantity: 0,
      },
      update: {},
      include: {
        store: true,
        variant: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  /**
   * Find inventory by ID with organization check
   */
  async findById(id: string, organizationId: string) {
    return prisma.inventory.findFirst({
      where: {
        id,
        store: {
          organizationId,
        },
      },
      include: {
        store: true,
        variant: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  /**
   * Find inventory by store and variant
   */
  async findByStoreAndVariant(storeId: string, variantId: string, organizationId: string) {
    return prisma.inventory.findFirst({
      where: {
        storeId,
        variantId,
        store: {
          organizationId,
        },
      },
      include: {
        store: true,
        variant: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  /**
   * List inventories for a store
   */
  async listByStore(storeId: string, organizationId: string, options: {
    skip?: number;
    take?: number;
  } = {}) {
    const { skip = 0, take = 50 } = options;

    const [inventories, total] = await Promise.all([
      prisma.inventory.findMany({
        where: {
          storeId,
          store: {
            organizationId,
          },
        },
        include: {
          store: true,
          variant: {
            include: {
              product: true,
            },
          },
        },
        skip,
        take,
        orderBy: {
          updatedAt: 'desc',
        },
      }),
      prisma.inventory.count({
        where: {
          storeId,
          store: {
            organizationId,
          },
        },
      }),
    ]);

    return {
      inventories,
      total,
      skip,
      take,
    };
  }

  /**
   * List inventories for an organization
   */
  async listByOrganization(organizationId: string, options: {
    storeId?: string;
    authorizedStoreIds?: string[] | null;
    skip?: number;
    take?: number;
  } = {}) {
    const { storeId, authorizedStoreIds, skip = 0, take = 50 } = options;

    const where: Prisma.InventoryWhereInput = {
      store: {
        organizationId,
      },
    };

    if (storeId) {
      where.storeId = storeId;
    }

    if (authorizedStoreIds != null) {
      if (authorizedStoreIds.length === 0) {
        return { inventories: [], total: 0, skip, take };
      }
      where.storeId = { in: authorizedStoreIds };
      if (storeId) {
        where.storeId = { in: authorizedStoreIds.filter((id: string) => id === storeId) };
      }
    }

    const [inventories, total] = await Promise.all([
      prisma.inventory.findMany({
        where,
        include: {
          store: true,
          variant: {
            include: {
              product: true,
            },
          },
        },
        skip,
        take,
        orderBy: {
          updatedAt: 'desc',
        },
      }),
      prisma.inventory.count({ where }),
    ]);

    return {
      inventories,
      total,
      skip,
      take,
    };
  }

  /**
   * Update inventory quantity (transactional)
   */
  async updateQuantity(id: string, organizationId: string, data: {
    quantity?: number;
    reservedQuantity?: number;
  }) {
    return prisma.inventory.updateMany({
      where: {
        id,
        store: {
          organizationId,
        },
      },
      data,
    });
  }

  /**
   * Check if inventory belongs to organization
   */
  async belongsToOrganization(inventoryId: string, organizationId: string): Promise<boolean> {
    const inventory = await prisma.inventory.findFirst({
      where: {
        id: inventoryId,
        store: {
          organizationId,
        },
      },
      select: { id: true },
    });

    return !!inventory;
  }

  /**
   * Create inventory movement
   */
  async createMovement(data: Prisma.InventoryMovementCreateInput) {
    return prisma.inventoryMovement.create({
      data,
      include: {
        inventory: {
          include: {
            store: true,
            variant: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * List movements for an inventory
   */
  async listMovements(inventoryId: string, organizationId: string, options: {
    type?: string;
    skip?: number;
    take?: number;
  } = {}) {
    const { type, skip = 0, take = 50 } = options;

    const where: Prisma.InventoryMovementWhereInput = {
      inventoryId,
      inventory: {
        store: {
          organizationId,
        },
      },
    };

    if (type) {
      where.type = type;
    }

    const [movements, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where,
        include: {
          inventory: {
            include: {
              store: true,
              variant: {
                include: {
                  product: true,
                },
              },
            },
          },
        },
        skip,
        take,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.inventoryMovement.count({ where }),
    ]);

    return {
      movements,
      total,
      skip,
      take,
    };
  }

  /**
   * Get available quantity for a variant in a store
   */
  async getAvailableQuantity(storeId: string, variantId: string, organizationId: string): Promise<number> {
    const inventory = await prisma.inventory.findFirst({
      where: {
        storeId,
        variantId,
        store: {
          organizationId,
        },
      },
      select: {
        quantity: true,
        reservedQuantity: true,
      },
    });

    if (!inventory) {
      return 0;
    }

    return Math.max(0, inventory.quantity - inventory.reservedQuantity);
  }
}

export const inventoryRepository = new InventoryRepository();
