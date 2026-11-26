import { expect, test } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('Barcode workflow', () => {
  test.skip(!email || !password, 'E2E_EMAIL and E2E_PASSWORD are required');

  test('scans an unknown barcode, creates the product from that scan, then scans it into POS', async ({ page }) => {
    const suffix = Date.now();
    const productName = `Barcode workflow ${suffix}`;
    const sku = `BC-SKU-${suffix}`;
    const barcode = `BCODE${suffix}`;

    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/mot de passe|password/i).fill(password!);
    await page.getByRole('button', { name: /sign in|se connecter|connexion/i }).click();
    await page.waitForURL(/\/$|\/dashboard/);
    const meResponse = await page.context().request.get('/api/auth/me');
    expect(meResponse.ok()).toBeTruthy();
    const { user: authUser } = await meResponse.json();
    const currencyLabel = authUser.currencySymbol || authUser.currency || 'USD';

    // A real keyboard-wedge scanner types quickly into the focused POS search field and sends Enter.
    await page.goto('/');
    const search = page.locator('#product-search');
    await search.focus();
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('Code-barres inconnu');
      await dialog.accept();
    });
    await search.pressSequentially(barcode, { delay: 8 });
    await search.press('Enter');

    // The page consumes newBarcode and removes it after opening the creation form.
    await expect(page).toHaveURL(/\/products(?:\?.*)?$/);
    await expect(page).not.toHaveURL(/newBarcode=/);
    await expect(page.getByRole('heading', { name: /créer un produit/i })).toBeVisible();
    const barcodeField = page.getByLabel(/code-barres/i);
    await expect(barcodeField).toHaveValue(barcode);

    // Enter from the scanner must not submit an incomplete product form.
    await barcodeField.focus();
    await barcodeField.press('Enter');
    await expect(page.getByRole('heading', { name: /créer un produit/i })).toBeVisible();

    await page.getByLabel(/nom du produit/i).fill(productName);
    await page.getByLabel(/^sku/i).fill(sku);
    await page.locator('#price').fill('125');
    await page.getByLabel(/coût d’acquisition unitaire/i).fill('75');
    await page.getByRole('button', { name: /^créer$/i }).click();

    const productRow = page.getByRole('row').filter({ hasText: productName });
    await expect(productRow).toBeVisible();
    await expect(productRow).toContainText(barcode);
    await expect(productRow).toContainText(`125.00 ${currencyLabel}`);
    await expect(productRow).toContainText(`75.00 ${currencyLabel}`);
    await expect(productRow.getByRole('cell').nth(5)).toHaveText('0');

    // A cashier can also start a product manually and scan directly into the barcode field.
    const secondProductName = `Direct scanner product ${suffix}`;
    const secondSku = `BC-DIRECT-${suffix}`;
    const secondBarcode = `DIRECTBC${suffix}`;
    await page.getByRole('button', { name: /nouveau produit/i }).click();
    const directBarcodeField = page.getByLabel(/code-barres/i);
    await expect(directBarcodeField).toBeFocused();
    await directBarcodeField.pressSequentially(secondBarcode, { delay: 8 });
    await directBarcodeField.press('Enter');
    await expect(directBarcodeField).toHaveValue(secondBarcode);
    await expect(page.getByRole('heading', { name: /créer un produit/i })).toBeVisible();
    await page.getByLabel(/nom du produit/i).fill(secondProductName);
    await page.getByLabel(/^sku/i).fill(secondSku);
    await page.locator('#price').fill('95');
    await page.getByLabel(/coût d’acquisition unitaire/i).fill('50');
    await page.getByRole('button', { name: /^créer$/i }).click();
    const secondProductRow = page.getByRole('row').filter({ hasText: secondProductName });
    await expect(secondProductRow).toContainText(secondBarcode);

    // Both scanned barcodes must resolve in POS and add the corresponding product to the cart.
    await page.goto('/');
    const posSearch = page.locator('#product-search');
    await posSearch.focus();
    await posSearch.pressSequentially(barcode, { delay: 8 });
    await posSearch.press('Enter');
    await expect(page.getByText(productName)).toHaveCount(2);
    await posSearch.focus();
    await posSearch.pressSequentially(secondBarcode, { delay: 8 });
    await posSearch.press('Enter');
    await expect(page.getByText(secondProductName)).toHaveCount(2);

    // Cancelling creation for a third unknown code must not add anything to the cart.
    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      await dialog.dismiss();
    });
    await posSearch.focus();
    await posSearch.pressSequentially(`UNKNOWN-${suffix}`, { delay: 8 });
    await posSearch.press('Enter');
    await expect(page).toHaveURL('/');
    await expect(page.getByText(productName)).toHaveCount(2);
    await expect(page.getByText(secondProductName)).toHaveCount(2);
  });
});
