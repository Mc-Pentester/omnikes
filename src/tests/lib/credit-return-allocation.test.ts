import { describe, expect, it } from 'vitest';
import { calculateCreditReturnAllocation } from '@omnikes/lib/credit-return-allocation';

describe('customer credit return allocation', () => {
  it('reduces unpaid debt before refunding repayments', () => {
    expect(calculateCreditReturnAllocation(1000, 400, 100, 700)).toEqual({ outstandingBefore: 500, debtAdjustment: 500, repaymentRefundDue: 200 });
  });
  it('refunds returned value when the credit is already settled', () => {
    expect(calculateCreditReturnAllocation(1000, 1000, 0, 250)).toEqual({ outstandingBefore: 0, debtAdjustment: 0, repaymentRefundDue: 250 });
  });
  it('reduces debt only when the return is below the outstanding balance', () => {
    expect(calculateCreditReturnAllocation(1000, 200, 0, 150)).toEqual({ outstandingBefore: 800, debtAdjustment: 150, repaymentRefundDue: 0 });
  });
  it('rounds cents and never creates a negative refund', () => {
    expect(calculateCreditReturnAllocation(100, 33.33, 0, 66.68)).toEqual({ outstandingBefore: 66.67, debtAdjustment: 66.67, repaymentRefundDue: 0.01 });
  });
});
