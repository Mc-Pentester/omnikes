import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { inventoryService } from '@omnikes/services/inventory.service';

describe('P1-E - Inventory movement runtime coherence', () => {
  let organizationId = '';
  let inventoryId = '';
  let baselineQuantity = 0;
  let currentQuantity = 0;
  const referenceIds: string[] = [];

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
      },
      orderBy: { id: 'asc' },
      select: { id: true, quantity: true },
    });

    inventoryId = inventory.id;
    baselineQuantity = inventory.quantity;
    currentQuantity = inventory.quantity;
  });

  it('applies positive directional movements and signed adjustments consistently', async () => {
    const cases = [
      { type: 'PURCHASE' as const, delta: 1 },
      { type: 'RETURN' as const, delta: 1 },
      { type: 'SALE' as const, delta: -1 },
    ];

    for (const movement of cases) {
      const referenceId = `P1-E-${movement.type}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      referenceIds.push(referenceId);

      await inventoryService.createMovement(inventoryId, organizationId, {
        inventoryId,
        type: movement.type,
        quantity: 1,
        referenceId,
        referenceType: 'P1_E_RUNTIME_PROOF',
      });

      const [inventory, persisted] = await Promise.all([
        prisma.inventory.findUniqueOrThrow({
          where: { id: inventoryId },
          select: { quantity: true },
        }),
        prisma.inventoryMovement.findFirstOrThrow({
          where: { referenceId },
          select: { type: true, quantity: true },
        }),
      ]);

      expect(persisted.type).toBe(movement.type);
      expect(persisted.quantity).toBe(1);
      expect(inventory.quantity).toBe(currentQuantity + movement.delta);
      currentQuantity = inventory.quantity;
    }

    const increaseReference = `P1-E-ADJUST-UP-${Date.now()}`;
    referenceIds.push(increaseReference);
    await inventoryService.createMovement(inventoryId, organizationId, {
      inventoryId,
      type: 'ADJUSTMENT',
      quantity: 2,
      referenceId: increaseReference,
      referenceType: 'P1_E_RUNTIME_PROOF',
    });

    const afterIncrease = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true },
    });
    expect(afterIncrease.quantity).toBe(currentQuantity + 2);
    currentQuantity = afterIncrease.quantity;

    const decreaseReference = `P1-E-ADJUST-DOWN-${Date.now()}`;
    referenceIds.push(decreaseReference);
    await inventoryService.createMovement(inventoryId, organizationId, {
      inventoryId,
      type: 'ADJUSTMENT',
      quantity: -2,
      referenceId: decreaseReference,
      referenceType: 'P1_E_RUNTIME_PROOF',
    });

    const [afterDecrease, adjustmentRows] = await Promise.all([
      prisma.inventory.findUniqueOrThrow({
        where: { id: inventoryId },
        select: { quantity: true },
      }),
      prisma.inventoryMovement.findMany({
        where: { referenceId: decreaseReference },
        select: { type: true, quantity: true },
      }),
    ]);

    expect(afterDecrease.quantity).toBe(currentQuantity - 2);
    expect(adjustmentRows).toEqual([
      expect.objectContaining({ type: 'ADJUSTMENT', quantity: -2 }),
    ]);
    currentQuantity = afterDecrease.quantity;
  });

  it.each(['SALE', 'PURCHASE', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN'] as const)(
    'rejects negative quantity for %s before persistence',
    async (type) => {
      const referenceId = `P1-E-REJECT-${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      await expect(
        inventoryService.createMovement(inventoryId, organizationId, {
          inventoryId,
          type,
          quantity: -1,
          referenceId,
          referenceType: 'P1_E_RUNTIME_PROOF',
        }),
      ).rejects.toThrow(`Quantity must be positive for ${type} movements`);

      const persisted = await prisma.inventoryMovement.findFirst({
        where: { referenceId },
        select: { id: true },
      });
      expect(persisted).toBeNull();
    },
  );

  afterAll(async () => {
    if (referenceIds.length) {
      await prisma.inventoryMovement.deleteMany({
        where: { referenceId: { in: referenceIds } },
      }).catch(() => undefined);
    }

    if (inventoryId) {
      await prisma.inventory.update({
        where: { id: inventoryId },
        data: { quantity: baselineQuantity },
      }).catch(() => undefined);
    }

    await prisma.$disconnect();
  });
});
