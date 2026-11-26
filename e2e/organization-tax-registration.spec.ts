import { expect, test } from '@playwright/test';

test.describe('Initial organization fiscal configuration', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/registration-status', async route => {
      await route.fulfill({ json: { mode: 'initial' }, headers: { 'Cache-Control': 'no-store' } });
    });
  });

  test('submits an enabled custom tax rate during first organization creation', async ({ page }) => {
    let submitted: Record<string, unknown> | undefined;
    await page.route('**/api/auth/register', async route => {
      submitted = route.request().postDataJSON();
      await route.fulfill({ status: 200, json: { user: { id: 'initial-admin' } } });
    });

    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Fiscalité de l’organisation' })).toBeVisible();
    await page.getByLabel('Activer la taxe pour cette organisation').check();
    await page.getByLabel('Taux fiscal (%)').fill('10');
    await page.getByLabel('Nom de l’organisation').fill('Commerce Haiti');
    await page.getByLabel('Votre nom').fill('Admin');
    await page.getByLabel('Email').fill('admin@example.test');
    await page.getByLabel('Mot de passe', { exact: true }).fill('secure-password');
    await page.getByLabel('Confirmer le mot de passe').fill('secure-password');
    await page.getByRole('button', { name: 'Créer un compte' }).click();

    await expect.poll(() => submitted).toBeTruthy();
    expect(submitted).toMatchObject({
      organizationName: 'Commerce Haiti',
      taxEnabled: true,
      taxRate: 10,
    });
  });

  test('submits disabled tax settings for an organization created without taxation', async ({ page }) => {
    let submitted: Record<string, unknown> | undefined;
    await page.route('**/api/auth/register', async route => {
      submitted = route.request().postDataJSON();
      await route.fulfill({ status: 200, json: { user: { id: 'initial-admin' } } });
    });

    await page.goto('/register');
    await page.getByLabel('Nom de l’organisation').fill('Commerce sans taxe');
    await page.getByLabel('Votre nom').fill('Admin');
    await page.getByLabel('Email').fill('admin-no-tax@example.test');
    await page.getByLabel('Mot de passe', { exact: true }).fill('secure-password');
    await page.getByLabel('Confirmer le mot de passe').fill('secure-password');
    await page.getByRole('button', { name: 'Créer un compte' }).click();

    await expect.poll(() => submitted).toBeTruthy();
    expect(submitted).toMatchObject({ taxEnabled: false, taxRate: 0 });
  });

  test('does not submit an enabled tax rate above 100 percent', async ({ page }) => {
    let requestCount = 0;
    await page.route('**/api/auth/register', async route => {
      requestCount += 1;
      await route.fulfill({ status: 200, json: { user: { id: 'unexpected' } } });
    });

    await page.goto('/register');
    await page.getByLabel('Activer la taxe pour cette organisation').check();
    await page.getByLabel('Taux fiscal (%)').fill('101');
    await page.getByLabel('Nom de l’organisation').fill('Commerce invalide');
    await page.getByLabel('Votre nom').fill('Admin');
    await page.getByLabel('Email').fill('invalid-tax@example.test');
    await page.getByLabel('Mot de passe', { exact: true }).fill('secure-password');
    await page.getByLabel('Confirmer le mot de passe').fill('secure-password');
    await page.getByRole('button', { name: 'Créer un compte' }).click();

    await expect(page.getByText('Le taux fiscal doit être compris entre 0 et 100 %.', { exact: true })).toBeVisible();
    expect(requestCount).toBe(0);
  });
});
