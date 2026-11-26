import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { cashService } from '@omnikes/services/cash.service';
import { saleService } from '@omnikes/services/sale.service';
import { returnService } from '@omnikes/services/return.service';
import { POST as checkout } from '@omnikes/app/api/sales/[id]/checkout/route';

const authState = vi.hoisted(() => ({ organizationId: '', userId: '' }));

vi.mock('@omnikes/lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn().mockImplementation(async () => authState.organizationId),
  requirePermission: vi.fn().mockResolvedValue(undefined),
  getAuthenticatedUser: vi.fn().mockImplementation(async () => ({ id: authState.userId })),
  requireStoreAccess: vi.fn().mockResolvedValue(undefined),
  requireSubscriptionCapability: vi.fn().mockResolvedValue(undefined),
}));

describe('POS CASH end-to-end PostgreSQL runtime proof', () => {
  const suffix = Date.now().toString(36);
  const ids = {
    org: `c${suffix}pose2eorg0000000`,
    store: `c${suffix}pose2estore000000`,
    user: `c${suffix}pose2euser000000`,
    product: `c${suffix}pose2eprod000000`,
    variant: `c${suffix}pose2evar0000000`,
    inventory: `c${suffix}pose2einv0000000`,
    customer: `c${suffix}pose2ecust000000`,
  };
  let saleId = '';
  let packagingSaleId = '';
  let packagingReturnId = '';
  let openingQuantity = 0;

  beforeAll(async () => {
    await prisma.organization.create({
      data: { id: ids.org, name: 'POS CASH E2E Org', slug: `pos-cash-e2e-${suffix}`, country: 'HT', currency: 'HTG' },
    });
    await prisma.store.create({
      data: { id: ids.store, organizationId: ids.org, name: 'POS CASH E2E Store', code: `E2E-${suffix}` },
    });
    await prisma.user.create({
      data: { id: ids.user, organizationId: ids.org, email: `pos-cash-e2e-${suffix}@example.test`, password: 'runtime-test-password' },
    });
    await prisma.customer.create({ data: { id: ids.customer, organizationId: ids.org, name: 'POS E2E Customer' } });
    await prisma.product.create({
      data: { id: ids.product, organizationId: ids.org, name: 'POS CASH E2E Product' },
    });
    await prisma.productVariant.create({
      data: {
        id: ids.variant,
        productId: ids.product,
        sku: `POS-CASH-E2E-${suffix}`,
        price: 125,
        unitPrice: 125,
        casePrice: 2400,
        dozenPrice: 1300,
        pack3Price: 350,
        unitsPerCase: 24,
        cost: 50,
        saleUnit: 'UNIT',
        attributes: {},
      },
    });
    const inventory = await prisma.inventory.create({
      data: { id: ids.inventory, storeId: ids.store, variantId: ids.variant, quantity: 100, reservedQuantity: 0 },
    });
    openingQuantity = inventory.quantity;
    authState.organizationId = ids.org;
    authState.userId = ids.user;
  });

  afterAll(async () => {
    if (packagingSaleId) {
      await prisma.returnItem.deleteMany({ where: { returnId: packagingReturnId } });
      await prisma.return.deleteMany({ where: { saleId: packagingSaleId } });
      await prisma.inventoryMovement.deleteMany({ where: { referenceId: packagingSaleId } });
      await prisma.checkoutIdempotency.deleteMany({ where: { saleId: packagingSaleId } });
      await prisma.payment.deleteMany({ where: { saleId: packagingSaleId } });
      await prisma.saleItem.deleteMany({ where: { saleId: packagingSaleId } });
      await prisma.sale.deleteMany({ where: { id: packagingSaleId } });
    }
    if (saleId) {
      await prisma.cashMovement.deleteMany({ where: { referenceId: saleId } });
      await prisma.checkoutIdempotency.deleteMany({ where: { saleId } });
      await prisma.payment.deleteMany({ where: { saleId } });
      await prisma.inventoryMovement.deleteMany({ where: { referenceId: saleId } });
      await prisma.saleItem.deleteMany({ where: { saleId } });
      await prisma.sale.deleteMany({ where: { id: saleId } });
    }
    await prisma.cashMovement.deleteMany({ where: { organizationId: ids.org } });
    await prisma.cashSession.deleteMany({ where: { organizationId: ids.org } });
    await prisma.inventory.deleteMany({ where: { id: ids.inventory } });
    await prisma.productVariant.deleteMany({ where: { id: ids.variant } });
    await prisma.customer.deleteMany({ where: { id: ids.customer } });
    await prisma.product.deleteMany({ where: { id: ids.product } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.store.deleteMany({ where: { id: ids.store } });
    await prisma.organization.deleteMany({ where: { id: ids.org } });
    await prisma.$disconnect();
  });


  it('sells multiple package sizes and restores base units on a partial return', async () => {
    const sale = await prisma.sale.create({
      data: {
        organizationId: ids.org,
        storeId: ids.store,
        orderNumber: `POS-PACKAGING-E2E-${suffix}`,
        status: 'PENDING',
        subtotal: 0,
        tax: 0,
        taxRate: 0,
        total: 0,
        discount: 0,
        applyTax: false,
      },
    });
    packagingSaleId = sale.id;
    const pricedSale = await saleService.syncItems(sale.id, ids.org, {
      applyTax: false,
      discount: 0,
      items: [
        { variantId: ids.variant, quantity: 2, packaging: 'CASE' },
        { variantId: ids.variant, quantity: 1, packaging: 'DOZEN' },
        { variantId: ids.variant, quantity: 1, packaging: 'PACK3' },
        { variantId: ids.variant, quantity: 1, packaging: 'UNIT' },
      ],
    });
    expect(Number(pricedSale?.total)).toBe(6575);
    expect(pricedSale?.items.map((item) => [item.packaging, item.baseUnits])).toEqual([
      ['CASE', 24], ['DOZEN', 12], ['PACK3', 3], ['UNIT', 1],
    ]);

    const response = await checkout(new NextRequest(`http://localhost/api/sales/${sale.id}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `packaging-${sale.id}` },
      body: JSON.stringify({ method: 'CARD', amount: 6575, reference: 'PACKAGING-E2E' }),
    }), { params: Promise.resolve({ id: sale.id }) });
    expect(response.status).toBe(201);

    const afterSale = await prisma.inventory.findUniqueOrThrow({ where: { id: ids.inventory } });
    expect(afterSale.quantity).toBe(openingQuantity - 64);

    const saleWithItems = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { items: true },
    });
    const caseLine = saleWithItems.items.find((item) => item.packaging === 'CASE');
    expect(caseLine).toBeTruthy();
    const returned = await returnService.create(ids.org, ids.user, {
      saleId: sale.id,
      items: [{ saleItemId: caseLine!.id, quantity: 1 }],
      reason: 'Packaging conversion E2E',
    });
    packagingReturnId = returned.id;

    const afterReturn = await prisma.inventory.findUniqueOrThrow({ where: { id: ids.inventory } });
    expect(afterReturn.quantity).toBe(openingQuantity - 40);
    const returnMovement = await prisma.inventoryMovement.findFirst({
      where: { referenceId: sale.id, type: 'RETURN', notes: { contains: 'Return for sale' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(returnMovement?.quantity).toBe(24);
  });

  it('completes a CASH sale atomically and is idempotent', async () => {
    const cashSession = await cashService.open(ids.org, ids.user, {
      storeId: ids.store,
      openingAmount: 5000,
    });

    const sale = await prisma.sale.create({
      data: {
        organizationId: ids.org,
        storeId: ids.store,
        orderNumber: `POS-CASH-E2E-${suffix}`,
        status: 'PENDING',
        subtotal: 1000,
        tax: 0,
        taxRate: 0,
        total: 1000,
        discount: 0,
        applyTax: false,
        items: {
          create: {
            variantId: ids.variant,
            quantity: 1,
            unitPrice: 1000,
            totalPrice: 1000,
            discount: 0,
          },
        },
      },
    });
    saleId = sale.id;

    await saleService.update(sale.id, ids.org, { customerId: ids.customer });
    await saleService.update(sale.id, ids.org, { customerId: null });
    await saleService.update(sale.id, ids.org, { customerId: ids.customer });
    const discountedSale = await saleService.syncItems(sale.id, ids.org, {
      applyTax: false,
      discount: 100,
      items: [{ variantId: ids.variant, quantity: 1 }],
    });
    expect(Number(discountedSale?.subtotal)).toBe(1000);
    expect(Number(discountedSale?.discount)).toBe(100);
    expect(Number(discountedSale?.total)).toBe(900);

    const key = `pos-cash-e2e-${sale.id}`;
    const makeRequest = () => new NextRequest(`http://localhost/api/sales/${sale.id}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ method: 'CASH', amount: 900, cashReceived: 1000 }),
    });

    const response1 = await checkout(makeRequest(), { params: Promise.resolve({ id: sale.id }) });
    expect(response1.status).toBe(201);

    const response2 = await checkout(makeRequest(), { params: Promise.resolve({ id: sale.id }) });
    expect(response2.status).toBe(201);

    const finalSale = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { payments: true },
    });
    const finalInventory = await prisma.inventory.findUniqueOrThrow({ where: { id: ids.inventory } });
    const payments = await prisma.payment.count({ where: { saleId: sale.id } });
    const stockMovements = await prisma.inventoryMovement.count({ where: { referenceId: sale.id, type: 'SALE' } });
    const cashMovements = await prisma.cashMovement.findMany({
      where: { cashSessionId: cashSession.id, referenceId: sale.id, type: 'SALE_CASH' },
    });
    const idempotency = await prisma.checkoutIdempotency.findMany({ where: { saleId: sale.id } });

    expect(finalSale.status).toBe('COMPLETED');
    expect(finalSale.customerId).toBe(ids.customer);
    expect(Number(finalSale.payments[0].cashReceived)).toBe(1000);
    expect(Number(finalSale.payments[0].changeGiven)).toBe(100);
    expect(payments).toBe(1);
    expect(stockMovements).toBe(1);
    expect(finalInventory.quantity).toBe(openingQuantity - 41);
    expect(cashMovements).toHaveLength(1);
    expect(Number(cashMovements[0].amount)).toBe(900);
    expect(idempotency).toHaveLength(1);
    expect(idempotency[0].status).toBe('COMPLETED');

    const summary = await cashService.summary(ids.org, cashSession.id);
    expect(summary.cashSales).toBe(900);
    expect(summary.expectedAmount).toBe(5900);

    const closed = await cashService.close(ids.org, cashSession.id, ids.user, { countedAmount: 5900 });
    expect(closed.status).toBe('CLOSED');
    expect(Number(closed.difference)).toBe(0);
  });
});
