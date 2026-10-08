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

  it('replays the same supplier payment idempotency key without creating a duplicate', async () => {
    const purchase = await purchaseService.create(ids.org, ids.user, {
      storeId: ids.store,
      supplierId: ids.supplier,
      reference: `PUR-IDEMP-${suffix}`,
      items: [{ variantId: ids.variant, orderedQuantity: 2, unitCost: 100 }],
    });
    await purchaseService.order(purchase.id, ids.org);
    await purchaseService.receive(purchase.id, ids.org, {
      items: [{ purchaseItemId: purchase.items[0].id, quantity: 2 }],
    });

    const key = `p1-idempotency-${suffix}`;
    const input = {
      storeId: ids.store,
      supplierId: ids.supplier,
      purchaseId: purchase.id,
      amount: 150,
      method: 'BANK',
      reference: `IDEMP-${suffix}`,
    };

    const first = await prisma.$transaction(async (tx) => {
      const record = await tx.supplierPaymentIdempotency.create({
        data: {
          organizationId: ids.org,
          userId: ids.user,
          supplierId: ids.supplier,
          purchaseId: purchase.id,
          storeId: ids.store,
          key,
          status: 'PROCESSING',
        },
      });
      const payment = await supplierPaymentService.create(ids.org, ids.user, input, tx);
      await tx.supplierPaymentIdempotency.update({
        where: { id: record.id },
        data: {
          status: 'COMPLETED',
          responseStatus: 201,
          responseBody: JSON.stringify({ payment, input }),
        },
      });
      return payment;
    });

    const replay = await prisma.supplierPaymentIdempotency.findUniqueOrThrow({
      where: { organizationId_key: { organizationId: ids.org, key } },
    });
    expect(replay.status).toBe('COMPLETED');
    expect(JSON.parse(replay.responseBody || '{}').payment.id).toBe(first.id);

    await expect(
      prisma.supplierPaymentIdempotency.create({
        data: {
          organizationId: ids.org,
          userId: ids.user,
          supplierId: ids.supplier,
          purchaseId: purchase.id,
          storeId: ids.store,
          key,
          status: 'PROCESSING',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const payments = await prisma.supplierPayment.findMany({
      where: { purchaseId: purchase.id },
    });
    expect(payments).toHaveLength(1);
    expect(Number(payments[0].amount)).toBe(150);
  });

  it('rejects a supplier payment above the outstanding purchase balance', async () => {
    const purchase = await purchaseService.create(ids.org, ids.user, {
      storeId: ids.store,
      supplierId: ids.supplier,
      reference: `PUR-OVERPAY-${suffix}`,
      items: [{ variantId: ids.variant, orderedQuantity: 2, unitCost: 100 }],
    });
    await purchaseService.order(purchase.id, ids.org);

    await expect(
      supplierPaymentService.create(ids.org, ids.user, {
        storeId: ids.store,
        supplierId: ids.supplier,
        purchaseId: purchase.id,
        amount: 1000,
        method: 'BANK',
      }),
    ).rejects.toThrow('Payment exceeds purchase outstanding balance');
  });
});
