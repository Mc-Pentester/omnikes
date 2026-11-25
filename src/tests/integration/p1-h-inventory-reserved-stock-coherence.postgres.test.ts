import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { inventoryService } from '@omnikes/services/inventory.service';

describe('P1-H - Inventory reserved-stock ledger coherence', () => {
  let organizationId = '';
  let inventoryId = '';
  let baselineQuantity = 0;
  let baselineReservedQuantity = 0;

  beforeAll(async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin.a@omnikes.test' },
      select: { organizationId: true },
    });
    organizationId = admin.organizationId;

    const inventory = await prisma.inventory.findFirstOrThrow({
      where: {
        store: { organizationId },
        quantity: { gte: 6 },
        reservedQuantity: 0,
      },
      orderBy: { id: 'asc' },
      select: { id: true, quantity: true, reservedQuantity: true },
    });

    inventoryId = inventory.id;
    baselineQuantity = inventory.quantity;
    baselineReservedQuantity = inventory.reservedQuantity;
  });

  it('rejects a direct SALE movement that would consume reserved stock', async () => {
    const before = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });

    await inventoryService.reserveStock(inventoryId, 2, organizationId);

    const reserved = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });

    const available = reserved.quantity - reserved.reservedQuantity;
    expect(available).toBeGreaterThan(0);

    await expect(
      inventoryService.createMovement(inventoryId, organizationId, {
        inventoryId,
        type: 'SALE',
        quantity: available + 1,
        referenceId: 'P1-H-RESERVED-GUARD',
        referenceType: 'P1-H',
      }),
    ).rejects.toThrow('Insufficient available stock');

    const afterReject = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });

    expect(afterReject).toEqual(reserved);
    expect(afterReject.reservedQuantity).toBeGreaterThanOrEqual(before.reservedQuantity);

    await inventoryService.releaseReservedStock(inventoryId, 2, organizationId);
  });

  it('keeps quantity and movement ledger coherent for a successful SALE', async () => {
    const before = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });

    const quantity = 2;
    const referenceId = 'P1-H-SALE-COHERENCE';

    await inventoryService.createMovement(inventoryId, organizationId, {
      inventoryId,
      type: 'SALE',
      quantity,
      referenceId,
      referenceType: 'P1-H',
    });

    const after = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });

    expect(after.quantity).toBe(before.quantity - quantity);
    expect(after.reservedQuantity).toBe(before.reservedQuantity);
    expect(after.reservedQuantity).toBeLessThanOrEqual(after.quantity);

    const movements = await prisma.inventoryMovement.findMany({
      where: { inventoryId, referenceId },
      select: { type: true, quantity: true },
    });

    expect(movements).toHaveLength(1);
    expect(movements[0]).toEqual({ type: 'SALE', quantity: quantity });
  });

  afterAll(async () => {
    if (inventoryId) {
      await prisma.inventory.update({
        where: { id: inventoryId },
        data: {
          quantity: baselineQuantity,
          reservedQuantity: baselineReservedQuantity,
        },
      }).catch(() => undefined);

      await prisma.inventoryMovement.deleteMany({
        where: {
          inventoryId,
          referenceId: { in: ['P1-H-RESERVED-GUARD', 'P1-H-SALE-COHERENCE'] },
        },
      }).catch(() => undefined);
    }

    await prisma.$disconnect();
  });
});
