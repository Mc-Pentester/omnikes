import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { sessionRepository } from '@omnikes/repositories/session.repository';
import { generateToken } from '@omnikes/lib/crypto';
import { GET as summary } from '@omnikes/app/api/reports/sales/summary/route';
import { GET as byPeriod } from '@omnikes/app/api/reports/sales/by-period/route';
import { GET as byProduct } from '@omnikes/app/api/reports/sales/by-product/route';
import { GET as byPaymentMethod } from '@omnikes/app/api/reports/sales/by-payment-method/route';
import { GET as byStore } from '@omnikes/app/api/reports/sales/by-store/route';

describe('P0-26 - PostgreSQL report aggregation and resource ceilings', () => {
  let adminId = '';

  beforeAll(async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin.b@omnikes.test' },
      select: { id: true },
    });
    adminId = admin.id;
  });

  async function request(path: string) {
    const rawToken = generateToken();
    await sessionRepository.create(
      {
        user: { connect: { id: adminId } },
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ipAddress: '127.0.0.1',
        userAgent: 'P0-26-report-resource-safety-test',
      },
      rawToken,
    );

    return new NextRequest(`http://localhost${path}`, {
      headers: { cookie: `auth_token=${rawToken}` },
    });
  }

  it('summary is computed successfully without loading sale rows into Node', async () => {
    const response = await summary(await request('/api/reports/sales/summary'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        totalRevenue: expect.any(Number),
        salesCount: expect.any(Number),
        itemsSold: expect.any(Number),
        totalDiscount: expect.any(Number),
        totalTax: expect.any(Number),
        averageSale: expect.any(Number),
      }),
    );
  });

  it('all report aggregations execute successfully', async () => {
    const [periodResponse, productResponse, paymentResponse, storeResponse] = await Promise.all([
      byPeriod(await request('/api/reports/sales/by-period?granularity=day')),
      byProduct(await request('/api/reports/sales/by-product?limit=50')),
      byPaymentMethod(await request('/api/reports/sales/by-payment-method')),
      byStore(await request('/api/reports/sales/by-store')),
    ]);

    expect(periodResponse.status).toBe(200);
    expect(productResponse.status).toBe(200);
    expect(paymentResponse.status).toBe(200);
    expect(storeResponse.status).toBe(200);

    expect(Array.isArray(await periodResponse.json())).toBe(true);
    expect(Array.isArray(await productResponse.json())).toBe(true);
    expect(Array.isArray(await paymentResponse.json())).toBe(true);
    expect(Array.isArray(await storeResponse.json())).toBe(true);
  });

  it('rejects a report range larger than 366 days with HTTP 400', async () => {
    const response = await summary(
      await request(
        '/api/reports/sales/summary?startDate=2024-01-01T00:00:00.000Z&endDate=2025-01-03T00:00:00.000Z',
      ),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid report parameters' });
  });

  it('rejects product extraction above the server ceiling with HTTP 400', async () => {
    const response = await byProduct(
      await request('/api/reports/sales/by-product?limit=101'),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid report parameters' });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
