import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { platformOperatorBootstrapService } from '@omnikes/services/platform-operator-bootstrap.service';
import { platformSubscriptionService } from '@omnikes/services/platform-subscription.service';
import { evaluateSubscriptionEntitlement } from '@omnikes/services/subscription-entitlement.service';

describe('Platform free license PostgreSQL lifecycle', () => {
  const suffix = Date.now().toString();
  let operatorOrg = '';
  let operatorUser = '';
  let tenantOrg = '';

  beforeAll(async () => {
    const [op, tenant] = await Promise.all([
      prisma.organization.create({ data: { name: `Free license operator ${suffix}`, slug: `free-op-${suffix}`, country: 'HT', currency: 'HTG' }, select: { id: true } }),
      prisma.organization.create({ data: { name: `Free license tenant ${suffix}`, slug: `free-tenant-${suffix}`, country: 'HT', currency: 'HTG' }, select: { id: true } }),
    ]);
    operatorOrg = op.id;
    tenantOrg = tenant.id;
    const result = await platformOperatorBootstrapService.bootstrap({
      organizationId: operatorOrg,
      email: `free.operator.${suffix}@omnikes.test`,
      name: 'Free license operator',
      password: 'FreeLicenseOperator!2026',
    });
    operatorUser = result.userId;
  });

  it('grants a perpetual free license, records its reason and revokes it safely', async () => {
    const granted = await platformSubscriptionService.update(tenantOrg, operatorUser, {
      action: 'GRANT_FREE',
      reason: 'Partenaire pilote OmniKes',
    });
    expect(granted.subscriptionStatus).toBe('FREE');
    expect(granted.subscriptionPlan).toBeNull();
    expect(granted.subscriptionExpiresAt).toBeNull();
    expect(granted.freeLicenseReason).toBe('Partenaire pilote OmniKes');
    expect(granted.freeLicenseGrantedBy).toBe(operatorUser);
    expect(granted.freeLicenseGrantedAt).toBeInstanceOf(Date);

    expect(evaluateSubscriptionEntitlement(granted, 'pos.sales', 'WRITE')).toEqual({ allowed: true, reason: 'PLAN_INCLUDED' });
    expect(evaluateSubscriptionEntitlement(granted, 'analytics.consolidated', 'WRITE')).toEqual({ allowed: true, reason: 'PLAN_INCLUDED' });

    const revoked = await platformSubscriptionService.update(tenantOrg, operatorUser, { action: 'REVOKE_FREE' });
    expect(revoked.subscriptionStatus).toBe('EXPIRED');
    expect(revoked.freeLicenseReason).toBeNull();
    expect(evaluateSubscriptionEntitlement(revoked, 'pos.sales', 'WRITE')).toEqual({ allowed: false, reason: 'SUBSCRIPTION_EXPIRED' });
    expect(evaluateSubscriptionEntitlement(revoked, 'data.read', 'READ')).toEqual({ allowed: true, reason: 'HISTORICAL_READ_ONLY' });

    const audit = await prisma.auditLog.findMany({
      where: { userId: operatorUser, organizationId: tenantOrg },
      orderBy: { createdAt: 'asc' },
      select: { action: true, oldValues: true, newValues: true, metadata: true },
    });
    expect(audit.map((entry) => entry.action)).toEqual([
      'ORGANIZATION_FREE_LICENSE_GRANTED',
      'ORGANIZATION_FREE_LICENSE_REVOKED',
    ]);
    expect(audit[0].newValues).toMatchObject({ subscriptionStatus: 'FREE', freeLicenseReason: 'Partenaire pilote OmniKes' });
    expect(audit[1].oldValues).toMatchObject({ subscriptionStatus: 'FREE', freeLicenseReason: 'Partenaire pilote OmniKes' });
    for (const entry of audit) {
      expect(entry.metadata).toEqual({ authorizationScope: 'PLATFORM', permission: 'organization.subscription.manage' });
    }
  });

  it('supports a time-limited free license', async () => {
    const granted = await platformSubscriptionService.update(tenantOrg, operatorUser, {
      action: 'GRANT_FREE',
      reason: 'Programme de démonstration temporaire',
      expiresAt: '2099-12-31',
    });
    expect(granted.subscriptionStatus).toBe('FREE');
    expect(granted.subscriptionExpiresAt).toBeInstanceOf(Date);
    expect(evaluateSubscriptionEntitlement(granted, 'pos.sales', 'WRITE')).toEqual({ allowed: true, reason: 'PLAN_INCLUDED' });
  });

  afterAll(async () => {
    if (operatorUser) await prisma.user.delete({ where: { id: operatorUser } }).catch(() => undefined);
    for (const id of [tenantOrg, operatorOrg]) if (id) await prisma.organization.delete({ where: { id } }).catch(() => undefined);
    await prisma.$disconnect();
  });
});
