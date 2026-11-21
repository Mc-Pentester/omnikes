import { Prisma } from '@prisma/client';
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

const PLAN_LEVEL: Record<string, number> = { OMNIKES_149: 1, OMNIKES_249: 2, OMNIKES_299: 3 };

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
        subscriptionPendingPlan: true,
        subscriptionPendingBillingInterval: true,
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
        subscriptionPendingPlan: true,
        subscriptionPendingBillingInterval: true,
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
        subscriptionPendingPlan: true,
        subscriptionPendingBillingInterval: true,
      },
    });

    if (!existing) throw new Error('Organization not found');

    if (data.action === 'CANCEL' && existing.subscriptionStatus !== 'ACTIVE') throw new Error('Only an active subscription can be cancelled');
    if (data.action === 'CHANGE_PLAN' && existing.subscriptionStatus !== 'ACTIVE') throw new Error('Only an active subscription can change plans');

    let next: Prisma.OrganizationUpdateInput;
    if (data.action === 'ACTIVATE') {
      next = {
        subscriptionStatus: 'ACTIVE',
        subscriptionPlan: existing.subscriptionPendingPlan ?? data.plan,
        subscriptionExpiresAt: parseExpirationDate(data.expiresAt),
        subscriptionBillingInterval: existing.subscriptionPendingBillingInterval ?? data.billingInterval,
        subscriptionCancelAtPeriodEnd: false,
        subscriptionPendingPlan: null,
        subscriptionPendingBillingInterval: null,
      };
    } else if (data.action === 'CANCEL') {
      next = { subscriptionCancelAtPeriodEnd: true };
    } else {
      if (!existing.subscriptionPlan || !(existing.subscriptionPlan in PLAN_LEVEL)) {
        throw new Error('Current subscription plan is unknown; renew it before changing plans');
      }
      const downgrade = PLAN_LEVEL[data.plan] < PLAN_LEVEL[existing.subscriptionPlan];
      next = downgrade
        ? { subscriptionPendingPlan: data.plan, subscriptionPendingBillingInterval: data.billingInterval }
        : {
            subscriptionPlan: data.plan,
            subscriptionBillingInterval: data.billingInterval,
            subscriptionPendingPlan: null,
            subscriptionPendingBillingInterval: null,
          };
    }

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
        subscriptionPendingPlan: true,
        subscriptionPendingBillingInterval: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          organizationId,
          action: data.action === 'ACTIVATE'
            ? 'ORGANIZATION_SUBSCRIPTION_ACTIVATED'
            : data.action === 'CANCEL'
              ? 'ORGANIZATION_SUBSCRIPTION_CANCELLATION_SCHEDULED'
              : 'ORGANIZATION_SUBSCRIPTION_PLAN_CHANGED_OR_SCHEDULED',
          module: 'subscription',
          entityId: organizationId,
          entityType: 'Organization',
          oldValues: {
            subscriptionStatus: existing.subscriptionStatus,
            subscriptionPlan: existing.subscriptionPlan,
            subscriptionExpiresAt: existing.subscriptionExpiresAt,
            subscriptionBillingInterval: existing.subscriptionBillingInterval,
            subscriptionCancelAtPeriodEnd: existing.subscriptionCancelAtPeriodEnd,
            subscriptionPendingPlan: existing.subscriptionPendingPlan,
            subscriptionPendingBillingInterval: existing.subscriptionPendingBillingInterval,
          },
          newValues: {
            subscriptionStatus: organization.subscriptionStatus,
            subscriptionPlan: organization.subscriptionPlan,
            subscriptionExpiresAt: organization.subscriptionExpiresAt,
            subscriptionBillingInterval: organization.subscriptionBillingInterval,
            subscriptionCancelAtPeriodEnd: organization.subscriptionCancelAtPeriodEnd,
            subscriptionPendingPlan: organization.subscriptionPendingPlan,
            subscriptionPendingBillingInterval: organization.subscriptionPendingBillingInterval,
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
