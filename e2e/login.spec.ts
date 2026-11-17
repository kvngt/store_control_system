import { test, expect } from '@playwright/test';
import { login, goToIntakeVehicleStep, openIntakeDialog, ADMIN_EMAIL, ADMIN_PASSWORD, MECHANIC_EMAIL, MECHANIC_PASSWORD, hasAdminCredentials, hasMechanicCredentials } from './fixtures.js';

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
    // Configuración la ve todo el personal (su perfil, idioma y tema; ver Sidebar). Sirve de espera a que la
    // barra pinte: un `toHaveCount(0)` a secas pasaba o fallaba según si ya había pintado.
    await expect(page.locator('a[href="/settings"]')).toHaveCount(1);
    await expect(page.locator('a[href="/finance"]')).toHaveCount(0);
    await expect(page.locator('a[href="/payroll"]')).toHaveCount(0);
    await expect(page.locator('#sede-selector')).toHaveCount(0);
  });

  test('mechanic is redirected away from /finance', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await page.goto('/finance');
    await expect(page).toHaveURL('/panel');
  });

  test('work orders show only "my orders"', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await page.goto('/work-orders');

    // Desde 20261007000000 un técnico solo ve las órdenes que tiene asignadas: ya no hay una
    // sección plegada con las de sus compañeros.
    const sections = page.locator('.orders-section');
    await expect(sections).toHaveCount(1);
    await expect(sections.first()).toContainText(/Mis Órdenes de Trabajo|My Work Orders/);
    await expect(page.locator('.orders-section-toggle')).toHaveCount(0);
  });

  test('mechanic gets no delete button on customers or vehicles', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);

    await page.goto('/customers');
    await expect(page.locator('.page-title')).toBeVisible();
    await expect(page.locator('.table-actions button[title="Eliminar"], .table-actions button[title="Delete"]')).toHaveCount(0);

    // Vehículos es de administración (crear o editar un vehículo es de admin): el técnico vuelve al panel.
    await page.goto('/vehicles');
    await expect(page).toHaveURL(/\/panel$/, { timeout: 10000 });
    await expect(page.locator('#new-vehicle-btn')).toHaveCount(0);
  });

});

// El formulario de alta es de administración desde 20261004000000, así que esta prueba
// necesita sesión de admin. Vive en su propio bloque para no depender de que existan
// credenciales de mecánico, que es de lo que colgaba antes.
test.describe('intake form (admin session)', () => {
  test.skip(!hasAdminCredentials, 'Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD in .env.test.local to run this test.');

  // `fill()` sets the value in one go and never fires keydown, so it cannot
  // exercise the keyboard guard — it is the paste path, covered in
  // qa-workorders.spec.ts. Here we type.
  test('intake mileage rejects a negative value', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await openIntakeDialog(page);
    test.skip(!(await goToIntakeVehicleStep(page)), 'La sede no tiene clientes');

    const miles = page.locator('#order-miles-in');
    await miles.pressSequentially('-250');
    await expect(miles).toHaveValue('250');
  });
});
