import { assertEquals, assertExists } from 'jsr:@std/assert@1';
import { createFakeSupabase } from '../_shared/test_doubles.ts';
import { handler } from './handler.ts';

const VALID_TOKEN = 'a'.repeat(64);
const PRESUPUESTO_ID = '33333333-3333-4333-8333-333333333333';
const LINEA_1 = '44444444-4444-4444-8444-444444444444';
const LINEA_2 = '55555555-5555-4555-8555-555555555555';

Deno.test('portal: OPTIONS responde 204 con cabeceras CORS', async () => {
  const fake = createFakeSupabase();
  const res = await handler(new Request('https://fn.test/portal', { method: 'OPTIONS' }), {
    supabase: fake.client,
  });
  assertEquals(res.status, 204);
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
  assertEquals(res.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
  assertEquals(res.headers.get('Access-Control-Allow-Headers'), 'content-type');
});

Deno.test('portal: método no permitido devuelve 405', async () => {
  const fake = createFakeSupabase();
  const res = await handler(new Request('https://fn.test/portal', { method: 'DELETE' }), {
    supabase: fake.client,
  });
  assertEquals(res.status, 405);
});

for (const [label, rawBody] of [
  ['JSON inválido', '{roto'],
  ['JSON null', 'null'],
  ['JSON arreglo', '[]'],
] as const) {
  Deno.test(`portal: POST con ${label} devuelve 400 (no 500)`, async () => {
    const fake = createFakeSupabase();
    const res = await handler(
      new Request('https://fn.test/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: rawBody,
      }),
      { supabase: fake.client },
    );
    assertEquals(res.status, 400);
    assertEquals(await res.json(), { error: 'Solicitud inválida.' });
    assertEquals(res.headers.get('Cache-Control'), 'no-store');
    assertEquals(fake.calls.rpc.length, 0);
  });
}

Deno.test('portal: GET con token inválido o faltante devuelve 404 sin llamar a la base', async () => {
  const fake = createFakeSupabase();
  const res = await handler(
    new Request('https://fn.test/portal?token=token-corto', { method: 'GET' }),
    { supabase: fake.client },
  );
  assertEquals(res.status, 404);
  assertEquals(await res.json(), { estado_enlace: 'no_encontrado' });
  assertEquals(fake.calls.rpc.length, 0);
});

Deno.test('portal: GET ?servicio= con formato inválido devuelve 404 sin llamar a datos_servicio', async () => {
  const fake = createFakeSupabase();
  const res = await handler(
    new Request('https://fn.test/portal?servicio=invalido', { method: 'GET' }),
    { supabase: fake.client },
  );
  assertEquals(res.status, 404);
  assertEquals(await res.json(), { estado: 'no_existe' });
  assertEquals(fake.calls.rpc.length, 0);
});

Deno.test('portal: GET con token válido llama datos_portal y firma URLs de firma y multimedia', async () => {
  const fake = createFakeSupabase({
    rpc: (fn) => {
      if (fn === 'datos_portal') {
        return {
          data: {
            estado_enlace: 'ok',
            orden: { numero: 'ORD-2026-001', firma_ruta: 'sede/firma.png' },
            multimedia: [
              {
                id: 'm1',
                tipo: 'foto',
                origen: 'recepcion',
                zona: null,
                ruta: 'sede/foto1.jpg',
                ruta_miniatura: 'sede/thumb1.jpg',
                mime: 'image/jpeg',
                duracion_seg: null,
                ancho: 800,
                alto: 600,
                creado_en: '2026-11-01T00:00:00Z',
              },
            ],
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  });

  const res = await handler(
    new Request(`https://fn.test/portal?token=${VALID_TOKEN}`, { method: 'GET' }),
    { supabase: fake.client },
  );

  assertEquals(res.status, 200);
  assertEquals(fake.calls.rpc, [{ fn: 'datos_portal', args: { p_token: VALID_TOKEN } }]);
  assertEquals(fake.calls.storage.length, 1);
  assertEquals(fake.calls.storage[0].bucket, 'orden_media');
  assertEquals(fake.calls.storage[0].paths, ['sede/foto1.jpg', 'sede/thumb1.jpg', 'sede/firma.png']);

  const body = await res.json();
  assertEquals(body.orden.firma_ruta, undefined);
  assertEquals(body.orden.firma_url, 'https://signed.test/sede/firma.png');
  assertEquals(body.multimedia[0].ruta, undefined);
  assertEquals(body.multimedia[0].url, 'https://signed.test/sede/foto1.jpg');
  assertEquals(body.multimedia[0].miniatura_url, 'https://signed.test/sede/thumb1.jpg');
  assertExists(body.urls_vencen_en);
});

Deno.test('portal: GET con enlace vencido o revocado devuelve 410', async () => {
  const fake = createFakeSupabase({
    rpc: () => ({ data: { estado_enlace: 'vencido' }, error: null }),
  });

  const res = await handler(
    new Request(`https://fn.test/portal?token=${VALID_TOKEN}`, { method: 'GET' }),
    { supabase: fake.client },
  );
  assertEquals(res.status, 410);
  assertEquals(await res.json(), { estado_enlace: 'vencido' });
});

Deno.test('portal: POST preferencia_correos llama preferencia_correos_portal', async () => {
  const fake = createFakeSupabase({
    rpc: () => ({ data: { ok: true }, error: null }),
  });

  const res = await handler(
    new Request('https://fn.test/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: VALID_TOKEN, accion: 'preferencia_correos', acepta: false }),
    }),
    { supabase: fake.client },
  );

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(fake.calls.rpc, [
    { fn: 'preferencia_correos_portal', args: { p_token: VALID_TOKEN, p_acepta: false } },
  ]);
});

Deno.test('portal: POST preferencia_idioma llama preferencia_idioma_portal', async () => {
  const fake = createFakeSupabase({
    rpc: () => ({ data: { ok: true }, error: null }),
  });

  const res = await handler(
    new Request('https://fn.test/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: VALID_TOKEN, accion: 'preferencia_idioma', idioma: 'es' }),
    }),
    { supabase: fake.client },
  );

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(fake.calls.rpc, [
    { fn: 'preferencia_idioma_portal', args: { p_token: VALID_TOKEN, p_idioma: 'es' } },
  ]);
});

Deno.test('portal: POST responder_presupuesto llama responder_presupuesto_portal con parámetros e IP', async () => {
  const fake = createFakeSupabase({
    rpc: () => ({ data: { ok: true }, error: null }),
  });

  const res = await handler(
    new Request('https://fn.test/portal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '203.0.113.10, 10.0.0.1',
        'user-agent': 'RestorifyTest/1.0',
      },
      body: JSON.stringify({
        token: VALID_TOKEN,
        accion: 'responder_presupuesto',
        presupuesto_id: PRESUPUESTO_ID,
        aprobadas: [LINEA_1],
        lineas: [LINEA_1, LINEA_2],
        nombre: 'Juan Cliente',
        comentario: 'Adelante con los frenos',
      }),
    }),
    { supabase: fake.client },
  );

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(fake.calls.rpc, [
    {
      fn: 'responder_presupuesto_portal',
      args: {
        p_token: VALID_TOKEN,
        p_presupuesto_id: PRESUPUESTO_ID,
        p_aprobadas: [LINEA_1],
        p_lineas: [LINEA_1, LINEA_2],
        p_nombre: 'Juan Cliente',
        p_comentario: 'Adelante con los frenos',
        p_ip: '203.0.113.10',
        p_user_agent: 'RestorifyTest/1.0',
      },
    },
  ]);
});

Deno.test('portal: POST con token inválido devuelve 404 sin llamar RPC', async () => {
  const fake = createFakeSupabase();
  const res = await handler(
    new Request('https://fn.test/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'malo', accion: 'preferencia_correos', acepta: true }),
    }),
    { supabase: fake.client },
  );
  assertEquals(res.status, 404);
  assertEquals(await res.json(), { ok: false });
  assertEquals(fake.calls.rpc.length, 0);
});

Deno.test('portal: POST con acción desconocida devuelve 400', async () => {
  const fake = createFakeSupabase();
  const res = await handler(
    new Request('https://fn.test/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: VALID_TOKEN, accion: 'borrar_todo' }),
    }),
    { supabase: fake.client },
  );
  assertEquals(res.status, 400);
  assertEquals(await res.json(), { error: 'Acción no válida.' });
  assertEquals(fake.calls.rpc.length, 0);
});
