import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@omnikes/lib/prisma';
import { POST as checkout } from '@omnikes/app/api/sales/[id]/checkout/route';
import { salesReportRepository } from '@omnikes/repositories/sales-report.repository';
import { inventoryReportRepository } from '@omnikes/repositories/inventory-report.repository';
import { cashService } from '@omnikes/services/cash.service';

const authState = vi.hoisted(() => ({
  organizationId: '',
  userId: '',
}));

vi.mock('@omnikes/lib/auth', () => ({
  requireCurrentOrganizationId: vi.fn().mockImplementation(async () => authState.organizationId),
  requirePermission: vi.fn().mockResolvedValue(undefined),
  getAuthenticatedUser: vi.fn().mockImplementation(async () => ({ id: authState.userId })),
  requireStoreAccess: vi.fn().mockResolvedValue(undefined),
  getAuthorizedStoreIds: vi.fn().mockResolvedValue(null),
}));

describe('V1-01 - real PostgreSQL business consistency: stock -> sale -> payment -> reports', () => {
  let organizationId: string;
  let storeId: string;
  let userId: string;
  let variantId: string;
  let inventoryId: string;
  let originalQuantity: number;
  let originalReservedQuantity: number;
  let saleId: string | undefined;
  let cashSessionId: string | undefined;

  const testPrefix = `V1_01_RUNTIME_${Date.now()}`;
  const startDate = new Date(Date.now() - 5000);
  const endDate = new Date(Date.now() + 60000);

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

    userId = (
      await prisma.user.findFirstOrThrow({
        where: { organizationId },
        select: { id: true },
      })
    ).id;

    variantId = (
      await prisma.productVariant.findUniqueOrThrow({
        where: { sku: 'OIL-A-1L' },
        select: { id: true },
      })
    ).id;

    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { storeId_variantId: { storeId, variantId } },
      select: { id: true, quantity: true, reservedQuantity: true },
    });

    inventoryId = inventory.id;
    originalQuantity = inventory.quantity;
    originalReservedQuantity = inventory.reservedQuantity;

    authState.organizationId = organizationId;
    authState.userId = userId;

    // Controlled runtime fixture: establish exactly 10 available units,
    // while preserving the original database state for restoration.
    await prisma.inventory.update({
      where: { id: inventoryId },
      data: { quantity: 10, reservedQuantity: 0 },
    });

    // Create an open cash session for CASH payments
    const cashSession = await cashService.open(organizationId, userId, {
      storeId,
      openingAmount: 5000,
    });
    cashSessionId = cashSession.id;
  });

  afterAll(async () => {
    if (saleId) {
      await prisma.checkoutIdempotency.deleteMany({ where: { saleId } });
      await prisma.payment.deleteMany({ where: { saleId } });
      await prisma.inventoryMovement.deleteMany({ where: { referenceId: saleId } });
      await prisma.saleItem.deleteMany({ where: { saleId } });
      await prisma.sale.deleteMany({ where: { id: saleId } });
    }

    if (cashSessionId) {
      await prisma.cashMovement.deleteMany({ where: { cashSessionId } });
      await prisma.cashSession.deleteMany({ where: { id: cashSessionId, organizationId } });
    }

    if (inventoryId) {
      await prisma.inventory.update({
        where: { id: inventoryId },
        data: {
          quantity: originalQuantity,
          reservedQuantity: originalReservedQuantity,
        },
      });
    }

    await prisma.$disconnect();
  });

  it('proves 10 -> sell 2 -> paid -> 8 and coherent sales/inventory reports', async () => {
    const inventoryBefore = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });

    expect(inventoryBefore.quantity).toBe(10);
    expect(inventoryBefore.reservedQuantity).toBe(0);

    const salesBaseline = await salesReportRepository.getSummary(organizationId, {
      startDate,
      endDate,
      storeId,
    });

    const inventoryBaseline = await inventoryReportRepository.getReport(organizationId, {
      startDate,
      endDate,
      storeId,
      lowStockThreshold: 5,
    });

    const sale = await prisma.sale.create({
      data: {
        organizationId,
        storeId,
        orderNumber: `${testPrefix}-SALE`,
        status: 'PENDING',
        subtotal: 2000,
        tax: 0,
        taxRate: 0,
        total: 2000,
        discount: 0,
        applyTax: false,
        items: {
          create: {
            variantId,
            quantity: 2,
            unitPrice: 1000,
            totalPrice: 2000,
            discount: 0,
          },
        },
      },
      select: { id: true },
    });
    saleId = sale.id;

    const response = await checkout(
      new NextRequest(`http://localhost/api/sales/${sale.id}/checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `${testPrefix}-CHECKOUT`,
        },
        body: JSON.stringify({
          method: 'CARD',
          amount: 2000,
          reference: `${testPrefix}-PAYMENT`,
        }),
      }),
      { params: Promise.resolve({ id: sale.id }) },
    );

    expect(response.status).toBe(201);

    const persistedSale = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: {
        items: true,
        payments: true,
      },
    });

    const inventoryAfter = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });

    const saleMovements = await prisma.inventoryMovement.findMany({
      where: {
        inventoryId,
        referenceId: sale.id,
        type: 'SALE',
      },
      select: {
        quantity: true,
        referenceId: true,
        referenceType: true,
      },
    });

    // Core economic invariants.
    expect(persistedSale.status).toBe('COMPLETED');
    expect(persistedSale.items).toHaveLength(1);
    expect(persistedSale.items[0].quantity).toBe(2);
    expect(Number(persistedSale.total)).toBe(2000);
    expect(persistedSale.payments).toHaveLength(1);
    expect(Number(persistedSale.payments[0].amount)).toBe(2000);
    expect(persistedSale.payments[0].status).toBe('COMPLETED');

    expect(inventoryAfter.quantity).toBe(8);
    expect(inventoryAfter.reservedQuantity).toBe(0);

    expect(saleMovements).toHaveLength(1);
    // Inventory movements store positive magnitudes; the inventory balance is
    // the authoritative signed effect produced by checkout (10 -> 8).
    expect(saleMovements[0].quantity).toBe(2);
    expect(saleMovements[0].referenceId).toBe(sale.id);
    expect(saleMovements[0].referenceType).toBe('SALE');

    const salesReport = await salesReportRepository.getSummary(organizationId, {
      startDate,
      endDate,
      storeId,
    });

    expect(salesReport.salesCount - salesBaseline.salesCount).toBe(1);
    expect(salesReport.itemsSold - salesBaseline.itemsSold).toBe(2);
    expect(Number(salesReport.totalRevenue) - Number(salesBaseline.totalRevenue)).toBe(2000);
    expect(Number(salesReport.totalPaid) - Number(salesBaseline.totalPaid)).toBe(2000);
    expect(Number(salesReport.uncoveredAmount) - Number(salesBaseline.uncoveredAmount)).toBe(0);

    const inventoryReport = await inventoryReportRepository.getReport(organizationId, {
      startDate,
      endDate,
      storeId,
      lowStockThreshold: 5,
    });

    const stockRow = inventoryReport.stock.find((row) => row.variantId === variantId);
    expect(stockRow).toBeDefined();
    expect(stockRow?.quantity).toBe(8);
    expect(stockRow?.reservedQuantity).toBe(0);
    expect(stockRow?.availableQuantity).toBe(8);

    const saleMovementReport = inventoryReport.movements.find((row) => row.type === 'SALE');
    const baselineSaleMovement = inventoryBaseline.movements.find((row) => row.type === 'SALE');

    expect(saleMovementReport).toBeDefined();
    expect(
      (saleMovementReport?.movementCount ?? 0) - (baselineSaleMovement?.movementCount ?? 0),
    ).toBe(1);
    expect(
      (saleMovementReport?.quantity ?? 0) - (baselineSaleMovement?.quantity ?? 0),
    ).toBe(2);
  });
});
