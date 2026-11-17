import { writeFileSync } from 'node:fs';
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
import { adminClient, createTestOrder, userIdOf, type CreatedTestOrder } from './localData.js';

// MED-01: el técnico registra un avance con nota y foto por galería, la bandeja de subidas termina
// y la base guarda `orden_avances` + `orden_media`.

test.describe.configure({ mode: 'serial' });

test.describe('MED | Avances del técnico con foto', () => {
  test.skip(!isLocalStack, 'Solo contra la base local: sube archivos al bucket local');
  test.skip(!hasAdminCredentials || !hasMechanicCredentials, 'Requiere credenciales de admin y mecánico');

  let adminDb: SupabaseClient;
  let order: CreatedTestOrder;

  test.beforeAll(async () => {
    adminDb = await adminClient();
    const mechanicId = await userIdOf(adminDb, MECHANIC_EMAIL!);

    order = await createTestOrder(adminDb, {
      label: 'AvanceFoto',
      labor: [
        {
          descripcion: `${TEST_DATA_PREFIX} Revisión de motor`,
          costo: 300,
          asignado_a: mechanicId,
          reparto_heredado: false,
        },
      ],
      authorized: true,
    });
  });

  test('MED-01 el técnico registra un avance con foto desde la galería', async ({ page }, testInfo) => {
    await login(page, MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
    await page.goto(`/work-orders?open=${order.id}`);
    await expect(page.locator('h1.order-detail-title')).toContainText(order.numero, { timeout: 10000 });

    // Genera un JPEG real en el navegador para que `compressImage` (canvas + Image) lo decodifique sin fallos.
    // Va como texto porque e2e/ se compila sin las definiciones del DOM (`document` no existe en Node).
    const jpegDataUrl = await page.evaluate<string>(`(() => {
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
    // A un archivo de verdad en disco, no desde memoria: la app comprime la foto y la deja en su
    // cola de subidas para mandarla después, y para entonces un archivo «de memoria» de Playwright
    // ya no existe (el navegador responde ERR_FILE_NOT_FOUND y la subida se queda en «0 de 1»).
    const photo = testInfo.outputPath('avance.jpg');
    writeFileSync(photo, Buffer.from(jpegDataUrl.split(',')[1] ?? '', 'base64'));

    // Acción rápida «Registrar avance» -> abre la pestaña Avances y despliega la sección `avances`.
    await page.getByRole('button', { name: /Registrar avance|Add progress/ }).click();

    const avancesSection = page.locator('[data-section="avances"]');
    const note = `${TEST_DATA_PREFIX} Avance con foto ${Date.now()}`;
    const textarea = avancesSection.locator('textarea');
    await expect(textarea).toBeVisible({ timeout: 10000 });
    await textarea.fill(note);

    // Input de galería (sin `capture="environment"`).
    const galleryInput = avancesSection.locator('input[type="file"]:not([capture])');
    await galleryInput.setInputFiles(photo);

    // Espera a que termine `compressImage` y aparezca la miniatura del borrador.
    await expect(avancesSection.locator('.draft-media')).toHaveCount(1, { timeout: 10000 });

    const saveBtn = avancesSection.getByRole('button', { name: /Agregar Avance|Add Progress/ });
    await expect(saveBtn).toBeEnabled({ timeout: 10000 });
    await saveBtn.click();

    await expect(page.getByText(/Avance registrado|Progress recorded/)).toBeVisible({ timeout: 10000 });

    // Espera a que la bandeja de subidas (`UploadTray.tsx`) marque 1 de 1 subidos («listo», sin `.has-errors`).
    const tray = page.locator('.upload-tray');
    await expect(tray, 'La subida del archivo en UploadTray no terminó dentro de 30 s').toContainText(
      /1 de 1 archivos subidos|1 of 1 files uploaded/,
      { timeout: 30000 },
    );
    await expect(tray).not.toHaveClass(/has-errors/);

    // Comprobación en la base: fila en `orden_avances` con la nota y fila en `orden_media` de esa orden.
    let avanceId = '';
    await expect
      .poll(
        async () => {
          const { data, error } = await adminDb
            .from('orden_avances')
            .select('id, descripcion')
            .eq('orden_id', order.id)
            .eq('descripcion', note);
          if (error) throw error;
          if (data.length > 0) avanceId = data[0].id as string;
          return data.length;
        },
        { timeout: 10000, message: 'No apareció la fila en orden_avances' },
      )
      .toBe(1);

    await expect
      .poll(
        async () => {
          const { data, error } = await adminDb
            .from('orden_media')
            .select('id, tipo, origen, avance_id')
            .eq('orden_id', order.id)
            .eq('avance_id', avanceId);
          if (error) throw error;
          return data.length;
        },
        { timeout: 10000, message: 'No apareció la fila en orden_media' },
      )
      .toBe(1);
  });
});
