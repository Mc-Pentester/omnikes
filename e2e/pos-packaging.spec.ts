import { test, expect } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('POS multi-packaging', () => {
  test.skip(!email || !password, 'E2E_EMAIL and E2E_PASSWORD are required');

  test('offers unit, pack of 3, dozen and case for one product', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(email!);
    await page.getByLabel(/mot de passe|password/i).fill(password!);
    await page.getByRole('button', { name: /sign in|se connecter|connexion/i }).click();
    await page.waitForURL((url) => url.pathname === '/' || url.pathname === '/dashboard');

    const storesResponse = await page.context().request.get('/api/stores?isActive=true');
    expect(storesResponse.ok()).toBeTruthy();
    const storesData = await storesResponse.json();
    expect(storesData.stores.length).toBeGreaterThan(0);

    const suffix = Date.now().toString(36);
    const productName = `Packaging E2E ${suffix}`;
    const productResponse = await page.context().request.post('/api/products', {
      data: {
        name: productName,
        category: 'E2E',
        variants: [{
          sku: `PACK-E2E-${suffix}`,
          price: 125,
          unitPrice: 125,
          pack3Price: 350,
          dozenPrice: 1300,
          casePrice: 2400,
          unitsPerCase: 24,
          cost: 50,
          saleUnit: 'UNIT',
          attributes: {},
        }],
      },
    });
    const created = await productResponse.json();
    expect(productResponse.status(), JSON.stringify(created)).toBe(201);

    try {
      await page.goto('/');
      const storeSelector = page.getByRole('combobox').first();
      if (await storeSelector.count()) {
        const selected = await storeSelector.inputValue();
        if (!selected) await storeSelector.selectOption(storesData.stores[0].id);
      }

      const search = page.locator('#product-search');
      await expect(search).toBeVisible();
      await search.fill(productName);
      const productCard = page.locator('[role="button"][aria-label^="Ajouter Packaging E2E"]');
      await expect(productCard).toBeVisible();

      await page.getByRole('button', { name: /Caisse \(24\)/ }).click();
      await page.getByRole('button', { name: /Douzaine/ }).click();
      await page.getByRole('button', { name: /Lot de 3/ }).click();
      await productCard.locator('h3').click();

      await expect(page.getByText('4 article(s)')).toBeVisible();
      await expect(page.getByText('Caisse (24 unités)', { exact: true })).toBeVisible();
      await expect(page.getByText('Douzaine', { exact: true })).toBeVisible();
      await expect(page.getByText('Lot de 3', { exact: true })).toBeVisible();
    } finally {
      await page.context().request.delete(`/api/products/${created.id}`);
    }
  });
});
