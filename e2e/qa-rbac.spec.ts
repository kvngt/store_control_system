/**
 * QA Suite: Permisos y control de acceso por rol
 *
 * Cubre:
 * - Acceso a rutas admin-only (Finance, Payroll)
 * - Visibilidad de botones Eliminar (solo admin)
 * - Selector de sede (solo admin)
 * - Mecánico ve sección "Otras órdenes" colapsada
 * - Mecánico no puede asignar técnicos a otros
 * - Navegación de admin a Configuración de sedes/empleados
 */
import { test, expect } from '@playwright/test';
import {
  login,
  ADMIN_EMAIL, ADMIN_PASSWORD, hasAdminCredentials,
  MECHANIC_EMAIL, MECHANIC_PASSWORD, hasMechanicCredentials,
  PAINTER_EMAIL, PAINTER_PASSWORD, hasPainterCredentials,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// Admin accede a rutas protegidas
// ---------------------------------------------------------------------------
test.describe('RBAC-01 | Admin accede a Finance', () => {
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');
  test('el admin llega a /finance y ve el botón de nueva transacción', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/finance');
    await expect(page).toHaveURL(/\/finance/);
    await expect(page.locator('#new-transaction-btn')).toBeVisible();
  });
});

test.describe('RBAC-02 | Admin accede a Payroll', () => {
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');
  test('el admin llega a /payroll', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/payroll');
    await expect(page).toHaveURL(/\/payroll/);
    // Debe existir un botón de nuevo pago
    await expect(page.locator('#new-payroll-btn, button:has-text("Nuevo Pago"), button:has-text("New Payment")').first()).toBeVisible({ timeout: 8000 });
  });
});

test.describe('RBAC-03 | Admin ve botón Eliminar en clientes y vehículos', () => {
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');
  test('existen botones de eliminar en al menos un registro de clientes', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/customers');
    await page.waitForSelector('.table-container, .cards-on-mobile', { timeout: 10000 });
    // Si hay al menos un cliente, el botón debe existir
    const rows = await page.locator('tr[data-row], tbody tr, .customer-card').count();
    if (rows > 0) {
      await expect(
        page.locator('.table-actions button[title="Eliminar"], .table-actions button[title="Delete"], button.btn-icon[title="Eliminar"]').first()
      ).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Mecánico bloqueado de rutas admin-only
// ---------------------------------------------------------------------------
test.describe('RBAC-10 | Mecánico redirigido desde /finance', () => {
  test.skip(!hasMechanicCredentials, 'Requiere credenciales de mecánico');
  test('intenta ir a /finance y cae en /', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await page.goto('/finance');
    await expect(page).toHaveURL('/');
  });
});

test.describe('RBAC-11 | Mecánico redirigido desde /payroll', () => {
  test.skip(!hasMechanicCredentials, 'Requiere credenciales de mecánico');
  test('intenta ir a /payroll y cae en /', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await page.goto('/payroll');
    await expect(page).toHaveURL('/');
  });
});

test.describe('RBAC-12 | Mecánico NO ve botones de eliminar', () => {
  test.skip(!hasMechanicCredentials, 'Requiere credenciales de mecánico');
  test('clientes: sin botón eliminar', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await page.goto('/customers');
    await page.waitForSelector('.table-container, .cards-on-mobile, .page-title', { timeout: 10000 });
    await expect(
      page.locator('.table-actions button[title="Eliminar"], .table-actions button[title="Delete"]')
    ).toHaveCount(0);
  });

  test('vehículos: sin botón eliminar', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await page.goto('/vehicles');
    await page.waitForSelector('.table-container, .cards-on-mobile, .page-title', { timeout: 10000 });
    await expect(
      page.locator('.table-actions button[title="Eliminar"], .table-actions button[title="Delete"]')
    ).toHaveCount(0);
  });
});

test.describe('RBAC-13 | Mecánico NO ve selector de sede', () => {
  test.skip(!hasMechanicCredentials, 'Requiere credenciales de mecánico');
  test('header no tiene sede-selector', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await expect(page.locator('#sede-selector')).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Dashboard: mecánico/pintor ven vista financieramente vacía
// ---------------------------------------------------------------------------
test.describe('RBAC-20 | Dashboard de mecánico no muestra datos financieros', () => {
  test.skip(!hasMechanicCredentials, 'Requiere credenciales de mecánico');
  test('no hay tarjeta de ingresos del mes visible', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    // El dashboard del mecánico no debe mostrar la tarjeta de ingresos
    await expect(page.locator('.stat-card:has-text("Ingresos"), .stat-card:has-text("Income")').first()).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Órdenes: mecánico ve "Mis Órdenes" y sección colapsada
// ---------------------------------------------------------------------------
test.describe('RBAC-30 | Vista de órdenes para mecánico/pintor', () => {
  test.skip(!hasMechanicCredentials, 'Requiere credenciales de mecánico');
  test('hay dos secciones: "Mis Órdenes" abierta y "Otras Órdenes" cerrada', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await page.goto('/work-orders');

    const sections = page.locator('.orders-section');
    await expect(sections).toHaveCount(2);
    await expect(sections.first()).toContainText(/Mis Órdenes de Trabajo|My Work Orders/);

    const toggle = page.locator('.orders-section-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // Expandir
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});

// ---------------------------------------------------------------------------
// Settings: admin ve sección de sedes y empleados; mecánico no
// ---------------------------------------------------------------------------
test.describe('RBAC-40 | Settings: admin ve sedes y empleados', () => {
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');
  test('sección de sedes está presente', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/settings');
    await expect(page.locator('#new-employee-btn, button:has-text("Nuevo Empleado"), button:has-text("New Employee")').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('RBAC-41 | Settings: mecánico NO ve gestión de sedes', () => {
  test.skip(!hasMechanicCredentials, 'Requiere credenciales de mecánico');
  test('no existe botón de nuevo empleado', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await page.goto('/settings');
    await page.waitForSelector('.page-title, h1, .settings-profile', { timeout: 10000 });
    await expect(page.locator('#new-employee-btn, button:has-text("Nuevo Empleado")').first()).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------
// Pintor: mismos permisos que mecánico
// ---------------------------------------------------------------------------
test.describe('RBAC-50 | Pintor redirigido de rutas admin', () => {
  test.skip(!hasPainterCredentials, 'Requiere credenciales de pintor');
  test('/finance redirige a /', async ({ page }) => {
    await login(page, PAINTER_EMAIL!, PAINTER_PASSWORD!);
    await page.goto('/finance');
    await expect(page).toHaveURL('/');
  });
  test('/payroll redirige a /', async ({ page }) => {
    await login(page, PAINTER_EMAIL!, PAINTER_PASSWORD!);
    await page.goto('/payroll');
    await expect(page).toHaveURL('/');
  });
});
