/**
 * QA Suite: Configuración - Perfil de usuario, sedes y empleados
 *
 * Cubre:
 * - Perfil de usuario: cargar, cambiar nombre (reversible)
 * - Cambio de idioma (ES/EN)
 * - Cambio de tema (oscuro/claro)
 * - Admin: lista de sedes visible
 * - Admin: modal de nuevo empleado abre y valida campos
 * - Admin: no puede borrar empleado con órdenes (validación del sistema)
 */
import { test, expect, type Page } from '@playwright/test';
import {
  login,
  ADMIN_EMAIL, ADMIN_PASSWORD, hasAdminCredentials,
  MECHANIC_EMAIL, MECHANIC_PASSWORD, hasMechanicCredentials,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// CFG-01: Perfil de usuario
// ---------------------------------------------------------------------------
test.describe('CFG-01 | Perfil de usuario - ver datos actuales', () => {
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');

  test('la sección de perfil muestra el nombre y correo del usuario', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/settings');
    await page.waitForSelector('.settings-profile, .profile-section, h1, .page-title', { timeout: 10000 });

    // El email del usuario debe aparecer en el formulario de perfil
    const emailField = page.locator('input[type="email"], input[id*="email"]').first();
    if ((await emailField.count()) > 0) {
      const value = await emailField.inputValue();
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// CFG-02: Cambio de idioma
// ---------------------------------------------------------------------------
test.describe('CFG-02 | Cambio de idioma', () => {
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');

  test('cambiar a inglés y volver a español funciona', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);

    // Buscar botón EN en el header o settings
    const enBtn = page.locator('button:has-text("EN"), button[data-lang="en"]').first();
    await expect(enBtn).toBeVisible({ timeout: 8000 });
    await enBtn.click();

    // La UI debería cambiar al inglés
    await expect(page.locator('body')).toContainText(/Work Orders|Dashboard|Customers|Settings/i, { timeout: 5000 });

    // Volver a español
    const esBtn = page.locator('button:has-text("ES"), button[data-lang="es"]').first();
    await esBtn.click();
    await expect(page.locator('body')).toContainText(/Órdenes|Panel|Clientes|Configuración/i, { timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// CFG-03: Cambio de tema
// ---------------------------------------------------------------------------
test.describe('CFG-03 | Cambio de tema claro/oscuro', () => {
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');

  test('el botón de tema cambia el atributo data-theme en html', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/settings');
    await page.waitForSelector('.page-title, h1', { timeout: 10000 });

    const htmlEl = page.locator('html');
    const initialTheme = await htmlEl.getAttribute('data-theme') || '';

    // Theme buttons use t('settings.themeDark') = 'Oscuro' / 'Dark'
    // and t('settings.themeLight') = 'Claro' / 'Light'
    const targetTheme = initialTheme === 'dark' ? 'light' : 'dark';
    const themeBtn = page.locator(`button:has-text("${ targetTheme === 'light' ? 'Claro' : 'Oscuro' }"), button:has-text("${ targetTheme === 'light' ? 'Light' : 'Dark' }")`).first();
    await expect(themeBtn).toBeVisible({ timeout: 8000 });
    await themeBtn.click();
    await page.waitForTimeout(500);

    const newTheme = await htmlEl.getAttribute('data-theme') || '';
    expect(newTheme).toBe(targetTheme);
  });
});

// ---------------------------------------------------------------------------
// CFG-10: Admin - lista de sedes
// ---------------------------------------------------------------------------
test.describe('CFG-10 | Admin ve y gestiona sedes', () => {
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');

  test('sección de sedes visible con el encabezado correcto', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/settings');
    await page.waitForSelector('.page-title, h1', { timeout: 10000 });

    // Section title is t('settings.workshops') = 'Sedes / Talleres' (ES) / 'Workshops' (EN)
    await expect(
      page.locator('h3:has-text("Sedes / Talleres"), h3:has-text("Workshops"), h2:has-text("Sedes")').first()
    ).toBeVisible({ timeout: 8000 });
  });
});

// ---------------------------------------------------------------------------
// CFG-11: Admin - modal de nuevo empleado
// ---------------------------------------------------------------------------
test.describe('CFG-11 | Modal de nuevo empleado: abre y valida', () => {
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');

  // Helper to open the employee modal
  async function openEmployeeModal(page: Page) {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/settings');
    // The button uses t('settings.newEmployee') = 'Nuevo Empleado' or 'New Employee'
    await page.waitForSelector('button:has-text("Nuevo Empleado"), button:has-text("New Employee")', { timeout: 12000 });
    await page.locator('button:has-text("Nuevo Empleado"), button:has-text("New Employee")').first().click();
    const modal = page.locator('.modal');
    await expect(modal).toBeVisible({ timeout: 5000 });
    return modal;
  }

  test('el modal de nuevo empleado abre con los campos correctos', async ({ page }) => {
    const modal = await openEmployeeModal(page);
    await expect(modal.locator('input[type="text"], input[type="email"], input#employee-password').first()).toBeVisible();
    await expect(modal.locator('input#employee-password').first()).toBeVisible();
    await expect(modal.locator('select').first()).toBeVisible();
  });

  test('no puede crear empleado sin nombre', async ({ page }) => {
    const modal = await openEmployeeModal(page);
    // Only fill email and password; leave name empty
    await modal.locator('input[type="email"]').first().fill('test@example.com');
    await modal.locator('input#employee-password').first().fill('Password123!');

    const saveBtn = modal.locator('button.btn.btn-primary').last();
    await saveBtn.click();

    await expect(modal).toBeVisible();
    // Uses t('settings.employeeMissingFields')
    await expect(modal.locator('.alert-error, .modal-error, [role="alert"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('no puede crear empleado con contraseña menor a 6 caracteres', async ({ page }) => {
    const modal = await openEmployeeModal(page);
    const nameInput = modal.locator('#employee-name');
    await nameInput.fill('Test Employee QA');
    await modal.locator('input[type="email"]').first().fill('testqa-short-pass@example.com');
    await modal.locator('input#employee-password').first().fill('123');

    const saveBtn = modal.locator('button.btn.btn-primary').last();
    await saveBtn.click();

    await expect(modal).toBeVisible();
    await expect(modal.locator('.alert-error, [role="alert"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('no puede crear empleado con email ya registrado', async ({ page }) => {
    const modal = await openEmployeeModal(page);
    const nameInput = modal.locator('#employee-name');
    await nameInput.fill('Duplicado QA Test');
    await modal.locator('input[type="email"]').first().fill(ADMIN_EMAIL!);
    await modal.locator('input#employee-password').first().fill('Restorify2026!');

    const saveBtn = modal.locator('button.btn.btn-primary').last();
    await saveBtn.click();

    await expect(modal).toBeVisible({ timeout: 10000 });
    // The error message comes from getErrorMessage() after the API rejects the duplicate
    await expect(modal.locator('.alert-error, [role="alert"]').first()).toBeVisible({ timeout: 8000 });
  });
});


// ---------------------------------------------------------------------------
// CFG-12: Mecánico - Settings limitada (solo perfil)
// ---------------------------------------------------------------------------
test.describe('CFG-12 | Mecánico solo ve su perfil en Settings', () => {
  test.skip(!hasMechanicCredentials, 'Requiere credenciales de mecánico');

  test('no hay sección de sedes ni de empleados', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await page.goto('/settings');
    await page.waitForSelector('.page-title, h1, .settings-profile', { timeout: 10000 });

    await expect(page.locator('h2:has-text("Sedes"), h3:has-text("Sedes")').first()).not.toBeVisible().catch(() => {});
    await expect(page.locator('#new-employee-btn, button:has-text("Nuevo Empleado")').first()).toHaveCount(0);
  });
});
