import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { generateToken } from '@omnikes/lib/crypto';
import { GET as summary } from '@omnikes/app/api/reports/sales/summary/route';

describe('P0-27 - scoped report aggregation', () => {
  let userId = '';
  let organizationId = '';
  let scopedStoreId = '';

  beforeAll(async () => {
    const reportPermission = await prisma.permission.findUniqueOrThrow({
      where: { code: 'report.read' },
      select: { id: true },
    });

    const organization = await prisma.organization.create({
      data: {
        name: `P0-27 Report Scope ${Date.now()}`,
        slug: `p0-27-report-scope-${Date.now()}`,
        country: 'HT',
        currency: 'HTG',
        locale: 'fr-HT',
        timezone: 'America/Port-au-Prince',
      },
    });

    organizationId = organization.id;

    const scopedStore = await prisma.store.create({
      data: {
        organizationId,
        name: 'Scoped Store',
        code: 'P0-27-SCOPED',
      },
    });

    const unauthorizedStore = await prisma.store.create({
      data: {
        organizationId,
        name: 'Unauthorized Store',
        code: 'P0-27-OTHER',
      },
    });

    scopedStoreId = scopedStore.id;

    await prisma.sale.createMany({
      data: [
        {
          organizationId,
          storeId: scopedStore.id,
          orderNumber: `P0-27-SCOPED-${Date.now()}`,
          status: 'COMPLETED',
          subtotal: 100,
          tax: 0,
          total: 100,
          discount: 0,
          applyTax: false,
        },
        {
          organizationId,
          storeId: unauthorizedStore.id,
          orderNumber: `P0-27-OTHER-${Date.now()}`,
          status: 'COMPLETED',
          subtotal: 900,
          tax: 0,
          total: 900,
          discount: 0,
          applyTax: false,
        },
      ],
    });

    const role = await prisma.role.create({
      data: {
        name: 'P0-27-REPORT-SCOPED',
        organizationId,
        isGlobal: false,
        storeId: scopedStore.id,
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

    expect(actual.salesCount).toBe(1);
    expect(actual.totalRevenue).toBe(100);
    expect(actual.totalDiscount).toBe(0);
    expect(actual.totalTax).toBe(0);
    expect(actual.averageSale).toBe(100);
    expect(actual.itemsSold).toBe(0);
  });

  afterAll(async () => {
    if (userId) {
      await prisma.session.deleteMany({ where: { userId } });
    }
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    void scopedStoreId;
    await prisma.$disconnect();
  });
});
