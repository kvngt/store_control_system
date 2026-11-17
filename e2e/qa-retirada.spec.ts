import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  TEST_DATA_PREFIX,
  hasAdminCredentials,
  isLocalStack,
  login,
} from './fixtures.js';
import { adminClient, createTestOrder, type CreatedTestOrder } from './localData.js';

// RET-01: retirada sin reparar con devolución de depósito en efectivo.

test.describe.configure({ mode: 'serial' });

test.describe('RET | Retirada sin reparar', () => {
  test.skip(!isLocalStack, 'Solo contra la base local: cierra la orden y registra egreso');
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');

  let db: SupabaseClient;
  let order: CreatedTestOrder;

  test.beforeAll(async () => {
    db = await adminClient();
    order = await createTestOrder(db, {
      label: 'Retirada',
      labor: [{ descripcion: `${TEST_DATA_PREFIX} Reparación mayor`, costo: 600 }],
      authorized: true,
      deposit: 100,
      depositMethod: 'efectivo',
    });
  });

  test('RET-01 cancelar todo devuelve el depósito y marca la orden como retirada sin reparar', async ({ page }) => {
    page.on('dialog', (dialog) => void dialog.accept());

    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto(`/work-orders?open=${order.id}`);
    await expect(page.locator('h1.order-detail-title')).toContainText(order.numero, { timeout: 10000 });

    await page.click('#order-withdraw');

    const modal = page.locator('.modal').first();
    await expect(modal).toBeVisible();
    await modal.locator('input[name="withdrawal-outcome"][value="cancelar"]').check();
    await expect(modal.locator('#payment-method')).toBeVisible({ timeout: 10000 });
    await modal.locator('#payment-method').selectOption('efectivo');

    const submitBtn = modal.locator('#withdrawal-submit');
    await expect(submitBtn).toBeEnabled({ timeout: 10000 });
    await submitBtn.click();

    await expect(page.getByText(/Orden cerrada como retirada sin reparar|Order closed as picked up without repair/)).toBeVisible({ timeout: 10000 });

    // En pantalla no muestra "Entregado" a secas: pinta el estado de la retirada.
    const title = page.locator('h1.order-detail-title');
    await expect(title.locator('.badge-retirada')).toHaveText(/Retirada sin reparar|Picked up without repair/);
    await expect(title.locator('.badge-entregado')).toHaveCount(0);

    // Comprobación en la base: estatus = entregado, retirada_sin_reparar = true, egreso de $100 sistema.
    const { data: ordenDb, error: ordenError } = await db
      .from('ordenes_trabajo')
      .select('estatus, retirada_sin_reparar')
      .eq('id', order.id)
      .single();
    if (ordenError) throw ordenError;
    expect(ordenDb.estatus).toBe('entregado');
    expect(ordenDb.retirada_sin_reparar).toBe(true);

    const { data: movimientos, error: movError } = await db
      .from('finanzas_movimientos')
      .select('tipo, monto, metodo_pago, origen')
      .eq('referencia_orden_id', order.id)
      .eq('tipo', 'egreso');
    if (movError) throw movError;
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0]).toMatchObject({ tipo: 'egreso', metodo_pago: 'efectivo', origen: 'sistema' });
    expect(Number(movimientos[0].monto)).toBe(100);
  });
});
