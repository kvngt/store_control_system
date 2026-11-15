import { assertEquals } from 'jsr:@std/assert@1';
import { createAdminTestDeps, createFakeFetch } from '../_shared/test_doubles.ts';
import { type Deps, handler } from './handler.ts';

function makeDeps(
  env: Record<string, string | undefined> = { GEMINI_API_KEY: 'gemini-secret' },
  fetchHandler?: Parameters<typeof createFakeFetch>[0],
  callerHandlers: Parameters<typeof createAdminTestDeps>[0] = {},
) {
  const { deps: adminDeps, fake } = createAdminTestDeps(callerHandlers, env);
  const { fetchFn, calls: fetchCalls } = createFakeFetch(fetchHandler);
  const deps: Deps = {
    ...adminDeps,
    fetch: fetchFn,
  };
  return { deps, fake, fetchCalls };
}

function authedRequest(body: unknown, rawBody?: string): Request {
  return new Request('https://fn.test/traducir-texto', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer jwt-token',
      'Content-Type': 'application/json',
    },
    body: rawBody ?? JSON.stringify(body),
  });
}

Deno.test('traducir-texto: OPTIONS responde con cabeceras CORS', async () => {
  const { deps } = makeDeps();
  const res = await handler(new Request('https://fn.test/traducir-texto', { method: 'OPTIONS' }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), 'ok');
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
});

Deno.test('traducir-texto: sin token devuelve 401 sin llamar a Gemini', async () => {
  const { deps, fetchCalls } = makeDeps();
  const res = await handler(
    new Request('https://fn.test/traducir-texto', { method: 'POST', body: '{}' }),
    deps,
  );
  assertEquals(res.status, 401);
  assertEquals((await res.json()).code, 'session_expired');
  assertEquals(fetchCalls.length, 0);
});

Deno.test('traducir-texto: usuario no admin devuelve 403 sin llamar a Gemini', async () => {
  const { deps, fetchCalls } = makeDeps(
    { GEMINI_API_KEY: 'gemini-secret' },
    undefined,
    {
      from: (q) => {
        if (q.table === 'perfiles' && q.columns === 'rol') {
          return { data: { rol: 'mecanico' }, error: null };
        }
        return undefined;
      },
    },
  );
  const res = await handler(authedRequest({ texto: 'Cambio de aceite', idioma: 'en' }), deps);
  assertEquals(res.status, 403);
  assertEquals((await res.json()).code, 'admin_only');
  assertEquals(fetchCalls.length, 0);
});

for (const [label, rawBody] of [
  ['JSON inválido', '{roto'],
  ['JSON null', 'null'],
  ['JSON arreglo', '["hola"]'],
] as const) {
  Deno.test(`traducir-texto: ${label} devuelve 400 sin llamar a Gemini`, async () => {
    const { deps, fetchCalls } = makeDeps();
    const res = await handler(authedRequest(null, rawBody), deps);
    assertEquals(res.status, 400);
    assertEquals((await res.json()).code, 'bad_request');
    assertEquals(fetchCalls.length, 0);
  });
}

Deno.test('traducir-texto: valida texto e idioma antes de revisar GEMINI_API_KEY o llamar a Gemini', async () => {
  for (const payload of [
    { texto: '   ', idioma: 'en' },
    { texto: 123, idioma: 'en' },
    { texto: 'a'.repeat(301), idioma: 'en' },
    { texto: 'Frenos', idioma: 'fr' },
  ]) {
    const { deps, fetchCalls } = makeDeps({ GEMINI_API_KEY: undefined });
    const res = await handler(authedRequest(payload), deps);
    assertEquals(res.status, 400);
    assertEquals(fetchCalls.length, 0);
  }
});

Deno.test('traducir-texto: sin GEMINI_API_KEY devuelve 503 not_configured', async () => {
  const { deps, fetchCalls } = makeDeps({ GEMINI_API_KEY: undefined });
  const res = await handler(authedRequest({ texto: 'Cambio de aceite', idioma: 'en' }), deps);
  assertEquals(res.status, 503);
  assertEquals((await res.json()).code, 'not_configured');
  assertEquals(fetchCalls.length, 0);
});

Deno.test('traducir-texto: error HTTP de Gemini devuelve 502', async () => {
  const { deps } = makeDeps(
    { GEMINI_API_KEY: 'gemini-secret' },
    () => new Response('upstream error', { status: 500 }),
  );
  const res = await handler(authedRequest({ texto: 'Cambio de aceite', idioma: 'en' }), deps);
  assertEquals(res.status, 502);
});

Deno.test('traducir-texto: traduce con el modelo configurado y devuelve 200', async () => {
  const { deps, fetchCalls } = makeDeps(
    { GEMINI_API_KEY: 'gemini-secret', GEMINI_MODEL: 'gemini-2.5-flash' },
    () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ texto: 'Oil change' }) }] } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  );

  const res = await handler(authedRequest({ texto: '  Cambio de aceite  ', idioma: 'en' }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { texto: 'Oil change' });
  assertEquals(fetchCalls.length, 1);
  assertEquals(
    fetchCalls[0].url,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  );
  assertEquals(fetchCalls[0].headers['x-goog-api-key'], 'gemini-secret');
});
