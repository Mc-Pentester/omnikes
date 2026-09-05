import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

export class SaleRepository {
  /**
   * Create a new sale
   */
  async create(data: Prisma.SaleCreateInput) {
    return prisma.sale.create({
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
        payments: true,
      },
    });
  }

  /**
   * Find a sale by ID with organization check
   */
  async findById(id: string, organizationId: string) {
    return prisma.sale.findFirst({
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
        payments: true,
      },
    });
  }

  /**
   * Find a sale by order number with organization check
   */
  async findByOrderNumber(orderNumber: string, organizationId: string) {
    return prisma.sale.findFirst({
      where: {
        orderNumber,
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
        payments: true,
      },
    });
  }

  /**
   * List sales for an organization with filters
   */
  async listByOrganization(organizationId: string, options: {
    storeId?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    customerId?: string;
    skip?: number;
    take?: number;
  } = {}) {
    const { storeId, status, startDate, endDate, customerId, skip = 0, take = 50 } = options;

    const where: Prisma.SaleWhereInput = {
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

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
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
          payments: true,
        },
        skip,
        take,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.sale.count({ where }),
    ]);

    return {
      sales,
      total,
      skip,
      take,
    };
  }

  /**
   * Update a sale
   */
  async update(id: string, organizationId: string, data: Prisma.SaleUpdateInput) {
    return prisma.sale.updateMany({
      where: {
        id,
        organizationId,
      },
      data,
    });
  }

  /**
   * Update sale status
   */
  async updateStatus(id: string, organizationId: string, status: string) {
    return prisma.sale.updateMany({
      where: {
        id,
        organizationId,
      },
      data: { status },
    });
  }

  /**
   * Check if sale belongs to organization
   */
  async belongsToOrganization(saleId: string, organizationId: string): Promise<boolean> {
    const sale = await prisma.sale.findFirst({
      where: {
        id: saleId,
        organizationId,
      },
      select: { id: true },
    });

    return !!sale;
  }

  /**
   * Create a sale item
   */
  async createItem(data: Prisma.SaleItemCreateInput) {
    return prisma.saleItem.create({
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
   * Update a sale item
   */
  async updateItem(id: string, organizationId: string, data: Prisma.SaleItemUpdateInput) {
    return prisma.saleItem.updateMany({
      where: {
        id,
        sale: {
          organizationId,
        },
      },
      data,
    });
  }

  /**
   * Delete a sale item
   */
  async deleteItem(id: string, organizationId: string) {
    return prisma.saleItem.deleteMany({
      where: {
        id,
        sale: {
          organizationId,
        },
      },
    });
  }

  /**
   * List items for a sale
   */
  async listItems(saleId: string, organizationId: string) {
    return prisma.saleItem.findMany({
      where: {
        saleId,
        sale: {
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

  /**
   * Create a payment
   */
  async createPayment(data: Prisma.PaymentCreateInput) {
    return prisma.payment.create({
      data,
      include: {
        sale: true,
      },
    });
  }

  /**
   * List payments for a sale
   */
  async listPayments(saleId: string, organizationId: string) {
    return prisma.payment.findMany({
      where: {
        saleId,
        sale: {
          organizationId,
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Get total paid for a sale
   */
  async getTotalPaid(saleId: string, organizationId: string): Promise<number> {
    const payments = await prisma.payment.findMany({
      where: {
        saleId,
        sale: {
          organizationId,
        },
        status: 'COMPLETED',
      },
      select: { amount: true },
    });

    return payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  }
}

export const saleRepository = new SaleRepository();
