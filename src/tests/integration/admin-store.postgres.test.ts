import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { generateToken } from '@omnikes/lib/crypto';
import { GET, POST as createStore } from '@omnikes/app/api/admin/stores/route';
import { PATCH, DELETE, POST as activateStore } from '@omnikes/app/api/admin/stores/[id]/route';

describe('P0-25-C - real PostgreSQL store administration', () => {
  let adminId = '';
  let restrictedUserId = '';
  let orgAId = '';
  let orgBStoreId = '';
  let createdStoreId = '';

  beforeAll(async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin.a@omnikes.test' },
      select: { id: true, organizationId: true },
    });
    const restrictedUser = await prisma.user.create({
      data: {
        email: `p0-25-c-no-store-read-${Date.now()}@omnikes.test`,
        name: 'P0-25-C Restricted User',
        password: 'unused-in-runtime-test',
        organizationId: admin.organizationId,
        isActive: true,
      },
      select: { id: true },
    });
    const orgB = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'omnikes-test-commerce-b' },
      select: { id: true },
    });
    const storeB = await prisma.store.findFirstOrThrow({
      where: { organizationId: orgB.id, code: 'STORE-B' },
      select: { id: true },
    });

    adminId = admin.id;
    restrictedUserId = restrictedUser.id;
    orgAId = admin.organizationId;
    orgBStoreId = storeB.id;
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
        userAgent: 'P0-25-C-store-runtime-test',
      },
      rawToken,
    );

    return `auth_token=${rawToken}`;
  }

  it('lists only stores belonging to the current organization', async () => {
    const request = new NextRequest('http://localhost/api/admin/stores', {
      headers: { cookie: await cookieFor(adminId) },
    });

    const response = await GET(request as never);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.stores.some((store: { id: string }) => store.id === orgBStoreId)).toBe(false);
    expect(body.stores.length).toBeGreaterThan(0);
  });

  it('denies store administration without store.read', async () => {
    const request = new NextRequest('http://localhost/api/admin/stores', {
      headers: { cookie: await cookieFor(restrictedUserId) },
    });

    const response = await GET(request as never);
    expect(response.status).toBe(403);
  });

  it('creates and updates a store through the real API', async () => {
    const cookie = await cookieFor(adminId);
    const suffix = Date.now().toString();

    const createRequest = new NextRequest('http://localhost/api/admin/stores', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        name: `P0-25-C Test Store ${suffix}`,
        code: `P0C-${suffix}`,
        city: 'Port-au-Prince',
        country: 'HT',
        isActive: true,
      }),
    });

    const createResponse = await createStore(createRequest as never);
    expect(createResponse.status).toBe(201);
    const createdBody = await createResponse.json();
    createdStoreId = createdBody.store.id;

    const patchRequest = new NextRequest(`http://localhost/api/admin/stores/${createdStoreId}`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `P0-25-C Updated ${suffix}` }),
    });

    const patchResponse = await PATCH(
      patchRequest as never,
      { params: Promise.resolve({ id: createdStoreId }) },
    );
    expect(patchResponse.status).toBe(200);

    const persisted = await prisma.store.findUniqueOrThrow({ where: { id: createdStoreId } });
    expect(persisted.organizationId).toBe(orgAId);
    expect(persisted.name).toBe(`P0-25-C Updated ${suffix}`);
  });

  it('rejects cross-organization store mutation', async () => {
    const cookie = await cookieFor(adminId);
    const patchRequest = new NextRequest(`http://localhost/api/admin/stores/${orgBStoreId}`, {
      method: 'PATCH',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'SHOULD-NOT-CHANGE' }),
    });

    const response = await PATCH(
      patchRequest as never,
      { params: Promise.resolve({ id: orgBStoreId }) },
    );
    expect(response.status).toBe(404);
  });

  it('deactivates and reactivates a store through the real API', async () => {
    const cookie = await cookieFor(adminId);

    const deleteRequest = new NextRequest(`http://localhost/api/admin/stores/${createdStoreId}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    const deleteResponse = await DELETE(
      deleteRequest as never,
      { params: Promise.resolve({ id: createdStoreId }) },
    );
    expect(deleteResponse.status).toBe(200);

    const inactive = await prisma.store.findUniqueOrThrow({ where: { id: createdStoreId } });
    expect(inactive.isActive).toBe(false);

    const activateRequest = new NextRequest(`http://localhost/api/admin/stores/${createdStoreId}`, {
      method: 'POST',
      headers: { cookie },
    });
    const activateResponse = await activateStore(
      activateRequest as never,
      { params: Promise.resolve({ id: createdStoreId }) },
    );
    expect(activateResponse.status).toBe(200);

    const active = await prisma.store.findUniqueOrThrow({ where: { id: createdStoreId } });
    expect(active.isActive).toBe(true);
  });

  afterAll(async () => {
    if (createdStoreId) {
      await prisma.store.delete({ where: { id: createdStoreId } }).catch(() => undefined);
    }
    if (restrictedUserId) {
      await prisma.session.deleteMany({ where: { userId: restrictedUserId } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: restrictedUserId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });
});
