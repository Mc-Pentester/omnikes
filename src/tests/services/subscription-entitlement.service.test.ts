import { describe, expect, it } from 'vitest';
import { evaluateSubscriptionEntitlement, type SubscriptionSnapshot } from '@omnikes/services/subscription-entitlement.service';

const future = new Date('2030-01-01T00:00:00.000Z');
const now = new Date('2029-12-01T00:00:00.000Z');
const active = (plan: string): SubscriptionSnapshot => ({
  subscriptionStatus: 'ACTIVE',
  subscriptionPlan: plan,
  subscriptionExpiresAt: future,
});

describe('evaluateSubscriptionEntitlement', () => {
  it('grants the seven-day trial plan the Professional capabilities', () => {
    const trial: SubscriptionSnapshot = {
      subscriptionStatus: 'TRIAL',
      subscriptionPlan: 'OMNIKES_249',
      subscriptionExpiresAt: future,
    };
    expect(evaluateSubscriptionEntitlement(trial, 'purchases.manage', 'WRITE', now))
      .toEqual({ allowed: true, reason: 'PLAN_INCLUDED' });
    expect(evaluateSubscriptionEntitlement(trial, 'analytics.consolidated', 'WRITE', now))
      .toEqual({ allowed: false, reason: 'CAPABILITY_NOT_INCLUDED' });
  });

  it('allows a higher plan to inherit lower-plan capabilities', () => {
    expect(evaluateSubscriptionEntitlement(active('OMNIKES_299'), 'inventory.transfers', 'WRITE', now))
      .toEqual({ allowed: true, reason: 'PLAN_INCLUDED' });
  });

  it('denies write operations after expiration', () => {
    const expired: SubscriptionSnapshot = {
      subscriptionStatus: 'ACTIVE',
      subscriptionPlan: 'OMNIKES_249',
      subscriptionExpiresAt: new Date('2029-11-30T23:59:59.999Z'),
    };
    expect(evaluateSubscriptionEntitlement(expired, 'pos.sales', 'WRITE', now))
      .toEqual({ allowed: false, reason: 'SUBSCRIPTION_EXPIRED' });
  });

  it('keeps historical reads and exports available without an active subscription', () => {
    const expired: SubscriptionSnapshot = {
      subscriptionStatus: 'EXPIRED',
      subscriptionPlan: 'OMNIKES_149',
      subscriptionExpiresAt: new Date('2029-11-30T23:59:59.999Z'),
    };
    expect(evaluateSubscriptionEntitlement(expired, 'data.read', 'READ', now))
      .toEqual({ allowed: true, reason: 'HISTORICAL_READ_ONLY' });
    expect(evaluateSubscriptionEntitlement(expired, 'data.export', 'EXPORT', now))
      .toEqual({ allowed: true, reason: 'HISTORICAL_READ_ONLY' });
  });

  it('fails closed for unknown plans and capability identifiers', () => {
    expect(evaluateSubscriptionEntitlement(active('UNRECOGNIZED'), 'pos.sales', 'WRITE', now))
      .toEqual({ allowed: false, reason: 'UNKNOWN_PLAN' });
    expect(evaluateSubscriptionEntitlement(active('OMNIKES_299'), 'unregistered.feature' as never, 'WRITE', now))
      .toEqual({ allowed: false, reason: 'CAPABILITY_NOT_INCLUDED' });
  });
});
