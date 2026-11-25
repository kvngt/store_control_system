import { test, expect } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  TEST_DATA_PREFIX,
  hasAdminCredentials,
  isLocalStack,
  login,
  chooseNewCustomerInIntake,
  openIntakeDialog,
} from './fixtures.js';
import { RECEIPT, adminClient, createTestOrder } from './localData.js';

// COB-01…03: los diálogos que mueven dinero, de punta a punta contra la base LOCAL.
// Entregan órdenes y asientan movimientos, así que nunca corren contra el proyecto real
// (`npm run test:e2e` las salta; `npm run test:e2e:local` las corre).
//
// La orden se prepara por la API (más rápido y estable que recorrer el alta cada vez) y lo que
// se prueba por la interfaz es lo que hace la persona en el mostrador: el anticipo con cheque,
// la entrega con su método y el depósito del alta. Lo que queda en la base se comprueba al final
// con la misma sesión de administración.

test.describe.configure({ mode: 'serial' });

test.describe('COB | Cobros: anticipo, entrega y depósito del alta', () => {
  test.skip(!isLocalStack, 'Solo contra la base local: entrega órdenes y asienta dinero');
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');

  let db: SupabaseClient;
  let orderId = '';
  let orderNumber = '';

  test.beforeAll(async () => {
    db = await adminClient();
    // Una tarea de $400 autorizada en el mostrador: la orden queda en proceso y con algo que cobrar.
    const orden = await createTestOrder(db, {
      label: 'Cobro',
      labor: [{ descripcion: `${TEST_DATA_PREFIX} Frenos`, costo: 400 }],
      authorized: true,
    });
    orderId = orden.id;
    orderNumber = orden.numero;
  });

  const movimientos = async () => {
    const { data, error } = await db
      .from('finanzas_movimientos')
      .select('tipo, monto, metodo_pago, numero_cheque, comprobante_ruta, origen')
      .eq('referencia_orden_id', orderId)
      .order('creado_en', { ascending: true });
    if (error) throw error;
    return data;
  };

  test('COB-01 un anticipo con cheque pide número o foto, y con la foto sola entra', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto(`/work-orders?open=${orderId}`);
    await page.getByRole('button', { name: /Registrar anticipo|Record advance payment/ }).first().click();

    await page.fill('#advance-amount', '100');
    await page.locator('#payment-method').selectOption('cheque');
    await page.click('#advance-submit');
    await expect(page.getByText(/Anota el número del cheque o sube su foto|check number or upload/i)).toBeVisible();

    await page.locator('#payment-receipt').setInputFiles(RECEIPT);
    await page.click('#advance-submit');
    await expect(page.getByText(/Anticipo de \$100\.00 registrado|Advance payment of \$100\.00 recorded/)).toBeVisible({ timeout: 10000 });

    const rows = await movimientos();
    const anticipo = rows.find((m) => Number(m.monto) === 100);
    expect(anticipo, 'el anticipo quedó en Finanzas').toBeTruthy();
    expect(anticipo).toMatchObject({ tipo: 'ingreso', metodo_pago: 'cheque', numero_cheque: null, origen: 'sistema' });
    expect(anticipo!.comprobante_ruta).toBeTruthy();
  });

  test('COB-02 entregar cobra el saldo con su método y cierra la orden', async ({ page }) => {
    // Terminada y confirmada como lista: es cuando aparece «Entregar y cobrar».
    const { error: finError } = await db.from('ordenes_trabajo').update({ estatus: 'finalizado' }).eq('id', orderId);
    if (finError) throw finError;
    const { error: readyError } = await db.rpc('marcar_lista_para_entregar', { p_orden_id: orderId });
    if (readyError) throw readyError;

    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await page.goto(`/work-orders?open=${orderId}`);
    await page.getByRole('button', { name: /Entregar y cobrar|Deliver and charge/ }).first().click();

    // Sin método no se entrega: el saldo es de $300 ($400 − $100 de anticipo).
    await page.click('#delivery-submit');
    await expect(page.getByText(/Elige cómo pagó|Choose how/i).first()).toBeVisible();
    await page.locator('#payment-method').selectOption('efectivo');
    await page.click('#delivery-submit');
    await expect(page.getByText(/Orden entregada|Order delivered/)).toBeVisible({ timeout: 10000 });

    const { data: orden, error } = await db.from('ordenes_trabajo').select('estatus').eq('id', orderId).single();
    if (error) throw error;
    expect(orden.estatus).toBe('entregado');
    const cobro = (await movimientos()).find((m) => m.metodo_pago === 'efectivo');
    expect(cobro, 'el cobro de la entrega quedó en Finanzas').toBeTruthy();
    expect(cobro).toMatchObject({ tipo: 'ingreso', origen: 'sistema' });
    expect(Number(cobro!.monto)).toBe(300);
  });

  test('COB-03 el depósito del alta con cheque entra con la foto sola', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    // ~25 pasos por la interfaz, cada uno de 1 a 5 s con la suite en paralelo y Vite en desarrollo.
    test.setTimeout(120_000);
    const modal = await openIntakeDialog(page);
    const next = () => modal.getByRole('button', { name: /Siguiente|Next/ }).click();

    const tag = `${Date.now()}`.slice(-7);
    // Un solo clic, con el diálogo ya listo (`openIntakeDialog`): «Nuevo cliente» cambia el panel y el
    // botón desaparece en cuanto el clic entra, así que reintentarlo a ciegas fallaba aunque hubiera entrado.
    const nameInput = await chooseNewCustomerInIntake(page, modal);
    await nameInput.fill(`${TEST_DATA_PREFIX} Alta ${tag}`);
    await modal.locator('input[type="tel"]').first().fill(`410${tag}`);
    await next();
    await page.fill('#vehicle-brand', 'Honda');
    await page.fill('#vehicle-model', 'Civic');
    await page.locator('#vehicle-year').selectOption('2020');
    await page.fill('#vehicle-plate', `PA${tag}`);
    await page.fill('#order-miles-in', '20000');
    await next();
    await page.click('#create-order-open');
    await page.fill('#create-order-description', `${TEST_DATA_PREFIX} Diagnóstico`);
    await page.fill('#create-order-price', '150');
    await page.click('#create-order-submit');
    await next();

    await page.fill('#order-deposit', '50');
    await page.locator('#payment-method').selectOption('cheque');
    await modal.locator('button[type="submit"]').click();
    // Sin número ni foto: avisa y marca el campo del cheque.
    await expect(modal.getByText(/Anota el número del cheque o sube su foto|check number or upload/i)).toBeVisible();
    await expect(page.locator('#payment-check')).toHaveAttribute('aria-invalid', 'true');

    await page.locator('#payment-receipt').setInputFiles(RECEIPT);
    await modal.locator('button[type="submit"]').click();
    const toast = page.getByText(/Orden creada exitosamente \((ORD-[0-9-]+)\)|Order created/);
    await expect(toast).toBeVisible({ timeout: 15000 });
    const numero = /\((ORD-[0-9-]+)\)/.exec((await toast.innerText()) ?? '')?.[1];
    expect(numero, 'el aviso dice el número de la orden').toBeTruthy();

    const { data: creada, error } = await db.from('ordenes_trabajo').select('id').eq('numero_orden', numero!).single();
    if (error) throw error;
    const { data: deposito, error: depError } = await db
      .from('finanzas_movimientos')
      .select('monto, metodo_pago, numero_cheque, comprobante_ruta')
      .eq('referencia_orden_id', creada.id)
      .single();
    if (depError) throw depError;
    expect(deposito).toMatchObject({ metodo_pago: 'cheque', numero_cheque: null });
    expect(Number(deposito.monto)).toBe(50);
    expect(deposito.comprobante_ruta).toBeTruthy();
    // La orden del anticipo y la entrega no estorba: cada prueba usa su propia orden.
    expect(orderNumber).not.toBe(numero);
  });
});
