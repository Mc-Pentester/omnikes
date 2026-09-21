import { describe, it, expect, vi, beforeEach } from 'vitest';
import { proformaService } from '@omnikes/services/proforma.service';
import { prisma } from '@omnikes/lib/prisma';

// Mock dependencies
vi.mock('@omnikes/lib/prisma', () => ({
  prisma: {
    proforma: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    sale: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    saleItem: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

const prismaMock = prisma as any;

vi.mock('@omnikes/repositories/proforma.repository', () => ({
  proformaRepository: {
    findById: vi.fn(),
    belongsToOrganization: vi.fn(),
    updateStatus: vi.fn(),
    listItems: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('@omnikes/repositories/product-variant.repository', () => ({
  productVariantRepository: {
    findByIdWithOrganizationCheck: vi.fn(),
  },
}));

import { proformaRepository } from '@omnikes/repositories/proforma.repository';

describe('ProformaService - Acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('accept', () => {
    it('should accept a SENT proforma', async () => {
      const mockProformaId = 'proforma-123';
      const mockOrganizationId = 'org-123';
      const mockProforma = {
        id: mockProformaId,
        organizationId: mockOrganizationId,
        status: 'SENT',
      };

      (proformaRepository.belongsToOrganization as any).mockResolvedValue(true);
      (proformaRepository.findById as any).mockResolvedValue(mockProforma);
      (proformaRepository.updateStatus as any).mockResolvedValue({ ...mockProforma, status: 'ACCEPTED' });
      (proformaRepository.listItems as any).mockResolvedValue([]);
      (proformaRepository.update as any).mockResolvedValue(mockProforma);
      (prismaMock.proforma.findUnique as any).mockResolvedValue({
        ...mockProforma,
        organization: {
          taxConfiguration: { taxRate: 0.1 },
        },
      });

      const result = await proformaService.accept(mockProformaId, mockOrganizationId);

      expect(proformaRepository.updateStatus).toHaveBeenCalledWith(
        mockProformaId,
        mockOrganizationId,
        'ACCEPTED'
      );
    });

    it('should reject acceptance for DRAFT status', async () => {
      const mockProformaId = 'proforma-123';
      const mockOrganizationId = 'org-123';
      const mockProforma = {
        id: mockProformaId,
        organizationId: mockOrganizationId,
        status: 'DRAFT',
      };

      (proformaRepository.belongsToOrganization as any).mockResolvedValue(true);
      (proformaRepository.findById as any).mockResolvedValue(mockProforma);

      await expect(proformaService.accept(mockProformaId, mockOrganizationId))
        .rejects.toThrow('Cannot accept proforma with status DRAFT');
    });

    it('should reject acceptance for ACCEPTED status', async () => {
      const mockProformaId = 'proforma-123';
      const mockOrganizationId = 'org-123';
      const mockProforma = {
        id: mockProformaId,
        organizationId: mockOrganizationId,
        status: 'ACCEPTED',
      };

      (proformaRepository.belongsToOrganization as any).mockResolvedValue(true);
      (proformaRepository.findById as any).mockResolvedValue(mockProforma);

      await expect(proformaService.accept(mockProformaId, mockOrganizationId))
        .rejects.toThrow('Cannot accept proforma with status ACCEPTED');
    });

    it('should reject acceptance for REJECTED status', async () => {
      const mockProformaId = 'proforma-123';
      const mockOrganizationId = 'org-123';
      const mockProforma = {
        id: mockProformaId,
        organizationId: mockOrganizationId,
        status: 'REJECTED',
      };

      (proformaRepository.belongsToOrganization as any).mockResolvedValue(true);
      (proformaRepository.findById as any).mockResolvedValue(mockProforma);

      await expect(proformaService.accept(mockProformaId, mockOrganizationId))
        .rejects.toThrow('Cannot accept proforma with status REJECTED');
    });

    it('should reject acceptance for EXPIRED status', async () => {
      const mockProformaId = 'proforma-123';
      const mockOrganizationId = 'org-123';
      const mockProforma = {
        id: mockProformaId,
        organizationId: mockOrganizationId,
        status: 'EXPIRED',
      };

      (proformaRepository.belongsToOrganization as any).mockResolvedValue(true);
      (proformaRepository.findById as any).mockResolvedValue(mockProforma);

      await expect(proformaService.accept(mockProformaId, mockOrganizationId))
        .rejects.toThrow('Cannot accept proforma with status EXPIRED');
    });

    it('should reject acceptance for CONVERTED status', async () => {
      const mockProformaId = 'proforma-123';
      const mockOrganizationId = 'org-123';
      const mockProforma = {
        id: mockProformaId,
        organizationId: mockOrganizationId,
        status: 'CONVERTED',
      };

      (proformaRepository.belongsToOrganization as any).mockResolvedValue(true);
      (proformaRepository.findById as any).mockResolvedValue(mockProforma);

      await expect(proformaService.accept(mockProformaId, mockOrganizationId))
        .rejects.toThrow('Cannot accept proforma with status CONVERTED');
    });

    it('should reject acceptance for CANCELLED status', async () => {
      const mockProformaId = 'proforma-123';
      const mockOrganizationId = 'org-123';
      const mockProforma = {
        id: mockProformaId,
        organizationId: mockOrganizationId,
        status: 'CANCELLED',
      };

      (proformaRepository.belongsToOrganization as any).mockResolvedValue(true);
      (proformaRepository.findById as any).mockResolvedValue(mockProforma);

      await expect(proformaService.accept(mockProformaId, mockOrganizationId))
        .rejects.toThrow('Cannot accept proforma with status CANCELLED');
    });

    it('should reject acceptance for wrong organization', async () => {
      const mockProformaId = 'proforma-123';
      const mockOrganizationId = 'org-123';

      (proformaRepository.belongsToOrganization as any).mockResolvedValue(false);

      await expect(proformaService.accept(mockProformaId, mockOrganizationId))
        .rejects.toThrow('Proforma not found or access denied');
    });
  });
});

describe('ProformaService - Conversion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('convert', () => {
    it('should convert an ACCEPTED proforma to a sale', async () => {
      const mockProformaId = 'proforma-123';
      const mockOrganizationId = 'org-123';
      const mockProforma = {
        id: mockProformaId,
        organizationId: mockOrganizationId,
        storeId: 'store-123',
        customerId: 'customer-123',
        status: 'ACCEPTED',
        subtotal: 100,
        tax: 10,
        taxRate: 0.1,
        total: 110,
        discount: 0,
        applyTax: true,
        notes: 'Test proforma',
        items: [
          {
            variantId: 'variant-123',
            quantity: 2,
            unitPrice: 50,
            totalPrice: 100,
            discount: 0,
            variant: { id: 'variant-123' },
          },
        ],
        organization: { id: mockOrganizationId },
        store: { id: 'store-123' },
        customer: { id: 'customer-123' },
      };

      const mockSale = {
        id: 'sale-123',
        orderNumber: 'SALE-ABC',
        subtotal: 100,
        tax: 10,
        taxRate: 0.1,
        total: 110,
        discount: 0,
        applyTax: true,
      };

      (prismaMock.$transaction as any).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      (prismaMock.proforma.findUnique as any).mockResolvedValue(mockProforma);
      (prismaMock.sale.findFirst as any).mockResolvedValue(null);
      (prismaMock.sale.create as any).mockResolvedValue(mockSale);
      (prismaMock.saleItem.create as any).mockResolvedValue({});
      (prismaMock.proforma.update as any).mockResolvedValue({});
      (prismaMock.sale.findUnique as any).mockResolvedValue({
        ...mockSale,
        store: { id: 'store-123' },
        customer: { id: 'customer-123' },
        items: [
          {
            variant: {
              product: { id: 'product-123' },
            },
          },
        ],
      });

      const result = await proformaService.convert(mockProformaId, mockOrganizationId);

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizationId: mockOrganizationId,
            storeId: 'store-123',
            customerId: 'customer-123',
            channel: 'POS',
            status: 'PENDING',
            subtotal: 100,
            tax: 10,
            taxRate: 0.1,
            total: 110,
            discount: 0,
            applyTax: true,
            notes: 'Test proforma',
            convertedFromProformaId: mockProformaId,
          }),
        })
      );

      expect(prisma.proforma.update).toHaveBeenCalledWith({
        where: { id: mockProformaId },
        data: { status: 'CONVERTED' },
      });

      expect(prisma.saleItem.create).toHaveBeenCalledTimes(1);
    });

    it('should reject conversion for non-ACCEPTED status', async () => {
      const mockProformaId = 'proforma-123';
      const mockOrganizationId = 'org-123';
      const mockProforma = {
        id: mockProformaId,
        organizationId: mockOrganizationId,
        status: 'DRAFT',
        items: [],
        organization: { id: mockOrganizationId },
        store: { id: 'store-123' },
      };

      (prismaMock.$transaction as any).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      (prismaMock.proforma.findUnique as any).mockResolvedValue(mockProforma);

      await expect(proformaService.convert(mockProformaId, mockOrganizationId))
        .rejects.toThrow('Cannot convert proforma with status DRAFT');
    });

    it('should reject conversion for already converted proforma', async () => {
      const mockProformaId = 'proforma-123';
      const mockOrganizationId = 'org-123';
      const mockProforma = {
        id: mockProformaId,
        organizationId: mockOrganizationId,
        status: 'ACCEPTED',
        items: [],
        organization: { id: mockOrganizationId },
        store: { id: 'store-123' },
      };

      (prismaMock.$transaction as any).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      (prismaMock.proforma.findUnique as any).mockResolvedValue(mockProforma);
      (prismaMock.sale.findFirst as any).mockResolvedValue({ id: 'sale-123' });

      await expect(proformaService.convert(mockProformaId, mockOrganizationId))
        .rejects.toThrow('Proforma has already been converted to a sale');
    });

    it('should reject conversion for empty proforma', async () => {
      const mockProformaId = 'proforma-123';
      const mockOrganizationId = 'org-123';
      const mockProforma = {
        id: mockProformaId,
        organizationId: mockOrganizationId,
        status: 'ACCEPTED',
        items: [],
        organization: { id: mockOrganizationId },
        store: { id: 'store-123' },
      };

      (prismaMock.$transaction as any).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      (prismaMock.proforma.findUnique as any).mockResolvedValue(mockProforma);
      (prismaMock.sale.findFirst as any).mockResolvedValue(null);

      await expect(proformaService.convert(mockProformaId, mockOrganizationId))
        .rejects.toThrow('Cannot convert an empty proforma');
    });

    it('should reject conversion for wrong organization', async () => {
      const mockProformaId = 'proforma-123';
      const mockOrganizationId = 'org-123';
      const mockProforma = {
        id: mockProformaId,
        organizationId: 'org-456',
        status: 'ACCEPTED',
        items: [],
        organization: { id: 'org-456' },
        store: { id: 'store-123' },
      };

      (prismaMock.$transaction as any).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      (prismaMock.proforma.findUnique as any).mockResolvedValue(mockProforma);

      await expect(proformaService.convert(mockProformaId, mockOrganizationId))
        .rejects.toThrow('Proforma not found or access denied');
    });

    it('should preserve fiscal data from proforma to sale', async () => {
      const mockProformaId = 'proforma-123';
      const mockOrganizationId = 'org-123';
      const mockProforma = {
        id: mockProformaId,
        organizationId: mockOrganizationId,
        storeId: 'store-123',
        status: 'ACCEPTED',
        subtotal: 200,
        tax: 20,
        taxRate: 0.1,
        total: 220,
        discount: 0,
        applyTax: true,
        items: [
          {
            variantId: 'variant-123',
            quantity: 1,
            unitPrice: 200,
            totalPrice: 200,
            discount: 0,
            variant: { id: 'variant-123' },
          },
        ],
        organization: { id: mockOrganizationId },
        store: { id: 'store-123' },
      };

      (prismaMock.$transaction as any).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      (prismaMock.proforma.findUnique as any).mockResolvedValue(mockProforma);
      (prismaMock.sale.findFirst as any).mockResolvedValue(null);
      (prismaMock.sale.create as any).mockResolvedValue({ id: 'sale-123' });
      (prismaMock.saleItem.create as any).mockResolvedValue({});
      (prismaMock.proforma.update as any).mockResolvedValue({});
      (prismaMock.sale.findUnique as any).mockResolvedValue({
        id: 'sale-123',
        store: { id: 'store-123' },
        items: [],
      });

      await proformaService.convert(mockProformaId, mockOrganizationId);

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            taxRate: 0.1,
            applyTax: true,
          }),
        })
      );
    });

    it('should handle conversion without customer', async () => {
      const mockProformaId = 'proforma-123';
      const mockOrganizationId = 'org-123';
      const mockProforma = {
        id: mockProformaId,
        organizationId: mockOrganizationId,
        storeId: 'store-123',
        customerId: null,
        status: 'ACCEPTED',
        subtotal: 100,
        tax: 10,
        taxRate: 0.1,
        total: 110,
        discount: 0,
        applyTax: true,
        items: [
          {
            variantId: 'variant-123',
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
            discount: 0,
            variant: { id: 'variant-123' },
          },
        ],
        organization: { id: mockOrganizationId },
        store: { id: 'store-123' },
      };

      (prismaMock.$transaction as any).mockImplementation(async (callback) => {
        return callback(prisma);
      });

      (prismaMock.proforma.findUnique as any).mockResolvedValue(mockProforma);
      (prismaMock.sale.findFirst as any).mockResolvedValue(null);
      (prismaMock.sale.create as any).mockResolvedValue({ id: 'sale-123' });
      (prismaMock.saleItem.create as any).mockResolvedValue({});
      (prismaMock.proforma.update as any).mockResolvedValue({});
      (prismaMock.sale.findUnique as any).mockResolvedValue({
        id: 'sale-123',
        store: { id: 'store-123' },
        items: [],
      });

      await proformaService.convert(mockProformaId, mockOrganizationId);

      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: null,
          }),
        })
      );
    });
  });
});
