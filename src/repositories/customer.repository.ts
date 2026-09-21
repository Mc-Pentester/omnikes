import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

export class CustomerRepository {
  /**
   * Find a customer by ID with organization check
   */
  async findById(id: string, organizationId: string) {
    return prisma.customer.findFirst({
      where: {
        id,
        organizationId,
        isActive: true,
      },
    });
  }

  /**
   * Check if a customer belongs to an organization
   */
  async belongsToOrganization(customerId: string, organizationId: string): Promise<boolean> {
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        organizationId,
      },
      select: { id: true },
    });

    return !!customer;
  }

  /**
   * List customers for an organization
   */
  async listByOrganization(organizationId: string, options: {
    search?: string;
    skip?: number;
    take?: number;
  } = {}) {
    const where: Prisma.CustomerWhereInput = {
      organizationId,
      isActive: true,
    };

    if (options.search) {
      where.name = {
        contains: options.search,
        mode: 'insensitive',
      };
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: options.skip,
        take: options.take,
        orderBy: { name: 'asc' },
      }),
      prisma.customer.count({ where }),
    ]);

    return { customers, total };
  }

  /**
   * Create a new customer
   */
  async create(data: Prisma.CustomerCreateInput) {
    return prisma.customer.create({
      data,
    });
  }

  /**
   * Update a customer
   */
  async update(id: string, organizationId: string, data: Prisma.CustomerUpdateInput) {
    return prisma.customer.updateMany({
      where: {
        id,
        organizationId,
      },
      data,
    });
  }

  /**
   * Delete (soft delete) a customer
   */
  async delete(id: string, organizationId: string) {
    return prisma.customer.updateMany({
      where: {
        id,
        organizationId,
      },
      data: {
        isActive: false,
      },
    });
  }
}

export const customerRepository = new CustomerRepository();
