import { assertEquals } from 'jsr:@std/assert@1';
import { createAdminTestDeps, type FromQuery } from '../_shared/test_doubles.ts';
import { handler } from './handler.ts';

const USER_ID = '22222222-2222-4222-8222-222222222222';

function authedRequest(body: unknown, rawBody?: string): Request {
  return new Request('https://fn.test/delete-employee', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer jwt-token',
      'Content-Type': 'application/json',
    },
    body: rawBody ?? JSON.stringify(body),
  });
}

Deno.test('delete-employee: OPTIONS responde con cabeceras CORS', async () => {
  const { deps } = createAdminTestDeps();
  const res = await handler(new Request('https://fn.test/delete-employee', { method: 'OPTIONS' }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), 'ok');
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
});

Deno.test('delete-employee: sin token devuelve 401', async () => {
  const { deps } = createAdminTestDeps();
  const res = await handler(new Request('https://fn.test/delete-employee', { method: 'POST', body: '{}' }), deps);
  assertEquals(res.status, 401);
  assertEquals((await res.json()).code, 'session_expired');
});

Deno.test('delete-employee: usuario no admin devuelve 403 sin llamar deleteUser', async () => {
  const { deps, fake } = createAdminTestDeps({
    from: (q) => {
      if (q.table === 'perfiles' && q.columns === 'rol') {
        return { data: { rol: 'mecanico' }, error: null };
      }
      return undefined;
    },
  });
  const res = await handler(authedRequest({ usuario_id: USER_ID }), deps);
  assertEquals(res.status, 403);
  assertEquals((await res.json()).code, 'admin_only');
  assertEquals(fake.calls.auth.filter((c) => c.method === 'admin.deleteUser').length, 0);
});

for (const [label, rawBody] of [
  ['JSON inválido', '{bad'],
  ['JSON null', 'null'],
  ['JSON arreglo', '[]'],
] as const) {
  Deno.test(`delete-employee: ${label} devuelve 400`, async () => {
    const { deps } = createAdminTestDeps();
    const res = await handler(authedRequest(null, rawBody), deps);
    assertEquals(res.status, 400);
    assertEquals((await res.json()).code, 'bad_request');
  });
}

Deno.test('delete-employee: validaciones previas a Auth devuelven 400/404 sin llamar deleteUser', async () => {
  const { deps: depsMissing, fake: fakeMissing } = createAdminTestDeps();
  const resMissing = await handler(authedRequest({}), depsMissing);
  assertEquals(resMissing.status, 400);
  assertEquals((await resMissing.json()).error, 'Falta el usuario a eliminar.');
  assertEquals(fakeMissing.calls.auth.filter((c) => c.method === 'admin.deleteUser').length, 0);

  const { deps: depsBadUuid } = createAdminTestDeps();
  const resBadUuid = await handler(authedRequest({ usuario_id: 'no-uuid' }), depsBadUuid);
  assertEquals(resBadUuid.status, 400);
  assertEquals((await resBadUuid.json()).error, 'El usuario no es válido.');

  const { deps: depsSelf } = createAdminTestDeps({
    getUser: () => ({ data: { user: { id: USER_ID } }, error: null }),
  });
  const resSelf = await handler(authedRequest({ usuario_id: USER_ID }), depsSelf);
  assertEquals(resSelf.status, 400);
  assertEquals((await resSelf.json()).error, 'No puedes eliminar tu propio usuario.');

  const { deps: depsNotFound } = createAdminTestDeps({
    from: (q) => {
      if (q.table === 'perfiles' && q.columns === 'id') return { data: null, error: null };
      return undefined;
    },
  });
  const resNotFound = await handler(authedRequest({ usuario_id: USER_ID }), depsNotFound);
  assertEquals(resNotFound.status, 404);
  assertEquals((await resNotFound.json()).error, 'Ese empleado ya no existe.');
});

for (const table of [
  'orden_asignaciones',
  'comision_pagos',
  'orden_labor',
  'orden_labor_tiempos',
  'orden_hallazgos',
  'comisiones',
] as const) {
  Deno.test(`delete-employee: bloquea con 409 si tiene registros en ${table}`, async () => {
    const { deps, fake } = createAdminTestDeps({
      from: (q) => {
        if (q.table === 'perfiles' && q.columns === 'id') return { data: { id: USER_ID }, error: null };
        if (q.table === table) return { count: 1, error: null };
        if (q.selectOptions?.head) return { count: 0, error: null };
        return undefined;
      },
    });
    const res = await handler(authedRequest({ usuario_id: USER_ID }), deps);
    assertEquals(res.status, 409);
    assertEquals(fake.calls.auth.filter((c) => c.method === 'admin.deleteUser').length, 0);
  });
}

Deno.test('delete-employee: si falla auth.admin.deleteUser tras borrar perfil devuelve 207', async () => {
  const { deps } = createAdminTestDeps({
    from: (q) => {
      if (q.table === 'perfiles' && q.columns === 'id') return { data: { id: USER_ID }, error: null };
      if (q.selectOptions?.head) return { count: 0, error: null };
      if (q.table === 'perfiles' && q.action === 'delete') return { error: null };
      return undefined;
    },
    deleteUser: () => ({ error: { message: 'auth unavailable' } }),
  });

  const res = await handler(authedRequest({ usuario_id: USER_ID }), deps);
  assertEquals(res.status, 207);
  assertEquals(await res.json(), { error: 'Perfil eliminado, pero el acceso no: auth unavailable' });
});

Deno.test('delete-employee: elimina perfil y acceso en Auth y devuelve 200 ok', async () => {
  const { deps, fake } = createAdminTestDeps({
    from: (q) => {
      if (q.table === 'perfiles' && q.columns === 'id') return { data: { id: USER_ID }, error: null };
      if (q.selectOptions?.head) return { count: 0, error: null };
      if (q.table === 'perfiles' && q.action === 'delete') return { error: null };
      return undefined;
    },
  });

  const res = await handler(authedRequest({ usuario_id: USER_ID }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(fake.calls.auth.find((c) => c.method === 'admin.deleteUser')?.args, [USER_ID]);
});

for (const [label, matches] of [
  ['orden_asignaciones', (q: FromQuery) => q.table === 'orden_asignaciones'],
  ['comision_pagos', (q: FromQuery) => q.table === 'comision_pagos'],
  [
    'orden_hallazgos (reportado_por)',
    (q: FromQuery) => q.table === 'orden_hallazgos' && q.filters.some((f) => f.col === 'reportado_por'),
  ],
  [
    'orden_hallazgos (resuelto_por)',
    (q: FromQuery) => q.table === 'orden_hallazgos' && q.filters.some((f) => f.col === 'resuelto_por'),
  ],
  ['comisiones', (q: FromQuery) => q.table === 'comisiones'],
  ['orden_labor', (q: FromQuery) => q.table === 'orden_labor'],
  ['orden_labor_tiempos', (q: FromQuery) => q.table === 'orden_labor_tiempos'],
] as const) {
  Deno.test(`delete-employee: fallo al contar ${label} devuelve 503 sin borrar perfil ni Auth`, async () => {
    const { deps, fake } = createAdminTestDeps({
      from: (q) => {
        if (q.table === 'perfiles' && q.columns === 'id') return { data: { id: USER_ID }, error: null };
        if (q.selectOptions?.head && matches(q)) return { count: null, error: { message: 'db error' } };
        if (q.selectOptions?.head) return { count: 0, error: null };
        return undefined;
      },
    });

    const res = await handler(authedRequest({ usuario_id: USER_ID }), deps);
    assertEquals(res.status, 503);
    assertEquals(await res.json(), {
      error: 'No se pudo comprobar en este momento. Intenta de nuevo.',
      code: 'unavailable',
    });
    assertEquals(fake.calls.from.filter((q) => q.action === 'delete').length, 0);
    assertEquals(fake.calls.auth.filter((c) => c.method === 'admin.deleteUser').length, 0);
  });
}
