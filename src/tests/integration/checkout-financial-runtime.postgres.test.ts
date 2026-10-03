import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { POST as checkout } from '@omnikes/app/api/sales/[id]/checkout/route';

const authState = vi.hoisted(() => ({
  organizationId: '',
  userId: '',
}));

vi.mock('@omnikes/lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn().mockImplementation(async () => authState.organizationId),
  requirePermission: vi.fn().mockResolvedValue(undefined),
  getAuthenticatedUser: vi.fn().mockImplementation(async () => ({ id: authState.userId })),
  requireStoreAccess: vi.fn().mockResolvedValue(undefined),
}));

describe('P0 POS financial runtime proofs', () => {
  let orgId: string;
  let storeId: string;
  let variantId: string;
  let userId: string;
  let customerId: string | null = null;
  const saleIds: string[] = [];
  const inventorySnapshots = new Map<string, number>();

  beforeAll(async () => {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'omnikes-test-commerce-a' },
      select: { id: true },
    });
    orgId = org.id;
    authState.organizationId = orgId;

    const user = await prisma.user.findFirstOrThrow({
      where: { organizationId: orgId },
      select: { id: true },
    });
    userId = user.id;
    authState.userId = userId;

    const store = await prisma.store.findFirstOrThrow({
      where: { organizationId: orgId, code: 'STORE-A' },
      select: { id: true },
    });
    storeId = store.id;

    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { sku: 'OIL-A-1L' },
      select: { id: true },
    });
    variantId = variant.id;

    const customer = await prisma.customer.findFirst({
      where: { organizationId: orgId, email: 'client.a@omnikes.test' },
      select: { id: true },
    });
    customerId = customer?.id ?? null;
  });

  async function createSale() {
    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { storeId_variantId: { storeId, variantId } },
      select: { quantity: true },
    });

    const sale = await prisma.sale.create({
      data: {
        organizationId: orgId,
        storeId,
        orderNumber: `P0-POS-RUNTIME-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        customerId,
        status: 'PENDING',
        subtotal: 1000,
        tax: 0,
        taxRate: 0,
        total: 1000,
        discount: 0,
        applyTax: false,
        items: {
          create: {
            variantId,
            quantity: 1,
            unitPrice: 1000,
            totalPrice: 1000,
            discount: 0,
          },
        },
      },
    });

    saleIds.push(sale.id);
    inventorySnapshots.set(sale.id, inventory.quantity);
    return sale;
  }

  async function cleanupSale(saleId: string) {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: {
        storeId: true,
        items: { select: { quantity: true, variantId: true } },
      },
    });

    if (!sale) return;

    await prisma.checkoutIdempotency.deleteMany({ where: { saleId } });
    await prisma.payment.deleteMany({ where: { saleId } });
    await prisma.inventoryMovement.deleteMany({ where: { referenceId: saleId } });
    await prisma.sale.delete({ where: { id: saleId } });

    const snapshot = inventorySnapshots.get(saleId);
    if (snapshot !== undefined) {
      for (const item of sale.items) {
        await prisma.inventory.update({
          where: {
            storeId_variantId: {
              storeId: sale.storeId,
              variantId: item.variantId,
            },
          },
          data: { quantity: snapshot },
        });
      }
    }
  }

  afterAll(async () => {
    for (const saleId of [...saleIds].reverse()) {
      await cleanupSale(saleId);
    }
    await prisma.$disconnect();
  });

  it('allows only one of two concurrent checkouts with different idempotency keys to finalize the sale', async () => {
    const sale = await createSale();

    const makeRequest = (key: string) =>
      new NextRequest(`http://localhost/api/sales/${sale.id}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({
          method: 'CASH',
          amount: 1000,
        }),
      });

    const [responseA, responseB] = await Promise.all([
      checkout(makeRequest(`p0-runtime-a-${sale.id}`), {
        params: Promise.resolve({ id: sale.id }),
      }),
      checkout(makeRequest(`p0-runtime-b-${sale.id}`), {
        params: Promise.resolve({ id: sale.id }),
      }),
    ]);

    const statuses = [responseA.status, responseB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const finalSale = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { payments: true },
    });

    const movementCount = await prisma.inventoryMovement.count({
      where: { referenceId: sale.id, type: 'SALE' },
    });

    const idempotencyRecords = await prisma.checkoutIdempotency.findMany({
      where: { saleId: sale.id },
      orderBy: { createdAt: 'asc' },
    });

    expect(finalSale.status).toBe('COMPLETED');
    expect(finalSale.payments).toHaveLength(1);
    expect(Number(finalSale.payments[0].amount)).toBe(1000);
    expect(movementCount).toBe(1);
    expect(idempotencyRecords).toHaveLength(1);
    expect(idempotencyRecords[0].status).toBe('COMPLETED');
  });

  it('returns the committed response for concurrent requests sharing the same idempotency key', async () => {
    const sale = await createSale();

    const key = `p0-runtime-same-key-${sale.id}`;
    const makeRequest = () =>
      new NextRequest(`http://localhost/api/sales/${sale.id}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({
          method: 'CASH',
          amount: 1000,
        }),
      });

    const [responseA, responseB] = await Promise.all([
      checkout(makeRequest(), {
        params: Promise.resolve({ id: sale.id }),
      }),
      checkout(makeRequest(), {
        params: Promise.resolve({ id: sale.id }),
      }),
    ]);

    expect([responseA.status, responseB.status].sort()).toEqual([201, 201]);

    const payments = await prisma.payment.findMany({
      where: { saleId: sale.id },
    });
    const movements = await prisma.inventoryMovement.count({
      where: { referenceId: sale.id, type: 'SALE' },
    });
    const idempotencyRecords = await prisma.checkoutIdempotency.findMany({
      where: { saleId: sale.id, key },
    });

    expect(payments).toHaveLength(1);
    expect(Number(payments[0].amount)).toBe(1000);
    expect(movements).toBe(1);
    expect(idempotencyRecords).toHaveLength(1);
    expect(idempotencyRecords[0].status).toBe('COMPLETED');
    expect(idempotencyRecords[0].responseStatus).toBe(201);
  });

  it('rolls back payment, stock movement, and sale completion when checkout fails on insufficient stock', async () => {
    const sale = await createSale();

    await prisma.inventory.update({
      where: { storeId_variantId: { storeId, variantId } },
      data: { quantity: 0 },
    });

    const response = await checkout(
      new NextRequest(`http://localhost/api/sales/${sale.id}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `p0-runtime-rollback-${sale.id}`,
        },
        body: JSON.stringify({
          method: 'CASH',
          amount: 1000,
        }),
      }),
      { params: Promise.resolve({ id: sale.id }) },
    );

    expect(response.status).toBe(409);

    const state = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { payments: true },
    });
    const movements = await prisma.inventoryMovement.count({
      where: { referenceId: sale.id },
    });
    const idempotency = await prisma.checkoutIdempotency.findMany({
      where: { saleId: sale.id },
    });

    expect(state.status).toBe('PENDING');
    expect(state.payments).toHaveLength(0);
    expect(movements).toBe(0);
    expect(idempotency).toHaveLength(0);
  });
});
