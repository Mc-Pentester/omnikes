import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { authService } from '@omnikes/services/auth.service';
import { platformOperatorBootstrapService } from '@omnikes/services/platform-operator-bootstrap.service';
import { GET as getSubscription, PATCH as patchSubscription } from '@omnikes/app/api/platform/subscriptions/[organizationId]/route';
import { GET as listSubscriptions } from '@omnikes/app/api/platform/subscriptions/route';

describe('P1 - Platform Subscriptions real PostgreSQL runtime', () => {
  const suffix = Date.now().toString();
  let operatorOrganizationId = '';
  let operatorUserId = '';
  let organizationAId = '';
  let organizationBId = '';
  let sessionToken = '';

  async function requestCookie() {
    return `auth_token=${sessionToken}`;
  }

  async function patch(organizationId: string, plan: 'OMNIKES_149' | 'OMNIKES_249' | 'OMNIKES_299') {
    const request = new NextRequest(
      `http://localhost/api/platform/subscriptions/${organizationId}`,
      {
        method: 'PATCH',
        headers: {
          cookie: await requestCookie(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'ACTIVATE',
          plan,
          expiresAt: '2099-12-31',
        }),
      },
    );

    return patchSubscription(
      request,
      { params: Promise.resolve({ organizationId }) },
    );
  }

  async function get(organizationId: string) {
    const request = new NextRequest(
      `http://localhost/api/platform/subscriptions/${organizationId}`,
      { headers: { cookie: await requestCookie() } },
    );

    return getSubscription(
      request,
      { params: Promise.resolve({ organizationId }) },
    );
  }

  beforeAll(async () => {
    const operatorOrganization = await prisma.organization.create({
      data: {
        name: `P1 Platform Operator ${suffix}`,
        slug: `p1-platform-operator-${suffix}`,
        country: 'HT',
        currency: 'HTG',
        locale: 'fr-HT',
        timezone: 'America/Port-au-Prince',
      },
      select: { id: true },
    });

    const organizationA = await prisma.organization.create({
      data: {
        name: `P1 Subscription A ${suffix}`,
        slug: `p1-subscription-a-${suffix}`,
        country: 'HT',
        currency: 'HTG',
        locale: 'fr-HT',
        timezone: 'America/Port-au-Prince',
      },
      select: { id: true },
    });

    const organizationB = await prisma.organization.create({
      data: {
        name: `P1 Subscription B ${suffix}`,
        slug: `p1-subscription-b-${suffix}`,
        country: 'HT',
        currency: 'HTG',
        locale: 'fr-HT',
        timezone: 'America/Port-au-Prince',
      },
      select: { id: true },
    });

    operatorOrganizationId = operatorOrganization.id;
    organizationAId = organizationA.id;
    organizationBId = organizationB.id;

    const bootstrap = await platformOperatorBootstrapService.bootstrap({
      organizationId: operatorOrganizationId,
      email: `p1.platform.operator.${suffix}@omnikes.test`,
      name: 'P1 Platform Operator',
      password: 'P1PlatformTest!2026',
    });

    operatorUserId = bootstrap.userId;

    const login = await authService.login(
      `p1.platform.operator.${suffix}@omnikes.test`,
      'P1PlatformTest!2026',
      '127.0.0.1',
      'P1-platform-subscriptions-runtime',
    );

    sessionToken = login.token;
  });

  it('authenticates the real platform operator and lists PostgreSQL organizations', async () => {
    const response = await listSubscriptions(
      new NextRequest('http://localhost/api/platform/subscriptions', {
        headers: { cookie: await requestCookie() },
      }),
    );

    expect(response.status).toBe(200);

    const body = await response.json();
    const ids = body.organizations.map((organization: { id: string }) => organization.id);

    expect(ids).toContain(organizationAId);
    expect(ids).toContain(organizationBId);

    const organizationA = body.organizations.find(
      (organization: { id: string }) => organization.id === organizationAId,
    );
    const organizationB = body.organizations.find(
      (organization: { id: string }) => organization.id === organizationBId,
    );

    expect(organizationA.subscriptionStatus).toBe('NONE');
    expect(organizationA.subscriptionPlan).toBeNull();
    expect(organizationB.subscriptionStatus).toBe('NONE');
    expect(organizationB.subscriptionPlan).toBeNull();
  });

  it('performs a real A → B → A sequence without stale subscription state', async () => {
    const activateA = await patch(organizationAId, 'OMNIKES_149');
    expect(activateA.status).toBe(200);

    const afterA = await get(organizationAId);
    expect(afterA.status).toBe(200);
    const afterABody = await afterA.json();
    expect(afterABody.organization.subscriptionStatus).toBe('ACTIVE');
    expect(afterABody.organization.subscriptionPlan).toBe('OMNIKES_149');

    const untouchedB = await get(organizationBId);
    expect(untouchedB.status).toBe(200);
    const untouchedBBody = await untouchedB.json();
    expect(untouchedBBody.organization.subscriptionStatus).toBe('NONE');
    expect(untouchedBBody.organization.subscriptionPlan).toBeNull();

    const activateB = await patch(organizationBId, 'OMNIKES_249');
    expect(activateB.status).toBe(200);

    const afterB = await get(organizationBId);
    expect(afterB.status).toBe(200);
    const afterBBody = await afterB.json();
    expect(afterBBody.organization.subscriptionStatus).toBe('ACTIVE');
    expect(afterBBody.organization.subscriptionPlan).toBe('OMNIKES_249');

    const AAfterB = await get(organizationAId);
    expect(AAfterB.status).toBe(200);
    const AAfterBBody = await AAfterB.json();
    expect(AAfterBBody.organization.subscriptionPlan).toBe('OMNIKES_149');

    const reactivateA = await patch(organizationAId, 'OMNIKES_299');
    expect(reactivateA.status).toBe(200);

    const finalA = await get(organizationAId);
    const finalB = await get(organizationBId);
    expect(finalA.status).toBe(200);
    expect(finalB.status).toBe(200);

    const finalABody = await finalA.json();
    const finalBBody = await finalB.json();

    expect(finalABody.organization.subscriptionPlan).toBe('OMNIKES_299');
    expect(finalBBody.organization.subscriptionPlan).toBe('OMNIKES_249');
  });

  it('persists the final A/B state and platform audit trail in PostgreSQL', async () => {
    const [organizationA, organizationB, audits] = await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: organizationAId },
        select: {
          subscriptionStatus: true,
          subscriptionPlan: true,
          subscriptionExpiresAt: true,
        },
      }),
      prisma.organization.findUniqueOrThrow({
        where: { id: organizationBId },
        select: {
          subscriptionStatus: true,
          subscriptionPlan: true,
          subscriptionExpiresAt: true,
        },
      }),
      prisma.auditLog.findMany({
        where: {
          userId: operatorUserId,
          organizationId: { in: [organizationAId, organizationBId] },
          action: 'ORGANIZATION_SUBSCRIPTION_ACTIVATED',
        },
        orderBy: { createdAt: 'asc' },
        select: {
          organizationId: true,
          entityId: true,
          metadata: true,
        },
      }),
    ]);

    expect(organizationA.subscriptionStatus).toBe('ACTIVE');
    expect(organizationA.subscriptionPlan).toBe('OMNIKES_299');
    expect(organizationA.subscriptionExpiresAt).toEqual(new Date('2099-12-31T23:59:59.999Z'));

    expect(organizationB.subscriptionStatus).toBe('ACTIVE');
    expect(organizationB.subscriptionPlan).toBe('OMNIKES_249');
    expect(organizationB.subscriptionExpiresAt).toEqual(new Date('2099-12-31T23:59:59.999Z'));

    expect(audits).toHaveLength(3);
    expect(audits.map((audit) => audit.organizationId)).toEqual([
      organizationAId,
      organizationBId,
      organizationAId,
    ]);
    for (const audit of audits) {
      expect(audit.entityId).toBe(audit.organizationId);
      expect(audit.metadata).toEqual({
        authorizationScope: 'PLATFORM',
        permission: 'organization.subscription.manage',
      });
    }
  });

  it('rejects an unauthenticated platform subscription mutation', async () => {
    const response = await patchSubscription(
      new NextRequest(
        `http://localhost/api/platform/subscriptions/${organizationAId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'ACTIVATE',
            plan: 'OMNIKES_149',
            expiresAt: '2099-12-31',
          }),
        },
      ),
      { params: Promise.resolve({ organizationId: organizationAId }) },
    );

    expect(response.status).toBe(401);
  });

  afterAll(async () => {
    if (sessionToken) {
      await authService.logout(sessionToken).catch(() => undefined);
    }

    if (operatorUserId) {
      await prisma.user.delete({ where: { id: operatorUserId } }).catch(() => undefined);
    }

    for (const organizationId of [organizationAId, organizationBId, operatorOrganizationId]) {
      if (organizationId) {
        await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
      }
    }

    await prisma.$disconnect();
  });
});
