import { test, expect } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('Customer creation navigation', () => {
  test.skip(!email || !password, 'E2E_EMAIL and E2E_PASSWORD are required');

  test('close customer creation and navigate back to POS without closing the app', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Mot de passe').fill(password!);
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page).toHaveURL(/\/$/);
    await page.goto('/customers');
    await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();

    await page.getByRole('button', { name: 'Créer un client' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Nom complet *')).toBeVisible();

    await page.getByRole('button', { name: 'Fermer' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('menuitem', { name: 'Point de vente' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'OmniKès POS' })).toBeVisible();
    expect(page.context().pages()).toHaveLength(1);
  });
});
