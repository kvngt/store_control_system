import { test, expect } from '@playwright/test';
import { login, ADMIN_EMAIL, ADMIN_PASSWORD, hasAdminCredentials, TEST_DATA_PREFIX } from './fixtures.js';

// Runs against the real Supabase project (there's no separate staging
// project yet), so this test creates a clearly-tagged customer and deletes
// it again at the end — see fixtures.ts for the naming convention. If this
// test fails partway through, search Clientes for "PWTEST" to clean up by
// hand.
test.describe('customer CRUD (self-cleaning)', () => {
  test.skip(!hasAdminCredentials, 'Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD in .env.test.local to run this test.');

  test('create, find, and delete a customer', async ({ page }) => {
    const name = `${TEST_DATA_PREFIX} Cliente ${Date.now()}`;

    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/customers');

    await page.click('#new-customer-btn');
    await page.fill('#customer-name', name);
    await page.fill('#customer-phone', '555-0100');
    await page.fill('#customer-email', 'pwtest@example.com');
    await page.click('#customer-save');

    const row = page.locator('tr', { hasText: name });
    await expect(row).toBeVisible();

    page.once('dialog', (dialog) => dialog.accept());
    await row.locator('button.btn-icon').last().click();

    await expect(page.locator('tr', { hasText: name })).toHaveCount(0);
  });
});
