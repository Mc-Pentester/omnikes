import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { salesReportRepository } from '@omnikes/repositories/sales-report.repository';

describe('P0-31-A - real PostgreSQL financial reconciliation', () => {
  let organizationId: string;
  let storeId: string;
  let customerId: string;
  let temporaryCustomer = false;
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

    const existingCustomer = await prisma.customer.findFirst({
      where: { organizationId, email: 'client.a@omnikes.test' },
      select: { id: true },
    });

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const createdCustomer = await prisma.customer.create({
        data: {
          organizationId,
          name: 'P0-31-A Customer',
          email: 'client.a@omnikes.test',
        },
        select: { id: true },
      });
      customerId = createdCustomer.id;
      temporaryCustomer = true;
    }
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
    if (temporaryCustomer) {
      await prisma.customer.delete({ where: { id: customerId } });
    }
    await prisma.$disconnect();
  });

  it('reconciles completed sale revenue against real payments and authorized credit', async () => {
    const startDate = new Date(Date.now() - 2000);
    const baseline = await salesReportRepository.getSummary(organizationId, {
      startDate,
      endDate: new Date(Date.now() + 60000),
    });

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
      startDate,
      endDate: new Date(Date.now() + 60000),
    });

    expect(summary.salesCount - baseline.salesCount).toBe(2);
    expect(Number(summary.totalPaid) - Number(baseline.totalPaid)).toBe(1600);
    expect(Number(summary.authorizedCredit) - Number(baseline.authorizedCredit)).toBe(400);
    expect(Number(summary.uncoveredAmount) - Number(baseline.uncoveredAmount)).toBe(0);
  });

  it('does not count historical CREDIT payments as real cash coverage', async () => {
    const startDate = new Date(Date.now() - 2000);
    const baseline = await salesReportRepository.getSummary(organizationId, {
      startDate,
      endDate: new Date(Date.now() + 60000),
    });

    const legacyCreditSale = await createCompletedSale(1000);
    await prisma.payment.create({
      data: { saleId: legacyCreditSale.id, method: 'CREDIT', amount: 1000, status: 'COMPLETED' },
    });

    const summary = await salesReportRepository.getSummary(organizationId, {
      startDate,
      endDate: new Date(Date.now() + 60000),
    });

    expect(summary.salesCount - baseline.salesCount).toBe(1);
    expect(Number(summary.totalPaid) - Number(baseline.totalPaid)).toBe(0);
    expect(Number(summary.authorizedCredit) - Number(baseline.authorizedCredit)).toBe(0);
    expect(Number(summary.uncoveredAmount) - Number(baseline.uncoveredAmount)).toBe(1000);
  });
});
