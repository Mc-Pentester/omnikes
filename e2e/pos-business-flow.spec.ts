import { test, expect } from '@playwright/test';

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe('POS business flow', () => {
  test.skip(!email || !password, 'E2E_EMAIL and E2E_PASSWORD are required for the authenticated business E2E');

  test('login → POS → sale → server totals → checkout → idempotency → logout', async ({
    page,
    request,
  }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Mot de passe').fill(password!);
    await page.getByRole('button', { name: 'Se connecter' }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'OmniKès POS' })).toBeVisible();

    const storeSelector = page.getByLabel('Sélectionner un magasin');
    await expect(storeSelector).toBeVisible();

    const selectedStore = await storeSelector.inputValue();
    if (!selectedStore) {
      const options = await storeSelector.locator('option').evaluateAll((items) =>
        items
          .map((item) => ({ value: (item as HTMLOptionElement).value, disabled: (item as HTMLOptionElement).disabled }))
          .filter((item) => item.value && !item.disabled),
      );
      expect(options.length).toBeGreaterThan(0);
      await storeSelector.selectOption(options[0].value);
    }

    const productCards = page.locator('[role="button"][aria-label^="Ajouter "]');
    await expect(productCards.first()).toBeVisible();

    const saleCreation = page.waitForResponse((response) =>
      response.url().includes('/api/sales') &&
      response.request().method() === 'POST',
    );

    await productCards.first().click();

    const saleResponse = await saleCreation;
    expect(saleResponse.status()).toBe(201);

    const sale = await saleResponse.json();
    expect(sale).toHaveProperty('id');
    expect(sale).toHaveProperty('status');

    await expect(page.getByText('Panier')).toBeVisible();
    await expect(page.getByText('1 article(s)')).toBeVisible();

    const checkoutResponsePromise = page.waitForResponse((response) =>
      response.url().includes(`/api/sales/${sale.id}/checkout`) &&
      response.request().method() === 'POST',
    );

    const checkoutRequestPromise = page.waitForRequest((request) =>
      request.url().includes(`/api/sales/${sale.id}/checkout`) &&
      request.method() === 'POST',
    );

    await page.getByRole('button', { name: /Payer \(F12\)/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    const totalText = await page.getByRole('dialog').getByText(/Total:/).textContent();
    const totalMatch = totalText?.match(/([0-9]+(?:\.[0-9]+)?)\s*HTG/);
    expect(totalMatch).not.toBeNull();
    const total = Number(totalMatch![1]);
    expect(total).toBeGreaterThan(0);

    await page.getByLabel('Montant reçu').fill(total.toFixed(2));

    await page.getByRole('dialog').getByRole('button', { name: 'Confirmer' }).click();

    const [checkoutRequest, checkoutResponse] = await Promise.all([
      checkoutRequestPromise,
      checkoutResponsePromise,
    ]);

    expect(checkoutResponse.status()).toBe(201);
    const checkoutBody = await checkoutResponse.json();
    expect(checkoutBody).toMatchObject({
      id: sale.id,
      status: 'COMPLETED',
    });
    expect(checkoutBody.payments).toBeInstanceOf(Array);
    expect(checkoutBody.payments.length).toBeGreaterThan(0);
    expect(checkoutBody.payments[0]).toHaveProperty('amount');

    const idempotencyKey = checkoutRequest.headers()['idempotency-key'];
    expect(idempotencyKey).toBeTruthy();

    const replayBody = checkoutRequest.postDataJSON();
    expect(replayBody).toMatchObject({
      method: 'CASH',
      amount: total,
    });

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map(({ name, value }) => `${name}=${value}`).join('; ');

    const replayResponse = await request.post(`/api/sales/${sale.id}/checkout`, {
      headers: {
        Cookie: cookieHeader,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      data: replayBody,
    });

    expect(replayResponse.status()).toBe(201);
    const replayResult = await replayResponse.json();

    // Idempotent response may be { payment, sale: { id, status } } or full sale object
    if (replayResult.sale) {
      // Cached idempotent response
      expect(replayResult.sale).toMatchObject({
        id: sale.id,
        status: 'COMPLETED',
      });
      expect(replayResult.payment).toMatchObject({
        method: 'CASH',
        amount: checkoutBody.payments[0].amount,
      });
    } else {
      // Full sale object (initial response)
      expect(replayResult).toMatchObject({
        id: sale.id,
        status: 'COMPLETED',
      });
      expect(replayResult.payments).toBeInstanceOf(Array);
      expect(replayResult.payments.length).toBeGreaterThan(0);
      expect(replayResult.payments[0]).toMatchObject({
        method: 'CASH',
        amount: checkoutBody.payments[0].amount,
      });
    }

    await expect(page.getByText('Vente complétée')).toBeVisible();

    // Click "Nouvelle vente" to return to POS with sidebar
    await page.getByRole('button', { name: 'Nouvelle vente' }).click();

    // Now the sidebar is visible, click logout
    await page.getByRole('button', { name: 'Déconnexion' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();

    const meAfterLogout = await request.get('/api/auth/me', {
      headers: { Cookie: cookieHeader },
    });
    expect(meAfterLogout.status()).toBe(401);
  });
});
