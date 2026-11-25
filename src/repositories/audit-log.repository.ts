import { prisma } from '@omnikes/lib/prisma';

export interface AuditLogListFilters {
  search?: string;
  action?: string;
  module?: string;
  storeId?: string;
  from?: Date;
  to?: Date;
  take: number;
  skip: number;
}

export class AuditLogRepository {
  async listByOrganization(organizationId: string, filters: AuditLogListFilters) {
    const where = {
      organizationId,
      ...(filters.search
        ? {
            OR: [
              { action: { contains: filters.search, mode: 'insensitive' as const } },
              { module: { contains: filters.search, mode: 'insensitive' as const } },
              { entityId: { contains: filters.search, mode: 'insensitive' as const } },
              { entityType: { contains: filters.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.module ? { module: filters.module } : {}),
      ...(filters.storeId ? { storeId: filters.storeId } : {}),
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lt: filters.to } : {}) } }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: filters.skip,
        take: filters.take,
        select: {
          id: true,
          userId: true,
          organizationId: true,
          storeId: true,
          action: true,
          module: true,
          entityId: true,
          entityType: true,
          oldValues: true,
          newValues: true,
          metadata: true,
          ipAddress: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { items, total };
  }

  async listFacets(organizationId: string) {
    const [actions, modules, stores] = await Promise.all([
      prisma.auditLog.findMany({
        where: { organizationId },
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
      prisma.auditLog.findMany({
        where: { organizationId },
        distinct: ['module'],
        select: { module: true },
        orderBy: { module: 'asc' },
      }),
      prisma.store.findMany({
        where: { organizationId },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      actions: actions.map((item) => item.action),
      modules: modules.map((item) => item.module),
      stores,
    };
  }
}

export const auditLogRepository = new AuditLogRepository();
