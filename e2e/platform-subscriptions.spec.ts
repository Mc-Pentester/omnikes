import { expect, test } from '@playwright/test';

const plans = ['OMNIKES_149', 'OMNIKES_249', 'OMNIKES_299'] as const;

test.describe('Platform subscription administration', () => {
  test.beforeEach(async ({ page }) => {
    let organizations = [
      { id: 'tenant-essential', name: 'Tenant Essential', slug: 'tenant-essential', country: 'HT', currency: 'HTG', subscriptionStatus: 'NONE', subscriptionPlan: null, subscriptionExpiresAt: null, subscriptionBillingInterval: null, subscriptionCancelAtPeriodEnd: false, subscriptionPendingPlan: null, subscriptionPendingBillingInterval: null },
      { id: 'tenant-professional', name: 'Tenant Professional', slug: 'tenant-professional', country: 'HT', currency: 'HTG', subscriptionStatus: 'NONE', subscriptionPlan: null, subscriptionExpiresAt: null, subscriptionBillingInterval: null, subscriptionCancelAtPeriodEnd: false, subscriptionPendingPlan: null, subscriptionPendingBillingInterval: null },
      { id: 'tenant-enterprise', name: 'Tenant Enterprise', slug: 'tenant-enterprise', country: 'HT', currency: 'HTG', subscriptionStatus: 'ACTIVE', subscriptionPlan: 'OMNIKES_299', subscriptionExpiresAt: '2030-12-31T23:59:59.999Z', subscriptionBillingInterval: 'ANNUAL', subscriptionCancelAtPeriodEnd: false, subscriptionPendingPlan: null, subscriptionPendingBillingInterval: null },
    ];

    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ json: { user: { id: 'platform-user', email: 'platform@example.test', name: 'Platform Operator', organizationId: 'platform-org', organizationName: 'Platform' } } });
    });

    await page.route('**/api/platform/subscriptions**', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: { organizations } });
        return;
      }
      const id = new URL(route.request().url()).pathname.split('/').pop()!;
      const input = route.request().postDataJSON();
      const current = organizations.find(item => item.id === id)!;
      const updated = input.action === 'CANCEL'
        ? { ...current, subscriptionCancelAtPeriodEnd: true }
        : input.action === 'CHANGE_PLAN'
          ? { ...current, subscriptionPendingPlan: input.plan, subscriptionPendingBillingInterval: input.billingInterval }
          : { ...current, subscriptionStatus: 'ACTIVE', subscriptionPlan: input.plan, subscriptionBillingInterval: input.billingInterval, subscriptionExpiresAt: new Date(input.expiresAt + 'T23:59:59.999Z').toISOString(), subscriptionCancelAtPeriodEnd: false };
      organizations = organizations.map(item => item.id === id ? updated : item);
      await route.fulfill({ json: { organization: updated } });
    });
  });

  test('selects each of the three plans and submits manual activation', async ({ page }) => {
    await page.goto('/administration/platform-subscriptions');
    await expect(page.getByRole('heading', { name: /entitlements & abonnements/i })).toBeVisible();

    for (let index = 0; index < plans.length; index += 1) {
      await page.getByRole('button', { name: new RegExp(['Tenant Essential', 'Tenant Professional', 'Tenant Enterprise'][index]) }).click();
      await page.getByLabel('Plan').selectOption(plans[index]);
      await page.getByLabel(/date d’expiration/i).fill('2030-12-31');
      await page.getByRole('button', { name: /activer \/ renouveler/i }).click();
      await expect(page.getByText(/abonnement activé\/renouvelé après confirmation manuelle/i)).toBeVisible();
      await expect(page.locator('dd').filter({ hasText: plans[index] }).first()).toBeVisible();
    }
  });

  test('shows deferred downgrade and end-of-period cancellation states', async ({ page }) => {
    await page.goto('/administration/platform-subscriptions');
    await page.getByRole('button', { name: /tenant enterprise/i }).click();
    await page.getByLabel('Plan').selectOption('OMNIKES_149');
    await page.getByRole('button', { name: /changer de forfait/i }).click();
    await expect(page.getByText(/rétrogradation programmée au renouvellement/i)).toBeVisible();
    await expect(page.getByText('OMNIKES_149')).toBeVisible();

    await page.getByRole('button', { name: /annuler l’abonnement/i }).click();
    await expect(page.getByText(/annulation programmée à la fin de la période déjà payée/i)).toBeVisible();
    await expect(page.getByText('À l’échéance')).toBeVisible();
    await expect(page.getByRole('button', { name: /annuler l’abonnement/i })).toHaveCount(0);
  });
});
