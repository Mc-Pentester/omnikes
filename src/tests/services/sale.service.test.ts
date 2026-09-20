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
    updateWithTaxRate: vi.fn(),
    belongsToOrganization: vi.fn(),
    findById: vi.fn(),
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
    it('should calculate tax using organization tax configuration (10%)', async () => {
      const mockSaleId = 'sale-123';
      const mockOrganizationId = 'org-123';
      const mockTaxRate = 0.10;
      const mockItems = [
        { totalPrice: 100, discount: 0 },
        { totalPrice: 50, discount: 10 },
      ];

      (saleRepository.listItems as any).mockResolvedValue(mockItems);
      (prisma.sale.findUnique as any).mockResolvedValue({
        id: mockSaleId,
        applyTax: true,
        organization: {
          id: mockOrganizationId,
          taxConfiguration: {
            taxRate: mockTaxRate,
          },
        },
      });
      (saleRepository.updateWithTaxRate as any).mockResolvedValue({});

      await saleService.recalculateTotals(mockSaleId, mockOrganizationId);

      const expectedSubtotal = 150;
      const expectedDiscount = 10;
      const expectedTax = expectedSubtotal * mockTaxRate;
      const expectedTotal = expectedSubtotal + expectedTax - expectedDiscount;

      expect(saleRepository.updateWithTaxRate).toHaveBeenCalledWith(
        mockSaleId,
        mockOrganizationId,
        {
          subtotal: expectedSubtotal,
          discount: expectedDiscount,
          tax: expectedTax,
          taxRate: mockTaxRate,
          total: expectedTotal,
          applyTax: true,
        }
      );
    });

    it('should use zero tax when no tax configuration exists', async () => {
      const mockSaleId = 'sale-123';
      const mockOrganizationId = 'org-123';
      const mockItems = [
        { totalPrice: 100, discount: 0 },
      ];

      (saleRepository.listItems as any).mockResolvedValue(mockItems);
      (prisma.sale.findUnique as any).mockResolvedValue({
        id: mockSaleId,
        applyTax: true,
        organization: {
          id: mockOrganizationId,
          taxConfiguration: null,
        },
      });
      (saleRepository.updateWithTaxRate as any).mockResolvedValue({});

      await saleService.recalculateTotals(mockSaleId, mockOrganizationId);

      const expectedSubtotal = 100;
      const expectedDiscount = 0;
      const expectedTax = 0;
      const expectedTotal = expectedSubtotal + expectedTax - expectedDiscount;

      expect(saleRepository.updateWithTaxRate).toHaveBeenCalledWith(
        mockSaleId,
        mockOrganizationId,
        {
          subtotal: expectedSubtotal,
          discount: expectedDiscount,
          tax: expectedTax,
          taxRate: 0,
          total: expectedTotal,
          applyTax: true,
        }
      );
    });

    it('should handle different tax rates correctly (15%)', async () => {
      const mockSaleId = 'sale-123';
      const mockOrganizationId = 'org-123';
      const mockTaxRate = 0.15;
      const mockItems = [
        { totalPrice: 200, discount: 0 },
      ];

      (saleRepository.listItems as any).mockResolvedValue(mockItems);
      (prisma.sale.findUnique as any).mockResolvedValue({
        id: mockSaleId,
        applyTax: true,
        organization: {
          id: mockOrganizationId,
          taxConfiguration: {
            taxRate: mockTaxRate,
          },
        },
      });
      (saleRepository.updateWithTaxRate as any).mockResolvedValue({});

      await saleService.recalculateTotals(mockSaleId, mockOrganizationId);

      const expectedSubtotal = 200;
      const expectedDiscount = 0;
      const expectedTax = expectedSubtotal * mockTaxRate;
      const expectedTotal = expectedSubtotal + expectedTax - expectedDiscount;

      expect(saleRepository.updateWithTaxRate).toHaveBeenCalledWith(
        mockSaleId,
        mockOrganizationId,
        {
          subtotal: expectedSubtotal,
          discount: expectedDiscount,
          tax: expectedTax,
          taxRate: mockTaxRate,
          total: expectedTotal,
          applyTax: true,
        }
      );
    });

    it('should apply zero tax when applyTax is false', async () => {
      const mockSaleId = 'sale-123';
      const mockOrganizationId = 'org-123';
      const mockTaxRate = 0.10;
      const mockItems = [
        { totalPrice: 100, discount: 0 },
      ];

      (saleRepository.listItems as any).mockResolvedValue(mockItems);
      (prisma.sale.findUnique as any).mockResolvedValue({
        id: mockSaleId,
        applyTax: false,
        organization: {
          id: mockOrganizationId,
          taxConfiguration: {
            taxRate: mockTaxRate,
          },
        },
      });
      (saleRepository.updateWithTaxRate as any).mockResolvedValue({});

      await saleService.recalculateTotals(mockSaleId, mockOrganizationId);

      const expectedSubtotal = 100;
      const expectedDiscount = 0;
      const expectedTax = 0;
      const expectedTotal = expectedSubtotal + expectedTax - expectedDiscount;

      expect(saleRepository.updateWithTaxRate).toHaveBeenCalledWith(
        mockSaleId,
        mockOrganizationId,
        {
          subtotal: expectedSubtotal,
          discount: expectedDiscount,
          tax: expectedTax,
          taxRate: 0,
          total: expectedTotal,
          applyTax: false,
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
        applyTax: true,
        organization: {
          id: mockOrganizationId,
          taxConfiguration: {
            taxRate: mockTaxRate,
          },
        },
      });
      (saleRepository.updateWithTaxRate as any).mockResolvedValue({});

      await saleService.recalculateTotals(mockSaleId, mockOrganizationId);

      const expectedSubtotal = 100;
      const expectedDiscount = 0;
      const expectedTax = 0;
      const expectedTotal = expectedSubtotal + expectedTax - expectedDiscount;

      expect(saleRepository.updateWithTaxRate).toHaveBeenCalledWith(
        mockSaleId,
        mockOrganizationId,
        {
          subtotal: expectedSubtotal,
          discount: expectedDiscount,
          tax: expectedTax,
          taxRate: 0,
          total: expectedTotal,
          applyTax: true,
        }
      );
    });

    it('should correctly calculate total with discounts (10%)', async () => {
      const mockSaleId = 'sale-123';
      const mockOrganizationId = 'org-123';
      const mockTaxRate = 0.10;
      const mockItems = [
        { totalPrice: 100, discount: 10 },
        { totalPrice: 50, discount: 5 },
      ];

      (saleRepository.listItems as any).mockResolvedValue(mockItems);
      (prisma.sale.findUnique as any).mockResolvedValue({
        id: mockSaleId,
        applyTax: true,
        organization: {
          id: mockOrganizationId,
          taxConfiguration: {
            taxRate: mockTaxRate,
          },
        },
      });
      (saleRepository.updateWithTaxRate as any).mockResolvedValue({});

      await saleService.recalculateTotals(mockSaleId, mockOrganizationId);

      const expectedSubtotal = 150;
      const expectedDiscount = 15;
      const expectedTax = expectedSubtotal * mockTaxRate;
      const expectedTotal = expectedSubtotal + expectedTax - expectedDiscount;

      expect(saleRepository.updateWithTaxRate).toHaveBeenCalledWith(
        mockSaleId,
        mockOrganizationId,
        {
          subtotal: expectedSubtotal,
          discount: expectedDiscount,
          tax: expectedTax,
          taxRate: mockTaxRate,
          total: expectedTotal,
          applyTax: true,
        }
      );
    });

    it('should historize tax rate in sale', async () => {
      const mockSaleId = 'sale-123';
      const mockOrganizationId = 'org-123';
      const mockTaxRate = 0.10;
      const mockItems = [
        { totalPrice: 100, discount: 0 },
      ];

      (saleRepository.listItems as any).mockResolvedValue(mockItems);
      (prisma.sale.findUnique as any).mockResolvedValue({
        id: mockSaleId,
        applyTax: true,
        organization: {
          id: mockOrganizationId,
          taxConfiguration: {
            taxRate: mockTaxRate,
          },
        },
      });
      (saleRepository.updateWithTaxRate as any).mockResolvedValue({});

      await saleService.recalculateTotals(mockSaleId, mockOrganizationId);

      expect(saleRepository.updateWithTaxRate).toHaveBeenCalledWith(
        mockSaleId,
        mockOrganizationId,
        expect.objectContaining({
          taxRate: mockTaxRate,
        })
      );
    });
  });
});
