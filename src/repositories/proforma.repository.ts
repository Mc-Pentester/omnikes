import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

export class ProformaRepository {
  /**
   * Create a new proforma
   */
  async create(data: Prisma.ProformaCreateInput) {
    return prisma.proforma.create({
      data,
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
  }

  /**
   * Find a proforma by ID with organization check
   */
  async findById(id: string, organizationId: string) {
    return prisma.proforma.findFirst({
      where: {
        id,
        organizationId,
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
        convertedSale: true,
      },
    });
  }

  /**
   * Find a proforma by proforma number with organization check
   */
  async findByProformaNumber(proformaNumber: string, organizationId: string) {
    return prisma.proforma.findFirst({
      where: {
        proformaNumber,
        organizationId,
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
  }

  /**
   * List proformas for an organization with filters
   */
  async listByOrganization(organizationId: string, options: {
    storeId?: string;
    status?: string;
    customerId?: string;
    startDate?: Date;
    endDate?: Date;
    skip?: number;
    take?: number;
  } = {}) {
    const { storeId, status, customerId, startDate, endDate, skip = 0, take = 50 } = options;

    const where: Prisma.ProformaWhereInput = {
      organizationId,
    };

    if (storeId) {
      where.storeId = storeId;
    }

    if (status) {
      where.status = status;
    }

    if (customerId) {
      where.customerId = customerId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    const [proformas, total] = await Promise.all([
      prisma.proforma.findMany({
        where,
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
        skip,
        take,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.proforma.count({ where }),
    ]);

    return {
      proformas,
      total,
      skip,
      take,
    };
  }

  /**
   * Update a proforma
   */
  async update(id: string, organizationId: string, data: Prisma.ProformaUpdateInput) {
    return prisma.proforma.updateMany({
      where: {
        id,
        organizationId,
      },
      data,
    });
  }

  /**
   * Update proforma status
   */
  async updateStatus(id: string, organizationId: string, status: string) {
    return prisma.proforma.updateMany({
      where: {
        id,
        organizationId,
      },
      data: { status },
    });
  }

  /**
   * Check if proforma belongs to organization
   */
  async belongsToOrganization(proformaId: string, organizationId: string): Promise<boolean> {
    const proforma = await prisma.proforma.findFirst({
      where: {
        id: proformaId,
        organizationId,
      },
      select: { id: true },
    });

    return !!proforma;
  }

  /**
   * Create a proforma item
   */
  async createItem(data: Prisma.ProformaItemCreateInput) {
    return prisma.proformaItem.create({
      data,
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
   * Update a proforma item
   */
  async updateItem(id: string, organizationId: string, data: Prisma.ProformaItemUpdateInput) {
    return prisma.proformaItem.updateMany({
      where: {
        id,
        proforma: {
          organizationId,
        },
      },
      data,
    });
  }

  /**
   * Delete a proforma item
   */
  async deleteItem(id: string, organizationId: string) {
    return prisma.proformaItem.deleteMany({
      where: {
        id,
        proforma: {
          organizationId,
        },
      },
    });
  }

  /**
   * List items for a proforma
   */
  async listItems(proformaId: string, organizationId: string) {
    return prisma.proformaItem.findMany({
      where: {
        proformaId,
        proforma: {
          organizationId,
        },
      },
      include: {
        variant: {
          include: {
            product: true,
          },
        },
      },
    });
  }
}

export const proformaRepository = new ProformaRepository();
