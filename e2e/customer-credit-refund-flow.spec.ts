import { test, expect } from '@playwright/test';

const managerEmail = process.env.E2E_EMAIL;
const managerPassword = process.env.E2E_PASSWORD;
const cashierEmail = process.env.E2E_CASHIER_EMAIL;
const cashierPassword = process.env.E2E_CASHIER_PASSWORD;
const productName = 'Produit Test A — Riz 5kg';
const unitPrice = 250;

async function login(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function switchUser(page: import('@playwright/test').Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await login(page, email, password);
}

test.describe('Customer credit to repayment, return and refund - full E2E', () => {
  test.skip(
    !managerEmail || !managerPassword || !cashierEmail || !cashierPassword,
    'E2E manager and cashier credentials are required',
  );

  test('cashier requests credit, manager approves, installments settle, return refunds collected repayments', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const customerName = `E2E Credit Customer ${suffix}`;
    const customerEmail = `e2e-credit-${suffix}@omnikes.test`;

    // Create an isolated customer with the manager account before starting the cashier flow.
    await login(page, managerEmail!, managerPassword!);
    const customerResponse = await page.request.post('/api/customers', {
      data: { name: customerName, email: customerEmail, country: 'HT' },
    });
    expect(customerResponse.status(), await customerResponse.text()).toBe(201);
    const customer = await customerResponse.json();

    const storesResponse = await page.request.get('/api/stores?isActive=true');
    expect(storesResponse.status(), await storesResponse.text()).toBe(200);
    const storesBody = await storesResponse.json();
    const store = storesBody.stores.find((item: { code: string }) => item.code === 'STORE-A');
    expect(store, 'Seeded STORE-A must exist').toBeTruthy();

    // Establish stock through the same idempotent receipt endpoint used by
    // operators. Do not rely on a seed-only inventory row being present:
    // products/stores can exist before their first physical delivery.
    const productsResponse = await page.request.get('/api/products?search=Produit%20Test%20A');
    expect(productsResponse.status(), await productsResponse.text()).toBe(200);
    const productsBody = await productsResponse.json();
    const product = productsBody.products.find((item: { name: string }) => item.name === productName);
    expect(product, `Seeded product "${productName}" must exist`).toBeTruthy();
    const variant = product.variants[0];
    expect(variant).toBeTruthy();

    const receiptResponse = await page.request.post('/api/inventory/receive', {
      data: {
        storeId: store.id,
        variantId: variant.id,
        quantity: 100,
        referenceId: `E2E-CREDIT-RECEIPT-${suffix}`,
        notes: 'Initial stock for customer-credit E2E scenario',
      },
    });
    expect(receiptResponse.status(), await receiptResponse.text()).toBe(200);
    const receivedInventory = await receiptResponse.json();
    expect(receivedInventory.storeId).toBe(store.id);
    expect(receivedInventory.variantId).toBe(variant.id);
    expect(receivedInventory.quantity).toBeGreaterThanOrEqual(100);

    await switchUser(page, cashierEmail!, cashierPassword!);
    await page.goto('/');

    const storeSelector = page.getByLabel('Sélectionner un magasin');
    await expect(storeSelector).toBeVisible();
    await storeSelector.selectOption(store.id);

    const customerSelector = page.getByLabel('Sélectionner un client');
    await expect(customerSelector.locator(`option[value="${customer.id}"]`)).toHaveCount(1);
    await customerSelector.selectOption(customer.id);

    const saleCreated = page.waitForResponse((response) =>
      response.url().endsWith('/api/sales') && response.request().method() === 'POST',
    );
    await page.locator('[role="button"][aria-label^="Ajouter Produit Test A"]').first().click();
    const saleResponse = await saleCreated;
    expect(saleResponse.status(), await saleResponse.text()).toBe(201);
    const sale = await saleResponse.json();

    // POS keeps the cart pending until checkout. Synchronize the cart server-side
    // so the pending-sale screen sees authoritative lines and totals for credit approval.
    const syncResponse = await page.request.post(`/api/sales/${sale.id}/sync`, {
      data: { applyTax: false, discount: 0, items: [{ variantId: variant.id, quantity: 1 }] },
    });
    expect(syncResponse.status(), await syncResponse.text()).toBe(200);
    const syncedSale = await syncResponse.json();
    expect(Number(syncedSale.total)).toBe(unitPrice);

    await page.goto('/sales');
    const saleSearch = page.getByPlaceholder('Rechercher commande ou client...');
    await saleSearch.fill(sale.orderNumber);
    const pendingSale = page.getByRole('button').filter({ hasText: sale.orderNumber }).first();
    await expect(pendingSale).toBeVisible();
    await pendingSale.click();

    await expect(page.getByRole('heading', { name: 'Accorder un crédit' })).toBeVisible();
    await page.getByPlaceholder(/Maximum/).last().fill(String(unitPrice));
    await page.locator('input[type="email"]').fill(managerEmail!);
    await page.getByPlaceholder('Mot de passe du responsable').fill(managerPassword!);

    const approvalResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith(`/api/sales/${sale.id}/credit`) && response.request().method() === 'POST',
    );
    const completionResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith(`/api/sales/${sale.id}/complete`) && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Accorder le crédit' }).click();
    const approvalResponse = await approvalResponsePromise;
    expect(approvalResponse.status(), await approvalResponse.text()).toBe(201);
    const completionResponse = await completionResponsePromise;
    expect(completionResponse.status(), await completionResponse.text()).toBe(200);

    const completedSaleResponse = await page.request.get(`/api/sales/${sale.id}`);
    expect(completedSaleResponse.status()).toBe(200);
    const completedSale = await completedSaleResponse.json();
    expect(completedSale.status).toBe('COMPLETED');
    expect(completedSale.saleCredit.status).toBe('AUTHORIZED');
    expect(completedSale.saleCredit.authorizedBy).toBeTruthy();

    // The manager now collects the debt in two partial card payments.
    await switchUser(page, managerEmail!, managerPassword!);
    const managerPermissions = await page.request.get('/api/auth/me');
    expect(managerPermissions.status(), await managerPermissions.text()).toBe(200);
    expect((await managerPermissions.json()).user.canRefundCreditPayment).toBe(true);
    await page.goto('/credits');
    await expect(page.getByText(customerName)).toBeVisible();
    await page.getByRole('button', { name: 'Encaisser un remboursement' }).first().click();
    await page.locator('main select').first().selectOption('CARD');
    await page.locator('main input[type="number"]').first().fill('125');
    await page.getByRole('button', { name: 'Confirmer le remboursement' }).click();
    await expect(page.getByRole('status')).toContainText('Solde restant : 125.00 USD');

    await page.locator('main input[type="number"]').first().fill('125');
    await page.getByRole('button', { name: 'Confirmer le remboursement' }).click();
    await expect(page.getByRole('status')).toContainText('Solde restant : 0.00 USD');

    const creditsResponse = await page.request.get('/api/credits?take=100');
    expect(creditsResponse.status(), await creditsResponse.text()).toBe(200);
    const creditRow = (await creditsResponse.json()).credits.find(
      (item: { sale: { id: string } }) => item.sale.id === sale.id,
    );
    expect(creditRow).toBeTruthy();
    expect(creditRow.status).toBe('SETTLED');
    expect(creditRow.paid).toBe(unitPrice);
    expect(creditRow.outstanding).toBe(0);

    // Return the sold unit. With no debt left, the return amount is refundable
    // against the original two collected repayments, not another debt adjustment.
    // Process the return through the dedicated returns workspace, not by
    // calling the API directly, so this test exercises the real operator flow.
    await page.goto('/returns');
    await expect(page.getByRole('heading', { name: 'Traitement des retours' })).toBeVisible();
    const saleToReturn = page.getByText(sale.orderNumber, { exact: true }).first();
    await expect(saleToReturn).toBeVisible();
    const saleRow = saleToReturn.locator('..').locator('..');
    await saleRow.getByRole('button', { name: 'Traiter le retour' }).click();
    await page.getByLabel('Quantité à retourner - ' + productName).fill('1');
    await page.getByLabel('Motif du retour (facultatif)').fill('E2E full return after credit settlement');
    const returnResponsePromise = page.waitForResponse((response) =>
      response.url().endsWith(`/api/sales/${sale.id}/returns`) && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Confirmer le retour' }).click();
    const returnResponse = await returnResponsePromise;
    expect(returnResponse.status(), await returnResponse.text()).toBe(201);
    const returned = await returnResponse.json();
    expect(Number(returned.totalRefunded)).toBe(unitPrice);

    await page.goto('/credits');
    await page.getByRole('button', { name: 'Historique des paiements' }).first().click();
    const refundPanel = page.getByRole('heading', { name: 'Rembourser un trop-perçu après retour' }).locator('..');
    await expect(refundPanel).toBeVisible();

    const returnSelect = page.getByLabel('Retour concerné');
    await returnSelect.selectOption({ index: 1 });
    const originalPaymentSelect = page.getByLabel('Encaissement d’origine');
    await originalPaymentSelect.selectOption({ index: 1 });
    await refundPanel.locator('input[type="number"]').fill('125');
    await refundPanel.getByRole('button', { name: 'Confirmer le remboursement' }).click();
    await expect(refundPanel.getByRole('status')).toContainText('Remboursement enregistré : 125.00 USD');
    // A successful refund refreshes history and credit balances without unmounting
    // the active refund workspace or losing its selected return context.
    await expect(refundPanel).toBeVisible();

    // The first repayment is now fully refunded and disappears from the choices.
    await expect(originalPaymentSelect.locator('option')).toHaveCount(2);
    await originalPaymentSelect.selectOption({ index: 1 });
    await refundPanel.locator('input[type="number"]').fill('125');
    await refundPanel.getByRole('button', { name: 'Confirmer le remboursement' }).click();

    const historyResponse = await page.request.get(`/api/credits/${creditRow.id}/payments`);
    expect(historyResponse.status(), await historyResponse.text()).toBe(200);
    const paymentHistory = await historyResponse.json();
    expect(paymentHistory).toHaveLength(2);
    for (const payment of paymentHistory) {
      expect(Number(payment.amount)).toBe(125);
      expect(Number(payment.refundedAmount)).toBe(125);
      expect(payment.refunds).toHaveLength(1);
      expect(Number(payment.refunds[0].amount)).toBe(125);
    }

    const finalCreditsResponse = await page.request.get('/api/credits?take=100');
    const finalCredit = (await finalCreditsResponse.json()).credits.find(
      (item: { id: string }) => item.id === creditRow.id,
    );
    expect(finalCredit.status).toBe('SETTLED');
    expect(finalCredit.outstanding).toBe(0);
    expect(finalCredit.sale.returns[0].refundableRemaining).toBe(0);
  });
});
