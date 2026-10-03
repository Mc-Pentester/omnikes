import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { POST as addPayment } from '@omnikes/app/api/sales/[id]/payments/route';

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

describe('P0 payment overpayment concurrency runtime proof', () => {
  let orgId: string;
  let storeId: string;
  let variantId: string;
  let userId: string;
  const saleIds: string[] = [];

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
  });

  async function createSale() {
    const sale = await prisma.sale.create({
      data: {
        organizationId: orgId,
        storeId,
        orderNumber: `P0-PAYMENT-OVERPAY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
    return sale;
  }

  afterAll(async () => {
    for (const saleId of [...saleIds].reverse()) {
      await prisma.paymentIdempotency.deleteMany({ where: { saleId } });
      await prisma.payment.deleteMany({ where: { saleId } });
      await prisma.inventoryMovement.deleteMany({ where: { referenceId: saleId } });
      await prisma.sale.delete({ where: { id: saleId } });
    }
    await prisma.$disconnect();
  });

  it('serializes different payment keys so concurrent requests cannot overpay the sale', async () => {
    const sale = await createSale();

    const makeRequest = (key: string) =>
      new NextRequest(`http://localhost/api/sales/${sale.id}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({
          method: 'CASH',
          amount: 600,
        }),
      });

    const [responseA, responseB] = await Promise.all([
      addPayment(makeRequest(`p0-overpay-a-${sale.id}`), {
        params: Promise.resolve({ id: sale.id }),
      }),
      addPayment(makeRequest(`p0-overpay-b-${sale.id}`), {
        params: Promise.resolve({ id: sale.id }),
      }),
    ]);

    const statuses = [responseA.status, responseB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const finalSale = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { payments: true },
    });

    const totalPaid = finalSale.payments
      .filter((payment) => payment.status === 'COMPLETED')
      .reduce((sum, payment) => sum + Number(payment.amount), 0);

    const idempotencyRecords = await prisma.paymentIdempotency.findMany({
      where: { saleId: sale.id },
    });

    expect(finalSale.payments).toHaveLength(1);
    expect(totalPaid).toBe(600);
    expect(totalPaid).toBeLessThanOrEqual(Number(finalSale.total));
    expect(idempotencyRecords).toHaveLength(1);
    expect(idempotencyRecords[0].status).toBe('COMPLETED');
  });
});
