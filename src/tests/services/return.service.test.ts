import { beforeEach, describe, expect, it, vi } from 'vitest';
import { returnService } from '@omnikes/services/return.service';
import { prisma } from '@omnikes/lib/prisma';

vi.mock('@omnikes/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    return: {
      findFirst: vi.fn(),
    },
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
    subtotal: 500,
    tax: 0,
    total: 1000,
    items: [
      {
        id: 'clh1234567890ab',
        quantity: 5,
        returnedQuantity: 0,
        unitPrice: 100,
        totalPrice: 500,
        discount: 0,
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.return.findFirst).mockReset();
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

    await returnService.create('clh1234567890cd', 'clh1234567890op', {
      saleId: 'clh1234567890ab',
      items: [{ saleItemId: 'clh1234567890ab', quantity: 2 }],
    });

    expect(tx.saleItem.update).toHaveBeenCalledWith({
      where: { id: 'clh1234567890ab' },
      data: { returnedQuantity: 2 },
    });
    expect(tx.return.create).toHaveBeenCalled();
  });

  it('calculates partial return refund from the discounted line total', async () => {
    const discountedSale = {
      ...mockSale,
      items: [{
        ...mockSale.items[0],
        quantity: 5,
        unitPrice: 100,
        discount: 100,
        totalPrice: 400,
        returnedQuantity: 0,
      }],
    };
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: 'clh1234567890ab' }])
        .mockResolvedValueOnce([{ id: 'clh1234567890kl', quantity: 10, reservedQuantity: 0 }]),
      sale: { findUnique: vi.fn().mockResolvedValue(discountedSale) },
      saleItem: { update: vi.fn().mockResolvedValue({}) },
      return: {
        create: vi.fn().mockResolvedValue({ id: 'discounted-return', totalRefunded: 160, items: [] }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await returnService.create('clh1234567890cd', 'clh1234567890op', {
      saleId: 'clh1234567890ab',
      items: [{ saleItemId: 'clh1234567890ab', quantity: 2 }],
    });

    expect(tx.return.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        totalRefunded: 160,
        items: {
          create: [expect.objectContaining({
            quantity: 2,
            totalRefunded: 160,
            unitPrice: 80,
          })],
        },
      }),
    }));
  });

  it('includes the prorated sale tax in a partial return refund', async () => {
    const taxedSale = {
      ...mockSale,
      subtotal: 400,
      tax: 40,
      total: 440,
      items: [{
        ...mockSale.items[0],
        quantity: 5,
        unitPrice: 100,
        discount: 100,
        totalPrice: 400,
        returnedQuantity: 0,
      }],
    };
    const tx = {
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: 'clh1234567890ab' }])
        .mockResolvedValueOnce([{ id: 'clh1234567890kl', quantity: 10, reservedQuantity: 0 }]),
      sale: { findUnique: vi.fn().mockResolvedValue(taxedSale) },
      saleItem: { update: vi.fn().mockResolvedValue({}) },
      return: {
        create: vi.fn().mockResolvedValue({ id: 'taxed-return', totalRefunded: 176, items: [] }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await returnService.create('clh1234567890cd', 'clh1234567890op', {
      saleId: 'clh1234567890ab',
      items: [{ saleItemId: 'clh1234567890ab', quantity: 2 }],
    });

    expect(tx.return.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        totalRefunded: 176,
        items: {
          create: [expect.objectContaining({
            quantity: 2,
            totalRefunded: 176,
            unitPrice: 88,
          })],
        },
      }),
    }));
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
  it('returns the existing return when concurrent requests use the same idempotency key and payload', async () => {
    const existingReturn = {
      id: 'existing-return',
      organizationId: 'clh1234567890cd',
      idempotencyKey: 'return-key-001',
      idempotencyRequestHash: 'hash-001',
      items: [],
    };
    vi.mocked(prisma.$transaction).mockRejectedValue({ code: 'P2002' });
    vi.mocked(prisma.return.findFirst).mockResolvedValue(existingReturn as never);

    await expect(
      returnService.create(
        'clh1234567890cd',
        'clh1234567890op',
        { saleId: 'clh1234567890ab', items: [{ saleItemId: 'clh1234567890ab', quantity: 1 }] },
        { key: 'return-key-001', requestHash: 'hash-001' },
      ),
    ).resolves.toEqual(existingReturn);
  });

  it('rejects reusing a return idempotency key with a different payload', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue({ code: 'P2002' });
    vi.mocked(prisma.return.findFirst).mockResolvedValue({
      id: 'existing-return',
      idempotencyRequestHash: 'different-hash',
    } as never);

    await expect(
      returnService.create(
        'clh1234567890cd',
        'clh1234567890op',
        { saleId: 'clh1234567890ab', items: [{ saleItemId: 'clh1234567890ab', quantity: 1 }] },
        { key: 'return-key-001', requestHash: 'hash-001' },
      ),
    ).rejects.toThrow('Idempotency-Key already used with different return data');
  });

});
