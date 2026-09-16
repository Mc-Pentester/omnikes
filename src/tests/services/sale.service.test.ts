import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saleService } from '@omnikes/services/sale.service';
import { prisma } from '@omnikes/lib/prisma';

// Mock dependencies
vi.mock('@omnikes/lib/prisma', () => ({
  prisma: {
    sale: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@omnikes/repositories/sale.repository', () => ({
  saleRepository: {
    listItems: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@omnikes/services/store.service', () => ({
  storeService: {
    validateStoreBelongsToOrganization: vi.fn(),
  },
}));

import { saleRepository } from '@omnikes/repositories/sale.repository';
import { storeService } from '@omnikes/services/store.service';

describe('SaleService - Tax Calculation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recalculateTotals', () => {
    it('should calculate tax using organization tax configuration', async () => {
      const mockSaleId = 'sale-123';
      const mockOrganizationId = 'org-123';
      const mockTaxRate = 0.18;
      const mockItems = [
        { totalPrice: 100, discount: 0 },
        { totalPrice: 50, discount: 10 },
      ];

      (saleRepository.listItems as any).mockResolvedValue(mockItems);
      (prisma.sale.findUnique as any).mockResolvedValue({
        id: mockSaleId,
        organization: {
          id: mockOrganizationId,
          taxConfiguration: {
            taxRate: mockTaxRate,
          },
        },
      });
      (saleRepository.update as any).mockResolvedValue({});

      await saleService.recalculateTotals(mockSaleId, mockOrganizationId);

      const expectedSubtotal = 150;
      const expectedDiscount = 10;
      const expectedTax = expectedSubtotal * mockTaxRate;
      const expectedTotal = expectedSubtotal + expectedTax - expectedDiscount;

      expect(saleRepository.update).toHaveBeenCalledWith(
        mockSaleId,
        mockOrganizationId,
        {
          subtotal: expectedSubtotal,
          discount: expectedDiscount,
          tax: expectedTax,
          total: expectedTotal,
        }
      );
    });

    it('should use fallback 0.18 when no tax configuration exists', async () => {
      const mockSaleId = 'sale-123';
      const mockOrganizationId = 'org-123';
      const mockItems = [
        { totalPrice: 100, discount: 0 },
      ];

      (saleRepository.listItems as any).mockResolvedValue(mockItems);
      (prisma.sale.findUnique as any).mockResolvedValue({
        id: mockSaleId,
        organization: {
          id: mockOrganizationId,
          taxConfiguration: null,
        },
      });
      (saleRepository.update as any).mockResolvedValue({});

      await saleService.recalculateTotals(mockSaleId, mockOrganizationId);

      const expectedSubtotal = 100;
      const expectedDiscount = 0;
      const expectedTax = expectedSubtotal * 0.18;
      const expectedTotal = expectedSubtotal + expectedTax - expectedDiscount;

      expect(saleRepository.update).toHaveBeenCalledWith(
        mockSaleId,
        mockOrganizationId,
        {
          subtotal: expectedSubtotal,
          discount: expectedDiscount,
          tax: expectedTax,
          total: expectedTotal,
        }
      );
    });

    it('should handle different tax rates correctly', async () => {
      const mockSaleId = 'sale-123';
      const mockOrganizationId = 'org-123';
      const mockTaxRate = 0.15;
      const mockItems = [
        { totalPrice: 200, discount: 0 },
      ];

      (saleRepository.listItems as any).mockResolvedValue(mockItems);
      (prisma.sale.findUnique as any).mockResolvedValue({
        id: mockSaleId,
        organization: {
          id: mockOrganizationId,
          taxConfiguration: {
            taxRate: mockTaxRate,
          },
        },
      });
      (saleRepository.update as any).mockResolvedValue({});

      await saleService.recalculateTotals(mockSaleId, mockOrganizationId);

      const expectedSubtotal = 200;
      const expectedDiscount = 0;
      const expectedTax = expectedSubtotal * mockTaxRate;
      const expectedTotal = expectedSubtotal + expectedTax - expectedDiscount;

      expect(saleRepository.update).toHaveBeenCalledWith(
        mockSaleId,
        mockOrganizationId,
        {
          subtotal: expectedSubtotal,
          discount: expectedDiscount,
          tax: expectedTax,
          total: expectedTotal,
        }
      );
    });

    it('should handle zero tax rate (tax exempt)', async () => {
      const mockSaleId = 'sale-123';
      const mockOrganizationId = 'org-123';
      const mockTaxRate = 0;
      const mockItems = [
        { totalPrice: 100, discount: 0 },
      ];

      (saleRepository.listItems as any).mockResolvedValue(mockItems);
      (prisma.sale.findUnique as any).mockResolvedValue({
        id: mockSaleId,
        organization: {
          id: mockOrganizationId,
          taxConfiguration: {
            taxRate: mockTaxRate,
          },
        },
      });
      (saleRepository.update as any).mockResolvedValue({});

      await saleService.recalculateTotals(mockSaleId, mockOrganizationId);

      const expectedSubtotal = 100;
      const expectedDiscount = 0;
      const expectedTax = 0;
      const expectedTotal = expectedSubtotal + expectedTax - expectedDiscount;

      expect(saleRepository.update).toHaveBeenCalledWith(
        mockSaleId,
        mockOrganizationId,
        {
          subtotal: expectedSubtotal,
          discount: expectedDiscount,
          tax: expectedTax,
          total: expectedTotal,
        }
      );
    });

    it('should correctly calculate total with discounts', async () => {
      const mockSaleId = 'sale-123';
      const mockOrganizationId = 'org-123';
      const mockTaxRate = 0.18;
      const mockItems = [
        { totalPrice: 100, discount: 10 },
        { totalPrice: 50, discount: 5 },
      ];

      (saleRepository.listItems as any).mockResolvedValue(mockItems);
      (prisma.sale.findUnique as any).mockResolvedValue({
        id: mockSaleId,
        organization: {
          id: mockOrganizationId,
          taxConfiguration: {
            taxRate: mockTaxRate,
          },
        },
      });
      (saleRepository.update as any).mockResolvedValue({});

      await saleService.recalculateTotals(mockSaleId, mockOrganizationId);

      const expectedSubtotal = 150;
      const expectedDiscount = 15;
      const expectedTax = expectedSubtotal * mockTaxRate;
      const expectedTotal = expectedSubtotal + expectedTax - expectedDiscount;

      expect(saleRepository.update).toHaveBeenCalledWith(
        mockSaleId,
        mockOrganizationId,
        {
          subtotal: expectedSubtotal,
          discount: expectedDiscount,
          tax: expectedTax,
          total: expectedTotal,
        }
      );
    });
  });
});
