import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { inventoryService } from '@omnikes/services/inventory.service';

describe('P1-D - Inventory transfer movement runtime coherence', () => {
  let organizationId = '';
  let sourceId = '';
  let targetId = '';
  let referenceId = '';
  let sourceQuantity = 0;
  let targetQuantity = 0;

  beforeAll(async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin.a@omnikes.test' },
      select: { organizationId: true },
    });
    organizationId = admin.organizationId;

    const source = await prisma.inventory.findFirstOrThrow({
      where: { store: { organizationId } },
      orderBy: { id: 'asc' },
      select: { id: true, variantId: true, quantity: true },
    });

    const target = await prisma.inventory.findFirst({
      where: {
        store: { organizationId },
        variantId: source.variantId,
        id: { not: source.id },
      },
      select: { id: true, quantity: true },
    });

    if (!target) {
      throw new Error('P1-D runtime fixture requires two inventories for the same variant in one organization');
    }

    sourceId = source.id;
    targetId = target.id;
    sourceQuantity = source.quantity;
    targetQuantity = target.quantity;
    referenceId = `P1-D-TRANSFER-${Date.now()}`;
  });

  it('records TRANSFER_OUT and TRANSFER_IN with positive quantities', async () => {
    const transferQuantity = 1;

    await inventoryService.transferInventory(sourceId, organizationId, {
      targetInventoryId: targetId,
      quantity: transferQuantity,
      referenceId,
      notes: 'P1-D runtime coherence proof',
    });

    const movements = await prisma.inventoryMovement.findMany({
      where: { referenceId },
      orderBy: { type: 'asc' },
      select: { inventoryId: true, type: true, quantity: true },
    });

    expect(movements).toHaveLength(2);
    expect(movements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          inventoryId: sourceId,
          type: 'TRANSFER_OUT',
          quantity: transferQuantity,
        }),
        expect.objectContaining({
          inventoryId: targetId,
          type: 'TRANSFER_IN',
          quantity: transferQuantity,
        }),
      ]),
    );

    const [sourceAfter, targetAfter] = await Promise.all([
      prisma.inventory.findUniqueOrThrow({ where: { id: sourceId }, select: { quantity: true } }),
      prisma.inventory.findUniqueOrThrow({ where: { id: targetId }, select: { quantity: true } }),
    ]);

    expect(sourceAfter.quantity).toBe(sourceQuantity - transferQuantity);
    expect(targetAfter.quantity).toBe(targetQuantity + transferQuantity);
  });

  afterAll(async () => {
    if (referenceId) {
      await prisma.inventoryMovement.deleteMany({ where: { referenceId } }).catch(() => undefined);
    }
    if (sourceId) {
      await prisma.inventory.update({ where: { id: sourceId }, data: { quantity: sourceQuantity } }).catch(() => undefined);
    }
    if (targetId) {
      await prisma.inventory.update({ where: { id: targetId }, data: { quantity: targetQuantity } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });
});
