import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { inventoryService } from '@omnikes/services/inventory.service';

describe('P1-G - Inventory reservation runtime coherence', () => {
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

  it('reserves only available stock and rejects over-reservation without mutation', async () => {
    const before = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });

    await inventoryService.reserveStock(inventoryId, 2, organizationId);

    const afterReserve = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });

    expect(afterReserve.quantity).toBe(before.quantity);
    expect(afterReserve.reservedQuantity).toBe(before.reservedQuantity + 2);
    expect(
      await inventoryService.getAvailableQuantity(
        (
          await prisma.inventory.findUniqueOrThrow({
            where: { id: inventoryId },
            select: { storeId: true, variantId: true },
          })
        ).storeId,
        (
          await prisma.inventory.findUniqueOrThrow({
            where: { id: inventoryId },
            select: { storeId: true, variantId: true },
          })
        ).variantId,
        organizationId,
      ),
    ).toBe(before.quantity - 2);

    await expect(
      inventoryService.reserveStock(inventoryId, before.quantity, organizationId),
    ).rejects.toThrow('Insufficient available stock');

    const afterReject = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });
    expect(afterReject).toEqual(afterReserve);

    await inventoryService.releaseReservedStock(inventoryId, 2, organizationId);
  });

  it('serializes concurrent reservations and never exceeds available stock', async () => {
    const before = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });

    const availableBefore = before.quantity - before.reservedQuantity;
    const request = Math.floor(availableBefore / 2) + 1;

    const results = await Promise.allSettled([
      inventoryService.reserveStock(inventoryId, request, organizationId),
      inventoryService.reserveStock(inventoryId, request, organizationId),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(2 * request).toBeGreaterThan(availableBefore);
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const after = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });

    expect(after.quantity).toBe(before.quantity);
    expect(after.reservedQuantity).toBe(before.reservedQuantity + request);
    expect(after.reservedQuantity).toBeLessThanOrEqual(after.quantity);

    const available = await inventoryService.getAvailableQuantity(
      (
        await prisma.inventory.findUniqueOrThrow({
          where: { id: inventoryId },
          select: { storeId: true, variantId: true },
        })
      ).storeId,
      (
        await prisma.inventory.findUniqueOrThrow({
          where: { id: inventoryId },
          select: { storeId: true, variantId: true },
        })
      ).variantId,
      organizationId,
    );
    expect(available).toBe(after.quantity - after.reservedQuantity);

    await inventoryService.releaseReservedStock(inventoryId, request, organizationId);
  });

  it('rejects invalid reservation and release quantities before persistence', async () => {
    const before = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });

    await expect(
      inventoryService.reserveStock(inventoryId, 0, organizationId),
    ).rejects.toThrow('Quantity must be positive');

    await expect(
      inventoryService.releaseReservedStock(inventoryId, 0, organizationId),
    ).rejects.toThrow('Quantity must be positive');

    const after = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });
    expect(after).toEqual(before);
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
    }

    await prisma.$disconnect();
  });
});
