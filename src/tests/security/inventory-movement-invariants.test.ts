import { describe, expect, it } from 'vitest';
import { inventoryMovementSchema } from '@omnikes/lib/validation';

const inventoryId = 'ckinventory000000000000001';

describe('P1-D inventory movement sign invariants', () => {
  it.each(['SALE', 'PURCHASE', 'TRANSFER_IN', 'TRANSFER_OUT', 'RETURN'] as const)(
    'rejects negative quantity for %s',
    (type) => {
      expect(() =>
        inventoryMovementSchema.parse({
          inventoryId,
          type,
          quantity: -1,
        }),
      ).toThrow();
    },
  );

  it('allows signed quantity for ADJUSTMENT', () => {
    expect(
      inventoryMovementSchema.parse({
        inventoryId,
        type: 'ADJUSTMENT',
        quantity: -1,
      }).quantity,
    ).toBe(-1);
  });

  it('rejects zero quantity for every movement type', () => {
    expect(() =>
      inventoryMovementSchema.parse({
        inventoryId,
        type: 'PURCHASE',
        quantity: 0,
      }),
    ).toThrow();
  });
});
