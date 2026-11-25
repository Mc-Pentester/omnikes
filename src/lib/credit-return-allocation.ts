import { roundMoney } from '@omnikes/lib/money';
export type CreditReturnAllocation = { outstandingBefore: number; debtAdjustment: number; repaymentRefundDue: number };
export function calculateCreditReturnAllocation(creditAmount: number, paidAmount: number, priorAdjustments: number, returnAmount: number): CreditReturnAllocation {
  const outstandingBefore = roundMoney(Math.max(0, creditAmount - paidAmount - priorAdjustments));
  const debtAdjustment = roundMoney(Math.min(Math.max(0, returnAmount), outstandingBefore));
  return { outstandingBefore, debtAdjustment, repaymentRefundDue: roundMoney(Math.max(0, returnAmount - debtAdjustment)) };
}
