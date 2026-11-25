import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@omnikes/lib/prisma';
import { inventoryService } from '@omnikes/services/inventory.service';

describe('P1-I - Inventory ledger conservation runtime', () => {
  let organizationId = '';
  let inventoryId = '';
  let baselineQuantity = 0;
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
        reservedQuantity: 0,
      },
      orderBy: { id: 'asc' },
      select: { id: true, quantity: true },
    });

    inventoryId = inventory.id;
    baselineQuantity = inventory.quantity;
  });

  it('keeps physical stock equal to the baseline plus the net movement ledger delta', async () => {
    const cases = [
      { type: 'PURCHASE' as const, quantity: 3, delta: 3 },
      { type: 'RETURN' as const, quantity: 2, delta: 2 },
      { type: 'SALE' as const, quantity: 4, delta: -4 },
      { type: 'ADJUSTMENT' as const, quantity: -1, delta: -1 },
    ];

    for (const movement of cases) {
      const referenceId = `P1-I-${movement.type}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      referenceIds.push(referenceId);

      await inventoryService.createMovement(inventoryId, organizationId, {
        inventoryId,
        type: movement.type,
        quantity: movement.quantity,
        referenceId,
        referenceType: 'P1_I_LEDGER_CONSERVATION',
      });
    }

    const [inventory, movements] = await Promise.all([
      prisma.inventory.findUniqueOrThrow({
        where: { id: inventoryId },
        select: { quantity: true, reservedQuantity: true },
      }),
      prisma.inventoryMovement.findMany({
        where: { referenceId: { in: referenceIds } },
        select: { type: true, quantity: true },
      }),
    ]);

    const expectedNetDelta = cases.reduce((sum, movement) => sum + movement.delta, 0);
    const persistedLedgerDelta = movements.reduce((sum, movement) => {
      if (movement.type === 'ADJUSTMENT') return sum + movement.quantity;
      return sum + (movement.type === 'SALE' || movement.type === 'TRANSFER_OUT'
        ? -movement.quantity
        : movement.quantity);
    }, 0);

    expect(movements).toHaveLength(cases.length);
    expect(persistedLedgerDelta).toBe(expectedNetDelta);
    expect(inventory.quantity).toBe(baselineQuantity + persistedLedgerDelta);
    expect(inventory.reservedQuantity).toBe(0);
    expect(inventory.reservedQuantity).toBeLessThanOrEqual(inventory.quantity);
  });

  afterAll(async () => {
    if (referenceIds.length) {
      await prisma.inventoryMovement.deleteMany({
        where: { referenceId: { in: referenceIds } },
      }).catch(() => undefined);
    }

    if (inventoryId) {
      await prisma.inventory.update({
        where: { id: inventoryId },
        data: { quantity: baselineQuantity, reservedQuantity: 0 },
      }).catch(() => undefined);
    }

    await prisma.$disconnect();
  });
});
