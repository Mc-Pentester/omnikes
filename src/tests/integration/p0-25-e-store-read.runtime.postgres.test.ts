import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { generateToken } from '@omnikes/lib/crypto';
import { GET as listStores } from '@omnikes/app/api/stores/route';
import { GET as getStore } from '@omnikes/app/api/stores/[id]/route';

describe('P0-25-E - real PostgreSQL permission runtime proof for store reads', () => {
  let adminId = '';
  let restrictedUserId = '';
  let authorizedStoreId = '';

  beforeAll(async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin.b@omnikes.test' },
      select: { id: true, organizationId: true },
    });

    const restrictedUser = await prisma.user.create({
      data: {
        email: `p0-25-e-no-store-read-${Date.now()}@omnikes.test`,
        name: 'P0-25-E Restricted User',
        password: 'unused-in-runtime-test',
        organizationId: admin.organizationId,
        isActive: true,
      },
      select: { id: true },
    });

    const store = await prisma.store.findFirstOrThrow({
      where: { organizationId: admin.organizationId, isActive: true },
      select: { id: true },
    });

    adminId = admin.id;
    restrictedUserId = restrictedUser.id;
    authorizedStoreId = store.id;
  });

  async function cookieFor(userId: string) {
    const rawToken = generateToken();
    await sessionRepository.create(
      {
        user: { connect: { id: userId } },
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'P0-25-E-store-read-runtime-test',
      },
      rawToken,
    );
    return `auth_token=${rawToken}`;
  }

  it('GET /api/stores allows an authorized admin', async () => {
    const response = await listStores(new NextRequest('http://localhost/api/stores', {
      headers: { cookie: await cookieFor(adminId) },
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.stores)).toBe(true);
  });

  it('GET /api/stores denies a user without store.read with HTTP 403', async () => {
    const response = await listStores(new NextRequest('http://localhost/api/stores', {
      headers: { cookie: await cookieFor(restrictedUserId) },
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Permission required' });
  });

  it('GET /api/stores/[id] allows an authorized admin', async () => {
    const response = await getStore(
      new NextRequest(`http://localhost/api/stores/${authorizedStoreId}`, {
        headers: { cookie: await cookieFor(adminId) },
      }),
      { params: Promise.resolve({ id: authorizedStoreId }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.store.id).toBe(authorizedStoreId);
  });

  it('GET /api/stores/[id] denies a user without store.read with HTTP 403', async () => {
    const response = await getStore(
      new NextRequest(`http://localhost/api/stores/${authorizedStoreId}`, {
        headers: { cookie: await cookieFor(restrictedUserId) },
      }),
      { params: Promise.resolve({ id: authorizedStoreId }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Permission required' });
  });

  afterAll(async () => {
    if (restrictedUserId) {
      await prisma.user.delete({ where: { id: restrictedUserId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });
});
