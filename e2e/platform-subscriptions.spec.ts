import { expect, test } from '@playwright/test';

const plans = ['OMNIKES_149', 'OMNIKES_249', 'OMNIKES_299'] as const;
const planSelect = (page: import('@playwright/test').Page) => page.getByRole('combobox', { name: 'Plan', exact: true });

async function selectOrganization(page: import('@playwright/test').Page, name: string) {
  await page.getByRole('button', { name: new RegExp(name, 'i') }).click();
  // Wait for the selected organization's details panel before interacting with its form.
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(planSelect(page)).toBeVisible();
}

type MockOrganization = {
  id: string;
  name: string;
  slug: string;
  country: string;
  currency: string;
  subscriptionStatus: string;
  subscriptionPlan: string | null;
  subscriptionExpiresAt: string | null;
  subscriptionBillingInterval: string | null;
  subscriptionCancelAtPeriodEnd: boolean;
  subscriptionPendingPlan: string | null;
  subscriptionPendingBillingInterval: string | null;
  freeLicenseReason: string | null;
  freeLicenseGrantedAt: string | null;
  freeLicenseGrantedBy: string | null;
};

test.describe('Platform subscription administration', () => {
  test.beforeEach(async ({ page }) => {
    let organizations: MockOrganization[] = [
      { id: 'tenant-essential', name: 'Tenant Essential', slug: 'tenant-essential', country: 'HT', currency: 'HTG', subscriptionStatus: 'NONE', subscriptionPlan: null, subscriptionExpiresAt: null, subscriptionBillingInterval: null, subscriptionCancelAtPeriodEnd: false, subscriptionPendingPlan: null, subscriptionPendingBillingInterval: null, freeLicenseReason: null, freeLicenseGrantedAt: null, freeLicenseGrantedBy: null },
      { id: 'tenant-professional', name: 'Tenant Professional', slug: 'tenant-professional', country: 'HT', currency: 'HTG', subscriptionStatus: 'NONE', subscriptionPlan: null, subscriptionExpiresAt: null, subscriptionBillingInterval: null, subscriptionCancelAtPeriodEnd: false, subscriptionPendingPlan: null, subscriptionPendingBillingInterval: null, freeLicenseReason: null, freeLicenseGrantedAt: null, freeLicenseGrantedBy: null },
      { id: 'tenant-enterprise', name: 'Tenant Enterprise', slug: 'tenant-enterprise', country: 'HT', currency: 'HTG', subscriptionStatus: 'ACTIVE', subscriptionPlan: 'OMNIKES_299', subscriptionExpiresAt: '2030-12-31T23:59:59.999Z', subscriptionBillingInterval: 'ANNUAL', subscriptionCancelAtPeriodEnd: false, subscriptionPendingPlan: null, subscriptionPendingBillingInterval: null, freeLicenseReason: null, freeLicenseGrantedAt: null, freeLicenseGrantedBy: null },
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
          : input.action === 'GRANT_FREE'
            ? { ...current, subscriptionStatus: 'FREE', subscriptionPlan: null, subscriptionBillingInterval: null, subscriptionExpiresAt: input.expiresAt ? new Date(input.expiresAt + 'T23:59:59.999Z').toISOString() : null, freeLicenseReason: input.reason, freeLicenseGrantedAt: new Date().toISOString(), freeLicenseGrantedBy: 'platform-user' }
            : input.action === 'REVOKE_FREE'
              ? { ...current, subscriptionStatus: 'EXPIRED', subscriptionExpiresAt: new Date().toISOString(), freeLicenseReason: null, freeLicenseGrantedAt: null, freeLicenseGrantedBy: null }
              : { ...current, subscriptionStatus: 'ACTIVE', subscriptionPlan: input.plan, subscriptionBillingInterval: input.billingInterval, subscriptionExpiresAt: new Date(input.expiresAt + 'T23:59:59.999Z').toISOString(), subscriptionCancelAtPeriodEnd: false, freeLicenseReason: null, freeLicenseGrantedAt: null, freeLicenseGrantedBy: null };
      organizations = organizations.map(item => item.id === id ? updated : item);
      await route.fulfill({ json: { organization: updated } });
    });
  });

  test('selects each of the three plans and submits manual activation', async ({ page }) => {
    await page.goto('/administration/platform-subscriptions');
    await expect(page.getByRole('heading', { name: /entitlements & abonnements/i })).toBeVisible();

    for (let index = 0; index < plans.length; index += 1) {
      await selectOrganization(page, ['Tenant Essential', 'Tenant Professional', 'Tenant Enterprise'][index]);
      await planSelect(page).selectOption(plans[index]);
      await expect(planSelect(page)).toHaveValue(plans[index]);
      await page.getByLabel('Date d’expiration', { exact: true }).fill('2030-12-31');
      await page.getByRole('button', { name: /activer \/ renouveler/i }).click();

      await expect(page.getByText(
        'Abonnement activé/renouvelé après confirmation manuelle du paiement.',
        { exact: true },
      )).toBeVisible();
      await expect(page.locator('dd').filter({ hasText: plans[index] }).first()).toBeVisible();
    }
  });

  test('shows deferred downgrade and end-of-period cancellation states', async ({ page }) => {
    await page.goto('/administration/platform-subscriptions');
    await selectOrganization(page, 'Tenant Enterprise');
    await planSelect(page).selectOption('OMNIKES_149');
    await expect(planSelect(page)).toHaveValue('OMNIKES_149');
    await page.getByRole('button', { name: /changer de forfait/i }).click();

    await expect(page.getByText(
      'Rétrogradation programmée au renouvellement. Le forfait actuel reste actif jusque-là.',
      { exact: true },
    )).toBeVisible();
    await expect(page.locator('dd').filter({ hasText: 'OMNIKES_299' })).toBeVisible();
    await expect(page.locator('dd').filter({ hasText: 'OMNIKES_149' })).toBeVisible();

    await page.getByRole('button', { name: /annuler l’abonnement/i }).click();
    await expect(page.getByText(
      'Annulation programmée à la fin de la période déjà payée. Les droits restent actifs jusqu’à cette échéance.',
      { exact: true },
    )).toBeVisible();
    await expect(page.getByText('À l’échéance', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /annuler l’abonnement/i })).toHaveCount(0);
  });

  test('grants and revokes a perpetual free license from platform administration', async ({ page }) => {
    await page.goto('/administration/platform-subscriptions');
    await selectOrganization(page, 'Tenant Essential');

    await page.getByLabel('Motif obligatoire').fill('Partenaire pilote OmniKes');
    await page.getByRole('button', { name: /accorder une licence gratuite/i }).click();

    await expect(page.getByText('Licence gratuite accordée. Les droits sont actifs sans paiement.', { exact: true })).toBeVisible();
    await expect(page.locator('dd').filter({ hasText: 'FREE' }).first()).toBeVisible();
    await expect(page.getByText('Partenaire pilote OmniKes', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /révoquer la licence gratuite/i }).click();
    await expect(page.getByText('Licence gratuite révoquée. Les données historiques restent consultables.', { exact: true })).toBeVisible();
    await expect(page.locator('dd').filter({ hasText: 'EXPIRED' }).first()).toBeVisible();
  });

  test('requires a justification before granting a free license', async ({ page }) => {
    await page.goto('/administration/platform-subscriptions');
    await selectOrganization(page, 'Tenant Essential');
    await page.getByRole('button', { name: /accorder une licence gratuite/i }).click();
    await expect(page.getByText('Le motif doit contenir au moins 5 caractères.', { exact: true })).toBeVisible();
  });
});
