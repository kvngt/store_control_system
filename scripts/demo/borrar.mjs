// Quita los datos de ejemplo marcados (` · demo`) usando la sesión del administrador
// de demostración por la API y respetando las reglas de la base de datos.
import { ensureAccountsInFirstSede, localStack } from '../lib/local-stack.mjs';
import {
  DEMO_ACCOUNTS,
  assertRowsAffected,
  fetchAllRows,
  formatApiError,
  isDemoMarked,
  signInClient,
} from './lib.mjs';

async function main() {
  const stack = await localStack();
  const { apiUrl, anonKey, rest } = stack;

  const adminSpec = DEMO_ACCOUNTS[0];
  const authUsers = (await rest('/auth/v1/admin/users?per_page=1000')).users ?? [];
  const adminExists = authUsers.some((u) => (u.email || '').toLowerCase() === adminSpec.email.toLowerCase());

  if (!adminExists) {
    console.log('No hay datos de ejemplo.');
    return;
  }

  const { password, cuentas } = await ensureAccountsInFirstSede(stack, [adminSpec]);
  const adminDb = await signInClient(apiUrl, anonKey, cuentas[0].email, password);

  const allClientes = await fetchAllRows((from, to) =>
    adminDb
      .from('clientes')
      .select('id, nombre')
      .order('creado_en', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  );
  const markedClientes = allClientes.filter((c) => isDemoMarked(c.nombre));

  if (markedClientes.length === 0) {
    console.log('No hay datos de ejemplo.');
    console.log('Las cuentas de demostración se conservan (se reutilizan al volver a cargar).');
    return;
  }

  const markedClientIds = new Set(markedClientes.map((c) => c.id));

  const [allOrders, allVehicles, allMovements] = await Promise.all([
    fetchAllRows((from, to) =>
      adminDb
        .from('ordenes_trabajo')
        .select('id, numero_orden, estatus, retirada_sin_reparar, archivada_en, firma_ruta, cliente_id, vehiculo_id')
        .order('creado_en', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      adminDb
        .from('vehiculos')
        .select('id, cliente_id, marca, modelo, placa')
        .order('creado_en', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRows((from, to) =>
      adminDb
        .from('finanzas_movimientos')
        .select('referencia_orden_id')
        .is('importacion_id', null)
        .not('referencia_orden_id', 'is', null)
        .order('creado_en', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);

  const demoOrders = allOrders.filter((o) => markedClientIds.has(o.cliente_id));
  const demoVehicles = allVehicles.filter((v) => markedClientIds.has(v.cliente_id));
  const ordersWithMoney = new Set(allMovements.map((m) => m.referencia_orden_id));

  const borradas = [];
  const archivadas = [];
  const yaArchivadas = [];
  const noBorrables = [];
  const remainingOrders = [];

  for (const order of demoOrders) {
    if (order.estatus === 'entregado') {
      const etiqueta = order.retirada_sin_reparar ? 'retirada sin reparar' : 'entregada';
      if (order.archivada_en === null) {
        const { data, error } = await adminDb
          .from('ordenes_trabajo')
          .update({ archivada_en: new Date().toISOString() })
          .eq('id', order.id)
          .select('id');
        if (error) throw error;
        assertRowsAffected(data, `archivar ${order.numero_orden}`);
        archivadas.push({ numero: order.numero_orden, motivo: `${etiqueta}; por diseño no se borra` });
      } else {
        yaArchivadas.push({ numero: order.numero_orden, motivo: `${etiqueta}; ya estaba archivada` });
      }
      remainingOrders.push(order);
      continue;
    }

    if (ordersWithMoney.has(order.id)) {
      noBorrables.push({
        numero: order.numero_orden,
        motivo: 'tiene movimientos en Finanzas y no está entregada (por diseño debe cerrarse con «Retirada sin reparar»)',
      });
      remainingOrders.push(order);
      continue;
    }

    const { data: mediaList, error: mediaErr } = await adminDb
      .from('orden_media')
      .select('ruta, ruta_miniatura')
      .eq('orden_id', order.id);
    if (mediaErr) throw mediaErr;

    const { data: delData, error: delErr } = await adminDb
      .from('ordenes_trabajo')
      .delete()
      .eq('id', order.id)
      .select('id');
    if (delErr) {
      if (delErr.code === '42501' || delErr.code === 'P0001') {
        noBorrables.push({ numero: order.numero_orden, motivo: delErr.message });
        remainingOrders.push(order);
        continue;
      }
      throw delErr;
    }
    assertRowsAffected(delData, `borrar ${order.numero_orden}`);

    const storagePaths = [
      ...(mediaList ?? []).flatMap((m) => [m.ruta, m.ruta_miniatura]),
      order.firma_ruta,
    ].filter(Boolean);
    if (storagePaths.length > 0) {
      await adminDb.storage.from('orden_media').remove(storagePaths).catch(() => {});
    }

    borradas.push({ numero: order.numero_orden, estatus: order.estatus });
  }

  const remainingVehicleIds = new Set(remainingOrders.map((o) => o.vehiculo_id));
  const remainingClientIds = new Set(remainingOrders.map((o) => o.cliente_id));

  let vehiclesDeleted = 0;
  const vehiclesKept = [];
  for (const v of demoVehicles) {
    if (remainingVehicleIds.has(v.id)) {
      vehiclesKept.push(v);
      continue;
    }
    const { data, error } = await adminDb.from('vehiculos').delete().eq('id', v.id).select('id');
    if (error) throw error;
    assertRowsAffected(data, `borrar vehículo ${v.placa ?? v.id}`);
    vehiclesDeleted += 1;
  }

  let customersDeleted = 0;
  const customersKept = [];
  for (const c of markedClientes) {
    if (remainingClientIds.has(c.id)) {
      customersKept.push(c);
      continue;
    }
    const { data, error } = await adminDb.from('clientes').delete().eq('id', c.id).select('id');
    if (error) throw error;
    assertRowsAffected(data, `borrar cliente ${c.nombre}`);
    customersDeleted += 1;
  }

  if (
    borradas.length === 0 &&
    archivadas.length === 0 &&
    noBorrables.length === 0 &&
    vehiclesDeleted === 0 &&
    customersDeleted === 0
  ) {
    console.log('No hay datos de ejemplo activos por borrar.');
    if (yaArchivadas.length > 0) {
      console.log(
        `Se conservan ${yaArchivadas.length} orden(es) entregada(s) ya archivada(s), con ${customersKept.length} cliente(s) y ${vehiclesKept.length} vehículo(s) por diseño (tienen dinero o movimientos ligados).`,
      );
    }
    console.log('Las cuentas de demostración se dejan (se reutilizan al volver a cargar).');
    return;
  }

  console.log(`Limpieza de datos de ejemplo en ${apiUrl}:`);
  console.log(`- Órdenes borradas (${borradas.length}):`);
  for (const o of borradas) {
    console.log(`  · ${o.numero} (${o.estatus})`);
  }
  console.log(`- Órdenes archivadas ahora (${archivadas.length}):`);
  for (const o of archivadas) {
    console.log(`  · ${o.numero} (${o.motivo})`);
  }
  if (yaArchivadas.length > 0) {
    console.log(`- Órdenes que ya estaban archivadas (${yaArchivadas.length}):`);
    for (const o of yaArchivadas) {
      console.log(`  · ${o.numero} (${o.motivo})`);
    }
  }
  if (noBorrables.length > 0) {
    console.log(`- Órdenes conservadas por diseño (${noBorrables.length}):`);
    for (const o of noBorrables) {
      console.log(`  · ${o.numero}: ${o.motivo}`);
    }
  }
  console.log(`- Vehículos: ${vehiclesDeleted} borrados, ${vehiclesKept.length} conservados (ligados a órdenes archivadas/conservadas).`);
  console.log(`- Clientes: ${customersDeleted} borrados, ${customersKept.length} conservados (ligados a órdenes archivadas/conservadas).`);
  console.log('- Cuentas de demostración conservadas (`demo-admin@demo.restorify.test`, `demo-mecanico@demo.restorify.test`, `demo-pintor@demo.restorify.test`) para reutilizar al volver a cargar.');
}

main().catch((err) => {
  console.error(`Error al borrar datos de ejemplo: ${formatApiError(err)}`);
  process.exit(1);
});
