const MONEY_SCALE = 100;
const MONEY_EPSILON = 1e-9;

/** Maximum value representable by Prisma Decimal(12,2). */
export const MAX_MONEY_12_2 = 9_999_999_999.99;

/** Maximum value representable by Prisma Decimal(10,2). */
export const MAX_MONEY_10_2 = 99_999_999.99;

/**
 * Round a monetary value to the exact precision persisted by PostgreSQL Decimal(*,2).
 * The calculation is deterministic and avoids relying on implicit DB rounding.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Monetary value must be finite');
  }

  return Math.round((value + Number.EPSILON) * MONEY_SCALE) / MONEY_SCALE;
}

/**
 * Returns true when a finite number has at most two decimal places.
 */
export function hasAtMostTwoDecimalPlaces(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  return Math.abs(value * MONEY_SCALE - Math.round(value * MONEY_SCALE)) <= MONEY_EPSILON;
}

export function assertMoney(value: number, max = MAX_MONEY_12_2): number {
  if (!Number.isFinite(value) || value < 0 || value > max || !hasAtMostTwoDecimalPlaces(value)) {
    throw new Error('Monetary value must be non-negative and have at most 2 decimal places');
  }

  return value;
}
