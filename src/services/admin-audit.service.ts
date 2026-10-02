import { auditLogRepository, AuditLogListFilters } from '@omnikes/repositories/audit-log.repository';
import { roleRepository } from '@omnikes/repositories/role.repository';

export interface AdminAuditFilters {
  search?: string;
  action?: string;
  module?: string;
  storeId?: string;
  from?: string;
  to?: string;
  page?: number;
  take?: number;
}

export class AdminAuditService {
  private async requireAccess(actorUserId: string) {
    const roles = await roleRepository.getUserRoles(actorUserId);
    const allowed = roles.some((role) => role.isGlobal && role.permissions.includes('audit.read'));
    if (!allowed) throw new Error('Permission required: audit.read');
  }

  async list(organizationId: string, actorUserId: string, input: AdminAuditFilters) {
    await this.requireAccess(actorUserId);

    const take = Math.min(Math.max(input.take ?? 50, 1), 100);
    const page = Math.max(input.page ?? 1, 1);
    const search = input.search?.trim().slice(0, 200) || undefined;

    let from: Date | undefined;
    let to: Date | undefined;
    if (input.from) {
      from = new Date(input.from);
      if (Number.isNaN(from.getTime())) throw new Error('Invalid from date');
    }
    if (input.to) {
      to = new Date(input.to);
      if (Number.isNaN(to.getTime())) throw new Error('Invalid to date');
      to.setDate(to.getDate() + 1);
    }

    const filters: AuditLogListFilters = {
      search,
      action: input.action || undefined,
      module: input.module || undefined,
      storeId: input.storeId || undefined,
      from,
      to,
      take,
      skip: (page - 1) * take,
    };

    const [result, facets] = await Promise.all([
      auditLogRepository.listByOrganization(organizationId, filters),
      auditLogRepository.listFacets(organizationId),
    ]);

    return {
      items: result.items,
      total: result.total,
      page,
      take,
      totalPages: Math.ceil(result.total / take),
      facets,
    };
  }
}

export const adminAuditService = new AdminAuditService();
