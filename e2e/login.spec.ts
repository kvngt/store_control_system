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

  test('work orders open on "my orders", with the rest of the board collapsed', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await page.goto('/work-orders');

    // Their own orders come first; the colleagues' section is present but shut.
    const sections = page.locator('.orders-section');
    await expect(sections).toHaveCount(2);
    await expect(sections.first()).toContainText(/Mis Órdenes de Trabajo|My Work Orders/);

    const toggle = page.locator('.orders-section-toggle');
    await expect(toggle).toContainText(/Otras Órdenes de Trabajo|Other Work Orders/);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.orders-section-hint')).toBeVisible();
  });

  test('mechanic gets no delete button on customers or vehicles', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);

    await page.goto('/customers');
    await expect(page.locator('#new-customer-btn, .page-title')).toBeVisible();
    await expect(page.locator('.table-actions button[title="Eliminar"], .table-actions button[title="Delete"]')).toHaveCount(0);

    await page.goto('/vehicles');
    await expect(page.locator('#new-vehicle-btn')).toBeVisible();
    await expect(page.locator('.table-actions button[title="Eliminar"], .table-actions button[title="Delete"]')).toHaveCount(0);
  });

  test('intake mileage rejects a negative value', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await page.goto('/work-orders');
    await page.click('#new-order-btn');

    const miles = page.locator('#order-miles-in');
    await miles.fill('-250');
    // The minus sign never lands in the field, and the reason is shown.
    await expect(miles).toHaveValue('250');
    await expect(page.locator('.modal')).toContainText(
      /Las millas de ingreso no pueden ser negativas|Intake mileage cannot be negative/
    );
  });
});
