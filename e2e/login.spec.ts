import { test, expect } from '@playwright/test';
import { login, ADMIN_EMAIL, ADMIN_PASSWORD, MECHANIC_EMAIL, MECHANIC_PASSWORD, hasAdminCredentials, hasMechanicCredentials } from './fixtures.js';

test('shows an error and stays on /login for invalid credentials', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#login-email', 'no-existe@restorify.com');
  await page.fill('#login-password', 'wrong-password');
  await page.click('#login-submit');

  await expect(page.locator('.login-error')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test.describe('admin session', () => {
  test.skip(!hasAdminCredentials, 'Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD in .env.test.local to run this test.');

  test('admin can log in and sees the finance/payroll/settings menu', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await expect(page.locator('a[href="/finance"]')).toBeVisible();
    await expect(page.locator('a[href="/payroll"]')).toBeVisible();
    await expect(page.locator('a[href="/settings"]')).toBeVisible();
    // The sede switcher in the header is admin-only.
    await expect(page.locator('#sede-selector')).toBeVisible();
  });

  test('admin is not blocked from the /finance route', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/finance');
    await expect(page).toHaveURL(/\/finance/);
    await expect(page.locator('#new-transaction-btn')).toBeVisible();
  });
});

test.describe('mechanic/painter session', () => {
  test.skip(!hasMechanicCredentials, 'Set E2E_MECHANIC_EMAIL / E2E_MECHANIC_PASSWORD in .env.test.local to run this test.');

  test('mechanic does not see the finance/payroll/settings menu', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await expect(page.locator('a[href="/finance"]')).toHaveCount(0);
    await expect(page.locator('a[href="/payroll"]')).toHaveCount(0);
    await expect(page.locator('a[href="/settings"]')).toHaveCount(0);
    await expect(page.locator('#sede-selector')).toHaveCount(0);
  });

  test('mechanic is redirected away from /finance', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await page.goto('/finance');
    await expect(page).toHaveURL('/');
  });
});
