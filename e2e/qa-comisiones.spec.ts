import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  MECHANIC_EMAIL,
  MECHANIC_PASSWORD,
  TEST_DATA_PREFIX,
  hasAdminCredentials,
  hasMechanicCredentials,
  isLocalStack,
  login,
} from './fixtures.js';
import { adminClient, createTestOrder, type CreatedTestOrder } from './localData.js';

// COM-01: esquema por comisión (40%), orden entregada, aceptar y pagar en /payroll,
// comprobación en base y en /mis-comisiones del mecánico.

test.describe.configure({ mode: 'serial' });

test.describe('COM | Comisiones: aceptar y pagar', () => {
  test.skip(!isLocalStack, 'Solo contra la base local: entrega órdenes y paga comisiones');
  test.skip(!hasAdminCredentials || !hasMechanicCredentials, 'Requiere credenciales de admin y mecánico');

  let db: SupabaseClient;
  let mechanicId = '';
  let mechanicName = '';
  let order: CreatedTestOrder;

  test.beforeAll(async () => {
    db = await adminClient();

    const { data: mechProfile, error: mechError } = await db
      .from('perfiles')
      .select('id, nombre_completo')
      .eq('email', MECHANIC_EMAIL!)
      .single();
    if (mechError) throw mechError;
    mechanicId = mechProfile.id as string;
    mechanicName = mechProfile.nombre_completo as string;

    const { error: schemeError } = await db
      .from('perfiles_pago')
      .upsert(
        {
          usuario_id: mechanicId,
          esquema: 'comision',
          comision_porcentaje: 40,
          salario_monto: null,
          salario_periodo: null,
        },
        { onConflict: 'usuario_id' },
      );
    if (schemeError) throw schemeError;

    order = await createTestOrder(db, {
      label: 'Comision',
      labor: [
        {
          descripcion: `${TEST_DATA_PREFIX} Suspensión`,
          costo: 500,
          especialidad: 'mecanica',
          asignado_a: mechanicId,
          reparto_heredado: false,
        },
      ],
      authorized: true,
    });

    const { error: finError } = await db
      .from('ordenes_trabajo')
      .update({ estatus: 'finalizado', fecha_finalizacion: new Date().toISOString(), porcentaje_avance: 100 })
      .eq('id', order.id);
    if (finError) throw finError;

    const { error: readyError } = await db.rpc('marcar_lista_para_entregar', { p_orden_id: order.id });
    if (readyError) throw readyError;

    const { error: deliverError } = await db.rpc('entregar_orden', {
      p_orden_id: order.id,
      p_metodo: 'efectivo',
      p_numero_cheque: null,
      p_comprobante_ruta: null,
    });
    if (deliverError) throw deliverError;
  });

  test('COM-01 aceptar y pagar una comisión en efectivo y verla en Mis comisiones', async ({ page, browser }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto('/payroll');
    await expect(page.locator('.page-title')).toBeVisible({ timeout: 12000 });

    const card = page
      .locator('.card', { hasText: mechanicName })
      .filter({ has: page.locator('button.pay-balance-btn') })
      .first();
    await expect(card).toBeVisible({ timeout: 10000 });

    // Despliega el saldo del mecánico y comprueba que la comisión de la orden nace sugerida ($200.00 = 40% de $500).
    await card.locator('button.orders-section-toggle').click();
    const row = card.locator('tr', { hasText: order.numero });
    await expect(row).toBeVisible();
    await expect(row).toContainText(/Por aceptar|To accept/);
    await expect(row).toContainText('$200.00');

    // Aceptar la comisión de esta orden.
    await row.getByRole('button', { name: /^(Aceptar|Accept)$/ }).click();
    await expect(page.getByText(/Comisión aceptada|Commission accepted/)).toBeVisible({ timeout: 10000 });
    await expect(row).toContainText(/Aceptada|Accepted/);

    // Pagar en efectivo desde el diálogo.
    const payBtn = card.locator('button.pay-balance-btn');
    await expect(payBtn).toBeEnabled();
    await payBtn.click();

    const modal = page.locator('.modal').first();
    await expect(modal).toBeVisible();
    await modal.locator('#pay-method').selectOption('efectivo');
    await modal.getByRole('button', { name: /Registrar pago|Record payment/ }).click();
    await expect(page.getByText(/Pago registrado|Payment recorded/)).toBeVisible({ timeout: 10000 });
    await expect(modal).not.toBeVisible({ timeout: 10000 });

    // Base: comisión pagada, fila en comision_pagos y egreso en finanzas_movimientos ligado a la orden.
    const { data: comision, error: comError } = await db
      .from('comisiones')
      .select('id, estado, monto, pago_id')
      .eq('orden_id', order.id)
      .single();
    if (comError) throw comError;
    expect(comision.estado).toBe('aceptada');
    expect(Number(comision.monto)).toBe(200);
    expect(comision.pago_id).toBeTruthy();

    const pagoId = comision.pago_id as string;
    const { data: pago, error: pagoError } = await db
      .from('comision_pagos')
      .select('id, usuario_id, monto, metodo')
      .eq('id', pagoId)
      .single();
    if (pagoError) throw pagoError;
    expect(pago.usuario_id).toBe(mechanicId);
    expect(pago.metodo).toBe('efectivo');
    expect(Number(pago.monto)).toBeGreaterThanOrEqual(200);

    const { data: movimiento, error: movError } = await db
      .from('finanzas_movimientos')
      .select('tipo, categoria, monto, metodo_pago, origen, comision_pago_id')
      .eq('referencia_orden_id', order.id)
      .eq('comision_pago_id', pagoId)
      .single();
    if (movError) throw movError;
    expect(movimiento).toMatchObject({
      tipo: 'egreso',
      categoria: 'planilla',
      metodo_pago: 'efectivo',
      origen: 'sistema',
      comision_pago_id: pagoId,
    });
    expect(Number(movimiento.monto)).toBe(200);

    // Con la sesión del mecánico, /mis-comisiones muestra los $200.00 de esa orden.
    const mechContext = await browser.newContext();
    const mechPage = await mechContext.newPage();
    try {
      await login(mechPage, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
      await mechPage.goto('/mis-comisiones');
      await expect(mechPage.locator('.page-title')).toBeVisible({ timeout: 12000 });
      const paymentItem = mechPage.locator('.my-commissions-payment', { hasText: order.numero });
      await expect(paymentItem).toBeVisible({ timeout: 10000 });
      await expect(paymentItem).toContainText('$200.00');
    } finally {
      await mechContext.close();
    }
  });
});
