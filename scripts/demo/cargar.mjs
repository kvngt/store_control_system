// Carga un taller de ejemplo bilingüe en la base LOCAL usando las mismas RPC y políticas
// que la aplicación, nunca contra producción ni insertando dinero a mano.
import { ensureAccountsInFirstSede, localStack } from '../lib/local-stack.mjs';
import {
  DEMO_ACCOUNTS,
  DEMO_CUSTOMERS,
  DEMO_SIGNATURE_PNG,
  assertRowsAffected,
  fetchAllRows,
  formatApiError,
  isDemoMarked,
  localDateOffset,
  markDemoName,
  signInClient,
} from './lib.mjs';

async function uploadSignatureAndSign(adminDb, sedeId, orderId) {
  const path = `${sedeId}/${orderId}/firma-demo-${Date.now()}.png`;
  const blob = new Blob([DEMO_SIGNATURE_PNG], { type: 'image/png' });
  const { error: uploadError } = await adminDb.storage
    .from('orden_media')
    .upload(path, blob, { contentType: 'image/png', cacheControl: '3600', upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await adminDb
    .from('ordenes_trabajo')
    .update({ firma_ruta: path, firma_fecha: new Date().toISOString() })
    .eq('id', orderId)
    .select('id');
  if (error) throw error;
  assertRowsAffected(data, 'la firma de recepción');
}

async function createOrderRpc(adminDb, { sedeId, adminId, clienteId, vehiculoId, tipoTrabajo, millas, gasolina, deposito = 0, depositoMetodo = null, notas = '', diasEntrega = 3, autorizadoEnRecepcion = false, marcasDanos = [], labor = [], parts = [] }) {
  const pOrder = {
    sede_id: sedeId,
    cliente_id: clienteId,
    vehiculo_id: vehiculoId,
    tipo_trabajo: tipoTrabajo,
    millas_ingreso: millas,
    nivel_gasolina: gasolina,
    deposito_inicial: deposito,
    ...(deposito > 0 && depositoMetodo ? { deposito_metodo: depositoMetodo } : {}),
    inspeccion_360_notas: notas,
    fecha_estimada_entrega: localDateOffset(diasEntrega),
    creado_por: adminId,
    autorizado_en_recepcion: autorizadoEnRecepcion,
    marcas_danos: marcasDanos,
  };

  const { data, error } = await adminDb.rpc('create_work_order', {
    p_order: pOrder,
    p_labor: labor.map((l) => ({
      descripcion: l.descripcion,
      costo: l.costo,
      especialidad: l.especialidad,
      asignado_a: l.asignado_a ?? null,
      reparto_heredado: false,
    })),
    p_parts: parts.map((p) => ({
      descripcion: p.descripcion,
      cantidad: p.cantidad,
      precio_venta_unitario: p.precio_venta_unitario,
      costo_unitario: p.costo_unitario ?? p.precio_venta_unitario,
    })),
    p_assignments: [],
  });
  if (error) throw error;
  return data;
}

async function getOrderLines(adminDb, orderId) {
  const [{ data: labor, error: laborError }, { data: parts, error: partsError }] = await Promise.all([
    adminDb
      .from('orden_labor')
      .select('id, descripcion, asignado_a, estado')
      .eq('orden_id', orderId)
      .order('creado_en', { ascending: true })
      .order('id', { ascending: true }),
    adminDb
      .from('orden_repuestos')
      .select('id, descripcion, estado')
      .eq('orden_id', orderId)
      .order('creado_en', { ascending: true })
      .order('id', { ascending: true }),
  ]);
  if (laborError) throw laborError;
  if (partsError) throw partsError;
  return { labor: labor ?? [], parts: parts ?? [] };
}

async function main() {
  const stack = await localStack();
  const { apiUrl, anonKey } = stack;
  const { password, cuentas, sede } = await ensureAccountsInFirstSede(stack, DEMO_ACCOUNTS);

  const adminAcc = cuentas.find((c) => c.key === 'ADMIN');
  const mechAcc = cuentas.find((c) => c.key === 'MECHANIC');
  const paintAcc = cuentas.find((c) => c.key === 'PAINTER');

  const [adminDb, mechDb, paintDb] = await Promise.all([
    signInClient(apiUrl, anonKey, adminAcc.email, password),
    signInClient(apiUrl, anonKey, mechAcc.email, password),
    signInClient(apiUrl, anonKey, paintAcc.email, password),
  ]);

  // Evitar duplicados: si existen clientes marcados con órdenes activas/no archivadas o sin
  // órdenes archivadas, se pide correr `demo:borrar` primero. Si solo quedan los clientes
  // retenidos por órdenes entregadas ya archivadas de un `demo:borrar` previo, se reutilizan.
  const allClientes = await fetchAllRows((from, to) =>
    adminDb
      .from('clientes')
      .select('id, sede_id, nombre, idioma')
      .order('creado_en', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  );
  const markedClientes = allClientes.filter((c) => isDemoMarked(c.nombre));
  const markedClientIds = new Set(markedClientes.map((c) => c.id));

  let existingVehicles = [];
  if (markedClientes.length > 0) {
    const allOrders = await fetchAllRows((from, to) =>
      adminDb
        .from('ordenes_trabajo')
        .select('id, cliente_id, archivada_en')
        .order('creado_en', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    );
    const demoOrders = allOrders.filter((o) => markedClientIds.has(o.cliente_id));
    const hasUnarchivedOrder = demoOrders.some((o) => o.archivada_en === null);
    const clientsWithArchived = new Set(demoOrders.filter((o) => o.archivada_en !== null).map((o) => o.cliente_id));
    const hasActiveMarkedClient = markedClientes.some((c) => !clientsWithArchived.has(c.id));

    if (hasUnarchivedOrder || hasActiveMarkedClient) {
      console.log('Ya hay datos de ejemplo; corre `npm run demo:borrar` primero.');
      return;
    }

    existingVehicles = (
      await fetchAllRows((from, to) =>
        adminDb
          .from('vehiculos')
          .select('id, cliente_id, placa')
          .order('creado_en', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      )
    ).filter((v) => markedClientIds.has(v.cliente_id));
  }

  console.log(`Cargando datos de ejemplo en ${apiUrl} (sede: ${sede.nombre})...`);

  // 1. Clientes y vehículos (reutilizando los retenidos por archivo si los hubiera).
  const byKey = new Map();
  let createdCustomers = 0;
  let reusedCustomers = 0;
  let createdVehicles = 0;
  let reusedVehicles = 0;

  for (const spec of DEMO_CUSTOMERS) {
    const markedName = markDemoName(spec.nombre);
    let cliente = markedClientes.find((c) => c.sede_id === sede.id && c.nombre === markedName);
    if (cliente) {
      reusedCustomers += 1;
    } else {
      const { data, error } = await adminDb
        .from('clientes')
        .insert({
          sede_id: sede.id,
          nombre: markedName,
          telefono: spec.telefono,
          email: spec.email,
          direccion: spec.direccion,
          notas_crm: spec.notas_crm,
          idioma: spec.idioma,
        })
        .select()
        .single();
      if (error) throw error;
      cliente = data;
      createdCustomers += 1;
    }

    let vehiculo = existingVehicles.find((v) => v.cliente_id === cliente.id);
    if (vehiculo) {
      reusedVehicles += 1;
    } else {
      const { data, error } = await adminDb
        .from('vehiculos')
        .insert({
          cliente_id: cliente.id,
          marca: spec.vehiculo.marca,
          modelo: spec.vehiculo.modelo,
          anio: spec.vehiculo.anio,
          color: spec.vehiculo.color,
          vin: spec.vehiculo.vin,
          placa: spec.vehiculo.placa,
          placa_estado: spec.vehiculo.placa_estado,
        })
        .select()
        .single();
      if (error) throw error;
      vehiculo = data;
      createdVehicles += 1;
    }

    byKey.set(spec.key, { spec, cliente, vehiculo });
  }

  console.log(
    `1. Clientes y vehículos listos: ${createdCustomers} clientes nuevos` +
      (reusedCustomers ? ` (${reusedCustomers} reutilizados por archivo)` : '') +
      `, ${createdVehicles} vehículos nuevos` +
      (reusedVehicles ? ` (${reusedVehicles} reutilizados)` : '') +
      '.',
  );

  const resumenOrdenes = [];

  // Orden 1: Recepción sin firma (recién creada, español).
  {
    const { cliente, vehiculo } = byKey.get('c1');
    const orden = await createOrderRpc(adminDb, {
      sedeId: sede.id,
      adminId: adminAcc.id,
      clienteId: cliente.id,
      vehiculoId: vehiculo.id,
      tipoTrabajo: 'mecanica',
      millas: 64200,
      gasolina: '3/4',
      notas: 'Vibración ligera al frenar en bajada; cliente espera cotización.',
      diasEntrega: 4,
      autorizadoEnRecepcion: false,
      marcasDanos: [{ vista: 'frontal', x: 0.42, y: 0.55, tipo: 'rayon' }],
      labor: [
        { descripcion: 'Inspección y rectificación de discos delanteros', costo: 145, especialidad: 'mecanica', asignado_a: mechAcc.id },
        { descripcion: 'Cambio de pastillas cerámicas delanteras', costo: 95, especialidad: 'mecanica', asignado_a: mechAcc.id },
      ],
      parts: [
        { descripcion: 'Juego de pastillas cerámicas delanteras', cantidad: 1, precio_venta_unitario: 78, costo_unitario: 52 },
      ],
    });
    resumenOrdenes.push({ id: orden.id, numero: orden.numero_orden, estado: 'recepcion (sin firma)', idioma: 'es' });
  }

  // Orden 2: Esperando autorización (en inglés; diagnóstico inicial autorizado -> envío de presupuesto adicional).
  {
    const { cliente, vehiculo } = byKey.get('c2');
    const orden = await createOrderRpc(adminDb, {
      sedeId: sede.id,
      adminId: adminAcc.id,
      clienteId: cliente.id,
      vehiculoId: vehiculo.id,
      tipoTrabajo: 'mecanica',
      millas: 48900,
      gasolina: '1/2',
      notas: 'Check engine light on; initial scan authorized at counter.',
      diasEntrega: 5,
      autorizadoEnRecepcion: true,
      labor: [
        { descripcion: 'Electronic engine diagnostic', costo: 95, especialidad: 'mecanica', asignado_a: mechAcc.id },
      ],
    });
    await uploadSignatureAndSign(adminDb, sede.id, orden.id);

    const { error: lErr } = await adminDb.from('orden_labor').insert([
      {
        orden_id: orden.id,
        descripcion: 'Throttle body replacement',
        costo: 210,
        especialidad: 'mecanica',
        asignado_a: mechAcc.id,
        reparto_heredado: false,
      },
      {
        orden_id: orden.id,
        descripcion: 'Fuel injector cleaning and calibration',
        costo: 135,
        especialidad: 'mecanica',
        asignado_a: mechAcc.id,
        reparto_heredado: false,
      },
    ]);
    if (lErr) throw lErr;

    const { error: pErr } = await adminDb.from('orden_repuestos').insert({
      orden_id: orden.id,
      descripcion: 'OEM throttle body',
      cantidad: 1,
      precio_venta_unitario: 285,
      costo_unitario: 215,
      subtotal: 285,
    });
    if (pErr) throw pErr;

    const { error: qErr } = await adminDb.rpc('enviar_presupuesto', { p_orden_id: orden.id, p_notificar: true });
    if (qErr) throw qErr;

    resumenOrdenes.push({ id: orden.id, numero: orden.numero_orden, estado: 'espera_autorizacion (presupuesto enviado)', idioma: 'en' });
  }

  // Orden 3: En proceso con avances (autorizada con `registrar_autorizacion`, una tarea hecha y 2 avances).
  {
    const { cliente, vehiculo } = byKey.get('c3');
    const orden = await createOrderRpc(adminDb, {
      sedeId: sede.id,
      adminId: adminAcc.id,
      clienteId: cliente.id,
      vehiculoId: vehiculo.id,
      tipoTrabajo: 'combinado',
      millas: 81500,
      gasolina: '1/4',
      notas: 'Golpe leve en guardafango izquierdo y revisión de suspensión.',
      diasEntrega: 2,
      autorizadoEnRecepcion: false,
      marcasDanos: [
        { vista: 'izquierda', x: 0.24, y: 0.48, tipo: 'golpe' },
        { vista: 'izquierda', x: 0.28, y: 0.52, tipo: 'pintura' },
      ],
      labor: [
        { descripcion: 'Cambio de amortiguadores delanteros', costo: 260, especialidad: 'mecanica', asignado_a: mechAcc.id },
        { descripcion: 'Enderezado y pintura de guardafango izquierdo', costo: 390, especialidad: 'pintura', asignado_a: paintAcc.id },
      ],
      parts: [
        { descripcion: 'Par de amortiguadores delanteros', cantidad: 2, precio_venta_unitario: 145, costo_unitario: 105 },
      ],
    });
    await uploadSignatureAndSign(adminDb, sede.id, orden.id);

    const { labor, parts } = await getOrderLines(adminDb, orden.id);
    const allLineIds = [...labor.map((l) => l.id), ...parts.map((p) => p.id)];
    const { error: authErr } = await adminDb.rpc('registrar_autorizacion', {
      p_orden_id: orden.id,
      p_aprobadas: allLineIds,
      p_lineas: allLineIds,
      p_via: 'admin_presencial',
      p_nombre: cliente.nombre,
      p_nota: 'Autorizado en recepción.',
    });
    if (authErr) throw authErr;

    const mechTask = labor.find((l) => l.asignado_a === mechAcc.id);
    const { error: compErr } = await mechDb.rpc('marcar_labor_completada', {
      p_labor_id: mechTask.id,
      p_completado: true,
    });
    if (compErr) throw compErr;

    const { error: av1Err } = await mechDb.from('orden_avances').insert({
      orden_id: orden.id,
      usuario_id: mechAcc.id,
      descripcion: 'Amortiguadores instalados; se verificó torque de tornillería.',
      visible_cliente: false,
      labor_id: mechTask.id,
    });
    if (av1Err) throw av1Err;

    const { error: av2Err } = await mechDb.from('orden_avances').insert({
      orden_id: orden.id,
      usuario_id: mechAcc.id,
      descripcion: 'Suspensión delantera lista y probada en ruta; el vehículo pasa a cabina de pintura.',
      visible_cliente: true,
      labor_id: mechTask.id,
    });
    if (av2Err) throw av2Err;

    resumenOrdenes.push({ id: orden.id, numero: orden.numero_orden, estado: 'en_proceso (con avances)', idioma: 'es' });
  }

  // Orden 4: En proceso autorizada, sin avances todavía (cliente sin correo).
  {
    const { cliente, vehiculo } = byKey.get('c4');
    const orden = await createOrderRpc(adminDb, {
      sedeId: sede.id,
      adminId: adminAcc.id,
      clienteId: cliente.id,
      vehiculoId: vehiculo.id,
      tipoTrabajo: 'pintura',
      millas: 93100,
      gasolina: '1/2',
      notas: 'Rayón profundo en puerta trasera derecha; cliente sin correo electrónico.',
      diasEntrega: 3,
      autorizadoEnRecepcion: true,
      marcasDanos: [{ vista: 'derecha', x: 0.58, y: 0.54, tipo: 'rayon' }],
      labor: [
        { descripcion: 'Preparación y masillado de puerta trasera derecha', costo: 180, especialidad: 'pintura', asignado_a: paintAcc.id },
        { descripcion: 'Pintura bicapa y barniz de puerta trasera derecha', costo: 320, especialidad: 'pintura', asignado_a: paintAcc.id },
      ],
      parts: [
        { descripcion: 'Moldura lateral trasera derecha', cantidad: 1, precio_venta_unitario: 65, costo_unitario: 45 },
      ],
    });
    await uploadSignatureAndSign(adminDb, sede.id, orden.id);

    resumenOrdenes.push({ id: orden.id, numero: orden.numero_orden, estado: 'en_proceso (sin avances, sin correo)', idioma: 'es' });
  }

  // Orden 5: En espera de autorización por hallazgo adicional del técnico (`reportar_hallazgo`).
  {
    const { cliente, vehiculo } = byKey.get('c5');
    const orden = await createOrderRpc(adminDb, {
      sedeId: sede.id,
      adminId: adminAcc.id,
      clienteId: cliente.id,
      vehiculoId: vehiculo.id,
      tipoTrabajo: 'mecanica',
      millas: 54700,
      gasolina: '3/4',
      notas: '60k mile maintenance service.',
      diasEntrega: 2,
      autorizadoEnRecepcion: true,
      labor: [
        { descripcion: '60,000-mile major service', costo: 240, especialidad: 'mecanica', asignado_a: mechAcc.id },
        { descripcion: 'Iridium spark plug replacement', costo: 130, especialidad: 'mecanica', asignado_a: mechAcc.id },
      ],
      parts: [
        { descripcion: 'Filter and spark plug kit', cantidad: 1, precio_venta_unitario: 125, costo_unitario: 88 },
      ],
    });
    await uploadSignatureAndSign(adminDb, sede.id, orden.id);

    const { error: hallErr } = await mechDb.rpc('reportar_hallazgo', {
      p_orden_id: orden.id,
      p_descripcion: 'Upper radiator hose is cracked with a minor coolant leak; it needs replacement before delivery.',
    });
    if (hallErr) throw hallErr;

    resumenOrdenes.push({ id: orden.id, numero: orden.numero_orden, estado: 'espera_autorizacion (hallazgo técnico)', idioma: 'en' });
  }

  // Orden 6: Terminada (`finalizado`) por el técnico, pendiente de confirmación de administración.
  {
    const { cliente, vehiculo } = byKey.get('c6');
    const orden = await createOrderRpc(adminDb, {
      sedeId: sede.id,
      adminId: adminAcc.id,
      clienteId: cliente.id,
      vehiculoId: vehiculo.id,
      tipoTrabajo: 'pintura',
      millas: 37400,
      gasolina: 'Lleno',
      notas: 'Pulido completo y retoque de defensa trasera.',
      diasEntrega: 1,
      autorizadoEnRecepcion: true,
      labor: [
        { descripcion: 'Repintado de defensa trasera', costo: 340, especialidad: 'pintura', asignado_a: paintAcc.id },
        { descripcion: 'Pulido cerámico de carrocería completa', costo: 220, especialidad: 'pintura', asignado_a: paintAcc.id },
      ],
    });
    await uploadSignatureAndSign(adminDb, sede.id, orden.id);

    const { labor } = await getOrderLines(adminDb, orden.id);
    for (const item of labor) {
      const { error: markErr } = await paintDb.rpc('marcar_labor_completada', {
        p_labor_id: item.id,
        p_completado: true,
      });
      if (markErr) throw markErr;
    }

    const { error: avErr } = await paintDb.from('orden_avances').insert({
      orden_id: orden.id,
      usuario_id: paintAcc.id,
      descripcion: 'Pintura y pulido finalizados; brillo uniforme verificado bajo lámpara.',
      visible_cliente: true,
    });
    if (avErr) throw avErr;

    const { data: finRows, error: finErr } = await paintDb
      .from('ordenes_trabajo')
      .update({ estatus: 'finalizado', porcentaje_avance: 100 })
      .eq('id', orden.id)
      .select('id');
    if (finErr) throw finErr;
    assertRowsAffected(finRows, 'finalizar orden 6');

    resumenOrdenes.push({ id: orden.id, numero: orden.numero_orden, estado: 'finalizado (por revisar)', idioma: 'es' });
  }

  // Orden 7: Lista para entregar (`marcar_lista_para_entregar`).
  {
    const { cliente, vehiculo } = byKey.get('c7');
    const orden = await createOrderRpc(adminDb, {
      sedeId: sede.id,
      adminId: adminAcc.id,
      clienteId: cliente.id,
      vehiculoId: vehiculo.id,
      tipoTrabajo: 'mecanica',
      millas: 72150,
      gasolina: '1/2',
      notas: 'A/C compressor replacement and recharge.',
      diasEntrega: 0,
      autorizadoEnRecepcion: true,
      labor: [
        { descripcion: 'A/C compressor replacement', costo: 310, especialidad: 'mecanica', asignado_a: mechAcc.id },
        { descripcion: 'R-134a refrigerant vacuum and recharge', costo: 115, especialidad: 'mecanica', asignado_a: mechAcc.id },
      ],
      parts: [
        { descripcion: 'Remanufactured A/C compressor', cantidad: 1, precio_venta_unitario: 360, costo_unitario: 250 },
      ],
    });
    await uploadSignatureAndSign(adminDb, sede.id, orden.id);

    const { labor } = await getOrderLines(adminDb, orden.id);
    for (const item of labor) {
      const { error: markErr } = await mechDb.rpc('marcar_labor_completada', {
        p_labor_id: item.id,
        p_completado: true,
      });
      if (markErr) throw markErr;
    }

    const { data: finRows, error: finErr } = await mechDb
      .from('ordenes_trabajo')
      .update({ estatus: 'finalizado', porcentaje_avance: 100 })
      .eq('id', orden.id)
      .select('id');
    if (finErr) throw finErr;
    assertRowsAffected(finRows, 'finalizar orden 7');

    const { error: readyErr } = await adminDb.rpc('marcar_lista_para_entregar', { p_orden_id: orden.id });
    if (readyErr) throw readyErr;

    resumenOrdenes.push({ id: orden.id, numero: orden.numero_orden, estado: 'finalizado (lista para entregar)', idioma: 'en' });
  }

  // Orden 8: Entregada y cobrada con tarjeta (incluye depósito inicial en efectivo y 2 técnicos).
  {
    const { cliente, vehiculo } = byKey.get('c8');
    const orden = await createOrderRpc(adminDb, {
      sedeId: sede.id,
      adminId: adminAcc.id,
      clienteId: cliente.id,
      vehiculoId: vehiculo.id,
      tipoTrabajo: 'combinado',
      millas: 29800,
      gasolina: '3/4',
      deposito: 150,
      depositoMetodo: 'efectivo',
      notas: 'Reparación trasera y alineación tras roce de estacionamiento.',
      diasEntrega: 0,
      autorizadoEnRecepcion: true,
      marcasDanos: [{ vista: 'trasera', x: 0.65, y: 0.58, tipo: 'golpe' }],
      labor: [
        { descripcion: 'Alineación y balanceo de 4 ruedas', costo: 120, especialidad: 'mecanica', asignado_a: mechAcc.id },
        { descripcion: 'Enderezado y pintura de bomper trasero', costo: 420, especialidad: 'pintura', asignado_a: paintAcc.id },
      ],
      parts: [
        { descripcion: 'Sensor de estacionamiento trasero', cantidad: 1, precio_venta_unitario: 95, costo_unitario: 60 },
      ],
    });
    await uploadSignatureAndSign(adminDb, sede.id, orden.id);

    const { labor } = await getOrderLines(adminDb, orden.id);
    for (const item of labor) {
      const actorDb = item.asignado_a === paintAcc.id ? paintDb : mechDb;
      const { error: markErr } = await actorDb.rpc('marcar_labor_completada', {
        p_labor_id: item.id,
        p_completado: true,
      });
      if (markErr) throw markErr;
    }

    const { data: finRows, error: finErr } = await mechDb
      .from('ordenes_trabajo')
      .update({ estatus: 'finalizado', porcentaje_avance: 100 })
      .eq('id', orden.id)
      .select('id');
    if (finErr) throw finErr;
    assertRowsAffected(finRows, 'finalizar orden 8');

    const { error: readyErr } = await adminDb.rpc('marcar_lista_para_entregar', { p_orden_id: orden.id });
    if (readyErr) throw readyErr;

    const { error: delErr } = await adminDb.rpc('entregar_orden', {
      p_orden_id: orden.id,
      p_metodo: 'tarjeta',
      p_numero_cheque: null,
      p_comprobante_ruta: null,
    });
    if (delErr) throw delErr;

    resumenOrdenes.push({ id: orden.id, numero: orden.numero_orden, estado: 'entregado (cobrada con tarjeta)', idioma: 'es' });
  }

  // Orden 9: Entregada y cobrada con Zelle.
  {
    const { cliente, vehiculo } = byKey.get('c9');
    const orden = await createOrderRpc(adminDb, {
      sedeId: sede.id,
      adminId: adminAcc.id,
      clienteId: cliente.id,
      vehiculoId: vehiculo.id,
      tipoTrabajo: 'mecanica',
      millas: 61400,
      gasolina: '1/2',
      notas: 'Alternator and serpentine belt replacement.',
      diasEntrega: 0,
      autorizadoEnRecepcion: true,
      labor: [
        { descripcion: 'Alternator replacement', costo: 195, especialidad: 'mecanica', asignado_a: mechAcc.id },
        { descripcion: 'Serpentine belt and tensioner replacement', costo: 110, especialidad: 'mecanica', asignado_a: mechAcc.id },
      ],
      parts: [
        { descripcion: '130A alternator', cantidad: 1, precio_venta_unitario: 270, costo_unitario: 190 },
        { descripcion: 'Serpentine belt', cantidad: 1, precio_venta_unitario: 42, costo_unitario: 24 },
      ],
    });
    await uploadSignatureAndSign(adminDb, sede.id, orden.id);

    const { labor } = await getOrderLines(adminDb, orden.id);
    for (const item of labor) {
      const { error: markErr } = await mechDb.rpc('marcar_labor_completada', {
        p_labor_id: item.id,
        p_completado: true,
      });
      if (markErr) throw markErr;
    }

    const { error: avErr } = await mechDb.from('orden_avances').insert({
      orden_id: orden.id,
      usuario_id: mechAcc.id,
      descripcion: 'Alternator installed; charging verified at 14.2 V with the electrical load on.',
      visible_cliente: true,
    });
    if (avErr) throw avErr;

    const { data: finRows, error: finErr } = await mechDb
      .from('ordenes_trabajo')
      .update({ estatus: 'finalizado', porcentaje_avance: 100 })
      .eq('id', orden.id)
      .select('id');
    if (finErr) throw finErr;
    assertRowsAffected(finRows, 'finalizar orden 9');

    const { error: readyErr } = await adminDb.rpc('marcar_lista_para_entregar', { p_orden_id: orden.id });
    if (readyErr) throw readyErr;

    const { error: delErr } = await adminDb.rpc('entregar_orden', {
      p_orden_id: orden.id,
      p_metodo: 'zelle',
      p_numero_cheque: null,
      p_comprobante_ruta: null,
    });
    if (delErr) throw delErr;

    resumenOrdenes.push({ id: orden.id, numero: orden.numero_orden, estado: 'entregado (cobrada con zelle)', idioma: 'en' });
  }

  // Orden 10: Retirada sin reparar (`retirar_sin_reparar`, conservando el diagnóstico hecho y devolviendo diferencia).
  {
    const { cliente, vehiculo } = byKey.get('c10');
    const orden = await createOrderRpc(adminDb, {
      sedeId: sede.id,
      adminId: adminAcc.id,
      clienteId: cliente.id,
      vehiculoId: vehiculo.id,
      tipoTrabajo: 'mecanica',
      millas: 112300,
      gasolina: '1/4',
      deposito: 200,
      depositoMetodo: 'efectivo',
      notas: 'Revisión de fuga en transmisión automática; cliente decide si continúa.',
      diasEntrega: 3,
      autorizadoEnRecepcion: true,
      labor: [
        { descripcion: 'Desmontaje parcial y diagnóstico de transmisión', costo: 120, especialidad: 'mecanica', asignado_a: mechAcc.id },
        { descripcion: 'Reconstrucción completa de transmisión automática', costo: 1150, especialidad: 'mecanica', asignado_a: mechAcc.id },
      ],
      parts: [
        { descripcion: 'Kit maestro de sellos y discos', cantidad: 1, precio_venta_unitario: 380, costo_unitario: 260 },
      ],
    });
    await uploadSignatureAndSign(adminDb, sede.id, orden.id);

    const { labor } = await getOrderLines(adminDb, orden.id);
    const diagTask = labor[0];
    const { error: markErr } = await mechDb.rpc('marcar_labor_completada', {
      p_labor_id: diagTask.id,
      p_completado: true,
    });
    if (markErr) throw markErr;

    const { error: retErr } = await adminDb.rpc('retirar_sin_reparar', {
      p_orden_id: orden.id,
      p_cobro: 0,
      p_concepto: null,
      p_metodo: 'efectivo',
      p_numero_cheque: null,
      p_comprobante_ruta: null,
      p_conservar: [diagTask.id],
    });
    if (retErr) throw retErr;

    resumenOrdenes.push({ id: orden.id, numero: orden.numero_orden, estado: 'retirada_sin_reparar', idioma: 'es' });
  }

  // Obtener tokens de enlace del cliente para imprimir un ejemplo en inglés y otro en español.
  const orderIds = resumenOrdenes.map((o) => o.id);
  const { data: enlaces, error: enlacesErr } = await adminDb
    .from('orden_enlaces')
    .select('orden_id, token')
    .in('orden_id', orderIds)
    .is('revocado_en', null);
  if (enlacesErr) throw enlacesErr;

  const tokenByOrderId = new Map((enlaces ?? []).map((e) => [e.orden_id, e.token]));
  const ejemploEs = resumenOrdenes.find((o) => o.idioma === 'es' && o.estado.startsWith('en_proceso') && tokenByOrderId.has(o.id))
    ?? resumenOrdenes.find((o) => o.idioma === 'es' && tokenByOrderId.has(o.id));
  const ejemploEn = resumenOrdenes.find((o) => o.idioma === 'en' && o.estado.startsWith('espera_autorizacion') && tokenByOrderId.has(o.id))
    ?? resumenOrdenes.find((o) => o.idioma === 'en' && tokenByOrderId.has(o.id));

  console.log(`\n2. Órdenes creadas (${resumenOrdenes.length}):`);
  for (const o of resumenOrdenes) {
    console.log(`   - ${o.numero}  [${o.idioma}]  ${o.estado}`);
  }

  console.log('\n3. Cuentas de demostración (solo local, contraseña nueva en esta corrida):');
  for (const c of cuentas) {
    console.log(`   - ${c.rol.padEnd(8)} ${c.nombre}  |  ${c.email}  |  ${password}`);
  }

  console.log('\n4. Enlaces de portal del cliente para probar:');
  if (ejemploEs) {
    console.log(`   - Español (${ejemploEs.numero}, ${ejemploEs.estado}): /r/${tokenByOrderId.get(ejemploEs.id)}`);
  }
  if (ejemploEn) {
    console.log(`   - Inglés  (${ejemploEn.numero}, ${ejemploEn.estado}): /r/${tokenByOrderId.get(ejemploEn.id)}`);
  }

  console.log('\nListo. Para quitar los datos de ejemplo cuando termines: `npm run demo:borrar`.');
}

main().catch((err) => {
  console.error(`Error cargando datos de ejemplo: ${formatApiError(err)}`);
  process.exit(1);
});
