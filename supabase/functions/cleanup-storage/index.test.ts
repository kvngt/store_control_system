import { assertEquals } from 'jsr:@std/assert@1';
import { createFakeSupabase } from '../_shared/test_doubles.ts';
import { type Deps, handler } from './handler.ts';

function makeDeps(
  fake: ReturnType<typeof createFakeSupabase>,
  secret: string | undefined = 'secreto-interno',
): Deps {
  const env: Record<string, string | undefined> = {
    RESTORIFY_FUNCTIONS_SECRET: secret,
  };
  return {
    supabase: fake.client,
    getEnv: (k) => env[k],
  };
}

Deno.test('cleanup-storage: sin cabecera x-restorify-secret devuelve 401', async () => {
  const fake = createFakeSupabase();
  const res = await handler(new Request('https://fn.test/cleanup-storage', { method: 'POST' }), makeDeps(fake));
  assertEquals(res.status, 401);
  assertEquals(await res.json(), { error: 'No autorizado.' });
  assertEquals(fake.calls.rpc.length, 0);
  assertEquals(fake.calls.storage.length, 0);
});

Deno.test('cleanup-storage: con secreto incorrecto devuelve 401', async () => {
  const fake = createFakeSupabase();
  const res = await handler(
    new Request('https://fn.test/cleanup-storage', {
      method: 'POST',
      headers: { 'x-restorify-secret': 'secreto-invalido' },
    }),
    makeDeps(fake),
  );
  assertEquals(res.status, 401);
  assertEquals(fake.calls.rpc.length, 0);
});

Deno.test('cleanup-storage: sin secreto configurado en entorno devuelve 401 aunque llegue cabecera', async () => {
  const fake = createFakeSupabase();
  const res = await handler(
    new Request('https://fn.test/cleanup-storage', {
      method: 'POST',
      headers: { 'x-restorify-secret': 'cualquier-cosa' },
    }),
    makeDeps(fake, undefined),
  );
  assertEquals(res.status, 401);
  assertEquals(fake.calls.rpc.length, 0);
});

Deno.test('cleanup-storage: sin archivos huérfanos devuelve removed 0 y no llama storage.remove', async () => {
  const fake = createFakeSupabase({
    rpc: () => ({ data: [], error: null }),
  });
  const res = await handler(
    new Request('https://fn.test/cleanup-storage', {
      method: 'POST',
      headers: { 'x-restorify-secret': 'secreto-interno' },
    }),
    makeDeps(fake),
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { removed: 0 });
  assertEquals(fake.calls.rpc, [{ fn: 'archivos_huerfanos', args: { p_limit: 500 } }]);
  assertEquals(fake.calls.storage.length, 0);
});

Deno.test('cleanup-storage: borra 150 archivos en lotes de 100 y 50 del bucket orden_media', async () => {
  const files = Array.from({ length: 150 }, (_, i) => ({ nombre: `sede/archivo-${i}.jpg` }));
  let round = 0;
  const fake = createFakeSupabase({
    rpc: () => {
      round += 1;
      return { data: round === 1 ? files : [], error: null };
    },
  });

  const res = await handler(
    new Request('https://fn.test/cleanup-storage', {
      method: 'POST',
      headers: { 'x-restorify-secret': 'secreto-interno' },
    }),
    makeDeps(fake),
  );

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { removed: 150 });
  assertEquals(fake.calls.storage.length, 2);
  assertEquals(fake.calls.storage[0].bucket, 'orden_media');
  assertEquals(fake.calls.storage[0].paths.length, 100);
  assertEquals(fake.calls.storage[1].paths.length, 50);
});

Deno.test('cleanup-storage: se detiene tras MAX_ROUNDS = 10 rondas', async () => {
  const fake = createFakeSupabase({
    rpc: () => ({ data: [{ nombre: 'sede/uno.jpg' }], error: null }),
  });

  const res = await handler(
    new Request('https://fn.test/cleanup-storage', {
      method: 'POST',
      headers: { 'x-restorify-secret': 'secreto-interno' },
    }),
    makeDeps(fake),
  );

  assertEquals(res.status, 200);
  assertEquals(await res.json(), { removed: 10 });
  assertEquals(fake.calls.rpc.length, 10);
});

Deno.test('cleanup-storage: error en archivos_huerfanos devuelve 500', async () => {
  const fake = createFakeSupabase({
    rpc: () => ({ data: null, error: { message: 'db down' } }),
  });

  const res = await handler(
    new Request('https://fn.test/cleanup-storage', {
      method: 'POST',
      headers: { 'x-restorify-secret': 'secreto-interno' },
    }),
    makeDeps(fake),
  );

  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: 'db down', removed: 0 });
});

Deno.test('cleanup-storage: error en storage.remove reporta el acumulado y devuelve 500', async () => {
  const files = Array.from({ length: 120 }, (_, i) => ({ nombre: `sede/archivo-${i}.jpg` }));
  let batchCall = 0;
  const fake = createFakeSupabase({
    rpc: () => ({ data: files, error: null }),
    storageRemove: () => {
      batchCall += 1;
      if (batchCall === 2) return { error: { message: 'storage fail' } };
      return { data: [], error: null };
    },
  });

  const res = await handler(
    new Request('https://fn.test/cleanup-storage', {
      method: 'POST',
      headers: { 'x-restorify-secret': 'secreto-interno' },
    }),
    makeDeps(fake),
  );

  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: 'storage fail', removed: 100 });
});
