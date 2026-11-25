import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { inventoryService } from '@omnikes/services/inventory.service';

describe('Inventory receipt idempotency - PostgreSQL runtime', () => {
  let organizationId = '';
  let inventoryId = '';
  let baselineQuantity = 0;
  const referenceId = `RECEIPT-IDEMPOTENCY-${Date.now()}`;

  beforeAll(async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin.a@omnikes.test' },
      select: { organizationId: true },
    });
    organizationId = admin.organizationId;
    const inventory = await prisma.inventory.findFirstOrThrow({
      where: { store: { organizationId }, reservedQuantity: 0 },
      orderBy: { id: 'asc' },
      select: { id: true, quantity: true },
    });
    inventoryId = inventory.id;
    baselineQuantity = inventory.quantity;
  });

  it('applies a receipt once when the same reference is submitted repeatedly', async () => {
    const first = await inventoryService.receiveInventory(inventoryId, organizationId, {
      quantity: 3, referenceId, notes: 'Idempotency runtime test',
    });
    const second = await inventoryService.receiveInventory(inventoryId, organizationId, {
      quantity: 3, referenceId, notes: 'Idempotency runtime test retry',
    });

    expect(first?.quantity).toBe(baselineQuantity + 3);
    expect(second?.quantity).toBe(baselineQuantity + 3);
    const [inventory, movements] = await Promise.all([
      prisma.inventory.findUniqueOrThrow({ where: { id: inventoryId }, select: { quantity: true } }),
      prisma.inventoryMovement.findMany({
        where: { inventoryId, referenceType: 'INVENTORY_RECEIPT', referenceId },
        select: { quantity: true },
      }),
    ]);
    expect(inventory.quantity).toBe(baselineQuantity + 3);
    expect(movements).toEqual([{ quantity: 3 }]);
  });

  it('rejects receipts without a stable idempotency reference', async () => {
    await expect(inventoryService.receiveInventory(inventoryId, organizationId, {
      quantity: 1,
    })).rejects.toThrow();
    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId }, select: { quantity: true },
    });
    expect(inventory.quantity).toBe(baselineQuantity + 3);
  });

  it('rejects reuse of a receipt reference with a different quantity', async () => {
    await expect(inventoryService.receiveInventory(inventoryId, organizationId, {
      quantity: 4, referenceId,
    })).rejects.toThrow('Receipt reference already exists with a different quantity');
    const inventory = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId }, select: { quantity: true },
    });
    expect(inventory.quantity).toBe(baselineQuantity + 3);
  });

  afterAll(async () => {
    if (inventoryId) {
      await prisma.inventoryMovement.deleteMany({
        where: { inventoryId, referenceType: 'INVENTORY_RECEIPT', referenceId },
      }).catch(() => undefined);
      await prisma.inventory.update({
        where: { id: inventoryId }, data: { quantity: baselineQuantity },
      }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });
});
