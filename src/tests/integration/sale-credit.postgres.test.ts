import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { saleService } from '@omnikes/services/sale.service';

describe('P0-24-F.2-D - real PostgreSQL sale credit runtime', () => {
  let orgA: { id: string };
  let orgB: { id: string };
  let storeA: { id: string };
  let customerA: { id: string };
  let customerB: { id: string };
  let temporaryCustomerA = false;
  let temporaryCustomerB = false;
  let adminA: { id: string };
  let variantA: { id: string };

  const createdSaleIds: string[] = [];
  const inventorySnapshots = new Map<string, number>();

  beforeAll(async () => {
    orgA = (await prisma.organization.findUniqueOrThrow({
      where: { slug: 'omnikes-test-commerce-a' },
      select: { id: true },
    }));

    orgB = (await prisma.organization.findUniqueOrThrow({
      where: { slug: 'omnikes-test-commerce-b' },
      select: { id: true },
    }));

    storeA = await prisma.store.findFirstOrThrow({
      where: { organizationId: orgA.id, code: 'STORE-A' },
      select: { id: true },
    });

    const existingCustomerA = await prisma.customer.findFirst({
      where: { organizationId: orgA.id, email: 'client.a@omnikes.test' },
      select: { id: true },
    });
    if (existingCustomerA) {
      customerA = existingCustomerA;
    } else {
      customerA = await prisma.customer.create({
        data: {
          organizationId: orgA.id,
          name: 'P0-24-F.2-D Customer A',
          email: 'client.a@omnikes.test',
        },
        select: { id: true },
      });
      temporaryCustomerA = true;
    }

    const existingCustomerB = await prisma.customer.findFirst({
      where: { organizationId: orgA.id, email: 'p0-24-f2-d.customer-b@omnikes.test' },
      select: { id: true },
    });
    if (existingCustomerB) {
      customerB = existingCustomerB;
    } else {
      customerB = await prisma.customer.create({
        data: {
          organizationId: orgA.id,
          name: 'P0-24-F.2-D Customer B',
          email: 'p0-24-f2-d.customer-b@omnikes.test',
        },
        select: { id: true },
      });
      temporaryCustomerB = true;
    }

    adminA = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin.a@omnikes.test' },
      select: { id: true },
    });

    variantA = await prisma.productVariant.findUniqueOrThrow({
      where: { sku: 'OIL-A-1L' },
      select: { id: true },
    });
  });

  async function createSale(customerId: string | null = customerA.id, quantity = 1) {
    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { storeId_variantId: { storeId: storeA.id, variantId: variantA.id } },
      select: { id: true, quantity: true },
    });

    const sale = await prisma.sale.create({
      data: {
        organizationId: orgA.id,
        storeId: storeA.id,
        orderNumber: `P0-24-F2-D-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
            variantId: variantA.id,
            quantity,
            unitPrice: 1000,
            totalPrice: 1000,
            discount: 0,
          },
        },
      },
    });

    createdSaleIds.push(sale.id);
    inventorySnapshots.set(sale.id, inventory.quantity);
    return { sale, inventory };
  }

  async function cleanupSale(saleId: string) {
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { status: true, storeId: true, items: { select: { quantity: true, variantId: true } } },
    });

    if (!sale) return;

    await prisma.inventoryMovement.deleteMany({ where: { referenceId: saleId } });
    await prisma.sale.delete({ where: { id: saleId } });

    const snapshot = inventorySnapshots.get(saleId);
    if (snapshot !== undefined) {
      for (const item of sale.items) {
        await prisma.inventory.update({
          where: { storeId_variantId: { storeId: sale.storeId, variantId: item.variantId } },
          data: { quantity: snapshot },
        });
      }
    }
  }

  afterAll(async () => {
    for (const saleId of [...createdSaleIds].reverse()) {
      await cleanupSale(saleId);
    }
    if (temporaryCustomerB) {
      await prisma.customer.delete({ where: { id: customerB.id } });
    }
    if (temporaryCustomerA) {
      await prisma.customer.delete({ where: { id: customerA.id } });
    }
    await prisma.$disconnect();
  });

  it('completes with 100% real payment and records stock movement', async () => {
    const { sale } = await createSale();

    await prisma.payment.create({
      data: { saleId: sale.id, method: 'CASH', amount: 1000, status: 'COMPLETED' },
    });

    await saleService.complete(sale.id, orgA.id);

    const result = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { payments: true, saleCredit: true },
    });
    const movements = await prisma.inventoryMovement.count({ where: { referenceId: sale.id, type: 'SALE' } });

    expect(result.status).toBe('COMPLETED');
    expect(result.saleCredit).toBeNull();
    expect(result.payments).toHaveLength(1);
    expect(movements).toBe(1);
  });

  it('completes with 100% explicit authorized credit and no payment', async () => {
    const { sale } = await createSale();

    await saleService.authorizeCredit(sale.id, orgA.id, adminA.id, {
      customerId: customerA.id,
      amount: 1000,
    });

    await saleService.complete(sale.id, orgA.id);

    const result = await prisma.sale.findUniqueOrThrow({
      where: { id: sale.id },
      include: { payments: true, saleCredit: true },
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.payments).toHaveLength(0);
    expect(Number(result.saleCredit?.amount)).toBe(1000);
    expect(result.saleCredit?.status).toBe('AUTHORIZED');
    expect(await prisma.inventoryMovement.count({ where: { referenceId: sale.id, type: 'SALE' } })).toBe(1);
  });

  it('completes with partial payment plus explicit credit', async () => {
    const { sale } = await createSale();

    await prisma.payment.create({
      data: { saleId: sale.id, method: 'CASH', amount: 600, status: 'COMPLETED' },
    });

    await saleService.authorizeCredit(sale.id, orgA.id, adminA.id, {
      customerId: customerA.id,
      amount: 400,
    });

    await saleService.complete(sale.id, orgA.id);

    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe('COMPLETED');
  });

  it('keeps sale pending when financial coverage is insufficient', async () => {
    const { sale } = await createSale();

    await prisma.payment.create({
      data: { saleId: sale.id, method: 'CASH', amount: 600, status: 'COMPLETED' },
    });

    await expect(saleService.complete(sale.id, orgA.id)).rejects.toThrow('Insufficient financial coverage');

    const result = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(result.status).toBe('PENDING');
    expect(await prisma.inventoryMovement.count({ where: { referenceId: sale.id } })).toBe(0);
  });

  it('rejects insufficient payment plus insufficient credit', async () => {
    const { sale } = await createSale();

    await prisma.payment.create({
      data: { saleId: sale.id, method: 'CASH', amount: 600, status: 'COMPLETED' },
    });

    await saleService.authorizeCredit(sale.id, orgA.id, adminA.id, {
      customerId: customerA.id,
      amount: 300,
    });

    await expect(saleService.complete(sale.id, orgA.id)).rejects.toThrow('Insufficient financial coverage');
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe('PENDING');
  });

  it('does not infer credit from zero payment and no credit agreement', async () => {
    const { sale } = await createSale();

    await expect(saleService.complete(sale.id, orgA.id)).rejects.toThrow('Insufficient financial coverage');
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe('PENDING');
  });

  it('rejects credit without a customer', async () => {
    const { sale } = await createSale(null);

    await expect(
      saleService.authorizeCredit(sale.id, orgA.id, adminA.id, {
        customerId: customerA.id,
        amount: 1000,
      }),
    ).rejects.toThrow('A customer is required to authorize credit');

    expect(await prisma.saleCredit.count({ where: { saleId: sale.id } })).toBe(0);
  });

  it('rejects credit for a different customer', async () => {
    const { sale } = await createSale();

    await expect(
      saleService.authorizeCredit(sale.id, orgA.id, adminA.id, {
        customerId: customerB.id,
        amount: 1000,
      }),
    ).rejects.toThrow('Credit customer must match the sale customer');

    expect(await prisma.saleCredit.count({ where: { saleId: sale.id } })).toBe(0);
  });

  it('rejects credit above remaining balance', async () => {
    const { sale } = await createSale();

    await prisma.payment.create({
      data: { saleId: sale.id, method: 'CASH', amount: 600, status: 'COMPLETED' },
    });

    await expect(
      saleService.authorizeCredit(sale.id, orgA.id, adminA.id, {
        customerId: customerA.id,
        amount: 500,
      }),
    ).rejects.toThrow('Credit amount exceeds remaining balance');

    expect(await prisma.saleCredit.count({ where: { saleId: sale.id } })).toBe(0);
  });

  it('rejects a second credit agreement for the same sale', async () => {
    const { sale } = await createSale();

    await saleService.authorizeCredit(sale.id, orgA.id, adminA.id, {
      customerId: customerA.id,
      amount: 400,
    });

    await expect(
      saleService.authorizeCredit(sale.id, orgA.id, adminA.id, {
        customerId: customerA.id,
        amount: 400,
      }),
    ).rejects.toThrow('Credit is already authorized for this sale');

    expect(await prisma.saleCredit.count({ where: { saleId: sale.id } })).toBe(1);
  });

  it('does not count historical CREDIT payment as financial coverage', async () => {
    const { sale } = await createSale();

    await prisma.payment.create({
      data: { saleId: sale.id, method: 'CREDIT', amount: 1000, status: 'COMPLETED' },
    });

    await expect(saleService.complete(sale.id, orgA.id)).rejects.toThrow('Insufficient financial coverage');
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe('PENDING');
  });

  it('rolls back finalization when stock is unavailable', async () => {
    const { sale, inventory } = await createSale();

    await prisma.payment.create({
      data: { saleId: sale.id, method: 'CASH', amount: 1000, status: 'COMPLETED' },
    });

    await prisma.inventory.update({
      where: { id: inventory.id },
      data: { quantity: 0 },
    });

    await expect(saleService.complete(sale.id, orgA.id)).rejects.toThrow('Insufficient stock');

    const result = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(result.status).toBe('PENDING');
    expect(await prisma.inventoryMovement.count({ where: { referenceId: sale.id } })).toBe(0);
  });

  it('rejects cross-organization credit authorization', async () => {
    const { sale } = await createSale();

    await expect(
      saleService.authorizeCredit(sale.id, orgB.id, adminA.id, {
        customerId: customerA.id,
        amount: 1000,
      }),
    ).rejects.toThrow('Sale not found or access denied');

    expect(await prisma.saleCredit.count({ where: { saleId: sale.id } })).toBe(0);
  });
});
