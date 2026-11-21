import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { generateToken } from '@omnikes/lib/crypto';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { roleRepository } from '@omnikes/repositories/role.repository';
import { requireSubscriptionCapability } from '@omnikes/lib/auth';
import { POST as createPurchase } from '@omnikes/app/api/purchases/route';

describe('Subscription access boundary - PostgreSQL', () => {
  let adminA: { id: string; organizationId: string };
  let cashierA: { id: string; organizationId: string };
  let adminB: { id: string; organizationId: string };
  let originalA: Record<string, unknown>;
  let originalB: Record<string, unknown>;
  const tokens: string[] = [];

  async function requestFor(userId: string) {
    const token = generateToken();
    tokens.push(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await sessionRepository.create({
      user: { connect: { id: userId } },
      expiresAt,
      ipAddress: '127.0.0.1',
      userAgent: 'subscription-access-boundary-test',
    }, token);
    return new NextRequest('http://localhost/api/purchases', {
      method: 'POST',
      headers: { cookie: `auth_token=${token}`, 'content-type': 'application/json' },
      body: '{}',
    });
  }

  beforeAll(async () => {
    const [a, cashier, b] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: 'admin.a@omnikes.test' }, select: { id: true, organizationId: true } }),
      prisma.user.findUniqueOrThrow({ where: { email: 'cashier.a@omnikes.test' }, select: { id: true, organizationId: true } }),
      prisma.user.findUniqueOrThrow({ where: { email: 'admin.b@omnikes.test' }, select: { id: true, organizationId: true } }),
    ]);
    adminA = a;
    cashierA = cashier;
    adminB = b;

    const [orgA, orgB] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: adminA.organizationId } }),
      prisma.organization.findUniqueOrThrow({ where: { id: adminB.organizationId } }),
    ]);
    const fields = ['subscriptionStatus', 'subscriptionPlan', 'subscriptionExpiresAt', 'subscriptionBillingInterval', 'subscriptionCancelAtPeriodEnd', 'subscriptionPendingPlan', 'subscriptionPendingBillingInterval'];
    originalA = Object.fromEntries(fields.map(key => [key, orgA[key as keyof typeof orgA]]));
    originalB = Object.fromEntries(fields.map(key => [key, orgB[key as keyof typeof orgB]]));

    await Promise.all([
      prisma.organization.update({ where: { id: adminA.organizationId }, data: { subscriptionStatus: 'ACTIVE', subscriptionPlan: 'OMNIKES_149', subscriptionExpiresAt: new Date(Date.now() + 86400000) } }),
      prisma.organization.update({ where: { id: adminB.organizationId }, data: { subscriptionStatus: 'ACTIVE', subscriptionPlan: 'OMNIKES_299', subscriptionExpiresAt: new Date(Date.now() + 86400000) } }),
    ]);
  });

  it('derives entitlements from the authenticated tenant, not another tenant ID', async () => {
    const reqA = await requestFor(adminA.id);
    const reqB = await requestFor(adminB.id);
    await expect(requireSubscriptionCapability(reqA, 'purchases.manage', 'WRITE'))
      .rejects.toThrow('Subscription entitlement required: purchases.manage');
    await expect(requireSubscriptionCapability(reqB, 'purchases.manage', 'WRITE')).resolves.toBeUndefined();
  });

  it('returns 402 when the plan is insufficient even for a tenant administrator', async () => {
    expect(await roleRepository.hasPermission(adminA.id, 'purchase.manage')).toBe(true);
    const response = await createPurchase(await requestFor(adminA.id));
    expect(response.status).toBe(402);
  });

  it('returns 403 when the role is insufficient even on an Enterprise plan', async () => {
    expect(await roleRepository.hasPermission(cashierA.id, 'purchase.manage')).toBe(false);
    const response = await createPurchase(await requestFor(cashierA.id));
    expect(response.status).toBe(403);
  });

  afterAll(async () => {
    await Promise.all(tokens.map(token => sessionRepository.revoke(token).catch(() => undefined)));
    if (originalA) await prisma.organization.update({ where: { id: adminA.organizationId }, data: originalA as never }).catch(() => undefined);
    if (originalB) await prisma.organization.update({ where: { id: adminB.organizationId }, data: originalB as never }).catch(() => undefined);
    await prisma.$disconnect();
  });
});
