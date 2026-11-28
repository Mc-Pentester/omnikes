export const SUBSCRIPTION_PLANS = ['OMNIKES_149', 'OMNIKES_249', 'OMNIKES_299'] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];
export type SubscriptionCapability =
  | 'pos.sales'
  | 'inventory.core'
  | 'inventory.transfers'
  | 'purchases.manage'
  | 'customers.credit'
  | 'reports.advanced'
  | 'organization.multi_store'
  | 'analytics.consolidated'
  | 'catalog.centralized'
  | 'backup.automated'
  | 'data.read'
  | 'data.export';
export type SubscriptionOperation = 'READ' | 'WRITE' | 'EXPORT';

type SubscriptionStatus = 'NONE' | 'LEGACY' | 'TRIAL' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | string;

export interface SubscriptionSnapshot {
  subscriptionStatus: SubscriptionStatus;
  subscriptionPlan: string | null;
  subscriptionExpiresAt: Date | string | null;
}

export type EntitlementDecision =
  | { allowed: true; reason: 'PLAN_INCLUDED' | 'HISTORICAL_READ_ONLY' }
  | { allowed: false; reason: 'SUBSCRIPTION_REQUIRED' | 'SUBSCRIPTION_EXPIRED' | 'UNKNOWN_PLAN' | 'CAPABILITY_NOT_INCLUDED' };

const PLAN_LEVEL: Record<SubscriptionPlan, number> = {
  OMNIKES_149: 1,
  OMNIKES_249: 2,
  OMNIKES_299: 3,
};

const CAPABILITY_LEVEL: Record<SubscriptionCapability, number> = {
  'pos.sales': 1,
  'inventory.core': 1,
  'inventory.transfers': 2,
  'purchases.manage': 2,
  'customers.credit': 2,
  'reports.advanced': 2,
  'organization.multi_store': 2,
  'analytics.consolidated': 3,
  'catalog.centralized': 3,
  'backup.automated': 2,
  'data.read': 1,
  'data.export': 2,
};

const isPlan = (value: string | null): value is SubscriptionPlan =>
  value !== null && Object.prototype.hasOwnProperty.call(PLAN_LEVEL, value);

export function evaluateSubscriptionEntitlement(
  subscription: SubscriptionSnapshot,
  capability: SubscriptionCapability,
  operation: SubscriptionOperation,
  now: Date = new Date(),
): EntitlementDecision {
  const legacyEssential = subscription.subscriptionStatus === 'LEGACY';
  const freeLicense = subscription.subscriptionStatus === 'FREE';
  const activeStatus = legacyEssential || freeLicense || subscription.subscriptionStatus === 'TRIAL' || subscription.subscriptionStatus === 'ACTIVE';
  const expiresAt = subscription.subscriptionExpiresAt
    ? new Date(subscription.subscriptionExpiresAt)
    : null;
  const expirationIsValid = Boolean(expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > now.getTime());
  const validUntil = legacyEssential || (freeLicense ? !expiresAt || expirationIsValid : expirationIsValid);

  // Once access expires, historical data remains readable and exportable.
  // This is a read-only exception, not permission to create or mutate records.
  if (!activeStatus || !validUntil) {
    if (operation === 'READ') return { allowed: true, reason: 'HISTORICAL_READ_ONLY' };
    if (operation === 'EXPORT' && capability === 'data.export') {
      return { allowed: true, reason: 'HISTORICAL_READ_ONLY' };
    }
    return {
      allowed: false,
      reason: activeStatus ? 'SUBSCRIPTION_EXPIRED' : 'SUBSCRIPTION_REQUIRED',
    };
  }

  const requiredLevel = CAPABILITY_LEVEL[capability];
  if (!requiredLevel) return { allowed: false, reason: 'CAPABILITY_NOT_INCLUDED' };

  if (freeLicense) {
    // A platform-granted free license unlocks every registered capability.
    return { allowed: true, reason: 'PLAN_INCLUDED' };
  }

  if (legacyEssential) {
    const legacyLevel = CAPABILITY_LEVEL[capability];
    return legacyLevel === 1
      ? { allowed: true, reason: 'PLAN_INCLUDED' }
      : { allowed: false, reason: 'CAPABILITY_NOT_INCLUDED' };
  }

  if (!isPlan(subscription.subscriptionPlan)) {
    return { allowed: false, reason: 'UNKNOWN_PLAN' };
  }

  if (PLAN_LEVEL[subscription.subscriptionPlan] < requiredLevel) {
    return { allowed: false, reason: 'CAPABILITY_NOT_INCLUDED' };
  }

  return { allowed: true, reason: 'PLAN_INCLUDED' };
}
