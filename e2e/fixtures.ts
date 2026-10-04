import type { Page } from '@playwright/test';

// Credentials come from .env.test.local (see .env.test.example) — never
// hardcoded, and tests that need them skip themselves when absent so the
// suite still runs (minus the credentialed tests) with zero setup.
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
export const MECHANIC_EMAIL = process.env.E2E_MECHANIC_EMAIL;
export const MECHANIC_PASSWORD = process.env.E2E_MECHANIC_PASSWORD;
export const BRANCH_ADMIN_EMAIL = process.env.E2E_BRANCH_ADMIN_EMAIL;
export const BRANCH_ADMIN_PASSWORD = process.env.E2E_BRANCH_ADMIN_PASSWORD;
export const PAINTER_EMAIL = process.env.E2E_PAINTER_EMAIL;
export const PAINTER_PASSWORD = process.env.E2E_PAINTER_PASSWORD;

export const hasAdminCredentials = Boolean(ADMIN_EMAIL && ADMIN_PASSWORD);
export const hasMechanicCredentials = Boolean(MECHANIC_EMAIL && MECHANIC_PASSWORD);
export const hasBranchAdminCredentials = Boolean(BRANCH_ADMIN_EMAIL && BRANCH_ADMIN_PASSWORD);
export const hasPainterCredentials = Boolean(PAINTER_EMAIL && PAINTER_PASSWORD);

// Data created by a test run against the real Wells Fargo... er, real
// Supabase project (there's no separate staging project yet) should always
// carry this prefix, so it's unmistakable and easy to find/clean up by hand
// if a test fails mid-way before its own cleanup runs.
export const TEST_DATA_PREFIX = 'PWTEST';

export async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('#login-submit');
  await page.waitForURL('/');
}

/** Waits for the dashboard to fully load (spinner gone, page title present). */
export async function waitForDashboard(page: Page) {
  await page.waitForSelector('.spinner', { state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForSelector('.page-title, .dashboard-title, h1', { timeout: 10000 });
}

/**
 * El alta de la orden va en cuatro pasos desde F4 (octubre 2026): las millas y la inspección
 * están en el paso 2. Elige el primer cliente que haya y pasa con "Siguiente". No crea nada.
 * Devuelve `false` si la sede no tiene clientes (la prueba se salta).
 */
export async function goToIntakeVehicleStep(page: Page): Promise<boolean> {
  const customer = page.locator('#intake-customer');
  await customer.waitFor({ timeout: 10000 });
  // Las dos primeras opciones son "Seleccionar" y "+ Nuevo cliente".
  const first = customer.locator('option').nth(2);
  if ((await first.count()) === 0) return false;
  await customer.selectOption((await first.getAttribute('value')) ?? '');
  await page.locator('.modal-footer button[type="submit"]').click();
  await page.locator('#order-miles-in').waitFor({ timeout: 10000 });
  return true;
}
