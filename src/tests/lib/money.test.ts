import { describe, expect, it } from 'vitest';
import { hasAtMostTwoDecimalPlaces, roundMoney } from '@omnikes/lib/money';
import { paymentSchema, saleCreditSchema } from '@omnikes/lib/validation';

describe('P0-28 monetary precision', () => {
  it('rounds financial calculations to two decimals deterministically', () => {
    expect(roundMoney(10.01 + 20.02)).toBe(30.03);
    expect(roundMoney(100.005)).toBe(100.01);
    expect(roundMoney(19.99 * 0.18)).toBe(3.6);
    expect(roundMoney(100.01 + roundMoney(100.01 * 0.18))).toBe(118.01);
  });

  it('recognizes values with at most two decimal places', () => {
    expect(hasAtMostTwoDecimalPlaces(10)).toBe(true);
    expect(hasAtMostTwoDecimalPlaces(10.01)).toBe(true);
    expect(hasAtMostTwoDecimalPlaces(10.999)).toBe(false);
    expect(hasAtMostTwoDecimalPlaces(Number.NaN)).toBe(false);
    expect(hasAtMostTwoDecimalPlaces(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('rejects payment amounts with more than two decimals', () => {
    expect(() => paymentSchema.parse({ method: 'CASH', amount: 10.01 })).not.toThrow();
    expect(() => paymentSchema.parse({ method: 'CASH', amount: 10.001 })).toThrow();
    expect(() => paymentSchema.parse({ method: 'CASH', amount: Number.POSITIVE_INFINITY })).toThrow();
  });

  it('rejects credit amounts with more than two decimals', () => {
    expect(() => saleCreditSchema.parse({ customerId: 'c1234567890', amount: 10.01 })).not.toThrow();
    expect(() => saleCreditSchema.parse({ customerId: 'c1234567890', amount: 10.001 })).toThrow();
  });
});
