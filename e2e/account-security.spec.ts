import { test, expect } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const originalPassword = process.env.E2E_PASSWORD;

async function signIn(page: import('@playwright/test').Page, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

test.describe('Account security', () => {
  test.skip(!email || !originalPassword, 'E2E_EMAIL and E2E_PASSWORD are required');

  test('user can change their own password, sign back in, and log out', async ({ page }) => {
    const temporaryPassword = `${originalPassword}#AccountChange2026`;

    await signIn(page, originalPassword!);
    await page.goto('/profile/security');
    await expect(page.getByRole('heading', { name: 'Profil et sécurité' })).toBeVisible();

    await page.getByLabel('Mot de passe actuel').fill(originalPassword!);
    await page.getByLabel('Nouveau mot de passe').fill(temporaryPassword);
    await page.getByLabel('Confirmer le nouveau mot de passe').fill(temporaryPassword);
    await page.getByRole('button', { name: 'Modifier mon mot de passe' }).click();
    await expect(page).toHaveURL(/\/login\?passwordChanged=1$/);

    await signIn(page, temporaryPassword);
    await page.goto('/profile/security');
    await page.getByLabel('Mot de passe actuel').fill(temporaryPassword);
    await page.getByLabel('Nouveau mot de passe').fill(originalPassword!);
    await page.getByLabel('Confirmer le nouveau mot de passe').fill(originalPassword!);
    await page.getByRole('button', { name: 'Modifier mon mot de passe' }).click();
    await expect(page).toHaveURL(/\/login\?passwordChanged=1$/);

    await signIn(page, originalPassword!);
    await page.goto('/profile/security');
    await page.getByRole('button', { name: 'Déconnexion' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  });
});
