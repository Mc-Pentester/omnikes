import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saleRepository } from '../../repositories/sale.repository';
import { storeRepository } from '../../repositories/store.repository';
import { salesReportRepository } from '../../repositories/sales-report.repository';
import { prisma } from '../../lib/prisma';

// Mock Prisma
vi.mock('../../lib/prisma', () => ({
  prisma: {
    sale: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    store: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
}));

describe('P0-21-A Cross-Store Isolation Repository Tests', () => {
  const mockOrganizationId = 'org-123';
  const storeA = 'store-a-id';
  const storeB = 'store-b-id';
  const storeC = 'store-c-id';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Sale Repository - authorizedStoreIds filtering', () => {
    it('TEST 1 — null (global) should NOT filter by store', async () => {
      (prisma.sale.findMany as any).mockResolvedValue([
        { id: 'sale-1', storeId: storeA },
        { id: 'sale-2', storeId: storeB },
        { id: 'sale-3', storeId: storeC },
      ]);
      (prisma.sale.count as any).mockResolvedValue(3);

      const result = await saleRepository.listByOrganization(mockOrganizationId, {
        authorizedStoreIds: null,
      });

      expect(prisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrganizationId,
          }),
        })
      );
      // Verify that storeId is NOT in the where clause
      const callArgs = (prisma.sale.findMany as any).mock.calls[0][0];
      expect(callArgs.where.storeId).toBeUndefined();
      expect(result.sales).toHaveLength(3);
    });

    it('TEST 2 — [storeA] should filter to only storeA', async () => {
      (prisma.sale.findMany as any).mockResolvedValue([
        { id: 'sale-1', storeId: storeA },
      ]);
      (prisma.sale.count as any).mockResolvedValue(1);

      const result = await saleRepository.listByOrganization(mockOrganizationId, {
        authorizedStoreIds: [storeA],
      });

      expect(prisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrganizationId,
            storeId: { in: [storeA] },
          }),
        })
      );
      expect(result.sales).toHaveLength(1);
    });

    it('TEST 3 — [] (empty) should return empty result', async () => {
      const result = await saleRepository.listByOrganization(mockOrganizationId, {
        authorizedStoreIds: [],
      });

      // Should return early without calling Prisma
      expect(prisma.sale.findMany).not.toHaveBeenCalled();
      expect(result).toEqual({ sales: [], total: 0 });
    });

    it('TEST 4 — [storeA, storeB] should filter to both stores', async () => {
      (prisma.sale.findMany as any).mockResolvedValue([
        { id: 'sale-1', storeId: storeA },
        { id: 'sale-2', storeId: storeB },
      ]);
      (prisma.sale.count as any).mockResolvedValue(2);

      const result = await saleRepository.listByOrganization(mockOrganizationId, {
        authorizedStoreIds: [storeA, storeB],
      });

      expect(prisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrganizationId,
            storeId: { in: [storeA, storeB] },
          }),
        })
      );
      expect(result.sales).toHaveLength(2);
    });

    it('TEST 5 — explicit storeId should override authorizedStoreIds', async () => {
      (prisma.sale.findMany as any).mockResolvedValue([
        { id: 'sale-1', storeId: storeA },
      ]);
      (prisma.sale.count as any).mockResolvedValue(1);

      const result = await saleRepository.listByOrganization(mockOrganizationId, {
        storeId: storeA,
        authorizedStoreIds: [storeB], // Should be ignored when storeId is explicit
      });

      expect(prisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrganizationId,
            storeId: storeA, // Explicit storeId takes precedence
          }),
        })
      );
    });
  });

  describe('Store Repository - authorizedStoreIds filtering', () => {
    it('TEST 6 — null (global) should NOT filter by store', async () => {
      (prisma.store.findMany as any).mockResolvedValue([
        { id: storeA, name: 'Store A' },
        { id: storeB, name: 'Store B' },
      ]);
      (prisma.store.count as any).mockResolvedValue(2);

      const result = await storeRepository.listByOrganization(mockOrganizationId, {
        authorizedStoreIds: null,
      });

      expect(prisma.store.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrganizationId,
          }),
        })
      );
      // Verify that id is NOT in the where clause
      const callArgs = (prisma.store.findMany as any).mock.calls[0][0];
      expect(callArgs.where.id).toBeUndefined();
      expect(result.stores).toHaveLength(2);
    });

    it('TEST 7 — [storeA] should filter to only storeA', async () => {
      (prisma.store.findMany as any).mockResolvedValue([
        { id: storeA, name: 'Store A' },
      ]);
      (prisma.store.count as any).mockResolvedValue(1);

      const result = await storeRepository.listByOrganization(mockOrganizationId, {
        authorizedStoreIds: [storeA],
      });

      expect(prisma.store.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrganizationId,
            id: { in: [storeA] },
          }),
        })
      );
      expect(result.stores).toHaveLength(1);
    });

    it('TEST 8 — [] (empty) should return empty result', async () => {
      const result = await storeRepository.listByOrganization(mockOrganizationId, {
        authorizedStoreIds: [],
      });

      // Should return early without calling Prisma
      expect(prisma.store.findMany).not.toHaveBeenCalled();
      expect(result).toEqual({ stores: [], total: 0 });
    });
  });

  describe('Sales Report Repository - authorizedStoreIds filtering', () => {
    it('TEST 9 — null (global) should NOT filter by store', async () => {
      (prisma.sale.findMany as any).mockResolvedValue([
        { id: 'sale-1', storeId: storeA, store: { id: storeA, name: 'Store A' }, items: [] },
        { id: 'sale-2', storeId: storeB, store: { id: storeB, name: 'Store B' }, items: [] },
      ]);

      const result = await salesReportRepository.getSalesByStore(mockOrganizationId, {}, null);

      expect(prisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrganizationId,
            status: 'COMPLETED',
          }),
        })
      );
      // Verify that storeId is NOT in the where clause
      const callArgs = (prisma.sale.findMany as any).mock.calls[0][0];
      expect(callArgs.where.storeId).toBeUndefined();
      expect(result).toHaveLength(2);
    });

    it('TEST 10 — [storeA] should filter to only storeA', async () => {
      (prisma.sale.findMany as any).mockResolvedValue([
        { id: 'sale-1', storeId: storeA, store: { id: storeA, name: 'Store A' }, items: [] },
      ]);

      const result = await salesReportRepository.getSalesByStore(mockOrganizationId, {}, [storeA]);

      expect(prisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrganizationId,
            status: 'COMPLETED',
            storeId: { in: [storeA] },
          }),
        })
      );
      expect(result).toHaveLength(1);
    });

    it('TEST 11 — [] (empty) should return empty result', async () => {
      const result = await salesReportRepository.getSalesByStore(mockOrganizationId, {}, []);

      // Should return early without calling Prisma
      expect(prisma.sale.findMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });
});
