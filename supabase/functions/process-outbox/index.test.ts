import { assert, assertEquals } from 'jsr:@std/assert@1';
import { type EmailContext, renderEmail } from '../_shared/email/templates.ts';
import { createFakeFetch, createFakeSupabase, type FakeSupabaseHandlers } from '../_shared/test_doubles.ts';
import { type Deps, handler } from './handler.ts';

function baseEmailCtx(overrides: Record<string, unknown> = {}) {
  return {
    token: 'a'.repeat(64),
    cliente: {
      nombre: 'María López',
      email: 'maria@example.com',
      email_valido: true,
      acepta_correos: true,
      idioma: 'en',
    },
    traducciones: {},
    taller: {
      nombre: 'Restorify Auto',
      direccion: '123 Main St',
      telefono: '301-555-0100',
      telefonos: null,
      email: 'shop@restorifyauto.net',
      logo_url: null,
      color: '#EBC334',
    },
    orden: {
      numero: 'ORD-2026-001',
      estatus: 'en_proceso',
      fecha_ingreso: '2026-11-01',
      fecha_estimada_entrega: '2026-11-05',
      retirada_sin_reparar: false,
    },
    vehiculo: '2020 Honda Civic',
    ultimo_estatus_enviado: null,
    presupuesto: null,
    parqueo: null,
    ...overrides,
  };
}

function makeDeps(
  handlers: FakeSupabaseHandlers = {},
  fetchHandler?: Parameters<typeof createFakeFetch>[0],
  envOverrides: Record<string, string | undefined> = {},
) {
  const fake = createFakeSupabase(handlers);
  const { fetchFn, calls: fetchCalls } = createFakeFetch(
    fetchHandler ??
      (() =>
        new Response(JSON.stringify({ id: 'resend-msg-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })),
  );
  const renderCalls: Array<{ template: string; ctx: EmailContext }> = [];
  const env: Record<string, string | undefined> = {
    RESTORIFY_FUNCTIONS_SECRET: 'secreto-interno',
    RESEND_API_KEY: 're_test_key',
    PUBLIC_SITE_URL: 'https://restorifyauto.net',
    EMAIL_FROM_ADDRESS: 'notificaciones@restorifyauto.net',
    ...envOverrides,
  };
  const deps: Deps = {
    supabase: fake.client,
    fetch: fetchFn,
    getEnv: (k) => env[k],
    sleep: () => Promise.resolve(),
    renderEmail: (template, ctx) => {
      renderCalls.push({ template, ctx });
      return renderEmail(template, ctx);
    },
  };
  return { deps, fake, fetchCalls, renderCalls };
}

function internalReq(secret: string | null = 'secreto-interno'): Request {
  const headers: Record<string, string> = {};
  if (secret !== null) headers['x-restorify-secret'] = secret;
  return new Request('https://fn.test/process-outbox', { method: 'POST', headers });
}

Deno.test('process-outbox: sin cabecera x-restorify-secret devuelve 401 sin reclamar cola', async () => {
  const { deps, fake } = makeDeps();
  const res = await handler(internalReq(null), deps);
  assertEquals(res.status, 401);
  assertEquals(await res.json(), { error: 'No autorizado.' });
  assertEquals(fake.calls.rpc.length, 0);
});

Deno.test('process-outbox: con x-restorify-secret incorrecto devuelve 401', async () => {
  const { deps, fake } = makeDeps();
  const res = await handler(internalReq('secreto-malo'), deps);
  assertEquals(res.status, 401);
  assertEquals(fake.calls.rpc.length, 0);
});

Deno.test('process-outbox: correo cuyo datos_correo devuelve null queda omitido con su motivo', async () => {
  let claimCall = 0;
  const { deps, fake, fetchCalls } = makeDeps({
    rpc: (fn) => {
      if (fn === 'claim_outbox') {
        claimCall += 1;
        return {
          data: claimCall === 1
            ? [{ id: 'job-1', canal: 'email', destinatario: 'x@y.com', plantilla: 'recepcion', datos: {}, intentos: 1 }]
            : [],
          error: null,
        };
      }
      if (fn === 'datos_correo') return { data: null, error: null };
      return { data: null, error: null };
    },
  });

  const res = await handler(internalReq(), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { enviados: 0, omitidos: 1, errores: 0, reintentos: 0, errores_cierre: 0 });
  assertEquals(fetchCalls.length, 0);
  const finish = fake.calls.rpc.find((c) => c.fn === 'finish_outbox');
  assertEquals(finish?.args, {
    p_id: 'job-1',
    p_estado: 'omitido',
    p_error: 'La orden ya no existe o su enlace fue desactivado.',
    p_proveedor_id: null,
  });
});

Deno.test('process-outbox: correo con cliente sin correo válido queda omitido', async () => {
  let claimCall = 0;
  const { deps, fake, fetchCalls } = makeDeps({
    rpc: (fn) => {
      if (fn === 'claim_outbox') {
        claimCall += 1;
        return {
          data: claimCall === 1
            ? [{ id: 'job-2', canal: 'email', destinatario: 'sin', plantilla: 'recepcion', datos: {}, intentos: 1 }]
            : [],
          error: null,
        };
      }
      if (fn === 'datos_correo') {
        return {
          data: baseEmailCtx({
            cliente: { nombre: 'Sin Correo', email: null, email_valido: false, acepta_correos: true, idioma: 'es' },
          }),
          error: null,
        };
      }
      return { data: null, error: null };
    },
  });

  const res = await handler(internalReq(), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { enviados: 0, omitidos: 1, errores: 0, reintentos: 0, errores_cierre: 0 });
  assertEquals(fetchCalls.length, 0);
  const finish = fake.calls.rpc.find((c) => c.fn === 'finish_outbox');
  assertEquals(finish?.args?.p_estado, 'omitido');
  assertEquals(finish?.args?.p_error, 'El cliente no tiene un correo válido.');
});

Deno.test('process-outbox: un error 500 de Resend se reintenta y no queda enviado', async () => {
  let claimCall = 0;
  const { deps, fake, fetchCalls } = makeDeps(
    {
      rpc: (fn) => {
        if (fn === 'claim_outbox') {
          claimCall += 1;
          return {
            data: claimCall === 1
              ? [{ id: 'job-3', canal: 'email', destinatario: 'maria@example.com', plantilla: 'recepcion', datos: {}, intentos: 1 }]
              : [],
            error: null,
          };
        }
        if (fn === 'datos_correo') return { data: baseEmailCtx(), error: null };
        return { data: null, error: null };
      },
    },
    () => new Response('Resend outage', { status: 500 }),
  );

  const res = await handler(internalReq(), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { enviados: 0, omitidos: 0, errores: 0, reintentos: 1, errores_cierre: 0 });
  assertEquals(fetchCalls.length, 1);
  const finish = fake.calls.rpc.find((c) => c.fn === 'finish_outbox');
  assertEquals(finish?.args?.p_estado, 'reintentar');
  assertEquals(finish?.args?.p_error, 'Resend HTTP 500: Resend outage');
});

Deno.test('process-outbox: correo de retirada sin reparar pasa retirada_sin_reparar a renderEmail y usa su plantilla', async () => {
  let claimCall = 0;
  const { deps, fake, fetchCalls, renderCalls } = makeDeps({
    rpc: (fn) => {
      if (fn === 'claim_outbox') {
        claimCall += 1;
        return {
          data: claimCall === 1
            ? [{ id: 'job-4', canal: 'email', destinatario: 'maria@example.com', plantilla: 'estatus', datos: {}, intentos: 1 }]
            : [],
          error: null,
        };
      }
      if (fn === 'datos_correo') {
        return {
          data: baseEmailCtx({
            cliente: {
              nombre: 'María López',
              email: 'maria@example.com',
              email_valido: true,
              acepta_correos: true,
              idioma: 'es',
            },
            orden: {
              numero: 'ORD-2026-009',
              estatus: 'entregado',
              fecha_ingreso: '2026-11-01',
              fecha_estimada_entrega: '2026-11-05',
              retirada_sin_reparar: true,
            },
          }),
          error: null,
        };
      }
      return { data: null, error: null };
    },
  });

  const res = await handler(internalReq(), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { enviados: 1, omitidos: 0, errores: 0, reintentos: 0, errores_cierre: 0 });
  assertEquals(renderCalls.length, 1);
  assertEquals(renderCalls[0].template, 'estatus');
  assertEquals(renderCalls[0].ctx.orden.retirada_sin_reparar, true);

  assertEquals(fetchCalls.length, 1);
  assertEquals(fetchCalls[0].url, 'https://api.resend.com/emails');
  assertEquals(fetchCalls[0].headers['idempotency-key'], 'job-4');
  const resendBody = fetchCalls[0].bodyJson as { subject: string; html: string };
  assertEquals(resendBody.subject, 'Entrega de vehículo · ORD-2026-009');
  assert(resendBody.html.includes('Vehículo entregado sin reparar'));
  assertEquals(
    fake.calls.rpc.some((c) => c.fn === 'marcar_estatus_enviado' && c.args?.p_estatus === 'entregado'),
    true,
  );
});

Deno.test('process-outbox: espera la traducción pendiente hasta dos veces y al tercer intento envía el correo', async () => {
  const quoteCtx = baseEmailCtx({
    presupuesto: {
      numero: 1,
      estado: 'enviado',
      via: null,
      total_propuesto: 200,
      total_aprobado: null,
      lineas: [{ descripcion: 'Cambio de frenos', monto: 200, estado: 'pendiente' }],
    },
  });

  for (const [intentos, debeEsperar] of [
    [1, true],
    [2, true],
    [3, false],
  ] as const) {
    let claimCall = 0;
    const { deps, fake, fetchCalls } = makeDeps({
      rpc: (fn) => {
        if (fn === 'claim_outbox') {
          claimCall += 1;
          return {
            data: claimCall === 1
              ? [{
                  id: `job-tr-${intentos}`,
                  canal: 'email',
                  destinatario: 'maria@example.com',
                  plantilla: 'presupuesto',
                  datos: {},
                  orden_id: 'orden-1',
                  intentos,
                }]
              : [],
            error: null,
          };
        }
        if (fn === 'datos_correo') return { data: quoteCtx, error: null };
        return { data: null, error: null };
      },
      from: (q) => {
        if (q.table === 'cola_envios') return { count: 1, error: null };
        return undefined;
      },
    });

    const res = await handler(internalReq(), deps);
    assertEquals(res.status, 200);
    const finish = fake.calls.rpc.find((c) => c.fn === 'finish_outbox');

    if (debeEsperar) {
      assertEquals(await res.json(), { enviados: 0, omitidos: 0, errores: 0, reintentos: 1, errores_cierre: 0 });
      assertEquals(fetchCalls.length, 0);
      assertEquals(finish?.args?.p_estado, 'reintentar');
      assertEquals(finish?.args?.p_error, 'Esperando la traducción de las líneas del presupuesto.');
    } else {
      assertEquals(await res.json(), { enviados: 1, omitidos: 0, errores: 0, reintentos: 0, errores_cierre: 0 });
      assertEquals(fetchCalls.length, 1);
      assertEquals(finish?.args?.p_estado, 'enviado');
    }
  }
});

Deno.test('process-outbox: si finish_outbox falla al cerrar trabajo enviado lo cuenta en errores_cierre y registra sin PII', async () => {
  let claimCall = 0;
  const { deps } = makeDeps({
    rpc: (fn) => {
      if (fn === 'claim_outbox') {
        claimCall += 1;
        return {
          data: claimCall === 1
            ? [{ id: 'job-err-1', canal: 'email', destinatario: 'maria@example.com', plantilla: 'recepcion', datos: {}, intentos: 1 }]
            : [],
          error: null,
        };
      }
      if (fn === 'datos_correo') return { data: baseEmailCtx(), error: null };
      if (fn === 'finish_outbox') return { data: null, error: { message: 'db write failed' } };
      return { data: null, error: null };
    },
  });

  const errorLogs: unknown[][] = [];
  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    errorLogs.push(args);
  };
  try {
    const res = await handler(internalReq(), deps);
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { enviados: 0, omitidos: 0, errores: 0, reintentos: 0, errores_cierre: 1 });
  } finally {
    console.error = origConsoleError;
  }

  assertEquals(errorLogs.length, 1);
  const loggedText = errorLogs[0].map((a) => String(a)).join(' ');
  assert(loggedText.includes('job-err-1'));
  assert(loggedText.includes('db write failed'));
  assert(!loggedText.includes('maria@example.com'));
  assert(!loggedText.includes('María López'));
});

Deno.test('process-outbox: si finish_outbox falla al cerrar un reintento no lo cuenta en reintentos y suma errores_cierre', async () => {
  let claimCall = 0;
  const { deps } = makeDeps(
    {
      rpc: (fn) => {
        if (fn === 'claim_outbox') {
          claimCall += 1;
          return {
            data: claimCall === 1
              ? [{ id: 'job-err-2', canal: 'email', destinatario: 'maria@example.com', plantilla: 'recepcion', datos: {}, intentos: 1 }]
              : [],
            error: null,
          };
        }
        if (fn === 'datos_correo') return { data: baseEmailCtx(), error: null };
        if (fn === 'finish_outbox') return { data: null, error: { message: 'finish retry failed' } };
        return { data: null, error: null };
      },
    },
    () => new Response('Resend outage', { status: 500 }),
  );

  const errorLogs: unknown[][] = [];
  const origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    errorLogs.push(args);
  };
  try {
    const res = await handler(internalReq(), deps);
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { enviados: 0, omitidos: 0, errores: 0, reintentos: 0, errores_cierre: 1 });
  } finally {
    console.error = origConsoleError;
  }

  assertEquals(errorLogs.length, 1);
  const loggedText = errorLogs[0].map((a) => String(a)).join(' ');
  assert(loggedText.includes('job-err-2'));
  assert(loggedText.includes('finish retry failed'));
  assert(!loggedText.includes('maria@example.com'));
  assert(!loggedText.includes('María López'));
});
