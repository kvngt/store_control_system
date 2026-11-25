import { statSync, writeFileSync } from 'node:fs';
import { test, expect, type BrowserContext } from '@playwright/test';
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
  chooseNewCustomerInIntake,
  openIntakeDialog,
} from './fixtures.js';
import { adminClient, userIdOf } from './localData.js';

// Q5 Fase A: "Un día en el taller", recorrido completo por la interfaz contra la base local.
// Cubre recepción (cliente nuevo en inglés, vehículo nuevo, mano de obra asignada y repuesto),
// envío del presupuesto y respuesta parcial en el portal (390 px), ejecución del técnico (390 px,
// botones >= 44 px, sin precios ni entrega), cierre/cobro por Zelle en escritorio y verificación
// final en Finanzas, el enlace del cliente y la descarga del PDF.

// 44 px menos la tolerancia de subpíxeles: el motor llegó a medir 43,9999 en un botón de 44.
const MIN_TOUCH_TARGET = 43.9;

test.describe.configure({ mode: 'serial' });

test.describe('Q5 | Un día en el taller', () => {
  test.skip(!isLocalStack, 'Solo contra la base local: entrega órdenes y asienta dinero');
  test.skip(!hasAdminCredentials || !hasMechanicCredentials, 'Requiere credenciales de admin y mecánico');

  test('recorre un día completo en el taller de punta a punta', async ({ page, browser }, testInfo) => {
    test.setTimeout(240_000);

    const adminDb: SupabaseClient = await adminClient();
    const mechanicId = await userIdOf(adminDb, MECHANIC_EMAIL!);

    const now = Date.now();
    const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const workerDigit = testInfo.workerIndex % 10;
    const repeatDigit = testInfo.repeatEachIndex % 10;
    const tag = `${now.toString().slice(-4)}${rand}${workerDigit}${repeatDigit}`;
    const phoneDigits = `410${now.toString().slice(-3)}${workerDigit}${repeatDigit}${rand.slice(0, 2)}`;
    const plate = `PW${now.toString(36).slice(-3).toUpperCase()}${(testInfo.workerIndex % 36).toString(36).toUpperCase()}${(testInfo.repeatEachIndex % 36).toString(36).toUpperCase()}${Math.floor(Math.random() * 36).toString(36).toUpperCase()}`;

    const customerName = `${TEST_DATA_PREFIX} Taller ${tag}`;
    const laborDesc = `${TEST_DATA_PREFIX} Cambio de frenos ${tag}`;
    const laborPrice = 220;
    const partDesc = `${TEST_DATA_PREFIX} Pastillas extra ${tag}`;
    const partPrice = 95;
    const progressNote = `${TEST_DATA_PREFIX} Front brakes replaced and tested ${tag}`;
    const signerName = `${TEST_DATA_PREFIX} Customer ${tag}`;

    let orderId = '';
    let numero = '';
    let portalToken = '';
    let appOrigin = '';
    let customerCtx: BrowserContext | undefined;
    let techCtx: BrowserContext | undefined;

    try {
      await test.step('1. Recepción del vehículo con cliente nuevo en inglés y cotización sin autorizar', async () => {
        await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
        appOrigin = new URL(page.url()).origin;

        const modal = await openIntakeDialog(page);
        const clickNext = () => modal.getByRole('button', { name: /Siguiente|Next/ }).click();

        // Paso 1: cliente nuevo solo con nombre, teléfono e idioma inglés.
        const nameInput = await chooseNewCustomerInIntake(page, modal);
        await nameInput.fill(customerName);
        await modal.locator('#intake-new-customer-phone').fill(phoneDigits);
        const englishBtn = modal.getByRole('button', { name: 'English', exact: true });
        await englishBtn.click();
        await expect(englishBtn).toHaveAttribute('aria-pressed', 'true');
        await clickNext();

        // Paso 2: vehículo nuevo con placa única.
        const brandInput = modal.getByLabel(/Marca|Brand/);
        await expect(brandInput).toBeVisible({ timeout: 15000 });
        await brandInput.fill('Toyota');
        await modal.getByRole('option', { name: 'Toyota', exact: true }).click();

        const modelInput = modal.getByLabel(/Modelo|Model/);
        await modelInput.fill('Camry');
        await modal.getByRole('option', { name: 'Camry', exact: true }).click();

        await modal.getByLabel(/Año|Year/).selectOption('2021');
        await modal.getByLabel(/^(Placa|Plate)$/).fill(plate);
        await modal.getByLabel(/Millas de Ingreso|Miles In/i).fill('45000');
        await clickNext();

        // Paso 3: una tarea asignada al mecánico, un repuesto y sin marcar "autorizado en recepción".
        await modal.getByRole('button', { name: /Agregar trabajo|Add job/ }).click();
        const taskGroup = modal.getByRole('group', { name: /Nuevo trabajo|New job/ });
        await expect(taskGroup).toBeVisible({ timeout: 10000 });
        await taskGroup.getByLabel(/Descripción|Description/).fill(laborDesc);
        await taskGroup.getByLabel(/Precio|Price/).fill(String(laborPrice));
        await taskGroup.getByLabel(/Técnico|Technician/).selectOption(mechanicId);
        await taskGroup.getByRole('button', { name: /^(Agregar|Add)$/ }).click();
        await expect(modal.getByText(laborDesc, { exact: true }).first()).toBeVisible({ timeout: 10000 });

        await modal.getByRole('button', { name: /Agregar repuesto|Add part/ }).click();
        const partGroup = modal.getByRole('group', { name: /Nuevo repuesto|New part/ });
        await expect(partGroup).toBeVisible({ timeout: 10000 });
        await partGroup.getByLabel(/Descripción|Description/).fill(partDesc);
        await partGroup.getByLabel(/Precio unitario|Unit price/).fill(String(partPrice));
        await partGroup.getByRole('button', { name: /^(Agregar|Add)$/ }).click();
        await expect(modal.getByText(partDesc, { exact: true }).first()).toBeVisible({ timeout: 10000 });

        const authAtIntake = modal.getByRole('checkbox', {
          name: /El cliente aceptó estos trabajos y precios|The customer accepted this work and these prices/,
        });
        await expect(authAtIntake).not.toBeChecked();
        await clickNext();

        // Paso 4: sin depósito -> Crear.
        const depositInput = modal.getByLabel(/Depósito|Deposit/i);
        await expect(depositInput).toBeVisible({ timeout: 10000 });
        await expect(depositInput).toHaveValue('0');
        await modal.getByRole('button', { name: /^(Crear|Create)$/ }).click();

        const createdToast = page.getByText(
          /(?:Orden creada exitosamente|Order created successfully) \((ORD-[0-9-]+)\)/,
        );
        await expect(createdToast).toBeVisible({ timeout: 25000 });
        numero = /\((ORD-[0-9-]+)\)/.exec((await createdToast.innerText()) ?? '')?.[1] ?? '';
        expect(numero, 'el aviso de creación debe traer el número ORD-...').toMatch(/^ORD-[0-9-]+$/);

        const { data: ordenRow, error: ordenErr } = await adminDb
          .from('ordenes_trabajo')
          .select('id, estatus')
          .eq('numero_orden', numero)
          .single();
        expect(ordenErr).toBeNull();
        expect(ordenRow?.estatus).toBe('recepcion');
        orderId = ordenRow!.id as string;

        const { data: linkRow, error: linkErr } = await adminDb
          .from('orden_enlaces')
          .select('token')
          .eq('orden_id', orderId)
          .is('revocado_en', null)
          .single();
        expect(linkErr).toBeNull();
        portalToken = linkRow!.token as string;
        expect(portalToken).toMatch(/^[0-9a-f]{64}$/);
      });

      await test.step('2. Envío de presupuesto y autorización parcial del cliente en su enlace (390 px)', async () => {
        await expect(page.getByRole('heading', { name: new RegExp(numero) })).toBeVisible({ timeout: 15000 });

        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: /Enviar presupuesto|Send estimate/ }).click();
        await expect(
          page.getByText(/Presupuesto listo, pero el cliente no tiene correo|Estimate ready, but the customer has no email/),
        ).toBeVisible({ timeout: 20000 });

        customerCtx = await browser.newContext({
          baseURL: appOrigin,
          viewport: { width: 390, height: 844 },
        });
        const customerPage = await customerCtx.newPage();

        await customerPage.goto(`/r/${portalToken}`);
        await expect(customerPage.getByRole('heading', { name: 'Estimate to approve' })).toBeVisible({ timeout: 25000 });

        // Aprueba la tarea y deja el repuesto sin marcar (rechazado).
        const laborCheckbox = customerPage.getByRole('checkbox', { name: new RegExp(laborDesc) });
        await laborCheckbox.check();
        await expect(laborCheckbox).toBeChecked();
        await expect(customerPage.getByRole('checkbox', { name: new RegExp(partDesc) })).not.toBeChecked();

        await customerPage.getByLabel('Your name').fill(signerName);
        await customerPage.getByRole('button', { name: /Approve checked items/ }).click();

        const confirmDialog = customerPage.getByRole('dialog', { name: 'Confirm approval' });
        await expect(confirmDialog).toBeVisible({ timeout: 10000 });
        await expect(confirmDialog).toContainText(`$${laborPrice}.00`);
        await confirmDialog.getByRole('button', { name: 'Approve', exact: true }).click();

        await expect(
          customerPage.getByText('Thank you. We saved your response and the shop has been notified.'),
        ).toBeVisible({ timeout: 20000 });
        await expect(customerPage.getByText(`You approved work for $${laborPrice}.00`)).toBeVisible({ timeout: 15000 });
        await expect(customerPage.getByText('Not approved (not done or charged)').first()).toBeVisible({ timeout: 10000 });
        await expect(customerPage.getByText(partDesc).first()).toBeVisible({ timeout: 10000 });

        await expect
          .poll(
            async () => {
              const { data, error } = await adminDb
                .from('ordenes_trabajo')
                .select('estatus')
                .eq('id', orderId)
                .single();
              if (error) throw error;
              return data.estatus;
            },
            { timeout: 20000, message: 'La orden no pasó sola a en_proceso tras aprobar' },
          )
          .toBe('en_proceso');
      });

      techCtx = await browser.newContext({
        baseURL: appOrigin,
        viewport: { width: 390, height: 844 },
      });
      const techPage = await techCtx.newPage();

      await test.step('3. El técnico ve la orden en Mis tareas, marca realizada, sube avance con foto y termina', async () => {
        await login(techPage, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);

        const myTasksRegion = techPage.getByRole('region', { name: /Mis tareas|My tasks/ });
        await expect(myTasksRegion).toBeVisible({ timeout: 20000 });
        const myTaskBtn = myTasksRegion.getByRole('button', { name: new RegExp(numero) }).first();
        await expect(myTaskBtn).toBeVisible({ timeout: 15000 });
        await myTaskBtn.click();

        await expect(techPage.getByRole('heading', { name: new RegExp(numero) })).toBeVisible({ timeout: 15000 });

        // Al entrar al detalle, "Tareas" ya viene abierta.
        const tareasSection = techPage.locator('[data-section="tareas"]');
        const tareasToggle = tareasSection.getByRole('button', { name: /Tareas|Tasks/ }).first();
        await expect(tareasToggle).toHaveAttribute('aria-expanded', 'true', { timeout: 10000 });

        // Marca la tarea "Realizado" (botón >= 44 px) y verifica que sigue visible como hecha.
        const doneBtn = tareasSection.getByRole('button', { name: /^(Realizado|Done)$/ });
        await expect(doneBtn).toBeVisible({ timeout: 15000 });
        const doneBox = await doneBtn.boundingBox();
        expect(doneBox?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
        await doneBtn.click();

        await expect(tareasSection.getByText(laborDesc)).toBeVisible({ timeout: 15000 });
        await expect(tareasSection.getByRole('button', { name: /Reabrir tarea|Reopen task/ })).toBeVisible({
          timeout: 15000,
        });

        // Registra un avance visible para el cliente con foto real generada en canvas y guardada a disco.
        const jpegDataUrl = await techPage.evaluate<string>(`(() => {
          const canvas = document.createElement('canvas');
          canvas.width = 4;
          canvas.height = 4;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ebc334';
            ctx.fillRect(0, 0, 4, 4);
          }
          return canvas.toDataURL('image/jpeg', 0.85);
        })()`);
        const photoPath = testInfo.outputPath(`avance-${tag}.jpg`);
        writeFileSync(photoPath, Buffer.from(jpegDataUrl.split(',')[1] ?? '', 'base64'));

        const addProgressBtn = tareasSection.getByRole('button', { name: /^(Agregar avance|Add update)$/ });
        await expect(addProgressBtn).toBeVisible({ timeout: 10000 });
        const addProgressBox = await addProgressBtn.boundingBox();
        expect(addProgressBox?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
        await addProgressBtn.click();

        const progressModal = techPage.locator('.modal[role="dialog"]');
        await expect(progressModal).toBeVisible({ timeout: 10000 });
        await progressModal
          .getByPlaceholder(/Describe el trabajo realizado|Describe the work done/)
          .fill(progressNote);

        const galleryInput = progressModal.locator('input[type="file"]:not([capture])');
        await galleryInput.setInputFiles(photoPath);
        // La miniatura de la foto ya comprimida (su botón lleva el nombre «Foto»; el que elige archivos dice igual
    // pero no tiene `aria-label`): comprueba que el archivo de verdad quedó adjunto antes de guardar.
        await expect(progressModal.locator('button[aria-label="Foto"], button[aria-label="Photo"]')).toBeVisible({
          timeout: 15000,
        });

        const visibleCheckbox = progressModal.getByRole('checkbox', {
          name: /Visible para el cliente|Visible to the customer/,
        });
        await visibleCheckbox.check();
        await expect(visibleCheckbox).toBeChecked();

        const saveProgressBtn = progressModal.getByRole('button', { name: /^(Guardar|Save)$/ });
        const saveBox = await saveProgressBtn.boundingBox();
        expect(saveBox?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
        await saveProgressBtn.click();

        await expect(techPage.getByText(/Avance registrado|Progress recorded/)).toBeVisible({ timeout: 15000 });
        await expect(techPage.getByText(/1 de 1 archivos subidos|1 of 1 files uploaded/)).toBeVisible({
          timeout: 30000,
        });

        let avanceId = '';
        await expect
          .poll(
            async () => {
              const { data, error } = await adminDb
                .from('orden_avances')
                .select('id, visible_cliente')
                .eq('orden_id', orderId)
                .eq('descripcion', progressNote);
              if (error) throw error;
              if (data.length > 0) avanceId = data[0].id as string;
              return data.length === 1 && data[0].visible_cliente === true;
            },
            { timeout: 15000, message: 'No apareció el avance visible_cliente en orden_avances' },
          )
          .toBe(true);

        await expect
          .poll(
            async () => {
              const { data, error } = await adminDb
                .from('orden_media')
                .select('id')
                .eq('orden_id', orderId)
                .eq('avance_id', avanceId);
              if (error) throw error;
              return data.length;
            },
            { timeout: 15000, message: 'No apareció la foto del avance en orden_media' },
          )
          .toBe(1);

        // Termina la orden con "Terminé: avisar a la oficina" (botón >= 44 px).
        const finishBtn = techPage.getByRole('button', {
          name: /Terminé: avisar a la oficina|Done: let the office know/,
        });
        await expect(finishBtn).toBeVisible({ timeout: 15000 });
        const finishBox = await finishBtn.boundingBox();
        expect(finishBox?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
        await finishBtn.click();

        await expect
          .poll(
            async () => {
              const { data, error } = await adminDb
                .from('ordenes_trabajo')
                .select('estatus')
                .eq('id', orderId)
                .single();
              if (error) throw error;
              return data.estatus;
            },
            { timeout: 20000, message: 'La orden no quedó en finalizado' },
          )
          .toBe('finalizado');
      });

      await test.step('3b. Permisos del técnico: sin precios ni botones de entrega', async () => {
        const pageBody = techPage.locator('body');
        await expect(pageBody).not.toContainText(`$${laborPrice}.00`);
        await expect(pageBody).not.toContainText(`$${laborPrice}`);
        await expect(pageBody).not.toContainText(`$${partPrice}.00`);
        await expect(pageBody).not.toContainText(`$${partPrice}`);

        await expect(
          techPage.getByRole('button', { name: /Entregar y cobrar|Deliver and charge/ }),
        ).toHaveCount(0);
        await expect(
          techPage.getByRole('button', { name: /Marcar listo para entregar|Mark ready for pickup/ }),
        ).toHaveCount(0);
        await expect(techPage.locator('[data-section="totales"]')).toHaveCount(0);
      });

      await test.step('4. Administración revisa, marca lista, entrega y cobra por Zelle', async () => {
        await page.goto('/panel');
        const attention = page.getByRole('region', { name: /Requiere atención|Needs attention/ });
        await expect(attention).toBeVisible({ timeout: 20000 });

        const attentionOrderBtn = attention.getByRole('button', { name: numero }).first();
        const inAttention = await attentionOrderBtn
          .waitFor({ state: 'visible', timeout: 5000 })
          .then(() => true, () => false);

        if (inAttention) {
          await attentionOrderBtn.click();
        } else {
          await page.goto('/work-orders');
          const searchInput = page.getByPlaceholder(/Buscar|Search/).first();
          await expect(searchInput).toBeVisible({ timeout: 15000 });
          await searchInput.fill(numero);
          const listOrderBtn = page.getByRole('button', { name: numero }).first();
          await expect(listOrderBtn).toBeVisible({ timeout: 15000 });
          await listOrderBtn.click();
        }

        await expect(page.getByRole('heading', { name: new RegExp(numero) })).toBeVisible({ timeout: 15000 });

        // El botón principal es "Marcar listo para entregar".
        const toolbar = page.getByRole('toolbar', { name: /Acciones rápidas|Quick actions/ });
        const primaryAction = toolbar.getByRole('button').first();
        await expect(primaryAction).toHaveAccessibleName(/Marcar listo para entregar|Mark ready for pickup/, {
          timeout: 15000,
        });
        await primaryAction.click();

        await expect(page.getByText(/Lista para entregar|Ready for pickup/).first()).toBeVisible({ timeout: 15000 });
        // Como el cliente no tiene correo, se abre el diálogo para avisarle por WhatsApp/SMS: cerrarlo.
        const readyDialog = page.getByRole('dialog', {
          name: /Avísale al cliente|Let the customer know/,
        });
        await expect(readyDialog).toBeVisible({ timeout: 10000 });
        await readyDialog.getByRole('button', { name: /Cerrar|Close/ }).first().click();
        await expect(readyDialog).toBeHidden({ timeout: 10000 });

        // Entregar y cobrar con método zelle.
        const deliverBtn = page.getByRole('button', { name: /Entregar y cobrar|Deliver and charge/ }).first();
        await expect(deliverBtn).toBeVisible({ timeout: 15000 });
        await deliverBtn.click();

        await expect(page.locator('#payment-method')).toBeEnabled({ timeout: 15000 });
        await page.locator('#payment-method').selectOption('zelle');
        await page.locator('#delivery-submit').click();

        await expect(page.getByText(/Orden entregada|Order delivered/)).toBeVisible({ timeout: 20000 });
        await expect(page.getByRole('heading', { name: /Entregado|Delivered/ })).toBeVisible({ timeout: 15000 });

        // Saldo en $0.00 en la pestaña Cobro y cliente -> Totales.
        await page.locator('#order-detail-tab-cobro').click();
        const totalesSection = page.locator('[data-section="totales"]');
        await expect(totalesSection).toBeVisible({ timeout: 15000 });
        const totalesToggle = totalesSection.getByRole('button').first();
        if ((await totalesToggle.getAttribute('aria-expanded')) !== 'true') {
          await totalesToggle.click();
        }
        await expect(totalesSection).toContainText(/Saldo pendiente|Balance due/, { timeout: 15000 });
        await expect(totalesSection).toContainText('$0.00', { timeout: 15000 });

        // Comparación en base local (centavos enteros): total autorizado vs movimientos de ingreso.
        const { data: montosRow, error: montosErr } = await adminDb
          .from('orden_montos')
          .select('total_general, total_repuestos')
          .eq('orden_id', orderId)
          .single();
        expect(montosErr).toBeNull();
        const totalAuthorizedCents = Math.round(Number(montosRow!.total_general) * 100);
        expect(totalAuthorizedCents).toBe(laborPrice * 100);
        expect(Math.round(Number(montosRow!.total_repuestos) * 100)).toBe(0);

        const { data: movs, error: movsErr } = await adminDb
          .from('finanzas_movimientos')
          .select('tipo, monto, metodo_pago')
          .eq('referencia_orden_id', orderId);
        expect(movsErr).toBeNull();
        const incomeCents = (movs ?? [])
          .filter((m) => m.tipo === 'ingreso')
          .reduce((acc, m) => acc + Math.round(Number(m.monto) * 100), 0);
        expect(incomeCents).toBe(totalAuthorizedCents);
      });

      await test.step('5. Verificación en Finanzas, portal del cliente (390 px) y descarga del PDF', async () => {
        // (a) Finanzas (/finance): aparece el ingreso de la orden con método Zelle.
        await page.goto('/finance');
        const txnRow = page
          .getByRole('row')
          .filter({ hasText: numero })
          .filter({ hasText: /Zelle/i })
          .first();
        await expect(txnRow).toBeVisible({ timeout: 20000 });
        await expect(txnRow).toContainText(/Ingresos|Income/);
        await expect(txnRow).toContainText(`+$${laborPrice.toFixed(2)}`);

        // (b) Portal del cliente (/r/<token>, 390 px): dice "Picked up", muestra el avance y oculta al técnico.
        const { data: mechProfile, error: mechErr } = await adminDb
          .from('perfiles')
          .select('nombre_completo')
          .eq('id', mechanicId)
          .single();
        expect(mechErr).toBeNull();
        const mechanicName = (mechProfile!.nombre_completo as string).trim();
        expect(mechanicName.length).toBeGreaterThan(0);

        const portalPage = await customerCtx!.newPage();
        await portalPage.goto(`/r/${portalToken}`);
        await expect(portalPage.getByText('Picked up').first()).toBeVisible({ timeout: 25000 });
        await expect(portalPage.getByText(progressNote)).toBeVisible({ timeout: 15000 });
        await expect(portalPage.getByRole('main')).not.toContainText(mechanicName);

        // (c) Descarga del PDF sin error desde el detalle de la orden.
        await page.goto(`/work-orders?open=${orderId}`);
        await expect(page.getByRole('heading', { name: new RegExp(numero) })).toBeVisible({ timeout: 15000 });

        const pdfBtn = page.getByRole('button', { name: /Descargar PDF|Download PDF/ }).first();
        await expect(pdfBtn).toBeVisible({ timeout: 15000 });
        const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
        await pdfBtn.click();
        const download = await downloadPromise;
        expect(download.suggestedFilename().toLowerCase()).toMatch(/\.pdf$/);

        const pdfPath = testInfo.outputPath(`${numero}.pdf`);
        await download.saveAs(pdfPath);
        expect(statSync(pdfPath).size).toBeGreaterThan(0);
        await expect(page.getByText(/No se pudo generar el PDF|Could not generate the PDF/)).toHaveCount(0);
      });
    } finally {
      await customerCtx?.close().catch(() => {});
      await techCtx?.close().catch(() => {});
    }
  });
});
