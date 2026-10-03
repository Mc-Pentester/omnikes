import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { salesReportRepository } from '@omnikes/repositories/sales-report.repository';

describe('P0-31-A - real PostgreSQL financial reconciliation', () => {
  let organizationId: string;
  let storeId: string;
  let customerId: string;
  const createdSaleIds: string[] = [];

  beforeAll(async () => {
    organizationId = (await prisma.organization.findUniqueOrThrow({
      where: { slug: 'omnikes-test-commerce-a' },
      select: { id: true },
    })).id;

    storeId = (await prisma.store.findFirstOrThrow({
      where: { organizationId, code: 'STORE-A' },
      select: { id: true },
    })).id;

    customerId = (await prisma.customer.findFirstOrThrow({
      where: { organizationId, email: 'client.a@omnikes.test' },
      select: { id: true },
    })).id;
  });

  async function createCompletedSale(total: number) {
    const sale = await prisma.sale.create({
      data: {
        organizationId,
        storeId,
        customerId,
        orderNumber: `P0-31-A-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: 'COMPLETED',
        subtotal: total,
        discount: 0,
        tax: 0,
        taxRate: 0,
        total,
        applyTax: false,
      },
    });
    createdSaleIds.push(sale.id);
    return sale;
  }

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { saleId: { in: createdSaleIds } } });
    await prisma.saleCredit.deleteMany({ where: { saleId: { in: createdSaleIds } } });
    await prisma.sale.deleteMany({ where: { id: { in: createdSaleIds } } });
    await prisma.$disconnect();
  });

  it('reconciles completed sale revenue against real payments and authorized credit', async () => {
    const paidSale = await createCompletedSale(1000);
    await prisma.payment.create({
      data: { saleId: paidSale.id, method: 'CASH', amount: 1000, status: 'COMPLETED' },
    });

    const mixedSale = await createCompletedSale(1000);
    await prisma.payment.create({
      data: { saleId: mixedSale.id, method: 'CASH', amount: 600, status: 'COMPLETED' },
    });
    await prisma.saleCredit.create({
      data: {
        organizationId,
        storeId,
        saleId: mixedSale.id,
        customerId,
        amount: 400,
        status: 'AUTHORIZED',
        authorizedBy: (await prisma.user.findUniqueOrThrow({
          where: { email: 'admin.a@omnikes.test' },
          select: { id: true },
        })).id,
      },
    });

    const summary = await salesReportRepository.getSummary(organizationId, {
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-10-03T23:59:59.999Z'),
    });

    expect(summary.salesCount).toBeGreaterThanOrEqual(2);
    expect(Number(summary.totalPaid)).toBeGreaterThanOrEqual(1600);
    expect(Number(summary.authorizedCredit)).toBeGreaterThanOrEqual(400);
    expect(Number(summary.uncoveredAmount)).toBe(0);
  });

  it('does not count historical CREDIT payments as real cash coverage', async () => {
    const legacyCreditSale = await createCompletedSale(1000);
    await prisma.payment.create({
      data: { saleId: legacyCreditSale.id, method: 'CREDIT', amount: 1000, status: 'COMPLETED' },
    });

    const summary = await salesReportRepository.getSummary(organizationId, {
      startDate: new Date('2026-10-01T00:00:00.000Z'),
      endDate: new Date('2026-10-03T23:59:59.999Z'),
    });

    expect(Number(summary.totalPaid)).toBeGreaterThanOrEqual(1600);
    expect(Number(summary.authorizedCredit)).toBeGreaterThanOrEqual(400);
    expect(Number(summary.uncoveredAmount)).toBeGreaterThanOrEqual(1000);
  });
});
