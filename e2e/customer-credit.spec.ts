import { test, expect } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const testPin = ['8', '4', '5', '2', '9', '1'].join('');

test.describe('Customer credit security and collection UI', () => {
  test.skip(!email || !password, 'E2E_EMAIL and E2E_PASSWORD are required');

  test('manager configures a personal PIN and opens the credit ledger', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Mot de passe').fill(password!);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/profile/security');
    await expect(page.getByRole('heading', { name: 'Profil et sécurité' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'PIN confidentiel pour autoriser les crédits' })).toBeVisible();

    const pinSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'PIN confidentiel pour autoriser les crédits' }) });
    await pinSection.getByLabel('Mot de passe actuel (confirmation)').fill(password!);
    await pinSection.getByLabel(/PIN personnel|Nouveau PIN/).fill(testPin);
    await pinSection.getByLabel('Confirmer le PIN').fill(testPin);
    await pinSection.getByRole('button', { name: /Configurer mon PIN|Remplacer mon PIN/ }).click();
    await expect(pinSection.getByText(/PIN confidentiel enregistré/)).toBeVisible();

    const pinStatus = await page.request.get('/api/users/me/credit-pin');
    expect(pinStatus.status()).toBe(200);
    expect(await pinStatus.json()).toMatchObject({ configured: true });

    await page.goto('/credits');
    await expect(page.getByRole('heading', { name: 'Crédits clients' })).toBeVisible();
  });
});
