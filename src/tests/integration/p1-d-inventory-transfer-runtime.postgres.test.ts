import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { inventoryService } from '@omnikes/services/inventory.service';

describe('P1-D - Inventory transfer movement runtime coherence', () => {
  let organizationId = '';
  let sourceId = '';
  let targetId = '';
  let createdTargetId = '';
  let createdStoreId = '';
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
      where: { store: { organizationId }, quantity: { gt: 0 } },
      orderBy: { id: 'asc' },
      select: { id: true, storeId: true, variantId: true, quantity: true },
    });

    sourceId = source.id;
    sourceQuantity = source.quantity;

    const existingTarget = await prisma.inventory.findFirst({
      where: {
        variantId: source.variantId,
        store: { organizationId },
        id: { not: source.id },
      },
      orderBy: { id: 'asc' },
      select: { id: true, quantity: true },
    });

    if (existingTarget) {
      targetId = existingTarget.id;
      targetQuantity = existingTarget.quantity;
    } else {
      const targetStore = await prisma.store.findFirst({
        where: {
          organizationId,
          id: { not: source.storeId },
        },
        orderBy: { id: 'asc' },
        select: { id: true },
      });

      let targetStoreId = targetStore?.id ?? '';

      if (!targetStoreId) {
        const createdStore = await prisma.store.create({
          data: {
            organizationId,
            name: 'P1-D Runtime Temporary Store',
            code: `P1-D-${Date.now()}`,
          },
          select: { id: true },
        });
        targetStoreId = createdStore.id;
        createdStoreId = createdStore.id;
      }

      const createdTarget = await prisma.inventory.create({
        data: {
          storeId: targetStoreId,
          variantId: source.variantId,
          quantity: 0,
          reservedQuantity: 0,
        },
        select: { id: true, quantity: true },
      });

      targetId = createdTarget.id;
      createdTargetId = createdTarget.id;
      targetQuantity = createdTarget.quantity;
    }

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
      if (createdTargetId === targetId) {
        await prisma.inventory.delete({ where: { id: targetId } }).catch(() => undefined);
      } else {
        await prisma.inventory.update({ where: { id: targetId }, data: { quantity: targetQuantity } }).catch(() => undefined);
      }
    }
    if (createdStoreId) {
      await prisma.store.delete({ where: { id: createdStoreId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });
});
