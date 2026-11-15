import { assertEquals } from 'jsr:@std/assert@1';
import { createAdminTestDeps } from '../_shared/test_doubles.ts';
import { handler } from './handler.ts';

const SEDE_ID = '11111111-1111-4111-8111-111111111111';

function authedRequest(body: unknown, rawBody?: string): Request {
  return new Request('https://fn.test/create-employee', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer jwt-token',
      'Content-Type': 'application/json',
    },
    body: rawBody ?? JSON.stringify(body),
  });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    email: 'Nuevo@Taller.com ',
    password: 'Password123',
    nombre_completo: 'Carlos Pérez',
    rol: 'mecanico',
    sede_id: SEDE_ID,
    telefono: '555-0100',
    ...overrides,
  };
}

Deno.test('create-employee: OPTIONS responde con cabeceras CORS', async () => {
  const { deps } = createAdminTestDeps();
  const res = await handler(new Request('https://fn.test/create-employee', { method: 'OPTIONS' }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), 'ok');
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
  assertEquals(
    res.headers.get('Access-Control-Allow-Headers'),
    'authorization, x-client-info, apikey, content-type',
  );
});

Deno.test('create-employee: sin token devuelve 401 sin crear cliente', async () => {
  const { deps, clientCalls } = createAdminTestDeps();
  const res = await handler(
    new Request('https://fn.test/create-employee', { method: 'POST', body: '{}' }),
    deps,
  );
  assertEquals(res.status, 401);
  assertEquals((await res.json()).code, 'session_expired');
  assertEquals(clientCalls.length, 0);
});

Deno.test('create-employee: usuario no admin devuelve 403 sin llamar Auth.admin', async () => {
  const { deps, fake } = createAdminTestDeps({
    from: (q) => {
      if (q.table === 'perfiles' && q.columns === 'rol') {
        return { data: { rol: 'mecanico' }, error: null };
      }
      return undefined;
    },
  });
  const res = await handler(authedRequest(validPayload()), deps);
  assertEquals(res.status, 403);
  assertEquals((await res.json()).code, 'admin_only');
  assertEquals(fake.calls.auth.filter((c) => c.method !== 'getUser').length, 0);
});

Deno.test('create-employee: fallo pasajero de identidad devuelve 503', async () => {
  const { deps } = createAdminTestDeps({
    getUser: () => ({ data: { user: null }, error: { message: 'timeout', status: 503 } }),
  });
  const res = await handler(authedRequest(validPayload()), deps);
  assertEquals(res.status, 503);
  assertEquals((await res.json()).code, 'service_unavailable');
});

for (const [label, rawBody] of [
  ['JSON inválido', '{roto'],
  ['JSON null', 'null'],
  ['JSON arreglo', '[1, 2]'],
] as const) {
  Deno.test(`create-employee: ${label} devuelve 400 (no 500)`, async () => {
    const { deps, fake } = createAdminTestDeps();
    const res = await handler(authedRequest(null, rawBody), deps);
    assertEquals(res.status, 400);
    assertEquals((await res.json()).code, 'bad_request');
    assertEquals(fake.calls.auth.filter((c) => c.method === 'admin.createUser').length, 0);
  });
}

Deno.test('create-employee: validaciones previas a Auth devuelven 400 sin llamar createUser', async () => {
  const cases: Array<{ name: string; payload: Record<string, unknown>; expectedError: string }> = [
    {
      name: 'faltan campos obligatorios',
      payload: validPayload({ email: '' }),
      expectedError: 'Faltan campos obligatorios.',
    },
    {
      name: 'contraseña menor a 8 caracteres',
      payload: validPayload({ password: '1234567' }),
      expectedError: 'La contraseña debe tener al menos 8 caracteres.',
    },
    {
      name: 'rol inválido',
      payload: validPayload({ rol: 'gerente' }),
      expectedError: 'Rol inválido.',
    },
    {
      name: 'correo con formato inválido',
      payload: validPayload({ email: 'no-es-correo' }),
      expectedError: 'El correo no tiene un formato válido.',
    },
    {
      name: 'sede_id no UUID',
      payload: validPayload({ sede_id: 'sede-1' }),
      expectedError: 'La sede no es válida.',
    },
    {
      name: 'nombre mayor a 120 caracteres',
      payload: validPayload({ nombre_completo: 'A'.repeat(121) }),
      expectedError: 'El nombre o el teléfono son demasiado largos.',
    },
    {
      name: 'teléfono mayor a 40 caracteres',
      payload: validPayload({ telefono: '9'.repeat(41) }),
      expectedError: 'El nombre o el teléfono son demasiado largos.',
    },
    {
      name: 'sede inexistente en base',
      payload: validPayload(),
      expectedError: 'Esa sede ya no existe.',
    },
  ];

  for (const c of cases) {
    const { deps, fake } = createAdminTestDeps({
      from: (q) => {
        if (q.table === 'sedes') return { data: null, error: null };
        return undefined;
      },
    });
    const res = await handler(authedRequest(c.payload), deps);
    assertEquals(res.status, 400, c.name);
    assertEquals((await res.json()).error, c.expectedError, c.name);
    assertEquals(
      fake.calls.auth.filter((call) => call.method === 'admin.createUser').length,
      0,
      `no debe llamar createUser en: ${c.name}`,
    );
  }
});

Deno.test('create-employee: si falla insertar perfil borra el usuario en Auth (rollback)', async () => {
  const { deps, fake } = createAdminTestDeps({
    from: (q) => {
      if (q.table === 'sedes') return { data: { id: SEDE_ID }, error: null };
      if (q.table === 'perfiles' && q.action === 'insert') {
        return { data: null, error: { message: 'duplicate key' } };
      }
      return undefined;
    },
    createUser: () => ({ data: { user: { id: 'new-uid' } }, error: null }),
  });

  const res = await handler(authedRequest(validPayload()), deps);
  assertEquals(res.status, 400);
  assertEquals(await res.json(), { error: 'duplicate key' });
  assertEquals(fake.calls.auth.find((c) => c.method === 'admin.deleteUser')?.args, ['new-uid']);
});

Deno.test('create-employee: crea usuario con correo normalizado y perfil en 200', async () => {
  const createdProfile = {
    id: 'new-uid',
    nombre_completo: 'Carlos Pérez',
    rol: 'mecanico',
    sede_id: SEDE_ID,
    telefono: '555-0100',
    email: 'nuevo@taller.com',
  };
  const { deps, fake } = createAdminTestDeps({
    from: (q) => {
      if (q.table === 'sedes') return { data: { id: SEDE_ID }, error: null };
      if (q.table === 'perfiles' && q.action === 'insert') {
        return { data: createdProfile, error: null };
      }
      return undefined;
    },
    createUser: () => ({ data: { user: { id: 'new-uid' } }, error: null }),
  });

  const res = await handler(authedRequest(validPayload()), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { profile: createdProfile });
  const createCall = fake.calls.auth.find((c) => c.method === 'admin.createUser');
  assertEquals(createCall?.args[0], {
    email: 'nuevo@taller.com',
    password: 'Password123',
    email_confirm: true,
  });
});

Deno.test('create-employee: teléfono con solo espacios se guarda como null en perfiles', async () => {
  const { deps, fake } = createAdminTestDeps({
    from: (q) => {
      if (q.table === 'sedes') return { data: { id: SEDE_ID }, error: null };
      if (q.table === 'perfiles' && q.action === 'insert') {
        return {
          data: {
            id: 'new-uid',
            nombre_completo: 'Carlos Pérez',
            rol: 'mecanico',
            sede_id: SEDE_ID,
            telefono: null,
            email: 'nuevo@taller.com',
          },
          error: null,
        };
      }
      return undefined;
    },
    createUser: () => ({ data: { user: { id: 'new-uid' } }, error: null }),
  });

  const res = await handler(authedRequest(validPayload({ telefono: '   ' })), deps);
  assertEquals(res.status, 200);
  const insertCall = fake.calls.from.find((q) => q.table === 'perfiles' && q.action === 'insert');
  assertEquals((insertCall?.payload as Record<string, unknown>)?.telefono, null);
});

Deno.test('create-employee: fallo al consultar sede devuelve 503 sin llamar createUser', async () => {
  const { deps, fake } = createAdminTestDeps({
    from: (q) => {
      if (q.table === 'sedes') return { data: null, error: { message: 'db timeout' } };
      return undefined;
    },
  });

  const res = await handler(authedRequest(validPayload()), deps);
  assertEquals(res.status, 503);
  assertEquals(await res.json(), {
    error: 'No se pudo comprobar en este momento. Intenta de nuevo.',
    code: 'unavailable',
  });
  assertEquals(fake.calls.auth.filter((c) => c.method === 'admin.createUser').length, 0);
});
