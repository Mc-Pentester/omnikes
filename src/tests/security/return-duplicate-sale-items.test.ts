import { describe, expect, it } from 'vitest';
import { returnSchema } from '@omnikes/lib/validation';

const saleId = 'c123456789012345678901234';
const saleItemIdA = 'c223456789012345678901234';
const saleItemIdB = 'c323456789012345678901234';

describe('returnSchema', () => {
  it('rejects duplicate sale item IDs in one return request', () => {
    const result = returnSchema.safeParse({
      saleId,
      items: [
        { saleItemId: saleItemIdA, quantity: 1 },
        { saleItemId: saleItemIdA, quantity: 1 },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ['items', 1, 'saleItemId'],
          message: 'A sale item may appear only once in a return',
        }),
      );
    }
  });

  it('accepts distinct sale items in one return request', () => {
    const result = returnSchema.safeParse({
      saleId,
      items: [
        { saleItemId: saleItemIdA, quantity: 1 },
        { saleItemId: saleItemIdB, quantity: 2 },
      ],
    });

    expect(result.success).toBe(true);
  });
});
