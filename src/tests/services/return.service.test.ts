import { beforeEach, describe, expect, it, vi } from 'vitest';
import { returnService } from '@omnikes/services/return.service';
import { prisma } from '@omnikes/lib/prisma';

vi.mock('@omnikes/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock('@omnikes/services/inventory.service', () => ({
  recordInventoryMovement: vi.fn(),
  updateInventoryQuantity: vi.fn(),
}));

vi.mock('@omnikes/services/store.service', () => ({
  storeService: {
    validateStoreBelongsToOrganization: vi.fn(),
  },
}));

describe('ReturnService', () => {
  const mockSale = {
    id: 'clh1234567890ab',
    organizationId: 'clh1234567890cd',
    storeId: 'clh1234567890ef',
    orderNumber: 'SALE-001',
    status: 'COMPLETED',
    total: 1000,
    items: [
      {
        id: 'clh1234567890ab',
        quantity: 5,
        returnedQuantity: 0,
        unitPrice: 100,
        variant: {
          id: 'clh1234567890gh',
          sku: 'SKU-1',
          product: {
            id: 'clh1234567890ij',
            name: 'Product 1',
          },
        },
      },
    ],
    store: {
      id: 'clh1234567890ef',
      organizationId: 'clh1234567890cd',
    },
  };

  const mockInventory = {
    id: 'clh1234567890kl',
    quantity: 10,
    reservedQuantity: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a return with valid partial return', async () => {
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: 'clh1234567890ab' }])
        .mockResolvedValueOnce([{ id: 'clh1234567890kl', quantity: 10, reservedQuantity: 0 }]),
      sale: {
        findUnique: vi.fn().mockResolvedValue(mockSale),
      },
      saleItem: {
        update: vi.fn().mockResolvedValue({}),
      },
      return: {
        create: vi.fn().mockResolvedValue({
          id: 'clh1234567890mn',
          totalRefunded: 200,
          items: [],
        }),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    const result = await returnService.create('clh1234567890cd', 'clh1234567890op', {
      saleId: 'clh1234567890ab',
      items: [{ saleItemId: 'clh1234567890ab', quantity: 2 }],
    });

    expect(tx.saleItem.update).toHaveBeenCalledWith({
      where: { id: 'clh1234567890ab' },
      data: { returnedQuantity: 2 },
    });
    expect(tx.return.create).toHaveBeenCalled();
  });

  it('rejects return when quantity exceeds available', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'clh1234567890ab' }]),
      sale: {
        findUnique: vi.fn().mockResolvedValue(mockSale),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await expect(
      returnService.create('clh1234567890cd', 'clh1234567890op', {
        saleId: 'clh1234567890ab',
        items: [{ saleItemId: 'clh1234567890ab', quantity: 10 }],
      })
    ).rejects.toThrow('Cannot return 10 units of SKU-1. Available: 5, Requested: 10');
  });

  it('rejects return for non-COMPLETED sale', async () => {
    const pendingSale = { ...mockSale, status: 'PENDING' };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'clh1234567890ab' }]),
      sale: {
        findUnique: vi.fn().mockResolvedValue(pendingSale),
      },
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await expect(
      returnService.create('clh1234567890cd', 'clh1234567890op', {
        saleId: 'clh1234567890ab',
        items: [{ saleItemId: 'clh1234567890ab', quantity: 1 }],
      })
    ).rejects.toThrow('Sale cannot be returned from status PENDING');
  });

  it('rejects return when sale does not belong to organization', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
    };

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await expect(
      returnService.create('clh1234567890cd', 'clh1234567890op', {
        saleId: 'clh1234567890ab',
        items: [{ saleItemId: 'clh1234567890ab', quantity: 1 }],
      })
    ).rejects.toThrow('Sale not found or access denied');
  });
});
