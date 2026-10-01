import { prisma } from '@omnikes/lib/prisma';
import { adminOrganizationUpdateSchema, AdminOrganizationUpdateInput } from '@omnikes/lib/validation';
import { roleRepository } from '@omnikes/repositories/role.repository';

export class AdminOrganizationService {
  private async requirePermission(actorUserId: string, permission: string) {
    const allowed = await roleRepository.hasPermission(actorUserId, permission);
    if (!allowed) throw new Error(`Permission required: ${permission}`);
  }

  async get(organizationId: string, actorUserId: string) {
    await this.requirePermission(actorUserId, 'organization.read');

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        country: true,
        currency: true,
        locale: true,
        timezone: true,
        cloudEnabled: true,
        onlineStoreEnabled: true,
        taxConfigurationId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!organization) throw new Error('Organization not found');
    return organization;
  }

  async update(
    organizationId: string,
    actorUserId: string,
    input: AdminOrganizationUpdateInput,
  ) {
    await this.requirePermission(actorUserId, 'organization.update');
    const data = adminOrganizationUpdateSchema.parse(input);

    if (data.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: data.timezone }).format();
      } catch {
        throw new Error('Invalid timezone');
      }
    }

    const existing = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        country: true,
        currency: true,
        locale: true,
        timezone: true,
        cloudEnabled: true,
        onlineStoreEnabled: true,
      },
    });

    if (!existing) throw new Error('Organization not found');

    const updated = await prisma.organization.update({
      where: { id: organizationId },
      data,
      select: {
        id: true,
        name: true,
        slug: true,
        country: true,
        currency: true,
        locale: true,
        timezone: true,
        cloudEnabled: true,
        onlineStoreEnabled: true,
        taxConfigurationId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const oldValues = {
      name: existing.name,
      country: existing.country,
      currency: existing.currency,
      locale: existing.locale,
      timezone: existing.timezone,
      cloudEnabled: existing.cloudEnabled,
      onlineStoreEnabled: existing.onlineStoreEnabled,
    };
    const newValues = {
      name: updated.name,
      country: updated.country,
      currency: updated.currency,
      locale: updated.locale,
      timezone: updated.timezone,
      cloudEnabled: updated.cloudEnabled,
      onlineStoreEnabled: updated.onlineStoreEnabled,
    };

    await prisma.auditLog.create({
      data: {
        userId: actorUserId,
        organizationId,
        action: 'ORGANIZATION_UPDATED',
        module: 'organization',
        entityId: organizationId,
        entityType: 'Organization',
        oldValues,
        newValues,
      },
    });

    return updated;
  }
}

export const adminOrganizationService = new AdminOrganizationService();
