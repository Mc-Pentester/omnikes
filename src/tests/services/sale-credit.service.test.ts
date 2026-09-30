import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saleService } from '@omnikes/services/sale.service';
import { prisma } from '@omnikes/lib/prisma';

vi.mock('@omnikes/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
  },
}));

vi.mock('@omnikes/repositories/sale.repository', () => ({
  saleRepository: {
    belongsToOrganization: vi.fn(),
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

describe('SaleService - explicit credit and completion coverage', () => {
  const baseSale = {
    id: 'sale-1',
    organizationId: 'org-1',
    storeId: 'store-1',
    orderNumber: 'SALE-001',
    status: 'PENDING',
    total: 1000,
    customerId: 'customer-1',
    items: [],
    payments: [],
    saleCredit: null,
  };

  const makeTx = (sale: typeof baseSale) => ({
    $queryRaw: vi.fn().mockResolvedValue([{ id: sale.id, quantity: 10, reservedQuantity: 0 }]),
    sale: {
      findUnique: vi.fn().mockResolvedValue(sale),
      update: vi.fn().mockResolvedValue({ ...sale, status: 'COMPLETED' }),
    },
    inventory: {
      update: vi.fn().mockResolvedValue({}),
    },
    inventoryMovement: {
      create: vi.fn().mockResolvedValue({}),
    },
    customer: {
      findFirst: vi.fn().mockResolvedValue({ id: 'customer-1' }),
    },
    saleCredit: {
      create: vi.fn().mockResolvedValue({
        id: 'credit-1',
        saleId: sale.id,
        customerId: 'customer-1',
        amount: 400,
        status: 'AUTHORIZED',
      }),
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows full real payment without credit', async () => {
    const tx = makeTx({
      ...baseSale,
      payments: [{ status: 'COMPLETED', method: 'CASH', amount: 1000 }],
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await saleService.complete('sale-1', 'org-1');

    expect(tx.sale.update).toHaveBeenCalledWith({
      where: { id: 'sale-1' },
      data: { status: 'COMPLETED' },
    });
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('allows partial payment plus authorized credit when coverage is complete', async () => {
    const tx = makeTx({
      ...baseSale,
      payments: [{ status: 'COMPLETED', method: 'CASH', amount: 600 }],
      saleCredit: { amount: 400, status: 'AUTHORIZED' },
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await saleService.complete('sale-1', 'org-1');

    expect(tx.sale.update).toHaveBeenCalled();
  });

  it('rejects partial payment without sufficient authorized credit', async () => {
    const tx = makeTx({
      ...baseSale,
      payments: [{ status: 'COMPLETED', method: 'CASH', amount: 600 }],
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await expect(saleService.complete('sale-1', 'org-1'))
      .rejects
      .toThrow('Insufficient financial coverage');

    expect(tx.inventory.update).not.toHaveBeenCalled();
    expect(tx.sale.update).not.toHaveBeenCalled();
  });

  it('does not count a historical CREDIT payment as money received', async () => {
    const tx = makeTx({
      ...baseSale,
      payments: [{ status: 'COMPLETED', method: 'CREDIT', amount: 1000 }],
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await expect(saleService.complete('sale-1', 'org-1'))
      .rejects
      .toThrow('Insufficient financial coverage');

    expect(tx.sale.update).not.toHaveBeenCalled();
  });

  it('authorizes explicit credit only for the sale customer', async () => {
    const tx = makeTx(baseSale);
    tx.customer.findFirst.mockResolvedValue({ id: 'other-customer' });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await expect(saleService.authorizeCredit(
      'sale-1',
      'org-1',
      'user-1',
      { customerId: 'other-customer', amount: 400 }
    )).rejects.toThrow('Credit customer must match the sale customer');

    expect(tx.saleCredit.create).not.toHaveBeenCalled();
  });

  it('rejects credit authorization when no customer is attached to the sale', async () => {
    const tx = makeTx({ ...baseSale, customerId: null });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => callback(tx as never));

    await expect(saleService.authorizeCredit(
      'sale-1',
      'org-1',
      'user-1',
      { customerId: 'customer-1', amount: 400 }
    )).rejects.toThrow('A customer is required to authorize credit');

    expect(tx.saleCredit.create).not.toHaveBeenCalled();
  });
});
