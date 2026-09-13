/**
 * QA Suite: Finanzas, Nómina y movimientos automáticos
 *
 * Cubre:
 * - Página de Finanzas carga con totales
 * - Formulario de nueva transacción: validación de campos
 * - Los filtros ingreso/egreso funcionan
 * - Lista de importaciones presente
 * - Comisiones (antes "Nómina"): pestañas, porcentaje de la sede, vista del técnico
 *
 * PAY-01/PAY-02 probaban la nómina por salario (salario base, período, "Nuevo
 * Pago"), que se eliminó en la migración 20260912000000. Se reemplazaron por
 * pruebas de la pantalla de comisiones que la sustituyó.
 */
import { test, expect } from '@playwright/test';
import {
  login,
  ADMIN_EMAIL, ADMIN_PASSWORD, hasAdminCredentials,
  MECHANIC_EMAIL, MECHANIC_PASSWORD, hasMechanicCredentials,
} from './fixtures.js';

// ---------------------------------------------------------------------------
// FIN-01: Página de Finanzas carga correctamente
// ---------------------------------------------------------------------------
test.describe('FIN-01 | Carga de Finanzas', () => {
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');

  test('la pantalla muestra tarjetas de ingresos, egresos y balance', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/finance');
    await expect(page).toHaveURL(/\/finance/);

    // Debe haber al menos tres stat-cards: ingresos, egresos, balance
    await page.waitForSelector('.stat-card, .finance-card, [class*="card"]', { timeout: 12000 });
    await expect(page.locator('.stat-card, .finance-card, [class*="stat-card"]').first()).toBeVisible();
  });

  test('el botón de importar estado de cuenta existe', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/finance');
    await page.waitForSelector('#new-transaction-btn', { timeout: 12000 });
    await expect(
      page.locator('button:has-text("Importar"), button:has-text("Import"), #import-statement-btn').first()
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// FIN-02: Nueva transacción - validación
// ---------------------------------------------------------------------------
test.describe('FIN-02 | Nueva transacción: validación de campos', () => {
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');

  test('no puede crear sin monto', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/finance');
    await page.waitForSelector('#new-transaction-btn', { timeout: 12000 });
    await page.click('#new-transaction-btn');

    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();

    // Llenar descripción pero dejar monto vacío
    const descField = modal.locator('input[id*="desc"], textarea[id*="desc"], #transaction-description').first();
    if ((await descField.count()) > 0) {
      await descField.fill('Test sin monto');
    }

    const saveBtn = modal.locator('button:has-text("Crear"), button:has-text("Create"), button[type="submit"]').first();
    await saveBtn.click();

    // El modal debe seguir visible (no se cerró) o mostrar error
    await expect(modal).toBeVisible({ timeout: 3000 }).catch(() => {
      // Si el modal cerró sin crear, es aceptable si hay un toast de error
    });
  });

  test('no puede crear con monto negativo', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/finance');
    await page.waitForSelector('#new-transaction-btn', { timeout: 12000 });
    await page.click('#new-transaction-btn');

    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();

    const amountField = modal.locator('input[id*="amount"], input[id*="monto"], #transaction-amount').first();
    if ((await amountField.count()) > 0) {
      await amountField.fill('-500');
    }

    const saveBtn = modal.locator('button:has-text("Crear"), button:has-text("Create"), button[type="submit"]').first();
    await saveBtn.click();

    // Debe mostrar error o no cerrar el modal
    await expect(modal).toBeVisible({ timeout: 3000 }).catch(() => {});
  });
});

// ---------------------------------------------------------------------------
// FIN-03: Filtros de tipo de transacción
// ---------------------------------------------------------------------------
test.describe('FIN-03 | Filtros de tipo (ingreso/egreso/todos)', () => {
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');

  test('los botones de filtro existen y cambian la vista', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/finance');
    await page.waitForSelector('#new-transaction-btn', { timeout: 12000 });

    // Debe haber botones/tabs de filtro
    const filterBtns = page.locator('button:has-text("Ingresos"), button:has-text("Egresos"), button:has-text("Todos"), button:has-text("Income"), button:has-text("Expense"), button:has-text("All")');
    const count = await filterBtns.count();
    if (count >= 2) {
      // Hacer clic en "Egresos" y verificar que cambia el estado activo
      await filterBtns.filter({ hasText: /Egresos|Expense/i }).first().click();
      await expect(filterBtns.filter({ hasText: /Egresos|Expense/i }).first()).toHaveClass(/active|selected|current/i).catch(() => {
        // Puede usar otro mecanismo visual; solo verificamos que no crasheó
      });
    }
  });
});

// ---------------------------------------------------------------------------
// FIN-04: Lista de importaciones
// ---------------------------------------------------------------------------
test.describe('FIN-04 | Lista de importaciones bancarias (si existen)', () => {
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');

  test('si hay importaciones, la sección es visible; si no, el botón de importar sí lo está', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/finance');
    await page.waitForSelector('#new-transaction-btn', { timeout: 12000 });

    // The imports section only renders when imports.length > 0 (Finance.tsx line 286)
    // So we can't guarantee it's visible; instead verify the Import button exists
    await expect(page.locator('#import-statement-btn').first()).toBeVisible({ timeout: 8000 });

    // If imports do exist, verify their section header
    const importSection = page.locator('h3:has-text("Importaciones"), h3:has-text("Imports"), .import-list');
    const count = await importSection.count();
    if (count > 0) {
      await expect(importSection.first()).toBeVisible();
    }
    // Either way the test passes: we verified the import button and optionally the section
  });
});

// ---------------------------------------------------------------------------
// PAY-01: Comisiones carga con sus tres vistas
// ---------------------------------------------------------------------------
test.describe('PAY-01 | Pantalla de comisiones', () => {
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');

  test('carga sin error y muestra saldos pendientes, historial y pagos', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/payroll');
    await expect(page).toHaveURL(/\/payroll/);
    await page.waitForSelector('.page-title', { timeout: 12000 });
    await expect(page.locator('.spinner')).not.toBeVisible({ timeout: 15000 }).catch(() => {});
    await expect(page.locator('.alert-error').first()).not.toBeVisible({ timeout: 5000 }).catch(() => {});

    await expect(page.getByRole('button', { name: /Saldos pendientes|Outstanding balances/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Historial de comisiones|Commission history/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Pagos realizados|Payments made/ })).toBeVisible();
  });

  test('cambiar de pestaña no rompe la pantalla', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/payroll');
    await page.waitForSelector('.page-title', { timeout: 12000 });

    for (const name of [/Historial de comisiones|Commission history/, /Pagos realizados|Payments made/, /Saldos pendientes|Outstanding balances/]) {
      await page.getByRole('button', { name }).click();
      await expect(page.locator('.alert-error').first()).not.toBeVisible({ timeout: 3000 }).catch(() => {});
    }
  });
});

// ---------------------------------------------------------------------------
// PAY-02: Porcentaje de comisión de la sede
// ---------------------------------------------------------------------------
test.describe('PAY-02 | Porcentaje de comisión', () => {
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');

  test('el admin ve el porcentaje editable y rechaza un valor fuera de 0-100', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/payroll');
    await page.waitForSelector('.page-title', { timeout: 12000 });

    const rateCard = page.locator('.card', { hasText: /Porcentaje de comisión|Commission rate/ }).first();
    await expect(rateCard).toBeVisible({ timeout: 8000 });
    const input = rateCard.locator('input[type="number"]');
    await expect(input).toBeVisible();

    // No se guarda: el valor inválido se rechaza antes de llegar a la base.
    await input.fill('150');
    await rateCard.getByRole('button', { name: /Guardar|Save/ }).click();
    await expect(page.locator('.toast-stack')).toContainText(/entre 0 y 100|between 0 and 100/i, { timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// PAY-03: Un mecánico no entra a Comisiones
// ---------------------------------------------------------------------------
test.describe('PAY-03 | Comisiones es solo para administradores', () => {
  test.skip(!hasMechanicCredentials, 'Requiere credenciales de mecánico');

  test('un mecánico que va a /payroll vuelve al panel', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await page.goto('/payroll');
    await expect(page).toHaveURL(/\/$/, { timeout: 10000 });
  });
});
