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
        subscriptionBillingInterval: true,
        subscriptionCancelAtPeriodEnd: true,
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
        subscriptionBillingInterval: true,
        subscriptionCancelAtPeriodEnd: true,
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
        subscriptionBillingInterval: true,
        subscriptionCancelAtPeriodEnd: true,
      },
    });

    if (!existing) throw new Error('Organization not found');

    if (data.action === 'CANCEL' && existing.subscriptionStatus !== 'ACTIVE') {
      throw new Error('Only an active subscription can be cancelled');
    }

    const next = data.action === 'ACTIVATE'
      ? {
          subscriptionStatus: 'ACTIVE',
          subscriptionPlan: data.plan,
          subscriptionExpiresAt: parseExpirationDate(data.expiresAt),
          subscriptionBillingInterval: data.billingInterval,
          subscriptionCancelAtPeriodEnd: false,
        }
      : {
          // Cancellation is scheduled for the already-paid-through date.
          // The current plan remains valid until its expiration timestamp.
          subscriptionStatus: existing.subscriptionStatus,
          subscriptionPlan: existing.subscriptionPlan,
          subscriptionExpiresAt: existing.subscriptionExpiresAt,
          subscriptionBillingInterval: existing.subscriptionBillingInterval,
          subscriptionCancelAtPeriodEnd: true,
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
          subscriptionBillingInterval: true,
          subscriptionCancelAtPeriodEnd: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          organizationId,
          action: data.action === 'ACTIVATE'
            ? 'ORGANIZATION_SUBSCRIPTION_ACTIVATED'
            : 'ORGANIZATION_SUBSCRIPTION_CANCELLATION_SCHEDULED',
          module: 'subscription',
          entityId: organizationId,
          entityType: 'Organization',
          oldValues: {
            subscriptionStatus: existing.subscriptionStatus,
            subscriptionPlan: existing.subscriptionPlan,
            subscriptionExpiresAt: existing.subscriptionExpiresAt,
            subscriptionBillingInterval: existing.subscriptionBillingInterval,
            subscriptionCancelAtPeriodEnd: existing.subscriptionCancelAtPeriodEnd,
          },
          newValues: {
            subscriptionStatus: organization.subscriptionStatus,
            subscriptionPlan: organization.subscriptionPlan,
            subscriptionExpiresAt: organization.subscriptionExpiresAt,
            subscriptionBillingInterval: organization.subscriptionBillingInterval,
            subscriptionCancelAtPeriodEnd: organization.subscriptionCancelAtPeriodEnd,
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
