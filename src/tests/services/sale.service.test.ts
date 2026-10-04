describe('SaleService - Financial authority at creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ignores client-supplied sale financial totals until server-priced items are added', async () => {
    (storeService.validateStoreBelongsToOrganization as any).mockResolvedValue(undefined);
    (prisma.organization.findUnique as any).mockResolvedValue({
      id: 'corg1234567',
      taxConfiguration: { taxRate: 0.10 },
    });
    (saleRepository.create as any).mockResolvedValue({ id: 'sale-123' });

    const result = await saleService.create('corg1234567', {
      organizationId: 'corg1234567',
      storeId: 'cstore1234567',
      orderNumber: 'ORD-123',
      status: 'PENDING',
      subtotal: 9999,
      tax: 999,
      total: 10998,
      discount: 500,
      applyTax: true,
    });

    expect(result).toEqual({ id: 'sale-123' });
    expect(saleRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      subtotal: 0,
      discount: 0,
      tax: 0,
      taxRate: 0.10,
      total: 0,
      applyTax: true,
    }));
  });
});

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
    organization: {
      findUnique: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@omnikes/repositories/sale.repository', () => ({
  saleRepository: {
    create: vi.fn(),
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
      const mockOrganizationId = 'corg1234567';
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
      const mockOrganizationId = 'corg1234567';
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
      const mockOrganizationId = 'corg1234567';
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
      const mockOrganizationId = 'corg1234567';
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
      const mockOrganizationId = 'corg1234567';
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
      const mockOrganizationId = 'corg1234567';
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
      const mockOrganizationId = 'corg1234567';
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

      const result = await saleService.addItem('sale-123', 'corg1234567', {
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

      await saleService.addItem('sale-123', 'corg1234567', {
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


describe('P1-C - Customer tenant isolation in sales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (storeService.validateStoreBelongsToOrganization as any).mockResolvedValue(undefined);
    (prisma.organization.findUnique as any).mockResolvedValue({
      id: 'corg1234567',
      taxConfiguration: { taxRate: 0.10 },
    });
  });

  it('rejects sale creation when customer belongs to another organization', async () => {
    (prisma.customer.findFirst as any).mockResolvedValue(null);

    await expect(
      saleService.create('corg1234567', {
        organizationId: 'corg1234567',
        storeId: 'cstore1234567',
        orderNumber: 'ORD-P1C',
        status: 'PENDING',
        customerId: 'ccustomer99999999999999999',
        subtotal: 0,
        tax: 0,
        total: 0,
        discount: 0,
        applyTax: true,
      })
    ).rejects.toThrow('Invalid customer');

    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'ccustomer99999999999999999',
        organizationId: 'corg1234567',
      },
      select: { id: true },
    });
    expect(saleRepository.create).not.toHaveBeenCalled();
  });

  it('allows sale creation when customer belongs to the authenticated organization', async () => {
    (prisma.customer.findFirst as any).mockResolvedValue({ id: 'ccustomer99999999999999999' });
    (saleRepository.create as any).mockResolvedValue({ id: 'sale-p1c' });

    await expect(
      saleService.create('corg1234567', {
        organizationId: 'corg1234567',
        storeId: 'cstore1234567',
        orderNumber: 'ORD-P1C',
        status: 'PENDING',
        customerId: 'ccustomer99999999999999999',
        subtotal: 0,
        tax: 0,
        total: 0,
        discount: 0,
        applyTax: true,
      })
    ).resolves.toEqual({ id: 'sale-p1c' });

    expect(saleRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'ccustomer99999999999999999',
        organization: { connect: { id: 'corg1234567' } },
      })
    );
  });

  it('rejects sale update when the new customer belongs to another organization', async () => {
    (saleRepository.belongsToOrganization as any).mockResolvedValue(true);
    (prisma.customer.findFirst as any).mockResolvedValue(null);

    await expect(
      saleService.update('sale-p1c', 'corg1234567', {
        customerId: 'ccustomer99999999999999999',
      })
    ).rejects.toThrow('Invalid customer');

    expect(saleRepository.update).not.toHaveBeenCalled();
  });

  it('scopes customer validation to the authenticated organization on sale update', async () => {
    (saleRepository.belongsToOrganization as any).mockResolvedValue(true);
    (prisma.customer.findFirst as any).mockResolvedValue({ id: 'ccustomer99999999999999999' });
    (saleRepository.update as any).mockResolvedValue({});
    (saleRepository.findById as any).mockResolvedValue({ id: 'sale-p1c' });

    await saleService.update('sale-p1c', 'corg1234567', {
      customerId: 'ccustomer99999999999999999',
    });

    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'ccustomer99999999999999999',
        organizationId: 'corg1234567',
      },
      select: { id: true },
    });
    expect(saleRepository.update).toHaveBeenCalledWith(
      'sale-p1c',
      'corg1234567',
      { customerId: 'ccustomer99999999999999999' }
    );
  });
});


describe('P1-E - addPayment financial coverage', () => {
  const tx = {
    $queryRaw: vi.fn(),
    sale: { findUnique: vi.fn() },
    payment: { create: vi.fn() },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.$transaction as any).mockImplementation(async (callback: any) => callback(tx));
  });

  it('subtracts authorized SaleCredit before admitting a real payment', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'sale-p1e' }]);
    tx.sale.findUnique.mockResolvedValue({
      id: 'sale-p1e',
      total: 100,
      payments: [{ amount: 40, status: 'COMPLETED', method: 'CASH' }],
      saleCredit: { amount: 40, status: 'AUTHORIZED' },
    });
    tx.payment.create.mockResolvedValue({ id: 'payment-p1e' });

    await expect(
      saleService.addPayment('sale-p1e', 'org-p1e', {
        method: 'CASH',
        amount: 20,
        status: 'COMPLETED',
      })
    ).resolves.toEqual({ id: 'payment-p1e' });

    expect(tx.payment.create).toHaveBeenCalledTimes(1);
  });

  it('rejects payment above the balance after authorized SaleCredit', async () => {
    tx.$queryRaw.mockResolvedValue([{ id: 'sale-p1e' }]);
    tx.sale.findUnique.mockResolvedValue({
      id: 'sale-p1e',
      total: 100,
      payments: [{ amount: 40, status: 'COMPLETED', method: 'CASH' }],
      saleCredit: { amount: 40, status: 'AUTHORIZED' },
    });

    await expect(
      saleService.addPayment('sale-p1e', 'org-p1e', {
        method: 'CASH',
        amount: 21,
        status: 'COMPLETED',
      })
    ).rejects.toThrow('Payment amount exceeds remaining balance');

    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});
