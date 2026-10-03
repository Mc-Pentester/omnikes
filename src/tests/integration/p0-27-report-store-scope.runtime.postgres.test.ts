import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { generateToken } from '@omnikes/lib/crypto';
import { GET as summary } from '@omnikes/app/api/reports/sales/summary/route';

describe('P0-27 - scoped report aggregation', () => {
  let userId = '';
  let roleId = '';
  let organizationId = '';
  let scopedStoreId = '';

  beforeAll(async () => {
    const store = await prisma.store.findFirstOrThrow({
      where: { code: 'test-store-a' },
      select: { id: true, organizationId: true },
    });

    const reportPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'report.read' },
      select: { id: true },
    });

    organizationId = store.organizationId;
    scopedStoreId = store.id;
    roleId = `p0-27-report-scope-${Date.now()}`;

    const role = await prisma.role.create({
      data: {
        id: roleId,
        name: 'P0-27-REPORT-SCOPED',
        organizationId,
        isGlobal: false,
        storeId: scopedStoreId,
        rolePermissions: {
          create: { permissionId: reportPermission.id },
        },
      },
    });

    const user = await prisma.user.create({
      data: {
        email: `p0-27-${Date.now()}@omnikes.test`,
        name: 'P0-27 Scoped Report Test',
        password: 'not-used',
        organizationId,
        isActive: true,
        userRoles: {
          create: { roleId: role.id },
        },
      },
    });

    userId = user.id;
  });

  async function request() {
    const rawToken = generateToken();

    await sessionRepository.create(
      {
        user: { connect: { id: userId } },
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'P0-27-report-scope-test',
      },
      rawToken,
    );

    return new NextRequest('http://localhost/api/reports/sales/summary', {
      headers: { cookie: `auth_token=${rawToken}` },
    });
  }

  it('does not aggregate sales from unauthorized stores when storeId is omitted', async () => {
    const response = await summary(await request());
    expect(response.status).toBe(200);

    const actual = await response.json();

    const expected = await prisma.sale.aggregate({
      where: {
        organizationId,
        storeId: scopedStoreId,
        status: 'COMPLETED',
      },
      _count: { id: true },
      _sum: {
        total: true,
        discount: true,
        tax: true,
      },
      _avg: { total: true },
    });

    const itemsSold = await prisma.saleItem.aggregate({
      where: {
        sale: {
          organizationId,
          storeId: scopedStoreId,
          status: 'COMPLETED',
        },
      },
      _sum: { quantity: true },
    });

    expect(actual.salesCount).toBe(expected._count.id);
    expect(actual.totalRevenue).toBe(expected._sum.total ?? 0);
    expect(actual.totalDiscount).toBe(expected._sum.discount ?? 0);
    expect(actual.totalTax).toBe(expected._sum.tax ?? 0);
    expect(actual.averageSale).toBe(expected._avg.total ?? 0);
    expect(actual.itemsSold).toBe(itemsSold._sum.quantity ?? 0);
  });

  afterAll(async () => {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } });
    }
    if (roleId) {
      await prisma.role.delete({ where: { id: roleId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });
});
