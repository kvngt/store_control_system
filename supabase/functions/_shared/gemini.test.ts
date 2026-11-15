import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { DEFAULT_GEMINI_MODEL, pedirJsonAGemini } from './gemini.ts';
import { type FetchFn } from './http.ts';
import { createFakeFetch } from './test_doubles.ts';

Deno.test('gemini: ok devuelve texto, usa modelo por defecto y manda encabezados/cuerpo esperados', async () => {
  const { fetchFn, calls } = createFakeFetch(() =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"texto":"Oil change"}' }] } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  );

  const res = await pedirJsonAGemini(fetchFn, {
    apiKey: 'gemini-secret',
    systemInstruction: 'Traduce al inglés',
    userText: 'Cambio de aceite',
  });

  assertEquals(res, { ok: true, texto: '{"texto":"Oil change"}' });
  assertEquals(calls.length, 1);
  assertEquals(
    calls[0].url,
    `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`,
  );
  assertEquals(calls[0].method, 'POST');
  assertEquals(calls[0].headers['content-type'], 'application/json');
  assertEquals(calls[0].headers['x-goog-api-key'], 'gemini-secret');
  assertEquals(calls[0].bodyJson, {
    contents: [{ parts: [{ text: 'Cambio de aceite' }] }],
    systemInstruction: { parts: [{ text: 'Traduce al inglés' }] },
    generationConfig: { responseMimeType: 'application/json' },
  });
});

Deno.test('gemini: respuesta 200 sin texto devuelve ok: false con detalle esperado', async () => {
  for (const body of [{ candidates: [] }, { candidates: [{ content: { parts: [{ text: '' }] } }] }]) {
    const { fetchFn } = createFakeFetch(() =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const res = await pedirJsonAGemini(fetchFn, {
      apiKey: 'gemini-secret',
      model: 'gemini-2.5-flash',
      systemInstruction: 'Traduce',
      userText: 'Frenos',
    });

    assertEquals(res, {
      ok: false,
      status: 200,
      detalle: 'Gemini no devolvió texto en el formato esperado.',
    });
  }
});

Deno.test('gemini: respuesta 4xx devuelve ok: false con status y detalle', async () => {
  const { fetchFn } = createFakeFetch(() => new Response('bad request', { status: 400 }));

  const res = await pedirJsonAGemini(fetchFn, {
    apiKey: 'gemini-secret',
    systemInstruction: 'Traduce',
    userText: 'Frenos',
  });

  assertEquals(res, {
    ok: false,
    status: 400,
    detalle: 'Gemini HTTP 400: bad request',
  });
});

Deno.test('gemini: respuesta 5xx devuelve ok: false con status y detalle', async () => {
  const { fetchFn } = createFakeFetch(() => new Response('upstream outage', { status: 503 }));

  const res = await pedirJsonAGemini(fetchFn, {
    apiKey: 'gemini-secret',
    systemInstruction: 'Traduce',
    userText: 'Frenos',
  });

  assertEquals(res, {
    ok: false,
    status: 503,
    detalle: 'Gemini HTTP 503: upstream outage',
  });
});

Deno.test('gemini: el tope de tiempo corta la petición colgada', async () => {
  let seenSignal: AbortSignal | null | undefined;
  const hangingFetch: FetchFn = (_input, init) =>
    new Promise((_resolve, reject) => {
      seenSignal = init?.signal;
      const signal = init?.signal;
      if (!signal) {
        reject(new Error('No se recibió AbortSignal'));
        return;
      }
      const abort = () => {
        reject(signal.reason ?? new DOMException('The signal has been aborted', 'AbortError'));
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
    });

  const err = await assertRejects(() =>
    pedirJsonAGemini(hangingFetch, {
      apiKey: 'gemini-secret',
      systemInstruction: 'Traduce',
      userText: 'Frenos',
      timeoutMs: 15,
    })
  );

  assert(seenSignal instanceof AbortSignal);
  assert(seenSignal.aborted);
  assert(err instanceof Error || err instanceof DOMException);
});
