import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  TEST_DATA_PREFIX,
  hasAdminCredentials,
  isLocalStack,
  login,
} from './fixtures.js';

// COB-01…03: los diálogos que mueven dinero, de punta a punta contra la base LOCAL.
// Entregan órdenes y asientan movimientos, así que nunca corren contra el proyecto real
// (`npm run test:e2e` las salta; `npm run test:e2e:local` las corre).
//
// La orden se prepara por la API (más rápido y estable que recorrer el alta cada vez) y lo que
// se prueba por la interfaz es lo que hace la persona en el mostrador: el anticipo con cheque,
// la entrega con su método y el depósito del alta. Lo que queda en la base se comprueba al final
// con la misma sesión de administración.

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';

// Una imagen JPEG mínima para el comprobante (el campo acepta image/* y PDF).
const RECEIPT = {
  name: 'comprobante.jpg',
  mimeType: 'image/jpeg',
  buffer: Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    'base64',
  ),
};

test.describe.configure({ mode: 'serial' });

test.describe('COB | Cobros: anticipo, entrega y depósito del alta', () => {
  test.skip(!isLocalStack, 'Solo contra la base local: entrega órdenes y asienta dinero');
  test.skip(!hasAdminCredentials, 'Requiere credenciales de admin');

  let db: SupabaseClient;
  let orderId = '';
  let orderNumber = '';

  test.beforeAll(async () => {
    db = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { data: auth, error: authError } = await db.auth.signInWithPassword({
      email: ADMIN_EMAIL!,
      password: ADMIN_PASSWORD!,
    });
    if (authError) throw authError;
    const userId = auth.user.id;
    const { data: perfil, error: perfilError } = await db.from('perfiles').select('sede_id').eq('id', userId).single();
    if (perfilError) throw perfilError;
    const sedeId = perfil.sede_id as string;

    const tag = `${Date.now()}`.slice(-7);
    const { data: cliente, error: clienteError } = await db
      .from('clientes')
      // Sin correo, como la app: la columna guarda '' (el cliente puede no tener correo).
      .insert({ sede_id: sedeId, nombre: `${TEST_DATA_PREFIX} Cobro ${tag}`, telefono: `+1410${tag}`, email: '', direccion: '' })
      .select('id')
      .single();
    if (clienteError) throw clienteError;
    const { data: vehiculo, error: vehiculoError } = await db
      .from('vehiculos')
      .insert({ sede_id: sedeId, cliente_id: cliente.id, marca: 'Toyota', modelo: 'Camry', anio: 2019, color: 'Gris', vin: '', placa: `PW${tag}`, placa_estado: 'MD' })
      .select('id')
      .single();
    if (vehiculoError) throw vehiculoError;

    // Una tarea de $400 autorizada en el mostrador: la orden queda en proceso y con algo que cobrar.
    const { data: orden, error: ordenError } = await db.rpc('create_work_order', {
      p_order: {
        sede_id: sedeId,
        cliente_id: cliente.id,
        vehiculo_id: vehiculo.id,
        tipo_trabajo: 'mecanica',
        millas_ingreso: 1000,
        nivel_gasolina: '1/2',
        deposito_inicial: 0,
        inspeccion_360_notas: '',
        fecha_estimada_entrega: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
        creado_por: userId,
        autorizado_en_recepcion: true,
      },
      p_labor: [{ descripcion: `${TEST_DATA_PREFIX} Frenos`, costo: 400, especialidad: 'mecanica', reparto_heredado: false }],
      p_parts: [],
      p_assignments: [],
    });
    if (ordenError) throw ordenError;
    orderId = (orden as { id: string }).id;
    orderNumber = (orden as { numero_orden: string }).numero_orden;
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
    await page.goto('/work-orders');
    await page.click('#new-order-btn');
    const modal = page.locator('.modal').first();
    const next = () => modal.getByRole('button', { name: /Siguiente|Next/ }).click();

    const tag = `${Date.now()}`.slice(-7);
    await page.locator('#intake-customer').selectOption({ label: '+ Nuevo Cliente' });
    await modal.getByPlaceholder(/Nombre|Name/).first().fill(`${TEST_DATA_PREFIX} Alta ${tag}`);
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
