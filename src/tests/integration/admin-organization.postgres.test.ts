import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { roleRepository } from '@omnikes/repositories/role.repository';
import { generateToken } from '@omnikes/lib/crypto';
import { GET, PATCH } from '@omnikes/app/api/admin/organization/route';

describe('P0-25-D.1 - real PostgreSQL organization administration', () => {
  let adminId = '';
  let cashierId = '';
  let orgAId = '';
  let orgBId = '';
  let originalName = '';
  let originalCountry = '';
  let originalCurrency = '';
  let originalLocale = '';
  let originalTimezone = '';
  let originalCloudEnabled = false;
  let originalOnlineStoreEnabled = false;

  beforeAll(async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin.a@omnikes.test' },
      select: { id: true, organizationId: true },
    });
    const cashier = await prisma.user.findUniqueOrThrow({
      where: { email: 'cashier.a@omnikes.test' },
      select: { id: true },
    });
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: admin.organizationId },
      select: { id: true, name: true, country: true, currency: true, locale: true, timezone: true, cloudEnabled: true, onlineStoreEnabled: true },
    });
    const orgB = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'omnikes-test-commerce-b' },
      select: { id: true },
    });

    adminId = admin.id;
    cashierId = cashier.id;
    orgAId = org.id;
    orgBId = orgB.id;
    originalName = org.name;
    originalCountry = org.country;
    originalCurrency = org.currency;
    originalLocale = org.locale;
    originalTimezone = org.timezone;
    originalCloudEnabled = org.cloudEnabled;
    originalOnlineStoreEnabled = org.onlineStoreEnabled;
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
        userAgent: 'P0-25-D1-organization-runtime-test',
      },
      rawToken,
    );

    return `auth_token=${rawToken}`;
  }

  it('reads only the authenticated user organization', async () => {
    const request = new NextRequest('http://localhost/api/admin/organization', {
      headers: { cookie: await cookieFor(adminId) },
    });

    const response = await GET(request as never);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.organization.id).toBe(orgAId);
    expect(body.organization.id).not.toBe(orgBId);
    expect(body.organization).not.toHaveProperty('users');
  });

  it('denies organization administration to CASHIER', async () => {
    const request = new NextRequest('http://localhost/api/admin/organization', {
      headers: { cookie: await cookieFor(cashierId) },
    });

    const response = await GET(request as never);
    expect(response.status).toBe(403);
  });

  it('updates and persists organization settings with audit trail', async () => {
    const cookie = await cookieFor(adminId);
    const newName = `OmniKès Runtime Organization ${Date.now()}`;

    const request = new NextRequest('http://localhost/api/admin/organization', {
      method: 'PATCH',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: newName,
        country: 'ht',
        currency: 'htg',
        locale: 'fr-HT',
        timezone: 'America/Port-au-Prince',
        cloudEnabled: false,
        onlineStoreEnabled: false,
      }),
    });

    const response = await PATCH(request as never);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.organization.id).toBe(orgAId);
    expect(body.organization.name).toBe(newName);
    expect(body.organization.slug).toBeTruthy();

    const persisted = await prisma.organization.findUniqueOrThrow({
      where: { id: orgAId },
    });
    expect(persisted.name).toBe(newName);
    expect(persisted.country).toBe('HT');
    expect(persisted.currency).toBe('HTG');

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        organizationId: orgAId,
        userId: adminId,
        action: 'ORGANIZATION_UPDATED',
        entityId: orgAId,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit.oldValues).toBeTruthy();
    expect(audit.newValues).toBeTruthy();
  });



  it('enforces the role organization boundary for authorization', async () => {
    const suffix = Date.now().toString();
    const permission = await prisma.permission.create({
      data: {
        code: `p0-25-d3.role-boundary.${suffix}`,
        description: 'P0-25-D.3 runtime boundary test permission',
        module: 'test',
      },
    });

    const [globalA, globalB, scopedA, scopedB, legacyGlobal] = await Promise.all([
      prisma.role.create({
        data: {
          organizationId: orgAId,
          name: `P0-25-D3-GLOBAL-A-${suffix}`,
          isGlobal: true,
        },
      }),
      prisma.role.create({
        data: {
          organizationId: orgBId,
          name: `P0-25-D3-GLOBAL-B-${suffix}`,
          isGlobal: true,
        },
      }),
      prisma.role.create({
        data: {
          organizationId: orgAId,
          name: `P0-25-D3-SCOPED-A-${suffix}`,
          isGlobal: false,
          storeId: null,
        },
      }),
      prisma.role.create({
        data: {
          organizationId: orgBId,
          name: `P0-25-D3-SCOPED-B-${suffix}`,
          isGlobal: false,
          storeId: null,
        },
      }),
      prisma.role.create({
        data: {
          organizationId: null,
          name: `P0-25-D3-LEGACY-GLOBAL-${suffix}`,
          isGlobal: true,
        },
      }),
    ]);

    await prisma.rolePermission.create({
      data: {
        roleId: globalB.id,
        permissionId: permission.id,
      },
    });

    await prisma.userRole.createMany({
      data: [
        { userId: adminId, roleId: globalA.id },
        { userId: adminId, roleId: globalB.id },
        { userId: adminId, roleId: scopedA.id },
        { userId: adminId, roleId: scopedB.id },
        { userId: adminId, roleId: legacyGlobal.id },
      ],
    });

    const roles = await roleRepository.getUserRoles(adminId);
    const roleIds = new Set(roles.map((role) => role.id));

    expect(roleIds.has(globalA.id)).toBe(true);
    expect(roleIds.has(scopedA.id)).toBe(true);
    expect(roleIds.has(globalB.id)).toBe(false);
    expect(roleIds.has(scopedB.id)).toBe(false);
    expect(roleIds.has(legacyGlobal.id)).toBe(false);

    expect(await roleRepository.hasPermission(adminId, permission.code)).toBe(false);
    expect(await roleRepository.hasGlobalRoleWithPermission(adminId, permission.code)).toBe(false);

    await prisma.role.deleteMany({
      where: {
        id: {
          in: [globalA.id, globalB.id, scopedA.id, scopedB.id, legacyGlobal.id],
        },
      },
    });
    await prisma.permission.delete({
      where: { id: permission.id },
    });
  });


  it('rejects an invalid timezone without changing the organization', async () => {
    const before = await prisma.organization.findUniqueOrThrow({
      where: { id: orgAId },
      select: { timezone: true },
    });

    const request = new NextRequest('http://localhost/api/admin/organization', {
      method: 'PATCH',
      headers: {
        cookie: await cookieFor(adminId),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ timezone: 'Not/A-Timezone' }),
    });

    const response = await PATCH(request as never);
    expect(response.status).toBe(400);

    const after = await prisma.organization.findUniqueOrThrow({
      where: { id: orgAId },
      select: { timezone: true },
    });
    expect(after.timezone).toBe(before.timezone);
  });

  afterAll(async () => {
    await prisma.organization.update({
      where: { id: orgAId },
      data: {
        name: originalName,
        country: originalCountry,
        currency: originalCurrency,
        locale: originalLocale,
        timezone: originalTimezone,
        cloudEnabled: originalCloudEnabled,
        onlineStoreEnabled: originalOnlineStoreEnabled,
      },
    });
    await prisma.$disconnect();
  });
});
