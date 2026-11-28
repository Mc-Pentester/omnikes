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

  it('keeps pre-existing installations on Essential without granting Professional features', () => {
    const legacy: SubscriptionSnapshot = {
      subscriptionStatus: 'LEGACY',
      subscriptionPlan: 'OMNIKES_149',
      subscriptionExpiresAt: null,
    };
    expect(evaluateSubscriptionEntitlement(legacy, 'pos.sales', 'WRITE', now))
      .toEqual({ allowed: true, reason: 'PLAN_INCLUDED' });
    expect(evaluateSubscriptionEntitlement(legacy, 'purchases.manage', 'WRITE', now))
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
  it('grants all registered capabilities through a perpetual free license', () => {
    const free: SubscriptionSnapshot = {
      subscriptionStatus: 'FREE',
      subscriptionPlan: null,
      subscriptionExpiresAt: null,
    };
    expect(evaluateSubscriptionEntitlement(free, 'pos.sales', 'WRITE', now))
      .toEqual({ allowed: true, reason: 'PLAN_INCLUDED' });
    expect(evaluateSubscriptionEntitlement(free, 'analytics.consolidated', 'WRITE', now))
      .toEqual({ allowed: true, reason: 'PLAN_INCLUDED' });
    expect(evaluateSubscriptionEntitlement(free, 'data.export', 'EXPORT', now))
      .toEqual({ allowed: true, reason: 'PLAN_INCLUDED' });
  });

  it('expires a time-limited free license while retaining historical reads', () => {
    const free: SubscriptionSnapshot = {
      subscriptionStatus: 'FREE',
      subscriptionPlan: null,
      subscriptionExpiresAt: new Date('2029-11-30T23:59:59.999Z'),
    };
    expect(evaluateSubscriptionEntitlement(free, 'pos.sales', 'WRITE', now))
      .toEqual({ allowed: false, reason: 'SUBSCRIPTION_EXPIRED' });
    expect(evaluateSubscriptionEntitlement(free, 'data.read', 'READ', now))
      .toEqual({ allowed: true, reason: 'HISTORICAL_READ_ONLY' });
  });

});
