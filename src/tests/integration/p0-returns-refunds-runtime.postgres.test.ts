import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { returnService } from '@omnikes/services/return.service';
import { refundService } from '@omnikes/services/refund.service';
import { cashService } from '@omnikes/services/cash.service';
import { storeService } from '@omnikes/services/store.service';
import { roundMoney } from '@omnikes/lib/money';

describe('P0 Returns/Refunds PostgreSQL Runtime Test', () => {
  let organizationId: string;
  let storeId: string;
  let userId: string;
  let variantId: string;
  let inventoryId: string;
  let customerId: string;
  let temporaryCustomer = false;
  let saleId: string;
  let paymentId: string;
  let cashSessionId: string;

  beforeAll(async () => {
    // Use existing test organization
    const org = await prisma.organization.findFirst({
      where: { slug: 'omnikes-test-commerce-a' },
    });
    if (!org) throw new Error('Test organization not found');
    organizationId = org.id;

    // Get a user from the organization
    const user = await prisma.user.findFirst({
      where: { organizationId },
    });
    if (!user) throw new Error('Test user not found');
    userId = user.id;

    // Get or create a store
    const store = await prisma.store.findFirst({
      where: { organizationId, code: 'STORE-A' },
    });
    if (!store) {
      const newStore = await storeService.create(organizationId, {
        name: 'Test Store A',
        code: 'STORE-A',
      });
      storeId = newStore.id;
    } else {
      storeId = store.id;
    }

    // Reuse existing product variant
    const variant = await prisma.productVariant.findFirst({
      where: { product: { organizationId } },
      include: { product: true },
    });
    if (!variant) throw new Error('No product variant found in test organization');
    variantId = variant.id;

    // Get or create inventory for this variant
    let inventory = await prisma.inventory.findFirst({
      where: { storeId, variantId },
    });

    if (!inventory) {
      inventory = await prisma.inventory.create({
        data: {
          storeId,
          variantId,
          quantity: 20,
          reservedQuantity: 0,
        },
      });
    }

    inventoryId = inventory.id;

    // Create a customer
    const customer = await prisma.customer.create({
      data: {
        organizationId,
        name: 'Test Return Customer',
        email: `test-return-${Date.now()}@example.com`,
        phone: '+50900000000',
      },
      select: { id: true },
    });
    customerId = customer.id;
    temporaryCustomer = true;

    // Find or create an open cash session for CASH payments
    let cashSession = await prisma.cashSession.findFirst({
      where: {
        organizationId,
        storeId,
        status: 'OPEN',
      },
    });

    if (!cashSession) {
      cashSession = await cashService.open(organizationId, userId, {
        storeId,
        openingAmount: 5000,
      });
    }
    cashSessionId = cashSession.id;

    // Create a sale directly
    const itemQuantity = 2;
    const itemPrice = Number(variant.price);
    const itemTotal = itemPrice * itemQuantity;

    const sale = await prisma.sale.create({
      data: {
        organizationId,
        storeId,
        orderNumber: `RETURN-TEST-${Date.now()}`,
        customerId,
        channel: 'POS',
        subtotal: itemTotal,
        tax: 0,
        total: itemTotal,
        discount: 0,
        applyTax: false,
        status: 'COMPLETED',
      },
    });
    saleId = sale.id;

    // Create sale items directly
    await prisma.saleItem.create({
      data: {
        saleId,
        variantId,
        quantity: itemQuantity,
        unitPrice: variant.price,
        totalPrice: itemTotal,
        discount: 0,
        returnedQuantity: 0,
      },
    });

    // Add a CASH payment directly
    const payment = await prisma.payment.create({
      data: {
        saleId,
        method: 'CASH',
        amount: itemTotal,
        reference: 'TEST-RETURN-PAYMENT',
        status: 'COMPLETED',
        refundedAmount: 0,
      },
    });
    paymentId = payment.id;
  });

  afterAll(async () => {
    // Cleanup in reverse order
    try {
      if (paymentId) {
        await prisma.payment.delete({ where: { id: paymentId } });
      }
      if (saleId) {
        await prisma.saleItem.deleteMany({ where: { saleId } });
        await prisma.sale.delete({ where: { id: saleId } });
      }
      if (cashSessionId) {
        try {
          await cashService.close(organizationId, cashSessionId, userId, {
            countedAmount: 5000,
          });
        } catch (closeError) {
          console.warn('Cash session close failed:', closeError);
        }
      }
      if (customerId && temporaryCustomer) {
        await prisma.customer.delete({ where: { id: customerId } });
      }
      if (inventoryId) {
        await prisma.inventory.delete({ where: { id: inventoryId } });
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  it('creates a partial return and refunds payment', async () => {
    // Initial state check
    const initialSale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true },
    });
    expect(initialSale?.status).toBe('COMPLETED');
    expect(initialSale?.items[0].quantity).toBe(2);
    expect(initialSale?.items[0].returnedQuantity).toBe(0);

    const initialInventory = await prisma.inventory.findUnique({
      where: { id: inventoryId },
    });
    const initialStock = initialInventory?.quantity || 0;

    // Create a partial return (1 out of 2 items)
    const returnRecord = await returnService.create(organizationId, userId, {
      saleId,
      items: [
        {
          saleItemId: initialSale!.items[0].id,
          quantity: 1,
        },
      ],
      reason: 'Test partial return',
    });

    expect(returnRecord.status).toBe('COMPLETED');
    expect(Number(returnRecord.totalRefunded)).toBe(Number(initialSale!.items[0].unitPrice));
    expect(returnRecord.items).toHaveLength(1);
    expect(returnRecord.items[0].quantity).toBe(1);

    // Verify SaleItem returnedQuantity updated
    const updatedSale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true },
    });
    expect(updatedSale?.items[0].returnedQuantity).toBe(1);

    // Verify stock restored
    const updatedInventory = await prisma.inventory.findUnique({
      where: { id: inventoryId },
    });
    expect(updatedInventory?.quantity).toBe(initialStock + 1);

    // Verify InventoryMovement RETURN created
    const returnMovement = await prisma.inventoryMovement.findFirst({
      where: {
        inventoryId,
        type: 'RETURN',
        referenceId: saleId,
        referenceType: 'SALE',
      },
    });
    expect(returnMovement).toBeTruthy();
    expect(returnMovement?.quantity).toBe(1);

    // Process refund
    const refund = await refundService.process(organizationId, userId, {
      returnId: returnRecord.id,
      paymentId,
      amount: Number(initialSale!.items[0].unitPrice),
      reference: 'TEST-RETURN-REFUND',
    });

    expect(refund.status).toBe('COMPLETED');
    expect(Number(refund.amount)).toBe(Number(initialSale!.items[0].unitPrice));

    // Verify Payment refundedAmount updated
    const updatedPayment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });
    expect(Number(updatedPayment?.refundedAmount)).toBe(Number(initialSale!.items[0].unitPrice));
    expect(updatedPayment?.status).toBe('COMPLETED'); // Partial refund

    // Verify CashMovement REFUND created
    const refundMovement = await prisma.cashMovement.findFirst({
      where: {
        type: 'REFUND',
        referenceId: saleId,
        referenceType: 'SALE',
      },
    });
    expect(refundMovement).toBeTruthy();
    expect(Number(refundMovement?.amount)).toBe(Number(initialSale!.items[0].unitPrice));
  });

  it('prevents returning more than available quantity', async () => {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true },
    });

    const availableQuantity = sale!.items[0].quantity - sale!.items[0].returnedQuantity;

    await expect(
      returnService.create(organizationId, userId, {
        saleId,
        items: [
          {
            saleItemId: sale!.items[0].id,
            quantity: availableQuantity + 1,
          },
        ],
      })
    ).rejects.toThrow('Cannot return');
  });

  it('prevents refunding more than remaining amount', async () => {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    const remainingRefundable = Number(payment!.amount) - Number(payment!.refundedAmount);

    // Get the return created in the first test
    const returnRecord = await prisma.return.findFirst({
      where: { saleId },
    });

    await expect(
      refundService.process(organizationId, userId, {
        returnId: returnRecord!.id,
        paymentId,
        amount: remainingRefundable + 1,
      })
    ).rejects.toThrow('Refund amount exceeds remaining refundable amount');
  });

  it('prevents refunding more than return total', async () => {
    // Get the return created in the first test
    const returnRecord = await prisma.return.findFirst({
      where: { saleId },
    });

    // Try to refund more than the return total (even if payment has enough)
    await expect(
      refundService.process(organizationId, userId, {
        returnId: returnRecord!.id,
        paymentId,
        amount: Number(returnRecord!.totalRefunded) + 1000,
      })
    ).rejects.toThrow('Refund amount exceeds remaining refundable amount');
  });
});
