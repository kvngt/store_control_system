import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { EMAIL_SPACING_MS, enviarPorResend, type ResendEmailPayload } from './resend.ts';
import { createFakeFetch } from './test_doubles.ts';

function samplePayload(): ResendEmailPayload {
  return {
    from: 'Restorify Auto <notificaciones@restorifyauto.net>',
    to: ['maria@example.com'],
    subject: 'Actualización de tu orden',
    html: '<p>Hola</p>',
    text: 'Hola',
    reply_to: 'taller@restorifyauto.net',
    tags: [{ name: 'plantilla', value: 'estatus' }],
  };
}

function makeSleepSpy() {
  const sleepCalls: number[] = [];
  const sleep = (ms: number) => {
    sleepCalls.push(ms);
    return Promise.resolve();
  };
  return { sleep, sleepCalls };
}

Deno.test('resend: envío ok devuelve proveedorId, manda encabezados/cuerpo esperados y espera EMAIL_SPACING_MS', async () => {
  const payload = samplePayload();
  const { fetchFn, calls } = createFakeFetch(() =>
    new Response(JSON.stringify({ id: 're_msg_123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
  const { sleep, sleepCalls } = makeSleepSpy();

  const res = await enviarPorResend(fetchFn, sleep, {
    apiKey: 're_test_key',
    idempotencyKey: 'job-1',
    payload,
  });

  assertEquals(res, { ok: true, proveedorId: 're_msg_123' });
  assertEquals(sleepCalls, [EMAIL_SPACING_MS]);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, 'https://api.resend.com/emails');
  assertEquals(calls[0].method, 'POST');
  assertEquals(calls[0].headers['authorization'], 'Bearer re_test_key');
  assertEquals(calls[0].headers['content-type'], 'application/json');
  assertEquals(calls[0].headers['idempotency-key'], 'job-1');
  assertEquals(calls[0].bodyJson, payload);
});

Deno.test('resend: 401 lanza error señalando RESEND_API_KEY y espera EMAIL_SPACING_MS', async () => {
  const { fetchFn } = createFakeFetch(() => new Response('Unauthorized', { status: 401 }));
  const { sleep, sleepCalls } = makeSleepSpy();

  await assertRejects(
    () =>
      enviarPorResend(fetchFn, sleep, {
        apiKey: 're_bad_key',
        idempotencyKey: 'job-401',
        payload: samplePayload(),
      }),
    Error,
    'La llave de Resend no es válida: revisa el secreto RESEND_API_KEY. Resend HTTP 401: Unauthorized',
  );
  assertEquals(sleepCalls, [EMAIL_SPACING_MS]);
});

Deno.test('resend: 400 con "api key" en el cuerpo lanza error de llave y espera EMAIL_SPACING_MS', async () => {
  const { fetchFn } = createFakeFetch(() =>
    new Response('{"message":"API key is invalid"}', { status: 400 })
  );
  const { sleep, sleepCalls } = makeSleepSpy();

  await assertRejects(
    () =>
      enviarPorResend(fetchFn, sleep, {
        apiKey: 're_bad_key',
        idempotencyKey: 'job-400',
        payload: samplePayload(),
      }),
    Error,
    'La llave de Resend no es válida: revisa el secreto RESEND_API_KEY. Resend HTTP 400: {"message":"API key is invalid"}',
  );
  assertEquals(sleepCalls, [EMAIL_SPACING_MS]);
});

Deno.test('resend: 429 lanza para reintentar y espera EMAIL_SPACING_MS', async () => {
  const { fetchFn } = createFakeFetch(() => new Response('rate limit exceeded', { status: 429 }));
  const { sleep, sleepCalls } = makeSleepSpy();

  await assertRejects(
    () =>
      enviarPorResend(fetchFn, sleep, {
        apiKey: 're_test_key',
        idempotencyKey: 'job-429',
        payload: samplePayload(),
      }),
    Error,
    'Resend HTTP 429: rate limit exceeded',
  );
  assertEquals(sleepCalls, [EMAIL_SPACING_MS]);
});

Deno.test('resend: 500 lanza para reintentar y espera EMAIL_SPACING_MS', async () => {
  const { fetchFn } = createFakeFetch(() => new Response('internal server error', { status: 500 }));
  const { sleep, sleepCalls } = makeSleepSpy();

  await assertRejects(
    () =>
      enviarPorResend(fetchFn, sleep, {
        apiKey: 're_test_key',
        idempotencyKey: 'job-500',
        payload: samplePayload(),
      }),
    Error,
    'Resend HTTP 500: internal server error',
  );
  assertEquals(sleepCalls, [EMAIL_SPACING_MS]);
});

Deno.test('resend: 422 devuelve estado error sin reintento y espera EMAIL_SPACING_MS', async () => {
  const { fetchFn } = createFakeFetch(() => new Response('invalid recipient', { status: 422 }));
  const { sleep, sleepCalls } = makeSleepSpy();

  const res = await enviarPorResend(fetchFn, sleep, {
    apiKey: 're_test_key',
    idempotencyKey: 'job-422',
    payload: samplePayload(),
  });

  assertEquals(res, {
    ok: false,
    estado: 'error',
    detalle: 'Resend HTTP 422: invalid recipient',
  });
  assertEquals(sleepCalls, [EMAIL_SPACING_MS]);
});
