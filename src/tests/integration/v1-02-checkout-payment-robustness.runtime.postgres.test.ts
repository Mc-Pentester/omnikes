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

describe('V1-02 - checkout/payment robustness on real PostgreSQL', () => {
  let organizationId: string;
  let storeId: string;
  let variantId: string;
  const saleIds: string[] = [];
  const testPrefix = `V1_02_RUNTIME_${Date.now()}`;

  beforeAll(async () => {
    organizationId = (
      await prisma.organization.findUniqueOrThrow({
        where: { slug: 'omnikes-test-commerce-a' },
        select: { id: true },
      })
    ).id;

    storeId = (
      await prisma.store.findFirstOrThrow({
        where: { organizationId, code: 'STORE-A' },
        select: { id: true },
      })
    ).id;

    const user = await prisma.user.findFirstOrThrow({
      where: { organizationId },
      select: { id: true },
    });

    const variant = await prisma.productVariant.findUniqueOrThrow({
      where: { sku: 'OIL-A-1L' },
      select: { id: true },
    });

    variantId = variant.id;
    authState.organizationId = organizationId;
    authState.userId = user.id;
  });

  async function createSale(total = 1000) {
    const sale = await prisma.sale.create({
      data: {
        organizationId,
        storeId,
        orderNumber: `${testPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: 'PENDING',
        subtotal: total,
        tax: 0,
        taxRate: 0,
        total,
        discount: 0,
        applyTax: false,
        items: {
          create: {
            variantId,
            quantity: 1,
            unitPrice: total,
            totalPrice: total,
            discount: 0,
          },
        },
      },
      select: { id: true },
    });

    saleIds.push(sale.id);
    return sale;
  }

  async function checkoutRequest(
    saleId: string,
    key: string,
    amount: number,
    method: 'CARD' | 'CASH' = 'CARD',
  ) {
    return checkout(
      new NextRequest(`http://localhost/api/sales/${saleId}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({ method, amount }),
      }),
      { params: Promise.resolve({ id: saleId }) },
    );
  }

  async function assertNoCheckoutMutation(saleId: string) {
    const sale = await prisma.sale.findUniqueOrThrow({
      where: { id: saleId },
      select: { status: true },
    });

    const payments = await prisma.payment.count({ where: { saleId } });
    const movements = await prisma.inventoryMovement.count({
      where: { referenceId: saleId },
      });
    const idempotency = await prisma.checkoutIdempotency.count({ where: { saleId } });

    expect(sale.status).toBe('PENDING');
    expect(payments).toBe(0);
    expect(movements).toBe(0);
    expect(idempotency).toBe(0);
  }

  afterAll(async () => {
    for (const saleId of saleIds) {
      await prisma.checkoutIdempotency.deleteMany({ where: { saleId } });
      await prisma.payment.deleteMany({ where: { saleId } });
      await prisma.inventoryMovement.deleteMany({ where: { referenceId: saleId } });
      await prisma.saleItem.deleteMany({ where: { saleId } });
      await prisma.sale.delete({ where: { id: saleId } });
    }

    await prisma.$disconnect();
  });

  it('rejects underpayment and overpayment before any economic mutation', async () => {
    const underpaidSale = await createSale(1000);
    const underpaid = await checkoutRequest(
      underpaidSale.id,
      `${testPrefix}-underpaid-${underpaidSale.id}`,
      999.99,
    );

    expect(underpaid.status).toBe(422);
    await assertNoCheckoutMutation(underpaidSale.id);

    const overpaidSale = await createSale(1000);
    const overpaid = await checkoutRequest(
      overpaidSale.id,
      `${testPrefix}-overpaid-${overpaidSale.id}`,
      1000.01,
    );

    expect(overpaid.status).toBe(422);
    await assertNoCheckoutMutation(overpaidSale.id);
  });

  it('rejects invalid payment amounts at the request boundary', async () => {
    const sale = await createSale(1000);

    const response = await checkoutRequest(
      sale.id,
      `${testPrefix}-invalid-${sale.id}`,
      0,
    );

    expect(response.status).toBe(400);
    await assertNoCheckoutMutation(sale.id);
  });

  it('rejects reuse of a completed idempotency key with different payment data', async () => {
    const sale = await createSale(1000);
    const key = `${testPrefix}-reuse-${sale.id}`;

    const first = await checkoutRequest(sale.id, key, 1000);
    expect(first.status).toBe(201);

    const second = await checkoutRequest(sale.id, key, 999);
    expect(second.status).toBe(409);

    const finalSale = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { payments: true },
    });
    const movementCount = await prisma.inventoryMovement.count({
      where: { referenceId: sale.id, type: 'SALE' },
    });
    const idempotencyRecords = await prisma.checkoutIdempotency.findMany({
      where: { saleId: sale.id, key },
    });

    expect(finalSale.status).toBe('COMPLETED');
    expect(finalSale.payments).toHaveLength(1);
    expect(Number(finalSale.payments[0].amount)).toBe(1000);
    expect(movementCount).toBe(1);
    expect(idempotencyRecords).toHaveLength(1);
    expect(idempotencyRecords[0].status).toBe('COMPLETED');
  });
});
