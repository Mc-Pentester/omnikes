import { test, expect } from '@playwright/test';

test.describe('Health Check API', () => {
  test('should return healthy status', async ({ request }) => {
    const response = await request.get('/api/health');
    
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body).toHaveProperty('status');
    expect(['ok', 'degraded']).toContain(body.status);
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('services');
    expect(body.services).toHaveProperty('database');
  });

  test('should include database status', async ({ request }) => {
    const response = await request.get('/api/health');
    const body = await response.json();
    
    expect(body.services.database).toHaveProperty('status');
    expect(['connected', 'disconnected', 'unknown']).toContain(body.services.database.status);
  });
});

test.describe('Application Homepage', () => {
  test('should load successfully', async ({ page }) => {
    await page.goto('/');
    
    await expect(page).toHaveTitle(/Create Next App|OmniKès/);
  });

  test('should be responsive', async ({ page }) => {
    await page.goto('/');
    
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('body')).toBeVisible();
    
    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('body')).toBeVisible();
  });
});
