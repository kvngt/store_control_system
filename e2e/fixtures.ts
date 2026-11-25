import { expect, type Locator, type Page } from '@playwright/test';

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

/**
 * `true` solo con `npm run test:e2e:local` (scripts/e2e-local.mjs): la app habla con el Supabase
 * de esta máquina. Una prueba que entregue órdenes, cobre o pague comisiones se salta si no lo
 * es: `test.skip(!isLocalStack, 'Solo contra la base local')`.
 */
export const isLocalStack = process.env.E2E_LOCAL_STACK === '1';

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
  await page.waitForURL('/panel');
}

/** Waits for the dashboard to fully load (spinner gone, page title present). */
export async function waitForDashboard(page: Page) {
  await page.waitForSelector('.spinner', { state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForSelector('.page-title, .dashboard-title, h1', { timeout: 10000 });
}

/**
 * Abre el diálogo «Nueva orden» y espera a que de verdad se pueda usar. Devuelve el diálogo.
 *
 * El diálogo se carga por partes: al pulsar el botón primero sale el recuadro de «Cargando» de
 * `LazyModal` (también es un `.modal`, pero sin `role="dialog"`), y el diálogo real llega cuando baja
 * su archivo (con Vite en desarrollo y varios navegadores a la vez, de 1 a 5 s). Un `.modal` visible no
 * prueba que el formulario esté: se espera el diálogo real y su primer campo habilitado. Y un clic no
 * se reintenta a ciegas, porque «Nuevo cliente» cambia el panel y el botón desaparece al primer
 * clic que entra, aunque Playwright lo reporte tarde.
 */
export async function openIntakeDialog(page: Page): Promise<Locator> {
  await page.goto('/work-orders');
  const button = page.locator('#new-order-btn');
  await button.waitFor({ state: 'visible', timeout: 20000 });
  const modal = page.locator('.modal[role="dialog"]');
  // Con muchas órdenes y avisos, la página cambia de alto mientras carga: el botón puede quedar bajo el
  // encabezado fijo después de que Playwright lo desplaza a la vista, y el clic cae en la campana. Se
  // vuelve arriba antes de cada intento y se toca solo mientras el diálogo no esté abierto.
  await expect(async () => {
    if (!(await modal.isVisible())) {
      await page.evaluate('window.scrollTo(0, 0)');
      await button.click({ timeout: 8000 });
    }
    await expect(modal).toBeVisible({ timeout: 15000 });
  }).toPass({ timeout: 60000 });
  await expect(modal.locator('#intake-customer-search')).toBeEnabled({ timeout: 30000 });
  return modal;
}

/**
 * Elige «Nuevo cliente» en el paso 1 del alta y devuelve el campo del nombre ya visible. El botón
 * desaparece en cuanto el clic entra, así que solo se vuelve a tocar mientras siga ahí; y si el diálogo
 * entero se perdió (el servidor de desarrollo de Vite puede recargar la página la primera vez que baja un
 * módulo diferido), se vuelve a abrir.
 */
export async function chooseNewCustomerInIntake(page: Page, modal: Locator): Promise<Locator> {
  const nameInput = modal.getByPlaceholder(/Nombre|Name/).first();
  await expect(async () => {
    if (!(await modal.isVisible())) await openIntakeDialog(page);
    const newCustomer = modal.locator('#intake-new-customer');
    if (await newCustomer.isVisible()) await newCustomer.click({ timeout: 8000 });
    await expect(nameInput).toBeVisible({ timeout: 5000 });
  }).toPass({ timeout: 60000 });
  return nameInput;
}

/**
 * El alta de la orden va en cuatro pasos desde F4 (octubre 2026): las millas y la inspección
 * están en el paso 2. Elige el primer cliente que haya y pasa con "Siguiente". No crea nada.
 * Devuelve `false` si la sede no tiene clientes (la prueba se salta).
 */
export async function goToIntakeVehicleStep(page: Page): Promise<boolean> {
  // El paso 1 es un buscador (A-08): al enfocarlo lista los primeros clientes.
  const search = page.locator('#intake-customer-search');
  await search.waitFor({ timeout: 10000 });
  await search.click();
  // Los clientes llegan por la red después de abrir el diálogo: se espera la primera opción antes de
  // dar por vacía la sede (si no, una lista que tarda 2 s saltaba la prueba sin avisar).
  const first = page.locator('.combo-option').first();
  if (!(await first.waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false))) return false;
  await first.click();
  await page.locator('.modal-footer button[type="submit"]').click();
  await page.locator('#order-miles-in').waitFor({ timeout: 10000 });
  return true;
}
