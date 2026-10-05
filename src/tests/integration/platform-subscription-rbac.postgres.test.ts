import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { generateToken } from '@omnikes/lib/crypto';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { roleRepository } from '@omnikes/repositories/role.repository';
import { platformRoleRepository } from '@omnikes/repositories/platform-role.repository';
import { platformSubscriptionService } from '@omnikes/services/platform-subscription.service';
import { GET, PATCH } from '@omnikes/app/api/platform/subscriptions/[organizationId]/route';
import { GET as LIST } from '@omnikes/app/api/platform/subscriptions/route';

describe('P0-Platform-RBAC - strict platform/tenant separation', () => {
  let adminAId = '';
  let platformUserId = '';
  let orgBId = '';
  let originalOrgB: {
    subscriptionStatus: string;
    subscriptionPlan: string | null;
    subscriptionExpiresAt: Date | null;
  } | null = null;

  beforeAll(async () => {
    const adminA = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin.a@omnikes.test' },
      select: { id: true, organizationId: true },
    });
    const orgB = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'omnikes-test-commerce-b' },
      select: { id: true, subscriptionStatus: true, subscriptionPlan: true, subscriptionExpiresAt: true },
    });

    const platformRole = await prisma.platformRole.findUniqueOrThrow({
      where: { name: 'OMNIKES_PLATFORM_OPERATOR' },
      select: { id: true },
    });

    adminAId = adminA.id;
    orgBId = orgB.id;
    originalOrgB = {
      subscriptionStatus: orgB.subscriptionStatus,
      subscriptionPlan: orgB.subscriptionPlan,
      subscriptionExpiresAt: orgB.subscriptionExpiresAt,
    };

    const suffix = Date.now();
    const platformUser = await prisma.user.create({
      data: {
        email: `platform.operator.${suffix}@omnikes.test`,
        name: 'Platform Operator Test',
        password: 'not-used-by-this-test',
        organizationId: adminA.organizationId,
        isActive: true,
        platformUserRoles: {
          create: { platformRoleId: platformRole.id },
        },
      },
      select: { id: true },
    });

    platformUserId = platformUser.id;
  });

  async function cookieFor(userId: string) {
    const rawToken = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await sessionRepository.create(
      {
        user: { connect: { id: userId } },
        expiresAt,
        ipAddress: '127.0.0.1',
        userAgent: 'P0-platform-rbac-test',
      },
      rawToken,
    );

    return `auth_token=${rawToken}`;
  }

  it('removes the legacy tenant permission entirely', async () => {
    const legacy = await prisma.permission.findUnique({
      where: { code: 'organization.subscription.manage' },
    });
    expect(legacy).toBeNull();
  });

  it('does not treat a tenant ADMIN as a platform operator', async () => {
    expect(
      await platformRoleRepository.hasPermission(adminAId, 'organization.subscription.manage'),
    ).toBe(false);
  });

  it('keeps platform permission separate from tenant permissions', async () => {
    expect(
      await platformRoleRepository.hasPermission(platformUserId, 'organization.subscription.manage'),
    ).toBe(true);

    expect(
      await roleRepository.hasPermission(platformUserId, 'sale.read'),
    ).toBe(false);

    expect(
      await roleRepository.getAuthorizedStoreIds(platformUserId),
    ).toEqual([]);
  });

  it('allows the platform operator to target another tenant', async () => {
    const result = await platformSubscriptionService.update(
      orgBId,
      platformUserId,
      { action: 'ACTIVATE', plan: 'OMNIKES_149', expiresAt: '2099-12-31' },
    );

    expect(result.id).toBe(orgBId);
    expect(result.subscriptionStatus).toBe('ACTIVE');
    expect(result.subscriptionPlan).toBe('OMNIKES_149');
  });

  it('denies tenant ADMIN from changing another tenant subscription', async () => {
    const request = new NextRequest(
      `http://localhost/api/platform/subscriptions/${orgBId}`,
      {
        method: 'PATCH',
        headers: {
          cookie: await cookieFor(adminAId),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'ACTIVATE',
          plan: 'OMNIKES_299',
          expiresAt: '2099-12-31',
        }),
      },
    );

    const response = await PATCH(
      request as never,
      { params: Promise.resolve({ organizationId: orgBId }) },
    );

    expect(response.status).toBe(403);
  });

  it('allows the platform operator to list and update organizations cross-tenant', async () => {
    const listRequest = new NextRequest('http://localhost/api/platform/subscriptions', {
      headers: { cookie: await cookieFor(platformUserId) },
    });

    const listResponse = await LIST(listRequest as never);
    expect(listResponse.status).toBe(200);

    const listBody = await listResponse.json();
    expect(listBody.organizations.some((item: { id: string }) => item.id === orgBId)).toBe(true);

    const request = new NextRequest(
      `http://localhost/api/platform/subscriptions/${orgBId}`,
      {
        method: 'PATCH',
        headers: {
          cookie: await cookieFor(platformUserId),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'ACTIVATE',
          plan: 'OMNIKES_249',
          expiresAt: '2099-12-31',
        }),
      },
    );

    const response = await PATCH(
      request as never,
      { params: Promise.resolve({ organizationId: orgBId }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.organization.id).toBe(orgBId);
    expect(body.organization.subscriptionPlan).toBe('OMNIKES_249');
  });

  it('writes an auditable platform-scoped change on the target tenant', async () => {
    const audit = await prisma.auditLog.findFirst({
      where: {
        userId: platformUserId,
        organizationId: orgBId,
        action: 'ORGANIZATION_SUBSCRIPTION_ACTIVATED',
      },
      orderBy: { createdAt: 'desc' },
      select: { metadata: true, entityId: true },
    });

    expect(audit?.entityId).toBe(orgBId);
    expect(audit?.metadata).toEqual({
      authorizationScope: 'PLATFORM',
      permission: 'organization.subscription.manage',
    });
  });

  it('retains the platform boundary after subscription management', async () => {
    expect(await roleRepository.getAuthorizedStoreIds(platformUserId)).toEqual([]);
    expect(await roleRepository.hasPermission(platformUserId, 'inventory.read')).toBe(false);
  });

  afterAll(async () => {
    if (platformUserId) {
      await prisma.user.delete({ where: { id: platformUserId } }).catch(() => undefined);
    }

    if (originalOrgB) {
      await prisma.organization.update({
        where: { id: orgBId },
        data: originalOrgB,
      }).catch(() => undefined);
    }

    await prisma.$disconnect();
  });
});
