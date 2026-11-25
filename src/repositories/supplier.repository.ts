import { prisma } from '@omnikes/lib/prisma';
import { Prisma } from '@prisma/client';

export class SupplierRepository {
  async findById(id: string, organizationId: string, includeInactive = false) {
    return prisma.supplier.findFirst({
      where: { id, organizationId, ...(includeInactive ? {} : { isActive: true }) },
    });
  }

  async listByOrganization(
    organizationId: string,
    options: { search?: string; includeInactive?: boolean; skip?: number; take?: number } = {},
  ) {
    const where: Prisma.SupplierWhereInput = {
      organizationId,
      ...(options.includeInactive ? {} : { isActive: true }),
    };

    if (options.search) {
      where.OR = [
        { name: { contains: options.search, mode: 'insensitive' } },
        { code: { contains: options.search, mode: 'insensitive' } },
        { email: { contains: options.search, mode: 'insensitive' } },
        { phone: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip: options.skip,
        take: options.take,
        orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.supplier.count({ where }),
    ]);

    return { suppliers, total };
  }

  async create(data: Prisma.SupplierCreateInput) {
    return prisma.supplier.create({ data });
  }

  async update(id: string, organizationId: string, data: Prisma.SupplierUpdateInput) {
    const result = await prisma.supplier.updateMany({
      where: { id, organizationId },
      data,
    });
    if (result.count === 0) return null;
    return prisma.supplier.findFirst({ where: { id, organizationId } });
  }

  async deactivate(id: string, organizationId: string) {
    return this.update(id, organizationId, { isActive: false });
  }
}

export const supplierRepository = new SupplierRepository();
