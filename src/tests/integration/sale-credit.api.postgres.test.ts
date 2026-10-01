import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';

import { POST as creditPost } from '@omnikes/app/api/sales/[id]/credit/route';

describe('P0-24-F.2-D.1 - real PostgreSQL credit API cross-store proof', () => {
  let orgA: { id: string };
  let storeA: { id: string };
  let storeB: { id: string };
  let customerA: { id: string };
  let scopedUser: { id: string; email: string };
  let scopedRole: { id: string };
  let permission: { id: string };
  let sameStoreSaleId: string;
  let crossStoreSaleId: string;

  beforeAll(async () => {
    orgA = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'omnikes-test-commerce-a' },
      select: { id: true },
    });

    storeA = await prisma.store.findFirstOrThrow({
      where: { organizationId: orgA.id, code: 'STORE-A' },
      select: { id: true },
    });

    const existingStoreB = await prisma.store.findFirst({
      where: { organizationId: orgA.id, code: 'P0-F2-D-STORE-B' },
      select: { id: true },
    });

    storeB = existingStoreB ?? await prisma.store.create({
      data: {
        organizationId: orgA.id,
        name: 'P0-24-F.2-D Store B',
        code: 'P0-F2-D-STORE-B',
        country: 'HT',
        isActive: true,
      },
      select: { id: true },
    });

    customerA = await prisma.customer.findFirstOrThrow({
      where: { organizationId: orgA.id, email: 'client.a@omnikes.test' },
      select: { id: true },
    });

    permission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'sale.credit' },
      select: { id: true },
    });

    const suffix = Date.now().toString();
    scopedUser = await prisma.user.create({
      data: {
        organizationId: orgA.id,
        email: `p0-24-f2-d-api-${suffix}@omnikes.test`,
        name: 'P0-24-F.2-D API Scoped User',
        password: await bcrypt.hash('P0F2D-Api-Test!2026', 10),
        isActive: true,
      },
      select: { id: true, email: true },
    });

    scopedRole = await prisma.role.create({
      data: {
        name: `P0-F2-D-STORE-A-${suffix}`,
        description: 'P0-24-F.2-D temporary scoped API proof role',
        isGlobal: false,
        storeId: storeA.id,
        rolePermissions: {
          create: {
            permissionId: permission.id,
          },
        },
      },
      select: { id: true },
    });

    await prisma.userRole.create({
      data: {
        userId: scopedUser.id,
        roleId: scopedRole.id,
      },
    });

    const sameStoreSale = await prisma.sale.create({
      data: {
        organizationId: orgA.id,
        storeId: storeA.id,
        orderNumber: `P0-24-F2-D-API-A-${suffix}`,
        customerId: customerA.id,
        status: 'PENDING',
        subtotal: 1000,
        tax: 0,
        taxRate: 0,
        total: 1000,
        discount: 0,
        applyTax: false,
      },
      select: { id: true },
    });
    sameStoreSaleId = sameStoreSale.id;

    const crossStoreSale = await prisma.sale.create({
      data: {
        organizationId: orgA.id,
        storeId: storeB.id,
        orderNumber: `P0-24-F2-D-API-B-${suffix}`,
        customerId: customerA.id,
        status: 'PENDING',
        subtotal: 1000,
        tax: 0,
        taxRate: 0,
        total: 1000,
        discount: 0,
        applyTax: false,
      },
      select: { id: true },
    });
    crossStoreSaleId = crossStoreSale.id;
  });

  async function loginAndGetCookie() {
    const request = new NextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'P0-24-F.2-D-api-runtime-test',
      },
      body: JSON.stringify({
        email: scopedUser.email,
        password: 'P0F2D-Api-Test!2026',
      }),
    });

    const response = await loginPost(request);
    expect(response.status).toBe(200);

    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();

    const match = setCookie?.match(/auth_token=([^;]+)/);
    expect(match?.[1]).toBeTruthy();

    return `auth_token=${match?.[1]}`;
  }

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: scopedUser.id } });
    await prisma.saleCredit.deleteMany({
      where: { saleId: { in: [sameStoreSaleId, crossStoreSaleId] } },
    });
    await prisma.sale.deleteMany({
      where: { id: { in: [sameStoreSaleId, crossStoreSaleId] } },
    });
    await prisma.userRole.deleteMany({ where: { userId: scopedUser.id } });
    await prisma.rolePermission.deleteMany({ where: { roleId: scopedRole.id } });
    await prisma.role.delete({ where: { id: scopedRole.id } });
    await prisma.user.delete({ where: { id: scopedUser.id } });

    const temporaryStore = await prisma.store.findUnique({
      where: { id: storeB.id },
      select: { code: true },
    });
    if (temporaryStore?.code === 'P0-F2-D-STORE-B') {
      await prisma.store.delete({ where: { id: storeB.id } });
    }

    await prisma.$disconnect();
  });

  it('allows the scoped user to authorize credit on the authorized store through the real API route', async () => {
    const cookie = await loginAndGetCookie();

    const request = new NextRequest(
      `http://localhost/api/sales/${sameStoreSaleId}/credit`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie,
          origin: 'http://localhost',
        },
        body: JSON.stringify({
          customerId: customerA.id,
          amount: 1000,
        }),
      },
    );

    const response = await creditPost(request, {
      params: Promise.resolve({ id: sameStoreSaleId }),
    });

    expect(response.status).toBe(201);

    const credit = await prisma.saleCredit.findUnique({
      where: { saleId: sameStoreSaleId },
    });
    expect(credit).not.toBeNull();
    expect(Number(credit?.amount)).toBe(1000);
  });

  it('rejects the same scoped user on a different store through the real API route', async () => {
    const cookie = await loginAndGetCookie();

    const before = await prisma.saleCredit.count({
      where: { saleId: crossStoreSaleId },
    });

    const request = new NextRequest(
      `http://localhost/api/sales/${crossStoreSaleId}/credit`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie,
          origin: 'http://localhost',
        },
        body: JSON.stringify({
          customerId: customerA.id,
          amount: 1000,
        }),
      },
    );

    const response = await creditPost(request, {
      params: Promise.resolve({ id: crossStoreSaleId }),
    });

    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.error).toBe('Not authorized to access this store');

    const after = await prisma.saleCredit.count({
      where: { saleId: crossStoreSaleId },
    });
    expect(after).toBe(before);

    const sale = await prisma.sale.findUniqueOrThrow({
      where: { id: crossStoreSaleId },
      select: { status: true },
    });
    expect(sale.status).toBe('PENDING');
  });
});
