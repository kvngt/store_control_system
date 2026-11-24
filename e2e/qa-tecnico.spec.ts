import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MECHANIC_EMAIL,
  MECHANIC_PASSWORD,
  TEST_DATA_PREFIX,
  hasAdminCredentials,
  hasMechanicCredentials,
  isLocalStack,
  login,
} from './fixtures.js';
import { adminClient, clientFor, createTestOrder, userIdOf, type CreatedTestOrder } from './localData.js';

// TEC-01: el técnico ve su tarea y los repuestos por descripción, sin precios ni secciones de cobro,
// y por la API tampoco accede a `orden_montos`, `orden_repuestos` ni órdenes ajenas.
// TEC-02: el técnico asignado termina su orden desde la pantalla (hallazgo B-01, 16/11/2026): la base
// pone la fecha de finalización y la orden queda `finalizado`.

test.describe.configure({ mode: 'serial' });

test.describe('TEC | Técnico sin precios ni dinero', () => {
  test.skip(!isLocalStack, 'Solo contra la base local');
  test.skip(!hasAdminCredentials || !hasMechanicCredentials, 'Requiere credenciales de admin y mecánico');

  let adminDb: SupabaseClient;
  let assignedOrder: CreatedTestOrder;
  let unassignedOrder: CreatedTestOrder;
  let finishOrder: CreatedTestOrder;
  const laborDesc = `${TEST_DATA_PREFIX} Cambio de frenos`;
  const partDesc = `${TEST_DATA_PREFIX} Pastillas cerámicas`;

  test.beforeAll(async () => {
    adminDb = await adminClient();
    const mechanicId = await userIdOf(adminDb, MECHANIC_EMAIL!);

    assignedOrder = await createTestOrder(adminDb, {
      label: 'TecAsignada',
      labor: [{ descripcion: laborDesc, costo: 400, asignado_a: mechanicId, reparto_heredado: false }],
      parts: [{ descripcion: partDesc, cantidad: 1, precio_venta_unitario: 120 }],
      authorized: true,
    });

    unassignedOrder = await createTestOrder(adminDb, {
      label: 'TecAjena',
      labor: [{ descripcion: `${TEST_DATA_PREFIX} Trabajo ajeno`, costo: 250 }],
      authorized: true,
    });

    finishOrder = await createTestOrder(adminDb, {
      label: 'TecTermina',
      assignTo: mechanicId,
      labor: [{ descripcion: `${TEST_DATA_PREFIX} Cambio de aceite`, costo: 80, asignado_a: mechanicId, reparto_heredado: false }],
      authorized: true,
    });
  });

  test('TEC-01 el técnico no ve precios ni dinero en el detalle ni por la API', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await page.goto(`/work-orders?open=${assignedOrder.id}`);
    await expect(page.locator('h1.order-detail-title')).toContainText(assignedOrder.numero, { timeout: 10000 });

    // Pestañas del técnico (`TECH_TABS`: tareas, orden, avances); ninguna de cobro ni historial.
    await expect(page.locator('#order-detail-tab-tareas')).toBeVisible();
    await expect(page.locator('#order-detail-tab-orden')).toBeVisible();
    await expect(page.locator('#order-detail-tab-avances')).toBeVisible();
    await expect(page.locator('#order-detail-tab-cobro')).toHaveCount(0);
    await expect(page.locator('#order-detail-tab-historial')).toHaveCount(0);
    await expect(page.locator('#order-detail-tab-trabajos')).toHaveCount(0);
    await expect(page.locator('#order-detail-tab-resumen')).toHaveCount(0);

    // Ninguna sección de cobro ni historial (`TAB_SECTIONS` para técnico).
    await expect(page.locator('[data-section="totales"]')).toHaveCount(0);
    await expect(page.locator('[data-section="balance"]')).toHaveCount(0);
    await expect(page.locator('[data-section="enlace"]')).toHaveCount(0);
    await expect(page.locator('[data-section="historial"]')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Cobro y cliente|Billing & customer/ })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Historial|History/ })).toHaveCount(0);

    // En la pestaña Tareas la sección de tareas ya viene abierta (B-03) y ve su tarea por descripción.
    const tareasSection = page.locator('[data-section="tareas"]');
    await expect(tareasSection.locator('.collapsible-section-toggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(tareasSection).toContainText(laborDesc);

    // En la pestaña Orden abre Repuestos: aparece la descripción de la pieza, pero no "$120.00".
    await page.click('#order-detail-tab-orden');
    const repuestosSection = page.locator('[data-section="repuestos"]');
    await repuestosSection.locator('.collapsible-section-toggle').click();
    await expect(repuestosSection).toContainText(partDesc);
    await expect(page.locator('body')).not.toContainText('$120.00');
    await expect(page.locator('body')).not.toContainText('$120');

    // Por la API con la sesión del mecánico: sin montos, sin precios de repuestos, sin órdenes ajenas.
    const techDb = await clientFor(MECHANIC_EMAIL!, MECHANIC_PASSWORD!);

    const { data: montos } = await techDb
      .from('orden_montos')
      .select('total_general, deposito_inicial')
      .eq('orden_id', assignedOrder.id);
    expect(montos ?? []).toHaveLength(0);

    const { data: repuestos, error: repError } = await techDb
      .from('orden_repuestos')
      .select('id, precio_venta_unitario')
      .eq('orden_id', assignedOrder.id);
    if (!repError) {
      expect(repuestos ?? []).toHaveLength(0);
    }

    const { data: ajena, error: ajenaError } = await techDb
      .from('ordenes_trabajo')
      .select('id')
      .eq('id', unassignedOrder.id);
    expect(ajenaError).toBeNull();
    expect(ajena ?? []).toHaveLength(0);
  });

  test('TEC-02 el técnico termina su orden por la pantalla y la base fija la fecha de finalización', async ({ page }) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await page.goto(`/work-orders?open=${finishOrder.id}`);
    await expect(page.locator('h1.order-detail-title')).toContainText(finishOrder.numero, { timeout: 10000 });

    // Marca su única tarea como realizada (el botón verde de la tarea).
    // «Tareas» ya viene abierta para el técnico (B-03): no se vuelve a tocar su flecha.
    const tareasSection = page.locator('[data-section="tareas"]');
    await expect(tareasSection.locator('.collapsible-section-toggle')).toHaveAttribute('aria-expanded', 'true');
    await tareasSection.getByRole('button', { name: /^(Realizado|Done)$/ }).click();

    // Con todo hecho, el botón principal pasa a «Terminé: avisar a la oficina».
    const terminar = page.getByRole('button', { name: /Terminé: avisar a la oficina|Done: let the office know/ });
    await expect(terminar).toBeVisible({ timeout: 10000 });
    await terminar.click();

    // La orden queda finalizada y la base puso la fecha (la app manda la suya y la base la ignora).
    await expect
      .poll(
        async () => {
          const { data } = await adminDb
            .from('ordenes_trabajo')
            .select('estatus, fecha_finalizacion')
            .eq('id', finishOrder.id)
            .single();
          return data?.estatus === 'finalizado' && data.fecha_finalizacion !== null;
        },
        { timeout: 15000 },
      )
      .toBe(true);
  });
});
