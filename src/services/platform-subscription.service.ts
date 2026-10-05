import { prisma } from '@omnikes/lib/prisma';
import { adminSubscriptionUpdateSchema, AdminSubscriptionUpdateInput } from '@omnikes/lib/validation';
import {
  platformRoleRepository,
  PLATFORM_SUBSCRIPTION_PERMISSION,
} from '@omnikes/repositories/platform-role.repository';

function parseExpirationDate(value: string): Date {
  const date = new Date(`${value}T23:59:59.999Z`);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid expiration date');
  if (date.getTime() <= Date.now()) throw new Error('Expiration date must be in the future');
  return date;
}

function requirePlatformManage(allowed: boolean) {
  if (!allowed) throw new Error(`Permission required: ${PLATFORM_SUBSCRIPTION_PERMISSION}`);
}

export class PlatformSubscriptionService {
  async list(actorUserId: string) {
    requirePlatformManage(
      await platformRoleRepository.hasPermission(actorUserId, PLATFORM_SUBSCRIPTION_PERMISSION),
    );

    return prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        country: true,
        currency: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        subscriptionExpiresAt: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async get(organizationId: string, actorUserId: string) {
    requirePlatformManage(
      await platformRoleRepository.hasPermission(actorUserId, PLATFORM_SUBSCRIPTION_PERMISSION),
    );

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        country: true,
        currency: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        subscriptionExpiresAt: true,
      },
    });

    if (!organization) throw new Error('Organization not found');
    return organization;
  }

  async update(
    organizationId: string,
    actorUserId: string,
    input: AdminSubscriptionUpdateInput,
  ) {
    requirePlatformManage(
      await platformRoleRepository.hasPermission(actorUserId, PLATFORM_SUBSCRIPTION_PERMISSION),
    );

    const data = adminSubscriptionUpdateSchema.parse(input);
    const existing = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        subscriptionExpiresAt: true,
      },
    });

    if (!existing) throw new Error('Organization not found');

    const next = data.action === 'ACTIVATE'
      ? {
          subscriptionStatus: 'ACTIVE',
          subscriptionPlan: data.plan,
          subscriptionExpiresAt: parseExpirationDate(data.expiresAt),
        }
      : {
          subscriptionStatus: 'CANCELLED',
          subscriptionPlan: existing.subscriptionPlan,
          subscriptionExpiresAt: existing.subscriptionExpiresAt,
        };

    return prisma.$transaction(async (tx) => {
      const organization = await tx.organization.update({
        where: { id: organizationId },
        data: next,
        select: {
          id: true,
          name: true,
          slug: true,
          country: true,
          currency: true,
          subscriptionStatus: true,
          subscriptionPlan: true,
          subscriptionExpiresAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          organizationId,
          action: data.action === 'ACTIVATE'
            ? 'ORGANIZATION_SUBSCRIPTION_ACTIVATED'
            : 'ORGANIZATION_SUBSCRIPTION_CANCELLED',
          module: 'subscription',
          entityId: organizationId,
          entityType: 'Organization',
          oldValues: {
            subscriptionStatus: existing.subscriptionStatus,
            subscriptionPlan: existing.subscriptionPlan,
            subscriptionExpiresAt: existing.subscriptionExpiresAt,
          },
          newValues: {
            subscriptionStatus: organization.subscriptionStatus,
            subscriptionPlan: organization.subscriptionPlan,
            subscriptionExpiresAt: organization.subscriptionExpiresAt,
          },
          metadata: {
            authorizationScope: 'PLATFORM',
            permission: PLATFORM_SUBSCRIPTION_PERMISSION,
          },
        },
      });

      return organization;
    });
  }
}

export const platformSubscriptionService = new PlatformSubscriptionService();
