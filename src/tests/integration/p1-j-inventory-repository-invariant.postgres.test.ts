import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { inventoryRepository } from '@omnikes/repositories/inventory.repository';

describe('P1-J - Inventory repository invariant runtime', () => {
  let organizationId = '';
  let inventoryId = '';
  let baselineQuantity = 0;
  let baselineReserved = 0;

  beforeAll(async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin.a@omnikes.test' },
      select: { organizationId: true },
    });
    organizationId = admin.organizationId;

    const inventory = await prisma.inventory.findFirstOrThrow({
      where: { store: { organizationId }, quantity: { gt: 0 } },
      orderBy: { id: 'asc' },
      select: { id: true, quantity: true, reservedQuantity: true },
    });

    inventoryId = inventory.id;
    baselineQuantity = inventory.quantity;
    baselineReserved = inventory.reservedQuantity;
  });

  it('rejects repository updates that would make reserved stock exceed physical stock', async () => {
    await expect(
      inventoryRepository.updateQuantity(inventoryId, organizationId, {
        quantity: baselineReserved,
        reservedQuantity: baselineReserved + 1,
      }),
    ).rejects.toThrow('Reserved quantity cannot exceed quantity');

    const after = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });
    expect(after.quantity).toBe(baselineQuantity);
    expect(after.reservedQuantity).toBe(baselineReserved);
  });

  it('rejects negative quantity or reservation values before persistence', async () => {
    await expect(
      inventoryRepository.updateQuantity(inventoryId, organizationId, { quantity: -1 }),
    ).rejects.toThrow('Quantity cannot be negative');

    await expect(
      inventoryRepository.updateQuantity(inventoryId, organizationId, { reservedQuantity: -1 }),
    ).rejects.toThrow('Reserved quantity cannot be negative');

    const after = await prisma.inventory.findUniqueOrThrow({
      where: { id: inventoryId },
      select: { quantity: true, reservedQuantity: true },
    });
    expect(after.quantity).toBe(baselineQuantity);
    expect(after.reservedQuantity).toBe(baselineReserved);
  });

  afterAll(async () => {
    if (inventoryId) {
      await prisma.inventory.update({
        where: { id: inventoryId },
        data: { quantity: baselineQuantity, reservedQuantity: baselineReserved },
      }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });
});