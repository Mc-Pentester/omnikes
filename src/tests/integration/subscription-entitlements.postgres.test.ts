import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { authService } from '@omnikes/services/auth.service';
import { requireSubscriptionCapability } from '@omnikes/lib/auth';

describe('Subscription entitlements PostgreSQL runtime', () => {
  const suffix = Date.now().toString();
  const email = `subscription.entitlements.${suffix}@omnikes.test`;
  const password = 'SubscriptionEntitlements!2026';
  let organizationId = '';
  let userId = '';
  let sessionToken = '';

  const request = () => new NextRequest('http://localhost/api/subscription-test', {
    headers: { cookie: `auth_token=${sessionToken}` },
  });

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: {
        name: `Subscription Entitlements ${suffix}`,
        slug: `subscription-entitlements-${suffix}`,
        country: 'HT',
        currency: 'HTG',
        locale: 'fr-HT',
        timezone: 'America/Port-au-Prince',
        subscriptionStatus: 'TRIAL',
        subscriptionPlan: 'OMNIKES_249',
        subscriptionTrialStartedAt: new Date(),
        subscriptionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      select: { id: true },
    });
    organizationId = organization.id;

    const user = await prisma.user.create({
      data: {
        email,
        name: 'Subscription Entitlements Test',
        password: await authService.hashPassword(password),
        organizationId,
        isActive: true,
      },
      select: { id: true },
    });
    userId = user.id;

    const login = await authService.login(email, password, '127.0.0.1', 'subscription-entitlements-test');
    sessionToken = login.token;
  });

  it('allows Professional trial capabilities and denies Enterprise-only capabilities', async () => {
    const req = request();
    await expect(requireSubscriptionCapability(req, 'purchases.manage', 'WRITE')).resolves.toBeUndefined();
    await expect(requireSubscriptionCapability(req, 'analytics.consolidated', 'WRITE'))
      .rejects.toThrow('Subscription entitlement required: analytics.consolidated');
  });

  it('enforces Essential versus Professional capabilities using current PostgreSQL state', async () => {
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        subscriptionStatus: 'ACTIVE',
        subscriptionPlan: 'OMNIKES_149',
        subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    const req = request();
    await expect(requireSubscriptionCapability(req, 'inventory.core', 'WRITE')).resolves.toBeUndefined();
    await expect(requireSubscriptionCapability(req, 'inventory.transfers', 'WRITE'))
      .rejects.toThrow('Subscription entitlement required: inventory.transfers');
  });

  it('blocks new writes after expiry without requiring an internet service', async () => {
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        subscriptionStatus: 'ACTIVE',
        subscriptionPlan: 'OMNIKES_249',
        subscriptionExpiresAt: new Date(Date.now() - 1000),
      },
    });
    await expect(requireSubscriptionCapability(request(), 'pos.sales', 'WRITE'))
      .rejects.toThrow('Subscription entitlement required: pos.sales');
  });

  it('retains Essential access for grandfathered existing installations', async () => {
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        subscriptionStatus: 'LEGACY',
        subscriptionPlan: 'OMNIKES_149',
        subscriptionExpiresAt: null,
      },
    });
    const req = request();
    await expect(requireSubscriptionCapability(req, 'pos.sales', 'WRITE')).resolves.toBeUndefined();
    await expect(requireSubscriptionCapability(req, 'purchases.manage', 'WRITE'))
      .rejects.toThrow('Subscription entitlement required: purchases.manage');
  });

  afterAll(async () => {
    if (sessionToken) await authService.logout(sessionToken).catch(() => undefined);
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    await prisma.$disconnect();
  });
});
