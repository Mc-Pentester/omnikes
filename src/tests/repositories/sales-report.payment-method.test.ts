import { describe, expect, it, vi } from 'vitest';

const { queryRaw } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock('@omnikes/lib/prisma', () => ({
  prisma: {
    $queryRaw: queryRaw,
  },
}));

import { salesReportRepository } from '@omnikes/repositories/sales-report.repository';

describe('SalesReportRepository.getSalesByPaymentMethod', () => {
  it('excludes historical CREDIT payments from real payment-method reporting', async () => {
    queryRaw.mockResolvedValueOnce([
      {
        paymentMethod: 'CASH',
        transactionCount: 1,
        amount: 100,
      },
    ]);

    const result = await salesReportRepository.getSalesByPaymentMethod('org-a', {
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-02T00:00:00.000Z'),
    });

    expect(result).toEqual([
      {
        paymentMethod: 'CASH',
        transactionCount: 1,
        amount: 100,
      },
    ]);

    const sql = JSON.stringify(queryRaw.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('p."status" = \\'COMPLETED\\'');
    expect(sql).toContain('p."method" <> \\'CREDIT\\'');
  });
});
