import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { generateToken } from '@omnikes/lib/crypto';
import { GET, POST } from '@omnikes/app/api/admin/roles/route';
import { PATCH } from '@omnikes/app/api/admin/roles/[id]/route';

describe('P0-25-B - real PostgreSQL role administration', () => {
  let adminId = '';
  let cashierId = '';
  let orgAId = '';
  let storeBId = '';
  let orgBAdminRoleId = '';
  let saleReadPermissionId = '';
  let createdRoleId = '';

  beforeAll(async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin.a@omnikes.test' },
      select: { id: true, organizationId: true },
    });
    const cashier = await prisma.user.findUniqueOrThrow({
      where: { email: 'cashier.a@omnikes.test' },
      select: { id: true },
    });
    const orgB = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'omnikes-test-commerce-b' },
      select: { id: true },
    });
    adminId = admin.id;
    cashierId = cashier.id;
    orgAId = admin.organizationId;
    storeBId = storeB.id;
    orgBAdminRoleId = orgBAdminRole.id;
    saleReadPermissionId = permission.id;
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
        userAgent: 'P0-25-B-role-runtime-test',
      },
      rawToken,
    );

    return `auth_token=${rawToken}`;
  }

  it('lists only roles belonging to the current organization', async () => {
    const request = new NextRequest('http://localhost/api/admin/roles', {
      headers: { cookie: await cookieFor(adminId) },
    });

    const response = await GET(request as never);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.roles.some((role: { id: string }) => role.id === orgBAdminRoleId)).toBe(false);
    expect(body.roles.some((role: { name: string }) => role.name === 'ADMIN')).toBe(true);
  });

  it('denies role administration to CASHIER', async () => {
    const request = new NextRequest('http://localhost/api/admin/roles', {
      headers: { cookie: await cookieFor(cashierId) },
    });

    const response = await GET(request as never);
    expect(response.status).toBe(403);
  });

  it('creates and updates a global role with permissions through the real API', async () => {
    const suffix = Date.now().toString();
    const cookie = await cookieFor(adminId);

    const createRequest = new NextRequest('http://localhost/api/admin/roles', {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: `P0-25-B-MANAGER-${suffix}`,
        description: 'Runtime role administration proof',
        isGlobal: true,
        permissionIds: [saleReadPermissionId],
      }),
    });

    const createdResponse = await POST(createRequest as never);
    expect(createdResponse.status).toBe(201);
    const createdBody = await createdResponse.json();
    createdRoleId = createdBody.role.id;

    const patchRequest = new NextRequest(`http://localhost/api/admin/roles/${createdRoleId}`, {
      method: 'PATCH',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        description: 'Updated runtime role',
        permissionIds: [saleReadPermissionId],
      }),
    });

    const patchedResponse = await PATCH(
      patchRequest as never,
      { params: Promise.resolve({ id: createdRoleId }) },
    );
    expect(patchedResponse.status).toBe(200);

    const persisted = await prisma.role.findUniqueOrThrow({
      where: { id: createdRoleId },
      include: { rolePermissions: true },
    });
    expect(persisted.organizationId).toBe(orgAId);
    expect(persisted.isGlobal).toBe(true);
    expect(persisted.rolePermissions.map((item) => item.permissionId)).toEqual([saleReadPermissionId]);
  });

  it('rejects a role scoped to another organization store', async () => {
    const cookie = await cookieFor(adminId);
    const request = new NextRequest('http://localhost/api/admin/roles', {
      method: 'POST',
      headers: {
        cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: `P0-25-B-CROSS-STORE-${Date.now()}`,
        isGlobal: false,
        storeId: storeBId,
        permissionIds: [saleReadPermissionId],
      }),
    });

    const response = await POST(request as never);
    expect(response.status).toBe(409);
    expect(await prisma.role.count({
      where: { name: { startsWith: 'P0-25-B-CROSS-STORE-' }, organizationId: orgAId },
    })).toBe(0);
  });

  afterAll(async () => {
    if (createdRoleId) {
      await prisma.role.delete({ where: { id: createdRoleId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });
});
