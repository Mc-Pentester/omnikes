import { expect, test } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('Barcode workflow', () => {
  test.skip(!email || !password, 'E2E_EMAIL and E2E_PASSWORD are required');

  test('creates without barcode, adds it later, then scans the exact variant in POS', async ({ page }) => {
    const suffix = Date.now();
    const productName = `Barcode workflow ${suffix}`;
    const sku = `BC-SKU-${suffix}`;
    const barcode = `BCODE${suffix}`;

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/password/i).fill(password!);
    await page.getByRole('button', { name: /sign in|se connecter|connexion/i }).click();
    await page.waitForURL(/\/$|\/dashboard/);

    await page.goto('/products');
    await page.getByRole('button', { name: /nouveau produit/i }).click();
    await page.getByLabel(/nom du produit/i).fill(productName);
    await page.getByLabel(/^sku/i).fill(sku);
    await page.getByLabel(/prix/i).fill('125');
    await expect(page.getByLabel(/code-barres/i)).toBeVisible();
    await expect(page.getByLabel(/code-barres/i)).toHaveValue('');
    await page.getByRole('button', { name: /^créer$/i }).click();
    await expect(page.getByText(productName)).toBeVisible();

    const productRow = page.getByRole('row').filter({ hasText: productName });
    await productRow.getByRole('button', { name: /modifier/i }).click();
    await page.getByLabel(/code-barres/i).fill(barcode);
    await page.getByRole('button', { name: /enregistrer/i }).click();
    await expect(productRow.getByText(barcode)).toBeVisible();

    await page.goto('/');
    const search = page.locator('#product-search');
    await search.fill(barcode);
    await search.press('Enter');
    await expect(page.getByText(productName)).toHaveCount(2);

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('Code-barres inconnu');
      await dialog.accept();
    });
    await search.fill(`UNKNOWN-${suffix}`);
    await search.press('Enter');
    await expect(page.getByText(productName)).toHaveCount(2);
  });
});
