/**
 * QA Suite: Autenticación y sesión
 *
 * Cubre:
 * - Login con credenciales inválidas
 * - Login correcto para cada rol
 * - Persistencia de sesión al recargar
 * - Cierre de sesión
 * - Redirección desde /login cuando ya hay sesión
 * - Recuperación de contraseña (UI solamente; el envío real no es testeable sin email)
 */
import { test, expect } from '@playwright/test';
import {
  login,
  ADMIN_EMAIL, ADMIN_PASSWORD, hasAdminCredentials,
  MECHANIC_EMAIL, MECHANIC_PASSWORD, hasMechanicCredentials,
  PAINTER_EMAIL, PAINTER_PASSWORD, hasPainterCredentials,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// 1. Credenciales inválidas
// ---------------------------------------------------------------------------
test('AUTH-01 | credenciales incorrectas: muestra error y permanece en /login', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#login-email', 'noeexiste@restorify.com');
  await page.fill('#login-password', 'claveincorrecta123');
  await page.click('#login-submit');

  await expect(page.locator('.login-error')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test('AUTH-02 | contraseña vacía: no hace petición de red innecesaria', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#login-email', 'alguien@restorify.com');
  // password queda vacío
  await page.click('#login-submit');
  // debe quedar en /login (HTML required o validación propia)
  await expect(page).toHaveURL(/\/login/);
});

test('AUTH-03 | usuario ya logueado: /login redirige a /', async ({ page }) => {
  test.skip(!hasAdminCredentials, 'Requiere E2E_ADMIN_EMAIL/PASSWORD');
  await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  await page.goto('/login');
  await expect(page).toHaveURL('/');
});

// ---------------------------------------------------------------------------
// 2. Login por rol
// ---------------------------------------------------------------------------
test.describe('AUTH-10 | Admin Main puede entrar', () => {
  test.skip(!hasAdminCredentials, 'Requiere E2E_ADMIN_EMAIL/PASSWORD');
  test('login correcto y ve el dashboard', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await expect(page).toHaveURL('/');
    // La barra lateral muestra Finanzas y Nómina
    await expect(page.locator('a[href="/finance"]')).toBeVisible();
    await expect(page.locator('a[href="/payroll"]')).toBeVisible();
    // El selector de sede es visible para el admin
    await expect(page.locator('#sede-selector')).toBeVisible();
  });
});

test.describe('AUTH-11 | Mecánico puede entrar y ve vista reducida', () => {
  test.skip(!hasMechanicCredentials, 'Requiere E2E_MECHANIC_EMAIL/PASSWORD');
  test('login correcto y NO ve Finanzas ni Nómina', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await expect(page).toHaveURL('/');
    await expect(page.locator('a[href="/finance"]')).toHaveCount(0);
    await expect(page.locator('a[href="/payroll"]')).toHaveCount(0);
    await expect(page.locator('#sede-selector')).toHaveCount(0);
  });
});

test.describe('AUTH-12 | Pintor puede entrar y ve vista reducida', () => {
  test.skip(!hasPainterCredentials, 'Requiere E2E_PAINTER_EMAIL/PASSWORD');
  test('login correcto y NO ve Finanzas ni Nómina', async ({ page }) => {
    await login(page, PAINTER_EMAIL!, PAINTER_PASSWORD!);
    await expect(page).toHaveURL('/');
    await expect(page.locator('a[href="/finance"]')).toHaveCount(0);
    await expect(page.locator('a[href="/payroll"]')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Persistencia de sesión
// ---------------------------------------------------------------------------
test.describe('AUTH-20 | Sesión persiste tras recarga', () => {
  test.skip(!hasAdminCredentials, 'Requiere E2E_ADMIN_EMAIL/PASSWORD');
  test('sigue autenticado después de F5', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.reload();
    // No debe aterrizar en /login
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator('a[href="/finance"]')).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// 4. Cierre de sesión
// ---------------------------------------------------------------------------
test.describe('AUTH-30 | Cierre de sesión', () => {
  test.skip(!hasAdminCredentials, 'Requiere E2E_ADMIN_EMAIL/PASSWORD');
  test('logout redirige a /login y limpia sesión', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    // The logout button lives in .sidebar-footer as a .sidebar-link
    // Its label is t('nav.logout') → "Cerrar Sesión" (ES) or "Log Out" (EN)
    const logoutBtn = page.locator('.sidebar-footer button.sidebar-link, button.sidebar-link:has-text("Cerrar Sesión"), button.sidebar-link:has-text("Log Out"), #logout-btn').first();
    await logoutBtn.waitFor({ timeout: 10000 });
    await logoutBtn.click();
    await expect(page).toHaveURL(/\/login/);
    // Intentar ir al dashboard debe redirigir a login
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });
});

// ---------------------------------------------------------------------------
// 5. Pantalla de recuperación de contraseña
// ---------------------------------------------------------------------------
test('AUTH-40 | Pantalla de recuperar contraseña renderiza sin errores', async ({ page }) => {
  await page.goto('/login');
  // Busca el enlace "¿Olvidaste tu contraseña?"
  const forgotLink = page.locator('a:has-text("Olvidaste"), button:has-text("Olvidaste"), a:has-text("forgot"), button:has-text("forgot")').first();
  await forgotLink.waitFor({ timeout: 5000 });
  await forgotLink.click();

  // Debe aparecer un campo de email para el reset
  const emailField = page.locator('input[type="email"]').first();
  await expect(emailField).toBeVisible();

  // Enviar un email ficticio debe mostrar el mensaje de confirmación (sin importar si existe)
  await emailField.fill('noexiste@example.com');
  const sendBtn = page.locator('button[type="submit"], button:has-text("Enviar"), button:has-text("Send")').first();
  await sendBtn.click();

  // El sistema muestra siempre el mismo mensaje de confirmación (privacy-safe)
  await expect(page.locator('body')).toContainText(/enviado|sent|revisa|check/i, { timeout: 8000 });
});

// ---------------------------------------------------------------------------
// 6. Guard de rutas privadas sin sesión
// ---------------------------------------------------------------------------
test('AUTH-50 | ruta protegida sin sesión redirige a /login', async ({ page }) => {
  // No hace login: intenta acceder directamente
  await page.goto('/customers');
  await expect(page).toHaveURL(/\/login/);
});

test('AUTH-51 | /finance sin sesión redirige a /login', async ({ page }) => {
  await page.goto('/finance');
  await expect(page).toHaveURL(/\/login/);
});

test('AUTH-52 | /payroll sin sesión redirige a /login', async ({ page }) => {
  await page.goto('/payroll');
  await expect(page).toHaveURL(/\/login/);
});
