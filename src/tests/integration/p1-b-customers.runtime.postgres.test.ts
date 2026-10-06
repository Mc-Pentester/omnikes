import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { generateToken } from '@omnikes/lib/crypto';
import {
  GET as listCustomers,
  POST as createCustomer,
} from '@omnikes/app/api/customers/route';
import {
  GET as getCustomer,
  PATCH as updateCustomer,
  DELETE as deleteCustomer,
} from '@omnikes/app/api/customers/[id]/route';

describe('P1-B - real PostgreSQL customer tenant isolation and RBAC', () => {
  let adminAId = '';
  let adminBId = '';
  let restrictedUserId = '';
  let orgAId = '';
  let orgBId = '';
  let customerAId = '';
  let customerBId = '';
  let createdCustomerId = '';

  beforeAll(async () => {
    const [adminA, adminB] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { email: 'admin.a@omnikes.test' },
        select: { id: true, organizationId: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: 'admin.b@omnikes.test' },
        select: { id: true, organizationId: true },
      }),
    ]);

    const [customerA, customerB] = await Promise.all([
      prisma.customer.create({
        data: {
          organizationId: adminA.organizationId,
          name: 'P1-B Customer A',
          email: `p1-b-a-${Date.now()}@example.test`,
          isActive: true,
        },
        select: { id: true },
      }),
      prisma.customer.create({
        data: {
          organizationId: adminB.organizationId,
          name: 'P1-B Customer B',
          email: `p1-b-b-${Date.now()}@example.test`,
          isActive: true,
        },
        select: { id: true },
      }),
    ]);

    const restrictedUser = await prisma.user.create({
      data: {
        email: `p1-b-no-customer-permission-${Date.now()}@omnikes.test`,
        name: 'P1-B Restricted User',
        password: 'unused-in-runtime-test',
        organizationId: adminA.organizationId,
        isActive: true,
      },
      select: { id: true },
    });

    adminAId = adminA.id;
    adminBId = adminB.id;
    restrictedUserId = restrictedUser.id;
    orgAId = adminA.organizationId;
    orgBId = adminB.organizationId;
    customerAId = customerA.id;
    customerBId = customerB.id;
  });

  async function cookieFor(userId: string) {
    const rawToken = generateToken();
    await sessionRepository.create(
      {
        user: { connect: { id: userId } },
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'P1-B-customer-runtime-test',
      },
      rawToken,
    );
    return `auth_token=${rawToken}`;
  }

  function request(
    url: string,
    cookie: string,
    init: RequestInit = {},
  ) {
    return new NextRequest(`http://localhost${url}`, {
      ...init,
      headers: {
        cookie,
        ...(init.headers ?? {}),
      },
    });
  }

  it('lists only customers belonging to the authenticated organization', async () => {
    const response = await listCustomers(
      request('/api/customers', await cookieFor(adminAId)),
    );

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.customers.some((customer: { id: string }) => customer.id === customerAId)).toBe(true);
    expect(body.customers.some((customer: { id: string }) => customer.id === customerBId)).toBe(false);
  });

  it('rejects cross-organization GET as 404 without leaking the customer', async () => {
    const response = await getCustomer(
      request(`/api/customers/${customerBId}`, await cookieFor(adminAId)),
      { params: Promise.resolve({ id: customerBId }) },
    );

    expect(response.status).toBe(404);
  });

  it('rejects cross-organization PATCH as 404 and preserves the foreign customer', async () => {
    const response = await updateCustomer(
      request(`/api/customers/${customerBId}`, await cookieFor(adminAId), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'SHOULD-NOT-CHANGE' }),
      }),
      { params: Promise.resolve({ id: customerBId }) },
    );

    expect(response.status).toBe(404);

    const persisted = await prisma.customer.findUniqueOrThrow({
      where: { id: customerBId },
      select: { organizationId: true, name: true, isActive: true },
    });

    expect(persisted.organizationId).toBe(orgBId);
    expect(persisted.name).toBe('P1-B Customer B');
    expect(persisted.isActive).toBe(true);
  });

  it('rejects cross-organization DELETE as 404 and preserves the foreign customer', async () => {
    const response = await deleteCustomer(
      request(`/api/customers/${customerBId}`, await cookieFor(adminAId), {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: customerBId }) },
    );

    expect(response.status).toBe(404);

    const persisted = await prisma.customer.findUniqueOrThrow({
      where: { id: customerBId },
      select: { organizationId: true, isActive: true },
    });

    expect(persisted.organizationId).toBe(orgBId);
    expect(persisted.isActive).toBe(true);
  });

  it('allows own-organization PATCH and persists the scoped update', async () => {
    const response = await updateCustomer(
      request(`/api/customers/${customerAId}`, await cookieFor(adminAId), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'P1-B Customer A Updated' }),
      }),
      { params: Promise.resolve({ id: customerAId }) },
    );

    expect(response.status).toBe(200);

    const persisted = await prisma.customer.findUniqueOrThrow({
      where: { id: customerAId },
      select: { organizationId: true, name: true },
    });

    expect(persisted.organizationId).toBe(orgAId);
    expect(persisted.name).toBe('P1-B Customer A Updated');
  });

  it('binds customer creation to the authenticated organization', async () => {
    const cookie = await cookieFor(adminAId);
    const response = await createCustomer(
      request('/api/customers', cookie, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'P1-B Created Customer',
          email: `p1-b-created-${Date.now()}@example.test`,
        }),
      }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    createdCustomerId = body.id;

    const persisted = await prisma.customer.findUniqueOrThrow({
      where: { id: createdCustomerId },
      select: { organizationId: true, name: true, isActive: true },
    });

    expect(persisted.organizationId).toBe(orgAId);
    expect(persisted.name).toBe('P1-B Created Customer');
    expect(persisted.isActive).toBe(true);
  });

  it('rejects a client-supplied organizationId on customer creation', async () => {
    const response = await createCustomer(
      request('/api/customers', await cookieFor(adminAId), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'P1-B Organization Override',
          organizationId: orgBId,
        }),
      }),
    );

    expect(response.status).toBe(400);
  });

  it('enforces customer RBAC for a user without customer permissions', async () => {
    const cookie = await cookieFor(restrictedUserId);

    const listResponse = await listCustomers(
      request('/api/customers', cookie),
    );
    expect(listResponse.status).toBe(403);

    const getResponse = await getCustomer(
      request(`/api/customers/${customerAId}`, cookie),
      { params: Promise.resolve({ id: customerAId }) },
    );
    expect(getResponse.status).toBe(403);

    const patchResponse = await updateCustomer(
      request(`/api/customers/${customerAId}`, cookie, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'SHOULD-NOT-CHANGE' }),
      }),
      { params: Promise.resolve({ id: customerAId }) },
    );
    expect(patchResponse.status).toBe(403);

    const deleteResponse = await deleteCustomer(
      request(`/api/customers/${customerAId}`, cookie, {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: customerAId }) },
    );
    expect(deleteResponse.status).toBe(403);
  });

  it('soft-deletes an own-organization customer and removes it from active reads', async () => {
    const response = await deleteCustomer(
      request(`/api/customers/${customerAId}`, await cookieFor(adminAId), {
        method: 'DELETE',
      }),
      { params: Promise.resolve({ id: customerAId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      customerId: customerAId,
      isActive: false,
    });

    const persisted = await prisma.customer.findUniqueOrThrow({
      where: { id: customerAId },
      select: { organizationId: true, isActive: true },
    });

    expect(persisted.organizationId).toBe(orgAId);
    expect(persisted.isActive).toBe(false);

    const getResponse = await getCustomer(
      request(`/api/customers/${customerAId}`, await cookieFor(adminAId)),
      { params: Promise.resolve({ id: customerAId }) },
    );
    expect(getResponse.status).toBe(404);
  });

  it('keeps organization B independently authorized', async () => {
    const response = await getCustomer(
      request(`/api/customers/${customerBId}`, await cookieFor(adminBId)),
      { params: Promise.resolve({ id: customerBId }) },
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.id).toBe(customerBId);
    expect(body.organizationId).toBe(orgBId);
  });

  afterAll(async () => {
    const customerIds = [customerAId, customerBId, createdCustomerId].filter(Boolean);

    if (customerIds.length > 0) {
      await prisma.customer.deleteMany({
        where: { id: { in: customerIds } },
      }).catch(() => undefined);
    }

    if (restrictedUserId) {
      await prisma.session.deleteMany({ where: { userId: restrictedUserId } }).catch(() => undefined);
      await prisma.user.delete({ where: { id: restrictedUserId } }).catch(() => undefined);
    }

    await prisma.$disconnect();
  });
});
