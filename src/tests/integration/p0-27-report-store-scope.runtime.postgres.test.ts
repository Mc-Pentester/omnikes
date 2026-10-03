import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { generateToken } from '@omnikes/lib/crypto';
import { GET as summary } from '@omnikes/app/api/reports/sales/summary/route';
import { GET as inventoryList } from '@omnikes/app/api/inventory/route';
import { GET as proformaList } from '@omnikes/app/api/proformas/route';

describe('P0-27 - scoped report aggregation', () => {
  let userId = '';
  let organizationId = '';
  let scopedStoreId = '';
  let otherStoreId = '';

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
    otherStoreId = unauthorizedStore.id;

    const product = await prisma.product.create({
      data: {
        organizationId,
        name: 'P0-27 Product',
      },
    });

    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: 'P0-27-SKU',
        price: 10,
        cost: 5,
      },
    });

    await prisma.inventory.createMany({
      data: [
        { storeId: scopedStore.id, variantId: variant.id, quantity: 10 },
        { storeId: unauthorizedStore.id, variantId: variant.id, quantity: 20 },
      ],
    });

    await prisma.proforma.createMany({
      data: [
        {
          organizationId,
          storeId: scopedStore.id,
          proformaNumber: `P0-27-SCOPED-${Date.now()}`,
          status: 'DRAFT',
          subtotal: 100,
          tax: 0,
          taxRate: 0,
          total: 100,
          discount: 0,
          applyTax: false,
        },
        {
          organizationId,
          storeId: unauthorizedStore.id,
          proformaNumber: `P0-27-OTHER-${Date.now()}`,
          status: 'DRAFT',
          subtotal: 900,
          tax: 0,
          taxRate: 0,
          total: 900,
          discount: 0,
          applyTax: false,
        },
      ],
    });

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

  it('does not list inventory from unauthorized stores when storeId is omitted', async () => {
    const response = await inventoryList(await requestFor('/api/inventory'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.inventory).toHaveLength(1);
    expect(body.inventory[0].storeId).toBe(scopedStoreId);
  });

  it('does not list proformas from unauthorized stores when storeId is omitted', async () => {
    const response = await proformaList(await requestFor('/api/proformas'));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.proformas).toHaveLength(1);
    expect(body.proformas[0].storeId).toBe(scopedStoreId);
  });

  async function requestFor(path: string) {
    const rawToken = generateToken();
    await sessionRepository.create(
      {
        user: { connect: { id: userId } },
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'P0-27-store-scope-test',
      },
      rawToken,
    );
    return new NextRequest(`http://localhost${path}`, {
      headers: { cookie: `auth_token=${rawToken}` },
    });
  }

  afterAll(async () => {
    if (userId) {
      await prisma.session.deleteMany({ where: { userId } });
    }
    if (organizationId) {
      await prisma.organization.delete({ where: { id: organizationId } }).catch(() => undefined);
    }
    void scopedStoreId;
    void otherStoreId;
    await prisma.$disconnect();
  });
});
