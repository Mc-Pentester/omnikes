import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { purchaseService } from '@omnikes/services/purchase.service';
import { supplierPaymentService } from '@omnikes/services/supplier-payment.service';

const suffix = Date.now().toString(36);
const ids = {
  org: `c${suffix}purorg00000000`,
  store: `c${suffix}purstore000000`,
  user: `c${suffix}puruser0000000`,
  supplier: `c${suffix}pursup00000000`,
  product: `c${suffix}purprod0000000`,
  variant: `c${suffix}purvar00000000`,
};

describe('P1 achats / fournisseurs PostgreSQL runtime proof', () => {
  afterAll(async () => {
    await prisma.supplierPaymentIdempotency.deleteMany({ where: { organizationId: ids.org } });
    await prisma.supplierPayment.deleteMany({ where: { organizationId: ids.org } });
    await prisma.inventoryMovement.deleteMany({ where: { inventory: { storeId: ids.store } } });
    await prisma.inventory.deleteMany({ where: { storeId: ids.store } });
    await prisma.purchaseItem.deleteMany({ where: { purchase: { organizationId: ids.org } } });
    await prisma.purchase.deleteMany({ where: { organizationId: ids.org } });
    await prisma.supplier.deleteMany({ where: { organizationId: ids.org } });
    await prisma.productVariant.deleteMany({ where: { id: ids.variant } });
    await prisma.product.deleteMany({ where: { id: ids.product } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.store.deleteMany({ where: { id: ids.store } });
    await prisma.organization.deleteMany({ where: { id: ids.org } });
  });

  it('creates a purchase, receives stock, and settles part of the supplier balance', async () => {
    await prisma.organization.create({
      data: { id: ids.org, name: 'Purchase Runtime Org', slug: `purchase-runtime-${suffix}`, country: 'HT', currency: 'HTG' },
    });
    await prisma.store.create({
      data: { id: ids.store, organizationId: ids.org, name: 'Purchase Runtime Store', code: `PUR-${suffix}` },
    });
    await prisma.user.create({
      data: { id: ids.user, organizationId: ids.org, email: `purchase-${suffix}@example.test`, password: 'runtime-test-password' },
    });
    await prisma.supplier.create({
      data: { id: ids.supplier, organizationId: ids.org, name: 'Runtime Supplier', code: `SUP-${suffix}` },
    });
    await prisma.product.create({
      data: { id: ids.product, organizationId: ids.org, name: 'Runtime Product' },
    });
    await prisma.productVariant.create({
      data: {
        id: ids.variant,
        productId: ids.product,
        sku: `PUR-SKU-${suffix}`,
        price: 150,
        cost: 100,
        attributes: {},
      },
    });

    const purchase = await purchaseService.create(ids.org, ids.user, {
      storeId: ids.store,
      supplierId: ids.supplier,
      reference: `PUR-RUNTIME-${suffix}`,
      items: [{ variantId: ids.variant, orderedQuantity: 10, unitCost: 100 }],
    });

    expect(purchase.status).toBe('DRAFT');
    expect(Number(purchase.total)).toBe(1000);

    await purchaseService.order(purchase.id, ids.org);
    const received = await purchaseService.receive(purchase.id, ids.org, {
      items: [{ purchaseItemId: purchase.items[0].id, quantity: 10 }],
    });

    expect(received?.status).toBe('RECEIVED');

    const inventory = await prisma.inventory.findUnique({
      where: { storeId_variantId: { storeId: ids.store, variantId: ids.variant } },
    });
    expect(inventory?.quantity).toBe(10);

    const movement = await prisma.inventoryMovement.findFirst({
      where: { inventoryId: inventory!.id, referenceId: purchase.id, type: 'PURCHASE' },
    });
    expect(movement?.quantity).toBe(10);

    const payment = await supplierPaymentService.create(ids.org, ids.user, {
      storeId: ids.store,
      supplierId: ids.supplier,
      purchaseId: purchase.id,
      amount: 400,
      method: 'BANK',
      reference: `PAY-${suffix}`,
    });
    expect(Number(payment.amount)).toBe(400);

    const balance = await supplierPaymentService.supplierBalance(ids.org, ids.supplier, ids.store);
    expect(Number(balance.totalPurchases)).toBe(1000);
    expect(Number(balance.totalPaid)).toBe(400);
    expect(Number(balance.balance)).toBe(600);
  });

  it('rejects draft receipt and duplicate overreceipt without changing persisted quantity', async () => {
    const purchase = await purchaseService.create(ids.org, ids.user, {
      storeId: ids.store,
      supplierId: ids.supplier,
      reference: `PUR-DRAFT-${suffix}`,
      items: [{ variantId: ids.variant, orderedQuantity: 10, unitCost: 100 }],
    });

    await expect(
      purchaseService.receive(purchase.id, ids.org, {
        items: [{ purchaseItemId: purchase.items[0].id, quantity: 1 }],
      }),
    ).rejects.toThrow('Draft purchases cannot be received');

    await purchaseService.order(purchase.id, ids.org);

    await expect(
      purchaseService.receive(purchase.id, ids.org, {
        items: [{ purchaseItemId: purchase.items[0].id, quantity: 11 }],
      }),
    ).rejects.toThrow('Cannot receive more than remaining quantity');

    const persisted = await prisma.purchaseItem.findUniqueOrThrow({
      where: { id: purchase.items[0].id },
    });
    expect(persisted.receivedQuantity).toBe(0);
  });

  it('proves partial and final receipt lifecycle plus cancelled and concurrent receipt protection', async () => {
    const partial = await purchaseService.create(ids.org, ids.user, {
      storeId: ids.store,
      supplierId: ids.supplier,
      reference: `PUR-PARTIAL-${suffix}`,
      items: [{ variantId: ids.variant, orderedQuantity: 10, unitCost: 100 }],
    });
    await purchaseService.order(partial.id, ids.org);

    const beforeReceipt = await prisma.inventory.findUnique({
      where: { storeId_variantId: { storeId: ids.store, variantId: ids.variant } },
    });
    const baselineQuantity = beforeReceipt?.quantity ?? 0;

    const firstReceipt = await purchaseService.receive(partial.id, ids.org, {
      items: [{ purchaseItemId: partial.items[0].id, quantity: 4 }],
    });
    expect(firstReceipt?.status).toBe('PARTIALLY_RECEIVED');
    expect(firstReceipt?.items[0].receivedQuantity).toBe(4);

    const afterPartial = await prisma.inventory.findUnique({
      where: { storeId_variantId: { storeId: ids.store, variantId: ids.variant } },
    });
    expect(afterPartial?.quantity).toBe(baselineQuantity + 4);

    const finalReceipt = await purchaseService.receive(partial.id, ids.org, {
      items: [{ purchaseItemId: partial.items[0].id, quantity: 6 }],
    });
    expect(finalReceipt?.status).toBe('RECEIVED');
    expect(finalReceipt?.items[0].receivedQuantity).toBe(10);

    const afterFinal = await prisma.inventory.findUnique({
      where: { storeId_variantId: { storeId: ids.store, variantId: ids.variant } },
    });
    expect(afterFinal?.quantity).toBe(baselineQuantity + 10);

    const movements = await prisma.inventoryMovement.count({
      where: { inventoryId: afterFinal!.id, referenceId: partial.id, type: 'PURCHASE' },
    });
    expect(movements).toBe(2);

    const cancelled = await purchaseService.create(ids.org, ids.user, {
      storeId: ids.store,
      supplierId: ids.supplier,
      reference: `PUR-CANCELLED-RECEIPT-${suffix}`,
      items: [{ variantId: ids.variant, orderedQuantity: 2, unitCost: 100 }],
    });
    await purchaseService.cancel(cancelled.id, ids.org);

    await expect(
      purchaseService.receive(cancelled.id, ids.org, {
        items: [{ purchaseItemId: cancelled.items[0].id, quantity: 1 }],
      }),
    ).rejects.toThrow('Cancelled purchases cannot be received');

    const concurrent = await purchaseService.create(ids.org, ids.user, {
      storeId: ids.store,
      supplierId: ids.supplier,
      reference: `PUR-CONCURRENT-${suffix}`,
      items: [{ variantId: ids.variant, orderedQuantity: 5, unitCost: 100 }],
    });
    await purchaseService.order(concurrent.id, ids.org);

    const concurrentBefore = await prisma.inventory.findUnique({
      where: { storeId_variantId: { storeId: ids.store, variantId: ids.variant } },
    });
    const concurrentBaseline = concurrentBefore?.quantity ?? 0;

    const results = await Promise.allSettled([
      purchaseService.receive(concurrent.id, ids.org, {
        items: [{ purchaseItemId: concurrent.items[0].id, quantity: 5 }],
      }),
      purchaseService.receive(concurrent.id, ids.org, {
        items: [{ purchaseItemId: concurrent.items[0].id, quantity: 5 }],
      }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const concurrentPersisted = await prisma.purchaseItem.findUniqueOrThrow({
      where: { id: concurrent.items[0].id },
    });
    expect(concurrentPersisted.receivedQuantity).toBe(5);

    const concurrentInventory = await prisma.inventory.findUnique({
      where: { storeId_variantId: { storeId: ids.store, variantId: ids.variant } },
    });
    expect(concurrentInventory?.quantity).toBe(concurrentBaseline + 5);

    const concurrentMovements = await prisma.inventoryMovement.count({
      where: { inventoryId: concurrentInventory!.id, referenceId: concurrent.id, type: 'PURCHASE' },
    });
    expect(concurrentMovements).toBe(1);
  });

  it('proves draft purchases are excluded from supplier liabilities', async () => {
    const purchase = await purchaseService.create(ids.org, ids.user, {
      storeId: ids.store,
      supplierId: ids.supplier,
      reference: `PUR-DRAFT-LIABILITY-${suffix}`,
      items: [{ variantId: ids.variant, orderedQuantity: 2, unitCost: 100 }],
    });

    const balanceBefore = await supplierPaymentService.supplierBalance(ids.org, ids.supplier, ids.store);
    expect(Number(balanceBefore.totalPurchases)).toBe(1000);
    expect(Number(balanceBefore.balance)).toBe(600);

    await expect(
      supplierPaymentService.create(ids.org, ids.user, {
        storeId: ids.store,
        supplierId: ids.supplier,
        amount: 700,
        method: 'BANK',
        reference: `PAY-DRAFT-OVER-${suffix}`,
      }),
    ).rejects.toThrow('Payment exceeds outstanding supplier balance');

    const persistedPayment = await prisma.supplierPayment.findFirst({
      where: { organizationId: ids.org, reference: `PAY-DRAFT-OVER-${suffix}` },
    });
    expect(persistedPayment).toBeNull();

    const persistedPurchase = await prisma.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(persistedPurchase.status).toBe('DRAFT');
  });
});
