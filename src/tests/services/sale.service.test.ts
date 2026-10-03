import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saleService } from '@omnikes/services/sale.service';
import { prisma } from '@omnikes/lib/prisma';

// Mock dependencies
vi.mock('@omnikes/lib/prisma', () => ({
  prisma: {
    sale: {
      findFirst: vi.fn(),
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
    createItem: vi.fn(),
  },
}));

vi.mock('@omnikes/repositories/product-variant.repository', () => ({
  productVariantRepository: {
    findByIdWithOrganizationCheck: vi.fn(),
  },
}));

vi.mock('@omnikes/services/store.service', () => ({
  storeService: {
    validateStoreBelongsToOrganization: vi.fn(),
  },
}));

import { saleRepository } from '@omnikes/repositories/sale.repository';
import { productVariantRepository } from '@omnikes/repositories/product-variant.repository';
import { storeService } from '@omnikes/services/store.service';

describe('SaleService - Tax Calculation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recalculateTotals', () => {
    it('should calculate tax from discounted line totals without double-counting discounts (10%)', async () => {
      const mockSaleId = 'sale-123';
      const mockOrganizationId = 'org-123';
      const mockTaxRate = 0.10;
      const mockItems = [
        { totalPrice: 100, discount: 0 },
        { totalPrice: 50, discount: 10 },
      ];

      (saleRepository.listItems as any).mockResolvedValue(mockItems);
      (prisma.sale.findFirst as any).mockResolvedValue({
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
      const expectedTotal = expectedSubtotal + expectedTax;

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
      (prisma.sale.findFirst as any).mockResolvedValue({
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
      const expectedTotal = expectedSubtotal + expectedTax;

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
      (prisma.sale.findFirst as any).mockResolvedValue({
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
      const expectedTotal = expectedSubtotal + expectedTax;

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
      (prisma.sale.findFirst as any).mockResolvedValue({
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
      const expectedTotal = expectedSubtotal + expectedTax;

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
      (prisma.sale.findFirst as any).mockResolvedValue({
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
      const expectedTotal = expectedSubtotal + expectedTax;

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
      (prisma.sale.findFirst as any).mockResolvedValue({
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
      const expectedTotal = expectedSubtotal + expectedTax;

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
      (prisma.sale.findFirst as any).mockResolvedValue({
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
  describe('weighted product pricing', () => {
    it('uses server price per kilogram and quantity stored in grams', async () => {
      const variant = {
        id: 'cvariant123',
        price: 450,
        saleUnit: 'KG',
      };
      (saleRepository.belongsToOrganization as any).mockResolvedValue(true);
      (productVariantRepository.findByIdWithOrganizationCheck as any).mockResolvedValue(variant);
      (saleRepository.createItem as any).mockResolvedValue({ id: 'item-123' });
      (saleRepository.listItems as any).mockResolvedValue([]);
      (prisma.sale.findFirst as any).mockResolvedValue({
        applyTax: false,
        organization: { taxConfiguration: null },
      });
      (saleRepository.updateWithTaxRate as any).mockResolvedValue({});

      const result = await saleService.addItem('sale-123', 'org-123', {
        variantId: 'cvariant123',
        quantity: 1250,
        unitPrice: 999999,
        discount: 0,
      });

      expect(result).toEqual({ id: 'item-123' });
      expect(saleRepository.createItem).toHaveBeenCalledWith(expect.objectContaining({
        quantity: 1250,
        unitPrice: 0.45,
        totalPrice: 562.5,
        discount: 0,
      }));
    });

    it('keeps legacy unit pricing unchanged', async () => {
      (saleRepository.belongsToOrganization as any).mockResolvedValue(true);
      (productVariantRepository.findByIdWithOrganizationCheck as any).mockResolvedValue({
        id: 'cvariant123',
        price: 250,
        saleUnit: 'UNIT',
      });
      (saleRepository.createItem as any).mockResolvedValue({ id: 'item-123' });
      (saleRepository.listItems as any).mockResolvedValue([]);
      (prisma.sale.findFirst as any).mockResolvedValue({
        applyTax: false,
        organization: { taxConfiguration: null },
      });
      (saleRepository.updateWithTaxRate as any).mockResolvedValue({});

      await saleService.addItem('sale-123', 'org-123', {
        variantId: 'cvariant123',
        quantity: 2,
        unitPrice: 1,
        discount: 0,
      });

      expect(saleRepository.createItem).toHaveBeenCalledWith(expect.objectContaining({
        quantity: 2,
        unitPrice: 250,
        totalPrice: 500,
      }));
    });
  });

});
