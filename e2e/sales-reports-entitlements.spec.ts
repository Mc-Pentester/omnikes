import { expect, test, type Page } from '@playwright/test';

const summary = {
  totalRevenue: 1250,
  salesCount: 8,
  itemsSold: 12,
  totalDiscount: 25,
  totalTax: 100,
  averageSale: 156.25,
  totalPaid: 1200,
  authorizedCredit: 50,
  uncoveredAmount: 0,
  currency: 'HTG',
};

async function mockSalesReport(page: Page, advancedAllowed: boolean) {
  await page.route('**/api/auth/me', async route => {
    await route.fulfill({
      json: {
        user: {
          id: 'report-admin',
          email: 'report-admin@example.test',
          name: 'Report Admin',
          organizationId: 'report-org',
          organizationName: 'Report Organization',
          canManagePlatformSubscriptions: false,
        },
      },
    });
  });
  await page.route('**/api/stores', async route => {
    await route.fulfill({ json: { stores: [{ id: 'store-1', name: 'Magasin central', code: 'MC' }] } });
  });
  await page.route('**/api/reports/sales/summary**', async route => {
    await route.fulfill({ json: summary });
  });

  const advancedData: Record<string, unknown> = {
    'by-period': [{ period: '2026-11-28', salesCount: 8, revenue: 1250, itemsSold: 12, discount: 25, tax: 100 }],
    'by-payment-method': [{ paymentMethod: 'CASH', transactionCount: 8, amount: 1200 }],
    'by-store': [{ storeId: 'store-1', storeName: 'Magasin central', salesCount: 8, revenue: 1250, itemsSold: 12 }],
  };

  await page.route('**/api/reports/sales/by-period**', async route => {
    if (advancedAllowed) await route.fulfill({ json: advancedData['by-period'] });
    else await route.fulfill({ status: 402, json: { error: 'Subscription entitlement required: reports.advanced' } });
  });
  await page.route('**/api/reports/sales/by-payment-method**', async route => {
    if (advancedAllowed) await route.fulfill({ json: advancedData['by-payment-method'] });
    else await route.fulfill({ status: 402, json: { error: 'Subscription entitlement required: reports.advanced' } });
  });
  await page.route('**/api/reports/sales/by-store**', async route => {
    if (advancedAllowed) await route.fulfill({ json: advancedData['by-store'] });
    else await route.fulfill({ status: 402, json: { error: 'Subscription entitlement required: reports.advanced' } });
  });
}

test.describe('Sales reports and subscription entitlements', () => {
  test('keeps the standard sales summary available when advanced reports are not included', async ({ page }) => {
    await mockSalesReport(page, false);
    await page.goto('/reports/sales');

    await expect(page.getByRole('heading', { name: 'Rapport des Ventes' })).toBeVisible();
    await expect(page.getByText('CA Total', { exact: true })).toBeVisible();
    await expect(page.getByText(/1.{0,3}250,00/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Analyses avancées non incluses' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Évolution des Ventes' })).toHaveCount(0);
  });

  test('shows detailed sales charts when the advanced entitlement is available', async ({ page }) => {
    await mockSalesReport(page, true);
    await page.goto('/reports/sales');

    await expect(page.getByText('CA Total', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Évolution des Ventes' })).toBeVisible();
    await expect(page.getByText('Magasin central', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Analyses avancées non incluses' })).toHaveCount(0);
  });
});
