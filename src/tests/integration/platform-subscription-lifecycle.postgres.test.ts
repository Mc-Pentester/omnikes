import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { platformOperatorBootstrapService } from '@omnikes/services/platform-operator-bootstrap.service';
import { platformSubscriptionService } from '@omnikes/services/platform-subscription.service';
import { evaluateSubscriptionEntitlement } from '@omnikes/services/subscription-entitlement.service';

describe('Subscription lifecycle PostgreSQL', () => {
  const suffix = Date.now().toString();
  let operatorOrg = '';
  let operatorUser = '';
  let tenantOrg = '';

  beforeAll(async () => {
    const [op, tenant] = await Promise.all([
      prisma.organization.create({ data: { name: `Lifecycle operator ${suffix}`, slug: `life-op-${suffix}`, country: 'HT', currency: 'HTG', locale: 'fr-HT', timezone: 'America/Port-au-Prince' }, select: { id: true } }),
      prisma.organization.create({ data: { name: `Lifecycle tenant ${suffix}`, slug: `life-tenant-${suffix}`, country: 'HT', currency: 'HTG', locale: 'fr-HT', timezone: 'America/Port-au-Prince', subscriptionStatus: 'ACTIVE', subscriptionPlan: 'OMNIKES_249', subscriptionBillingInterval: 'ANNUAL', subscriptionExpiresAt: new Date('2099-12-31T23:59:59.999Z') }, select: { id: true } }),
    ]);
    operatorOrg = op.id;
    tenantOrg = tenant.id;
    const result = await platformOperatorBootstrapService.bootstrap({
      organizationId: operatorOrg,
      email: `life.operator.${suffix}@omnikes.test`,
      name: 'Lifecycle operator',
      password: 'LifecycleOperator!2026',
    });
    operatorUser = result.userId;
  });

  it('keeps the current plan active while a downgrade is pending and applies it at renewal', async () => {
    const pending = await platformSubscriptionService.update(tenantOrg, operatorUser, { action: 'CHANGE_PLAN', plan: 'OMNIKES_149', billingInterval: 'ANNUAL' });
    expect(pending.subscriptionPlan).toBe('OMNIKES_249');
    expect(pending.subscriptionPendingPlan).toBe('OMNIKES_149');
    expect(evaluateSubscriptionEntitlement(pending, 'purchases.manage', 'WRITE')).toEqual({ allowed: true, reason: 'PLAN_INCLUDED' });

    const renewed = await platformSubscriptionService.update(tenantOrg, operatorUser, { action: 'ACTIVATE', plan: 'OMNIKES_249', billingInterval: 'MONTHLY', expiresAt: '2099-12-31' });
    expect(renewed.subscriptionPlan).toBe('OMNIKES_149');
    expect(renewed.subscriptionBillingInterval).toBe('ANNUAL');
    expect(renewed.subscriptionPendingPlan).toBeNull();
    expect(renewed.subscriptionPendingBillingInterval).toBeNull();
    expect(evaluateSubscriptionEntitlement(renewed, 'purchases.manage', 'WRITE')).toEqual({ allowed: false, reason: 'CAPABILITY_NOT_INCLUDED' });
  });

  it('schedules cancellation without cutting access before expiry and preserves read/export afterwards', async () => {
    await prisma.organization.update({ where: { id: tenantOrg }, data: { subscriptionStatus: 'ACTIVE', subscriptionPlan: 'OMNIKES_249', subscriptionExpiresAt: new Date('2099-12-31T23:59:59.999Z'), subscriptionCancelAtPeriodEnd: false } });
    const cancelled = await platformSubscriptionService.update(tenantOrg, operatorUser, { action: 'CANCEL' });
    expect(cancelled.subscriptionStatus).toBe('ACTIVE');
    expect(cancelled.subscriptionCancelAtPeriodEnd).toBe(true);
    expect(evaluateSubscriptionEntitlement(cancelled, 'purchases.manage', 'WRITE')).toEqual({ allowed: true, reason: 'PLAN_INCLUDED' });

    const expired = { ...cancelled, subscriptionExpiresAt: new Date('2020-01-01T00:00:00.000Z') };
    expect(evaluateSubscriptionEntitlement(expired, 'pos.sales', 'WRITE')).toEqual({ allowed: false, reason: 'SUBSCRIPTION_EXPIRED' });
    expect(evaluateSubscriptionEntitlement(expired, 'data.read', 'READ')).toEqual({ allowed: true, reason: 'HISTORICAL_READ_ONLY' });
    expect(evaluateSubscriptionEntitlement(expired, 'data.export', 'EXPORT')).toEqual({ allowed: true, reason: 'HISTORICAL_READ_ONLY' });
  });

  it('writes auditable records for downgrade, renewal and cancellation', async () => {
    const entries = await prisma.auditLog.findMany({ where: { userId: operatorUser, organizationId: tenantOrg }, orderBy: { createdAt: 'asc' }, select: { action: true, entityId: true, metadata: true } });
    expect(entries.map(x => x.action)).toEqual([
      'ORGANIZATION_SUBSCRIPTION_PLAN_CHANGED_OR_SCHEDULED',
      'ORGANIZATION_SUBSCRIPTION_ACTIVATED',
      'ORGANIZATION_SUBSCRIPTION_CANCELLATION_SCHEDULED',
    ]);
    for (const entry of entries) {
      expect(entry.entityId).toBe(tenantOrg);
      expect(entry.metadata).toEqual({ authorizationScope: 'PLATFORM', permission: 'organization.subscription.manage' });
    }
  });

  afterAll(async () => {
    if (operatorUser) await prisma.user.delete({ where: { id: operatorUser } }).catch(() => undefined);
    for (const id of [tenantOrg, operatorOrg]) if (id) await prisma.organization.delete({ where: { id } }).catch(() => undefined);
    await prisma.$disconnect();
  });
});
