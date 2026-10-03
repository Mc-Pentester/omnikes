import { describe, expect, it, vi } from 'vitest';

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock('@omnikes/lib/prisma', () => ({
  prisma: {
    $queryRaw: queryRaw,
  },
}));

import { SalesReportRepository } from '@omnikes/repositories/sales-report.repository';

describe('SalesReportRepository — product tax allocation', () => {
  it('returns PostgreSQL tax allocation results without recomputing them in JavaScript', async () => {
    const expected = [
      {
        productId: 'c123456789012345678901234',
        productName: 'Product A',
        variantId: 'c223456789012345678901234',
        sku: 'A-001',
        quantitySold: 1,
        revenue: 100,
        discount: 0,
        tax: 18,
      },
      {
        productId: 'c323456789012345678901234',
        productName: 'Product B',
        variantId: 'c423456789012345678901234',
        sku: 'B-001',
        quantitySold: 1,
        revenue: 900,
        discount: 0,
        tax: 162,
      },
    ];
    queryRaw.mockResolvedValueOnce(expected);

    const repository = new SalesReportRepository();
    const result = await repository.getSalesByProduct(
      'c523456789012345678901234',
      {
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2026-10-01T23:59:59.999Z'),
      },
    );

    expect(result).toEqual(expected);
    expect(queryRaw).toHaveBeenCalledTimes(1);

    const sql = JSON.stringify(queryRaw.mock.calls[0][0]);
    expect(sql).toContain('sale_item_basis');
    expect(sql).toContain('provisional_tax');
    expect(sql).toContain('allocated_items');
    expect(sql).toContain('ROW_NUMBER');
    expect(sql).toContain('SUM(\\"provisionalTax\\") OVER (PARTITION BY \\"saleId\\")');
  });
});


describe('SalesReportRepository — monetary output normalization', () => {
  it('rounds report monetary aggregates to two decimals in PostgreSQL', async () => {
    const expected = {
      salesCount: 1,
      totalRevenue: 100.12,
      totalDiscount: 0.13,
      totalTax: 18.02,
      itemsSold: 1,
      averageSale: 100.12,
      totalPaid: 100.12,
      authorizedCredit: 0,
      uncoveredAmount: 0,
    };
    queryRaw.mockResolvedValueOnce([expected]);

    const repository = new SalesReportRepository();
    const result = await repository.getSummary(
      'c523456789012345678901234',
      {
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2026-10-01T23:59:59.999Z'),
      },
    );

    expect(result).toEqual(expected);
    expect(queryRaw).toHaveBeenCalledTimes(1);

    const sql = JSON.stringify(queryRaw.mock.calls[0][0]);
    expect(sql).toContain('ROUND');
    expect(sql).toContain('\\"totalRevenue\\"');
    expect(sql).toContain('\\"uncoveredAmount\\"');
    expect(sql).toContain('\\"averageSale\\"');
    expect(sql).toContain('COALESCE(SUM(fs.\"total\"), 0)');
  });
});
