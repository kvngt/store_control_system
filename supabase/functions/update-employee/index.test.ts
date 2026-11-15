import { assertEquals } from 'jsr:@std/assert@1';
import { createAdminTestDeps } from '../_shared/test_doubles.ts';
import { handler } from './handler.ts';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const SEDE_ID = '11111111-1111-4111-8111-111111111111';

const TARGET_PROFILE = {
  id: USER_ID,
  nombre_completo: 'Ana Gómez',
  rol: 'mecanico',
  sede_id: SEDE_ID,
  telefono: '555-0100',
  email: 'ana@taller.com',
};

function authedRequest(body: unknown, rawBody?: string): Request {
  return new Request('https://fn.test/update-employee', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer jwt-token',
      'Content-Type': 'application/json',
    },
    body: rawBody ?? JSON.stringify(body),
  });
}

Deno.test('update-employee: OPTIONS responde con cabeceras CORS', async () => {
  const { deps } = createAdminTestDeps();
  const res = await handler(new Request('https://fn.test/update-employee', { method: 'OPTIONS' }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.text(), 'ok');
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), '*');
});

Deno.test('update-employee: sin token devuelve 401', async () => {
  const { deps } = createAdminTestDeps();
  const res = await handler(new Request('https://fn.test/update-employee', { method: 'POST', body: '{}' }), deps);
  assertEquals(res.status, 401);
  assertEquals((await res.json()).code, 'session_expired');
});

Deno.test('update-employee: usuario no admin devuelve 403 sin tocar Auth.admin', async () => {
  const { deps, fake } = createAdminTestDeps({
    from: (q) => {
      if (q.table === 'perfiles' && q.columns === 'rol') {
        return { data: { rol: 'pintor' }, error: null };
      }
      return undefined;
    },
  });
  const res = await handler(authedRequest({ usuario_id: USER_ID, nombre_completo: 'Otro' }), deps);
  assertEquals(res.status, 403);
  assertEquals((await res.json()).code, 'admin_only');
  assertEquals(fake.calls.auth.filter((c) => c.method === 'admin.updateUserById').length, 0);
});

for (const [label, rawBody] of [
  ['JSON inválido', '{mal'],
  ['JSON null', 'null'],
  ['JSON arreglo', '[]'],
] as const) {
  Deno.test(`update-employee: ${label} devuelve 400`, async () => {
    const { deps } = createAdminTestDeps();
    const res = await handler(authedRequest(null, rawBody), deps);
    assertEquals(res.status, 400);
    assertEquals((await res.json()).code, 'bad_request');
  });
}

Deno.test('update-employee: validaciones previas a Auth devuelven su código sin llamar updateUserById', async () => {
  const cases: Array<{
    name: string;
    body: Record<string, unknown>;
    status: number;
    error: string;
    target?: Record<string, unknown> | null;
    sede?: Record<string, unknown> | null;
    adminCount?: number;
  }> = [
    { name: 'sin usuario_id', body: {}, status: 400, error: 'Falta el usuario a editar.' },
    { name: 'usuario_id inválido', body: { usuario_id: 'no-uuid' }, status: 400, error: 'El usuario no es válido.' },
    { name: 'usuario no existe', body: { usuario_id: USER_ID }, status: 404, error: 'Ese usuario ya no existe.', target: null },
    { name: 'nombre vacío', body: { usuario_id: USER_ID, nombre_completo: '   ' }, status: 400, error: 'El nombre es obligatorio.' },
    { name: 'nombre > 120', body: { usuario_id: USER_ID, nombre_completo: 'A'.repeat(121) }, status: 400, error: 'El nombre es demasiado largo.' },
    { name: 'teléfono > 40', body: { usuario_id: USER_ID, telefono: '9'.repeat(41) }, status: 400, error: 'El teléfono es demasiado largo.' },
    { name: 'sede vacía', body: { usuario_id: USER_ID, sede_id: ' ' }, status: 400, error: 'Selecciona una sede.' },
    { name: 'sede no UUID', body: { usuario_id: USER_ID, sede_id: 'mala' }, status: 400, error: 'La sede no es válida.' },
    { name: 'sede inexistente', body: { usuario_id: USER_ID, sede_id: SEDE_ID }, status: 400, error: 'Esa sede ya no existe.', sede: null },
    { name: 'rol inválido', body: { usuario_id: USER_ID, rol: 'dueno' }, status: 400, error: 'Rol inválido.' },
    {
      name: 'degradar al único admin',
      body: { usuario_id: USER_ID, rol: 'mecanico' },
      status: 409,
      error: 'No puedes quitar el rol de administrador al único administrador del sistema.',
      target: { ...TARGET_PROFILE, rol: 'admin' },
      adminCount: 1,
    },
    { name: 'correo inválido', body: { usuario_id: USER_ID, email: 'invalido' }, status: 400, error: 'El correo no tiene un formato válido.' },
    { name: 'contraseña < 8', body: { usuario_id: USER_ID, password: '123' }, status: 400, error: 'La contraseña debe tener al menos 8 caracteres.' },
    { name: 'sin cambios', body: { usuario_id: USER_ID }, status: 400, error: 'No hay cambios que guardar.' },
  ];

  for (const c of cases) {
    const { deps, fake } = createAdminTestDeps({
      from: (q) => {
        if (q.table === 'perfiles' && q.columns === '*') {
          return { data: c.target === undefined ? TARGET_PROFILE : c.target, error: null };
        }
        if (q.table === 'perfiles' && q.selectOptions?.head) {
          return { count: c.adminCount ?? 2, error: null };
        }
        if (q.table === 'sedes') {
          return { data: c.sede === undefined ? { id: SEDE_ID } : c.sede, error: null };
        }
        return undefined;
      },
    });
    const res = await handler(authedRequest(c.body), deps);
    assertEquals(res.status, c.status, c.name);
    assertEquals((await res.json()).error, c.error, c.name);
    assertEquals(
      fake.calls.auth.filter((call) => call.method === 'admin.updateUserById').length,
      0,
      `no debe llamar Auth.admin en: ${c.name}`,
    );
  }
});

Deno.test('update-employee: cambiar solo contraseña actualiza Auth y devuelve 200 sin actualizar perfiles', async () => {
  const { deps, fake } = createAdminTestDeps({
    from: (q) => {
      if (q.table === 'perfiles' && q.columns === '*') {
        return { data: TARGET_PROFILE, error: null };
      }
      return undefined;
    },
  });

  const res = await handler(authedRequest({ usuario_id: USER_ID, password: 'NuevaPassword1' }), deps);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { profile: TARGET_PROFILE });
  assertEquals(fake.calls.auth.find((c) => c.method === 'admin.updateUserById')?.args, [
    USER_ID,
    { password: 'NuevaPassword1' },
  ]);
  assertEquals(fake.calls.from.filter((q) => q.action === 'update').length, 0);
});

Deno.test('update-employee: si falla update de perfiles tras cambiar correo revierte el correo en Auth', async () => {
  const { deps, fake } = createAdminTestDeps({
    from: (q) => {
      if (q.table === 'perfiles' && q.columns === '*') {
        return { data: TARGET_PROFILE, error: null };
      }
      if (q.table === 'perfiles' && q.action === 'update') {
        return { data: null, error: { message: 'db write error' } };
      }
      return undefined;
    },
  });

  const res = await handler(authedRequest({ usuario_id: USER_ID, email: 'Nueva@Taller.com' }), deps);
  assertEquals(res.status, 400);
  assertEquals(await res.json(), { error: 'db write error' });
  const authUpdates = fake.calls.auth.filter((c) => c.method === 'admin.updateUserById');
  assertEquals(authUpdates.length, 2);
  assertEquals(authUpdates[0].args, [USER_ID, { email: 'nueva@taller.com', email_confirm: true }]);
  assertEquals(authUpdates[1].args, [USER_ID, { email: 'ana@taller.com', email_confirm: true }]);
});

Deno.test('update-employee: nombre_completo null devuelve 400 sin guardar "null"', async () => {
  const { deps, fake } = createAdminTestDeps({
    from: (q) => {
      if (q.table === 'perfiles' && q.columns === '*') {
        return { data: TARGET_PROFILE, error: null };
      }
      return undefined;
    },
  });

  const res = await handler(authedRequest({ usuario_id: USER_ID, nombre_completo: null }), deps);
  assertEquals(res.status, 400);
  assertEquals(await res.json(), { error: 'El nombre es obligatorio.' });
  assertEquals(fake.calls.from.filter((q) => q.action === 'update').length, 0);
  assertEquals(fake.calls.auth.filter((c) => c.method === 'admin.updateUserById').length, 0);
});

for (const [label, telefono] of [
  ['null', null],
  ['vacío', ''],
  ['solo espacios', '   '],
] as const) {
  Deno.test(`update-employee: telefono ${label} guarda null en perfiles`, async () => {
    const { deps, fake } = createAdminTestDeps({
      from: (q) => {
        if (q.table === 'perfiles' && q.columns === '*') {
          return { data: TARGET_PROFILE, error: null };
        }
        if (q.table === 'perfiles' && q.action === 'update') {
          return { data: { ...TARGET_PROFILE, telefono: null }, error: null };
        }
        return undefined;
      },
    });

    const res = await handler(authedRequest({ usuario_id: USER_ID, telefono }), deps);
    assertEquals(res.status, 200);
    const updateCall = fake.calls.from.find((q) => q.table === 'perfiles' && q.action === 'update');
    assertEquals(updateCall?.payload, { telefono: null });
  });
}

Deno.test('update-employee: fallo al consultar perfil devuelve 503 sin tocar Auth', async () => {
  const { deps, fake } = createAdminTestDeps({
    from: (q) => {
      if (q.table === 'perfiles' && q.columns === '*') {
        return { data: null, error: { message: 'db timeout' } };
      }
      return undefined;
    },
  });

  const res = await handler(authedRequest({ usuario_id: USER_ID, nombre_completo: 'Nuevo' }), deps);
  assertEquals(res.status, 503);
  assertEquals(await res.json(), {
    error: 'No se pudo comprobar en este momento. Intenta de nuevo.',
    code: 'unavailable',
  });
  assertEquals(fake.calls.auth.filter((c) => c.method === 'admin.updateUserById').length, 0);
});

Deno.test('update-employee: fallo al consultar sede devuelve 503 sin tocar Auth ni perfiles', async () => {
  const { deps, fake } = createAdminTestDeps({
    from: (q) => {
      if (q.table === 'perfiles' && q.columns === '*') {
        return { data: TARGET_PROFILE, error: null };
      }
      if (q.table === 'sedes') {
        return { data: null, error: { message: 'db timeout' } };
      }
      return undefined;
    },
  });

  const res = await handler(authedRequest({ usuario_id: USER_ID, sede_id: SEDE_ID }), deps);
  assertEquals(res.status, 503);
  assertEquals(await res.json(), {
    error: 'No se pudo comprobar en este momento. Intenta de nuevo.',
    code: 'unavailable',
  });
  assertEquals(fake.calls.from.filter((q) => q.action === 'update').length, 0);
  assertEquals(fake.calls.auth.filter((c) => c.method === 'admin.updateUserById').length, 0);
});

Deno.test('update-employee: fallo al contar administradores devuelve 503 en vez de 409', async () => {
  const { deps, fake } = createAdminTestDeps({
    from: (q) => {
      if (q.table === 'perfiles' && q.columns === '*') {
        return { data: { ...TARGET_PROFILE, rol: 'admin' }, error: null };
      }
      if (q.table === 'perfiles' && q.selectOptions?.head) {
        return { count: null, error: { message: 'db timeout' } };
      }
      return undefined;
    },
  });

  const res = await handler(authedRequest({ usuario_id: USER_ID, rol: 'mecanico' }), deps);
  assertEquals(res.status, 503);
  assertEquals(await res.json(), {
    error: 'No se pudo comprobar en este momento. Intenta de nuevo.',
    code: 'unavailable',
  });
  assertEquals(fake.calls.from.filter((q) => q.action === 'update').length, 0);
  assertEquals(fake.calls.auth.filter((c) => c.method === 'admin.updateUserById').length, 0);
});
