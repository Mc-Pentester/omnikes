import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { generateToken } from '@omnikes/lib/crypto';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { prisma } from '@omnikes/lib/prisma';

import { POST as creditPost } from '@omnikes/app/api/sales/[id]/credit/route';

describe('P0-24-F.2-D.1 - real PostgreSQL credit API cross-store proof', () => {
  let orgA: { id: string } | undefined;
  let storeA: { id: string } | undefined;
  let storeB: { id: string } | undefined;
  let customerA: { id: string } | undefined;
  let temporaryCustomerA = false;
  let scopedUser: { id: string; email: string } | undefined;
  let scopedRole: { id: string } | undefined;
  let permission: { id: string } | undefined;
  let sameStoreSaleId: string;
  let crossStoreSaleId: string;

  beforeAll(async () => {
    orgA = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'omnikes-test-commerce-a' },
      select: { id: true },
    });

    storeA = await prisma.store.findFirstOrThrow({
      where: { organizationId: orgA!.id, code: 'STORE-A' },
      select: { id: true },
    });

    const existingStoreB = await prisma.store.findFirst({
      where: { organizationId: orgA!.id, code: 'P0-F2-D-STORE-B' },
      select: { id: true },
    });

    storeB = existingStoreB ?? await prisma.store.create({
      data: {
        organizationId: orgA!.id,
        name: 'P0-24-F.2-D Store B',
        code: 'P0-F2-D-STORE-B',
        country: 'HT',
        isActive: true,
      },
      select: { id: true },
    });

    const existingCustomerA = await prisma.customer.findFirst({
      where: { organizationId: orgA!.id, email: 'client.a@omnikes.test' },
      select: { id: true },
    });
    if (existingCustomerA) {
      customerA = existingCustomerA;
    } else {
      customerA = await prisma.customer.create({
        data: {
          organizationId: orgA!.id,
          name: 'P0-24-F.2-D API Customer A',
          email: 'client.a@omnikes.test',
        },
        select: { id: true },
      });
      temporaryCustomerA = true;
    }

    permission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'sale.credit' },
      select: { id: true },
    });

    const suffix = Date.now().toString();
    scopedUser = await prisma.user.create({
      data: {
        organizationId: orgA!.id,
        email: `p0-24-f2-d-api-${suffix}@omnikes.test`,
        name: 'P0-24-F.2-D API Scoped User',
        password: await bcrypt.hash('P0F2D-Api-Test!2026', 10),
        isActive: true,
      },
      select: { id: true, email: true },
    });

    scopedRole = await prisma.role.create({
      data: {
        organizationId: orgA!.id,
        name: `P0-F2-D-STORE-A-${suffix}`,
        description: 'P0-24-F.2-D temporary scoped API proof role',
        isGlobal: false,
        storeId: storeA!.id,
        rolePermissions: {
          create: {
            permissionId: permission!.id,
          },
        },
      },
      select: { id: true },
    });

    await prisma.userRole.create({
      data: {
        userId: scopedUser!.id,
        roleId: scopedRole!.id,
      },
    });

    const sameStoreSale = await prisma.sale.create({
      data: {
        organizationId: orgA!.id,
        storeId: storeA!.id,
        orderNumber: `P0-24-F2-D-API-A-${suffix}`,
        customerId: customerA!.id,
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
        organizationId: orgA!.id,
        storeId: storeB!.id,
        orderNumber: `P0-24-F2-D-API-B-${suffix}`,
        customerId: customerA!.id,
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

  async function createAuthenticatedCookie() {
    const rawToken = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await sessionRepository.create(
      {
        user: {
          connect: { id: scopedUser!.id },
        },
        expiresAt,
        ipAddress: '127.0.0.1',
        userAgent: 'P0-24-F.2-D-api-runtime-test',
      },
      rawToken,
    );

    return `auth_token=${rawToken}`;
  }

  afterAll(async () => {
    if (scopedUser?.id) {
      await prisma.session.deleteMany({ where: { userId: scopedUser!.id } });
    }
    if (sameStoreSaleId || crossStoreSaleId) {
      await prisma.saleCredit.deleteMany({
        where: { saleId: { in: [sameStoreSaleId, crossStoreSaleId].filter(Boolean) } },
      });
      await prisma.sale.deleteMany({
        where: { id: { in: [sameStoreSaleId, crossStoreSaleId].filter(Boolean) } },
      });
    }
    if (scopedUser?.id) {
      await prisma.userRole.deleteMany({ where: { userId: scopedUser!.id } });
    }
    if (scopedRole?.id) {
      await prisma.rolePermission.deleteMany({ where: { roleId: scopedRole!.id } });
      await prisma.role.delete({ where: { id: scopedRole!.id } }).catch(() => undefined);
    }
    if (scopedUser?.id) {
      await prisma.user.delete({ where: { id: scopedUser!.id } }).catch(() => undefined);
    }

    if (storeB?.id) {
      const temporaryStore = await prisma.store.findUnique({
        where: { id: storeB!.id },
        select: { code: true },
      });
      if (temporaryStore?.code === 'P0-F2-D-STORE-B') {
        await prisma.store.delete({ where: { id: storeB!.id } }).catch(() => undefined);
      }
    }
    if (temporaryCustomerA && customerA?.id) {
      await prisma.customer.delete({ where: { id: customerA!.id } }).catch(() => undefined);
    }

    await prisma.$disconnect();
  });

  it('allows the scoped user to authorize credit on the authorized store through the real API route', async () => {
    const cookie = await createAuthenticatedCookie();

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
          customerId: customerA!.id,
          amount: 1000,
        }),
      },
    );

    const response = await creditPost(request, {
      params: Promise.resolve({ id: sameStoreSaleId }),
    });

    const responseBody = await response.json();
    expect(response.status, JSON.stringify(responseBody)).toBe(201);

    const credit = await prisma.saleCredit.findUnique({
      where: { saleId: sameStoreSaleId },
    });
    expect(credit).not.toBeNull();
    expect(Number(credit?.amount)).toBe(1000);
  });

  it('rejects the same scoped user on a different store through the real API route', async () => {
    const cookie = await createAuthenticatedCookie();

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
          customerId: customerA!.id,
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
