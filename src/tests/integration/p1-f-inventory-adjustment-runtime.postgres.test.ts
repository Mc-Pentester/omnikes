import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { inventoryService } from '@omnikes/services/inventory.service';

describe('P1-F - Inventory adjustment runtime coherence', () => {
  let organizationId = '';
  let inventoryId = '';
  let baselineQuantity = 0;
  let baselineReservedQuantity = 0;
  let testNotes: string[] = [];

  beforeAll(async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin.a@omnikes.test' },
      select: { organizationId: true },
    });
    organizationId = admin.organizationId;

    const inventory = await prisma.inventory.findFirstOrThrow({
      where: {
        store: { organizationId },
        quantity: { gt: 0 },
        reservedQuantity: 0,
      },
      orderBy: { id: 'asc' },
      select: { id: true, quantity: true, reservedQuantity: true },
    });

    inventoryId = inventory.id;
    baselineQuantity = inventory.quantity;
    baselineReservedQuantity = inventory.reservedQuantity;
  });

  it('rejects lowering stock below reserved quantity without mutation', async () => {
    await inventoryService.reserveStock(inventoryId, 1, organizationId);

    const before = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });

    const notes = `P1-F-REJECT-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    testNotes.push(notes);

    await expect(
      inventoryService.adjustQuantity(inventoryId, before.quantity - 1, organizationId, notes),
    ).rejects.toThrow('Adjusted quantity cannot be below reserved quantity');

    const [after, movement] = await Promise.all([
      prisma.inventory.findUniqueOrThrow({
        where: { id: inventoryId },
        select: { quantity: true, reservedQuantity: true },
      }),
      prisma.inventoryMovement.findFirst({
        where: { inventoryId, notes },
        select: { id: true },
      }),
    ]);

    expect(after).toEqual(before);
    expect(movement).toBeNull();

    await inventoryService.releaseReservedStock(inventoryId, 1, organizationId);
  });

  it('persists the exact signed delta for successful adjustments', async () => {
    const increaseNotes = `P1-F-UP-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const decreaseNotes = `P1-F-DOWN-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    testNotes.push(increaseNotes, decreaseNotes);

    const before = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });

    await inventoryService.adjustQuantity(inventoryId, before.quantity + 2, organizationId, increaseNotes);

    const afterIncrease = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });
    expect(afterIncrease.quantity).toBe(before.quantity + 2);
    expect(afterIncrease.reservedQuantity).toBe(before.reservedQuantity);

    await inventoryService.adjustQuantity(inventoryId, afterIncrease.quantity - 1, organizationId, decreaseNotes);

    const [afterDecrease, movements] = await Promise.all([
      prisma.inventory.findUniqueOrThrow({
        where: { id: inventoryId },
        select: { quantity: true, reservedQuantity: true },
      }),
      prisma.inventoryMovement.findMany({
        where: { inventoryId, notes: { in: [increaseNotes, decreaseNotes] } },
        select: { notes: true, type: true, quantity: true },
      }),
    ]);

    expect(afterDecrease.quantity).toBe(before.quantity + 1);
    expect(afterDecrease.reservedQuantity).toBe(before.reservedQuantity);
    expect(movements).toEqual(
      expect.arrayContaining([
        { notes: increaseNotes, type: 'ADJUSTMENT', quantity: 2 },
        { notes: decreaseNotes, type: 'ADJUSTMENT', quantity: -1 },
      ]),
    );
  });

  it('rejects a no-op adjustment before persistence', async () => {
    const current = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true },
    });
    const notes = `P1-F-NOOP-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    testNotes.push(notes);

    await expect(
      inventoryService.adjustQuantity(inventoryId, current.quantity, organizationId, notes),
    ).rejects.toThrow('No inventory adjustment is required');

    const movement = await prisma.inventoryMovement.findFirst({
      where: { inventoryId, notes },
      select: { id: true },
    });
    expect(movement).toBeNull();
  });

  afterAll(async () => {
    if (testNotes.length) {
      await prisma.inventoryMovement.deleteMany({
        where: { inventoryId, notes: { in: testNotes } },
      }).catch(() => undefined);
    }

    if (inventoryId) {
      await prisma.inventory.update({
        where: { id: inventoryId },
        data: {
          quantity: baselineQuantity,
          reservedQuantity: baselineReservedQuantity,
        },
      }).catch(() => undefined);
    }

    await prisma.$disconnect();
  });
});
