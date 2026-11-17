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
  waitForDashboard,
} from './fixtures.js';
import { adminClient, clientFor, createTestOrder, userIdOf, type CreatedTestOrder } from './localData.js';

// NOT-01: la campana del admin recibe en tiempo real el aviso de trabajo adicional sin recargar.

test.describe.configure({ mode: 'serial' });

test.describe('NOT | Campana de notificaciones en tiempo real', () => {
  test.skip(!isLocalStack, 'Solo contra la base local');
  test.skip(!hasAdminCredentials || !hasMechanicCredentials, 'Requiere credenciales de admin y mecánico');

  let adminDb: SupabaseClient;
  let techDb: SupabaseClient;
  let order: CreatedTestOrder;

  test.beforeAll(async () => {
    adminDb = await adminClient();
    const mechanicId = await userIdOf(adminDb, MECHANIC_EMAIL!);

    order = await createTestOrder(adminDb, {
      label: 'Campana',
      labor: [
        {
          descripcion: `${TEST_DATA_PREFIX} Diagnóstico`,
          costo: 150,
          asignado_a: mechanicId,
          reparto_heredado: false,
        },
      ],
      authorized: true,
    });

    techDb = await clientFor(MECHANIC_EMAIL!, MECHANIC_PASSWORD!);
  });

  test('NOT-01 la campana del admin sube en uno y muestra el trabajo adicional sin recargar', async ({ page }) => {
    await login(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
    await waitForDashboard(page);
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

    const bellBtn = page.locator('#notifications-btn');
    await expect(bellBtn).toBeVisible({ timeout: 10000 });

    // Abre y cierra la campana una vez para confirmar que las consultas iniciales terminaron y Realtime está montado.
    await bellBtn.click();
    const dropdown = page.locator('.notif-dropdown');
    await expect(dropdown).toBeVisible();
    await expect(dropdown.getByText(/Cargando\.\.\.|Loading\.\.\./)).toHaveCount(0, { timeout: 10000 });
    await bellBtn.click();
    await expect(dropdown).not.toBeVisible();

    const badge = bellBtn.locator('.header-notification-count');
    const initialText = (await badge.count()) > 0 ? (await badge.innerText()).trim() : '0';
    // Si hubiera 99+, marca todo leído primero para poder verificar el incremento exacto en 1.
    let initialCount = Number(initialText);
    if (Number.isNaN(initialCount)) {
      await bellBtn.click();
      await dropdown.getByRole('button', { name: /Marcar todo leído|Mark all read/ }).click();
      await bellBtn.click();
      await expect(badge).toHaveCount(0, { timeout: 5000 });
      initialCount = 0;
    }

    // Sin recargar la página, el mecánico reporta trabajo adicional por la API.
    const findingDesc = `${TEST_DATA_PREFIX} Fuga de aceite ${Date.now()}`;
    const { error: hallazgoError } = await techDb.rpc('reportar_hallazgo', {
      p_orden_id: order.id,
      p_descripcion: findingDesc,
    });
    expect(hallazgoError).toBeNull();

    // En menos de 15 s el contador de la campana sube, sin recargar. «Al menos uno»: las pruebas
    // corren en paralelo y otra (el avance con foto) también le avisa a este mismo admin; con
    // «exactamente uno» la prueba fallaba según quién llegara primero.
    await expect
      .poll(async () => ((await badge.count()) > 0 ? Number((await badge.innerText()).replace('+', '')) : 0), { timeout: 15000 })
      .toBeGreaterThan(initialCount);

    // Al abrir la campana aparece el aviso del trabajo adicional (llega solo, también con ella abierta).
    await bellBtn.click();
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toContainText(
      new RegExp(`Trabajo adicional reportado · ${order.numero}|Additional work reported · ${order.numero}`),
      { timeout: 15000 },
    );
    await expect(dropdown).toContainText(findingDesc);
  });
});
