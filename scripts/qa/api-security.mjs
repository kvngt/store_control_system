#!/usr/bin/env node
// =====================================================================================
// Restorify — Pruebas de seguridad contra la API (plan de pruebas, casos SEC-*)
// =====================================================================================
// Hace lo que haría alguien con la clave pública de la app, o un técnico con su
// propia sesión, llamando la API directo en vez de usar la pantalla. Cada caso espera
// un rechazo o una lista vacía.
//
//   npm run qa:security                  # sin sesión + lo que permitan las cuentas
//   npm run qa:security -- --json        # resultado en JSON (para un agente)
//
// Configuración (variables de entorno; si faltan, se leen de .env.local y
// .env.test.local):
//
//   SB_URL / VITE_SUPABASE_URL, SB_ANON / VITE_SUPABASE_ANON_KEY
//   Técnico:  TOKEN_TECH, o QA_TECH_EMAIL + QA_TECH_PASSWORD, o E2E_MECHANIC_EMAIL + E2E_MECHANIC_PASSWORD
//   Admin:    TOKEN_ADMIN, o QA_ADMIN_EMAIL + QA_ADMIN_PASSWORD, o E2E_ADMIN_EMAIL + E2E_ADMIN_PASSWORD
//   Órdenes (opcional; si faltan se buscan con la sesión del técnico):
//     ORDEN (asignada, no entregada), ORDEN_AJENA (no asignada), ORDEN_ENTREGADA (asignada, entregada)
//
// Lo que no se puede preparar se marca SKIP, no FAIL. Termina con código 1 si algún
// caso falla.
//
// SOLO contra un entorno o datos de prueba: si la base tiene un hueco, la petición
// que lo demuestra sí escribe (por ejemplo, entrega la orden).
// =====================================================================================
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = new Set(process.argv.slice(2));
const JSON_OUTPUT = args.has('--json');

function readEnvFile(name) {
  const path = join(ROOT, name);
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...readEnvFile('.env.local'), ...readEnvFile('.env.test.local'), ...process.env };
const SB_URL = (env.SB_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SB_ANON = env.SB_ANON || env.VITE_SUPABASE_ANON_KEY || '';
if (!SB_URL || !SB_ANON) {
  console.error('Falta SB_URL / SB_ANON (o VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local).');
  process.exit(2);
}

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const ZERO_TOKEN = '0'.repeat(64);

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(SB_URL + path, {
    method,
    headers: {
      apikey: SB_ANON,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // no es JSON
  }
  return { status: res.status, text, json };
}

async function login(email, password) {
  if (!email || !password) return null;
  const r = await call('POST', '/auth/v1/token?grant_type=password', { body: { email, password } });
  return r.json?.access_token ?? null;
}

// ------------------------------------------------------------------------------------
// Preparación: sesiones y órdenes
// ------------------------------------------------------------------------------------
const ctx = {
  TOKEN_TECH: env.TOKEN_TECH || (await login(env.QA_TECH_EMAIL || env.E2E_MECHANIC_EMAIL, env.QA_TECH_PASSWORD || env.E2E_MECHANIC_PASSWORD)),
  TOKEN_ADMIN: env.TOKEN_ADMIN || (await login(env.QA_ADMIN_EMAIL || env.E2E_ADMIN_EMAIL, env.QA_ADMIN_PASSWORD || env.E2E_ADMIN_PASSWORD)),
  ORDEN: env.ORDEN,
  ORDEN_AJENA: env.ORDEN_AJENA,
  ORDEN_ENTREGADA: env.ORDEN_ENTREGADA,
};

if (ctx.TOKEN_TECH) {
  const me = await call('GET', '/auth/v1/user', { token: ctx.TOKEN_TECH });
  ctx.TECH_ID = me.json?.id;
  if (ctx.TECH_ID) {
    const perfil = await call('GET', `/rest/v1/perfiles?select=sede_id,rol&id=eq.${ctx.TECH_ID}`, { token: ctx.TOKEN_TECH });
    ctx.TECH_SEDE = perfil.json?.[0]?.sede_id;
    if (perfil.json?.[0]?.rol === 'admin') {
      console.error('TOKEN_TECH es de un admin: usa la cuenta de un mecánico o pintor.');
      process.exit(2);
    }
    const otro = await call('GET', `/rest/v1/perfiles?select=id&id=neq.${ctx.TECH_ID}&limit=1`, { token: ctx.TOKEN_TECH });
    ctx.OTRO_USUARIO = otro.json?.[0]?.id;

    const orders = await call(
      'GET',
      '/rest/v1/ordenes_trabajo?select=id,estatus,cliente_id,vehiculo_id,firma_ruta,asignaciones:orden_asignaciones(usuario_id)&order=creado_en.desc&limit=200',
      { token: ctx.TOKEN_TECH }
    );
    const list = Array.isArray(orders.json) ? orders.json : [];
    const mine = (o) => (o.asignaciones || []).some((a) => a.usuario_id === ctx.TECH_ID);
    // Un id fijo (.env.test.local) de una orden borrada, o que no es de este técnico, hace que
    // un PATCH no toque ninguna fila y responda 204: daba FAIL sin que hubiera un hueco (y un
    // PASS igual de falso en los casos que esperan cero filas). Se descarta y se busca otra.
    const descartar = (key, ok) => {
      if (ctx[key] && !ok(list.find((o) => o.id === ctx[key]))) {
        console.error(`${key} de .env.test.local no es una orden de este técnico (borrada o ajena): se ignora.`);
        ctx[key] = undefined;
      }
    };
    descartar('ORDEN', (o) => o && mine(o) && o.estatus !== 'entregado');
    descartar('ORDEN_ENTREGADA', (o) => o && mine(o) && o.estatus === 'entregado');
    ctx.ORDEN ||= list.find((o) => mine(o) && o.estatus !== 'entregado')?.id;
    ctx.ORDEN_ENTREGADA ||= list.find((o) => mine(o) && o.estatus === 'entregado')?.id;
    // La ajena fija tiene que existir: una borrada daría "cero filas" y un PASS que no prueba nada.
    if (ctx.ORDEN_AJENA && ctx.TOKEN_ADMIN) {
      const r = await call('GET', `/rest/v1/ordenes_trabajo?select=id&id=eq.${ctx.ORDEN_AJENA}`, { token: ctx.TOKEN_ADMIN });
      if (!(Array.isArray(r.json) && r.json.length) || list.some((o) => o.id === ctx.ORDEN_AJENA && mine(o))) {
        console.error('ORDEN_AJENA de .env.test.local no existe o es del técnico: se ignora.');
        ctx.ORDEN_AJENA = undefined;
      }
    }
    // Desde 20261007000000 el técnico no ve las órdenes de sus compañeros, así que la ajena se
    // busca con la sesión del admin: una de su sede, sin entregar, donde él no está.
    if (!ctx.ORDEN_AJENA && ctx.TOKEN_ADMIN && ctx.TECH_SEDE) {
      const ajenas = await call(
        'GET',
        `/rest/v1/ordenes_trabajo?select=id,cliente_id,asignaciones:orden_asignaciones(usuario_id)&sede_id=eq.${ctx.TECH_SEDE}&estatus=neq.entregado&order=creado_en.desc&limit=200`,
        { token: ctx.TOKEN_ADMIN }
      );
      const ajena = (Array.isArray(ajenas.json) ? ajenas.json : []).find((o) => !mine(o));
      ctx.ORDEN_AJENA = ajena?.id;
      // Un cliente que no sea también de alguna orden del técnico: ese sí lo vería.
      const clientesPropios = new Set(list.map((o) => o.cliente_id));
      if (ajena && !clientesPropios.has(ajena.cliente_id)) ctx.CLIENTE_AJENO = ajena.cliente_id;
    }
    // SEC-19 usa una orden **ya firmada**: si la regla fallara, lo único que cambiaría es la
    // fecha de la firma. En una sin firmar, la primera firma aprobaría lo cotizado.
    ctx.ORDEN_FIRMADA ||= list.find((o) => mine(o) && o.estatus !== 'entregado' && o.firma_ruta)?.id;
    // SEC-55 solo necesita un `cliente_id` y un `vehiculo_id` reales, para que lo único que
    // pueda tumbar su POST sea la política y no una clave foránea inventada. Cae a cualquier
    // orden visible: si el técnico de prueba no tiene ninguna asignada, el caso se saltaba
    // sin necesidad.
    ctx.ORDEN_ROW = list.find((o) => o.id === ctx.ORDEN) ?? list[0];
    ctx.CLIENTE ||= ctx.ORDEN_ROW?.cliente_id;

    const lineaDe = async (ordenId, token = ctx.TOKEN_TECH) => {
      if (!ordenId || !token) return undefined;
      const r = await call(
        'GET',
        `/rest/v1/orden_labor?select=id&estado=eq.aprobado&orden_id=eq.${ordenId}&limit=1`,
        { token }
      );
      return r.json?.[0]?.id;
    };
    ctx.LABOR ||= await lineaDe(ctx.ORDEN);
    // La línea de la orden ajena tampoco la ve el técnico: la lee el admin.
    ctx.LABOR_AJENA ||= await lineaDe(ctx.ORDEN_AJENA, ctx.TOKEN_ADMIN);
    ctx.LABOR_ENTREGADA ||= await lineaDe(ctx.ORDEN_ENTREGADA);

    // SEC-99 y SEC-100 escriben lo que ya hay (el mismo técnico de la línea, el mismo tipo de
    // la asignación) y filtran por ese valor: si la regla fallara, la petición devolvería la fila
    // sin mover ninguna comisión, aun en una base con datos reales.
    if (ctx.LABOR) {
      const r = await call('GET', `/rest/v1/orden_labor?select=asignado_a&id=eq.${ctx.LABOR}`, { token: ctx.TOKEN_TECH });
      if (Array.isArray(r.json) && r.json[0] && 'asignado_a' in r.json[0]) ctx.LABOR_TECNICO = { asignado_a: r.json[0].asignado_a };
    }
    const asig = await call('GET', `/rest/v1/orden_asignaciones?select=id,tipo_tarea&usuario_id=eq.${ctx.TECH_ID}&limit=1`, { token: ctx.TOKEN_TECH });
    ctx.ASIGNACION_PROPIA = Array.isArray(asig.json) ? asig.json[0] : undefined;
  }
}

// ------------------------------------------------------------------------------------
// Casos
// ------------------------------------------------------------------------------------
// Los identificadores **SEC-70 en adelante están tomados** por los casos manuales de
// plan-de-pruebas.md §5 (curl a mano contra Storage y órdenes ajenas). Para un caso nuevo
// automatizado usa un hueco de abajo o sigue desde SEC-91, y anótalo en §5 de ese documento
// (SEC-75 a SEC-90 ya son automatizados).
const anon = (c) => ({ ...c, who: 'anon' });
const tech = (c) => ({ ...c, who: 'tech', needs: ['TOKEN_TECH', ...(c.needs || [])] });
const admin = (c) => ({ ...c, who: 'admin', needs: ['TOKEN_ADMIN', ...(c.needs || [])] });
const rpc = (name) => `/rest/v1/rpc/${name}`;

const CASES = [
  anon({ id: 'SEC-01', desc: 'Sin sesión no se listan clientes', method: 'GET', path: () => '/rest/v1/clientes?select=id', expect: 'empty' }),
  anon({ id: 'SEC-02', desc: 'Sin sesión no se listan órdenes', method: 'GET', path: () => '/rest/v1/ordenes_trabajo?select=id', expect: 'empty' }),
  anon({ id: 'SEC-03', desc: 'Sin sesión no se listan enlaces del cliente', method: 'GET', path: () => '/rest/v1/orden_enlaces?select=token', expect: 'empty' }),
  anon({ id: 'SEC-04', desc: 'Sin sesión no se llama datos_portal', method: 'POST', path: () => rpc('datos_portal'), body: { p_token: ZERO_TOKEN }, expect: 'denied' }),
  anon({ id: 'SEC-05', desc: 'Sin sesión no se revierte el cobro de una orden', method: 'POST', path: () => rpc('reverse_order_delivery_finance'), body: { target_order_id: ZERO_UUID }, expect: 'denied' }),
  anon({ id: 'SEC-06', desc: 'Sin sesión no se recalculan comisiones', method: 'POST', path: () => rpc('sync_order_commissions'), body: { target_order_id: ZERO_UUID }, expect: 'denied' }),
  anon({ id: 'SEC-07', desc: 'Sin sesión no se asienta costo de repuestos', method: 'POST', path: () => rpc('sync_order_parts_expense'), body: { target_order_id: ZERO_UUID }, expect: 'denied' }),
  anon({ id: 'SEC-08', desc: 'Sin sesión no se recalculan totales', method: 'POST', path: () => rpc('recalculate_order_totals'), body: { target_order_id: ZERO_UUID }, expect: 'denied' }),
  anon({ id: 'SEC-09', desc: 'Sin sesión no se toma la cola de envíos', method: 'POST', path: () => rpc('claim_outbox'), body: {}, expect: 'denied' }),
  anon({ id: 'SEC-10', desc: 'Sin sesión no se responde un presupuesto por RPC', method: 'POST', path: () => rpc('responder_presupuesto_portal'), body: {}, expect: 'denied' }),
  anon({ id: 'SEC-11', desc: 'process-outbox sin secreto responde 401', method: 'POST', path: () => '/functions/v1/process-outbox', body: {}, expect: { status: 401 } }),
  anon({ id: 'SEC-12', desc: 'Portal con token inexistente responde 404', method: 'GET', path: () => `/functions/v1/portal?token=${ZERO_TOKEN}`, expect: { status: 404 } }),
  anon({ id: 'SEC-13', desc: 'Portal: cambiar correos con token inexistente responde 404', method: 'POST', path: () => '/functions/v1/portal', body: { token: ZERO_TOKEN, accion: 'preferencia_correos', acepta: false }, expect: { status: 404 } }),
  anon({ id: 'SEC-14', desc: 'El bucket viejo de firmas no es público', method: 'GET', path: () => '/storage/v1/object/public/firmas/prueba.png', expect: 'denied' }),
  anon({ id: 'SEC-15', desc: 'La multimedia de órdenes no es pública', method: 'GET', path: () => '/storage/v1/object/public/orden_media/prueba.jpg', expect: 'denied' }),
  anon({ id: 'SEC-16', desc: 'Sin sesión no se paga una comisión', method: 'POST', path: () => rpc('pay_commissions'), body: { p_usuario_id: ZERO_UUID, p_comision_ids: [] }, expect: 'denied' }),

  tech({ id: 'SEC-20', desc: 'Un técnico no ve montos (orden_montos)', method: 'GET', path: () => '/rest/v1/orden_montos?select=*', expect: 'empty' }),
  tech({ id: 'SEC-21', desc: 'Un técnico no ve repuestos con precio', method: 'GET', path: () => '/rest/v1/orden_repuestos?select=*', expect: 'empty' }),
  tech({ id: 'SEC-22', desc: 'Un técnico no ve Finanzas', method: 'GET', path: () => '/rest/v1/finanzas_movimientos?select=id', expect: 'empty' }),
  tech({ id: 'SEC-23', desc: 'Un técnico no ve enlaces del cliente', method: 'GET', path: () => '/rest/v1/orden_enlaces?select=token', expect: 'empty' }),
  tech({ id: 'SEC-24', desc: 'Un técnico no ve presupuestos', method: 'GET', path: () => '/rest/v1/presupuestos?select=id', expect: 'empty' }),
  tech({ id: 'SEC-25', desc: 'Un técnico no ve la cola de correos', method: 'GET', path: () => '/rest/v1/cola_envios?select=destinatario', expect: 'empty' }),
  tech({ id: 'SEC-26', desc: 'Un técnico no llama datos_portal', method: 'POST', path: () => rpc('datos_portal'), body: { p_token: ZERO_TOKEN }, expect: 'denied' }),
  tech({ id: 'SEC-27', desc: 'Un técnico no revierte el cobro de una orden', method: 'POST', path: () => rpc('reverse_order_delivery_finance'), body: { target_order_id: ZERO_UUID }, expect: 'denied' }),
  tech({ id: 'SEC-28', desc: 'Un técnico no toma la cola de envíos', method: 'POST', path: () => rpc('claim_outbox'), body: {}, expect: 'denied' }),
  tech({ id: 'SEC-29', desc: 'Un técnico no crea avisos para otros', method: 'POST', path: () => '/rest/v1/notificaciones', body: { usuario_id: ZERO_UUID, tipo: 'x', titulo: 'x' }, expect: 'denied' }),
  tech({ id: 'SEC-30', desc: 'Un técnico no paga comisiones', method: 'POST', path: () => rpc('pay_commissions'), body: { p_usuario_id: ZERO_UUID, p_comision_ids: [] }, expect: 'denied' }),
  tech({ id: 'SEC-31', desc: 'Un técnico no se cambia a admin', needs: ['TECH_ID'], method: 'PATCH', path: (c) => `/rest/v1/perfiles?id=eq.${c.TECH_ID}`, body: { rol: 'admin' }, expect: 'denied' }),
  tech({ id: 'SEC-32', desc: 'Un técnico solo ve sus propios pagos de comisión', needs: ['TECH_ID'], method: 'GET', path: (c) => `/rest/v1/comision_pagos?select=id&usuario_id=neq.${c.TECH_ID}`, expect: 'empty' }),
  tech({ id: 'SEC-33', desc: 'Un técnico solo ve sus propios avisos', needs: ['TECH_ID'], method: 'GET', path: (c) => `/rest/v1/notificaciones?select=id&usuario_id=neq.${c.TECH_ID}`, expect: 'empty' }),
  tech({ id: 'SEC-34', desc: 'Un técnico no ve órdenes de otra sede', needs: ['TECH_SEDE'], method: 'GET', path: (c) => `/rest/v1/ordenes_trabajo?select=id&sede_id=neq.${c.TECH_SEDE}`, expect: 'empty' }),
  tech({ id: 'SEC-35', desc: 'Un técnico no ve clientes de otra sede', needs: ['TECH_SEDE'], method: 'GET', path: (c) => `/rest/v1/clientes?select=id&sede_id=neq.${c.TECH_SEDE}`, expect: 'empty' }),

  tech({ id: 'SEC-40', desc: 'Un técnico no agrega mano de obra', needs: ['ORDEN'], method: 'POST', path: () => '/rest/v1/orden_labor', body: (c) => ({ orden_id: c.ORDEN, descripcion: 'PRUEBA', costo: 9999 }), expect: 'denied' }),
  tech({ id: 'SEC-41', desc: 'Un técnico no entrega la orden', needs: ['ORDEN'], method: 'PATCH', path: (c) => `/rest/v1/ordenes_trabajo?id=eq.${c.ORDEN}`, body: { estatus: 'entregado' }, expect: 'denied' }),
  tech({ id: 'SEC-42', desc: 'Un técnico no escribe totales', needs: ['ORDEN'], method: 'PATCH', path: (c) => `/rest/v1/ordenes_trabajo?id=eq.${c.ORDEN}`, body: { total_labor: 99999 }, expect: 'denied' }),
  tech({ id: 'SEC-43', desc: 'Un técnico no cambia datos de recepción', needs: ['ORDEN'], method: 'PATCH', path: (c) => `/rest/v1/ordenes_trabajo?id=eq.${c.ORDEN}`, body: { millas_ingreso: 1 }, expect: 'denied' }),
  // La firma de recepción la toma administración (20261006000000): la primera firma aprueba
  // lo cotizado, y el técnico podía capturarla en cualquier estado.
  tech({ id: 'SEC-19', desc: 'Un técnico asignado no cambia la firma de recepción', needs: ['ORDEN_FIRMADA'], method: 'PATCH', path: (c) => `/rest/v1/ordenes_trabajo?id=eq.${c.ORDEN_FIRMADA}`, body: { firma_fecha: '2000-01-01T00:00:00Z' }, expect: 'denied' }),
  tech({ id: 'SEC-44', desc: 'Nadie firma con un archivo de otra orden', needs: ['ORDEN'], method: 'PATCH', path: (c) => `/rest/v1/ordenes_trabajo?id=eq.${c.ORDEN}`, body: { firma_ruta: 'otra/orden/firma.png' }, expect: 'denied' }),
  tech({ id: 'SEC-45', desc: 'Un técnico no publica archivos al cliente', needs: ['ORDEN'], method: 'PATCH', path: (c) => `/rest/v1/orden_media?orden_id=eq.${c.ORDEN}`, body: { visible_cliente: true }, headers: { Prefer: 'return=representation' }, expect: 'empty' }),
  tech({ id: 'SEC-46', desc: 'Un técnico no crea el enlace del cliente', needs: ['ORDEN'], method: 'POST', path: () => rpc('crear_enlace_cliente'), body: (c) => ({ p_orden_id: c.ORDEN }), expect: 'denied' }),
  tech({ id: 'SEC-47', desc: 'Un técnico no envía presupuestos', needs: ['ORDEN'], method: 'POST', path: () => rpc('enviar_presupuesto'), body: (c) => ({ p_orden_id: c.ORDEN }), expect: 'denied' }),
  tech({ id: 'SEC-48', desc: 'Un técnico no envía el reporte', needs: ['ORDEN'], method: 'POST', path: () => rpc('enviar_reporte_cliente'), body: (c) => ({ p_orden_id: c.ORDEN }), expect: 'denied' }),
  tech({ id: 'SEC-49', desc: 'Un técnico no avisa novedades al cliente', needs: ['ORDEN'], method: 'POST', path: () => rpc('notificar_cliente_avance'), body: (c) => ({ p_orden_id: c.ORDEN }), expect: 'denied' }),
  tech({ id: 'SEC-50', desc: 'Un técnico no asigna a otra persona', needs: ['ORDEN', 'OTRO_USUARIO'], method: 'POST', path: () => '/rest/v1/orden_asignaciones', body: (c) => ({ orden_id: c.ORDEN, usuario_id: c.OTRO_USUARIO, tipo_tarea: 'mecanica' }), expect: 'denied' }),
  // Desde 20261007000000 la orden ajena ni aparece: el PATCH afecta cero filas en vez de chocar
  // con el guardia. Lo que importa es que no la cambie.
  tech({ id: 'SEC-51', desc: 'Un técnico no mueve el avance de una orden ajena', needs: ['ORDEN_AJENA'], method: 'PATCH', path: (c) => `/rest/v1/ordenes_trabajo?id=eq.${c.ORDEN_AJENA}`, body: { porcentaje_avance: 50 }, headers: { Prefer: 'return=representation' }, expect: 'denied-or-empty' }),
  // Reunión con el taller (sept. 2026): un técnico ve solo sus órdenes, y clientes y vehículos
  // son de administración (20261007000000).
  tech({ id: 'SEC-36', desc: 'Un técnico no ve una orden que no tiene asignada', needs: ['ORDEN_AJENA'], method: 'GET', path: (c) => `/rest/v1/ordenes_trabajo?select=id&id=eq.${c.ORDEN_AJENA}`, expect: 'empty' }),
  tech({ id: 'SEC-77', desc: 'Ni los archivos de esa orden', needs: ['ORDEN_AJENA'], method: 'GET', path: (c) => `/rest/v1/orden_media?select=ruta&orden_id=eq.${c.ORDEN_AJENA}`, expect: 'empty' }),
  tech({ id: 'SEC-78', desc: 'Ni el cliente de esa orden', needs: ['CLIENTE_AJENO'], method: 'GET', path: (c) => `/rest/v1/clientes?select=id,telefono&id=eq.${c.CLIENTE_AJENO}`, expect: 'empty' }),
  tech({ id: 'SEC-37', desc: 'Un técnico no da de alta un cliente', needs: ['TECH_SEDE'], method: 'POST', path: () => '/rest/v1/clientes', body: (c) => ({ sede_id: c.TECH_SEDE, nombre: 'PRUEBA qa:security', telefono: '+15550000000', email: '', direccion: 'PRUEBA' }), expect: 'denied' }),
  tech({ id: 'SEC-75', desc: 'Ni edita el cliente de su propia orden', needs: ['CLIENTE'], method: 'PATCH', path: (c) => `/rest/v1/clientes?id=eq.${c.CLIENTE}`, body: { direccion: 'PRUEBA qa:security' }, headers: { Prefer: 'return=representation' }, expect: 'denied-or-empty' }),
  tech({ id: 'SEC-76', desc: 'Un técnico no da de alta un vehículo', needs: ['CLIENTE'], method: 'POST', path: () => '/rest/v1/vehiculos', body: (c) => ({ cliente_id: c.CLIENTE, marca: 'PRUEBA', modelo: 'qa:security', anio: 2020, vin: '1HGCM82633A004352', color: 'Gris' }), expect: 'denied' }),
  tech({ id: 'SEC-52', desc: 'Un técnico no agrega avances a una orden ajena', needs: ['ORDEN_AJENA'], method: 'POST', path: () => '/rest/v1/orden_avances', body: (c) => ({ orden_id: c.ORDEN_AJENA, descripcion: 'PRUEBA' }), expect: 'denied' }),
  // Archivar a mano (20261005000000) es de administración. No hizo falta política nueva: la
  // orden entregada ya le está cerrada al técnico y la columna nueva no está en su lista.
  tech({ id: 'SEC-38', desc: 'Un técnico no archiva una orden entregada', needs: ['ORDEN_ENTREGADA'], method: 'PATCH', path: (c) => `/rest/v1/ordenes_trabajo?id=eq.${c.ORDEN_ENTREGADA}`, body: { archivada_en: '2026-01-01T00:00:00Z' }, headers: { Prefer: 'return=representation' }, expect: 'denied-or-empty' }),
  tech({ id: 'SEC-53', desc: 'Un técnico no saca una orden de Entregado', needs: ['ORDEN_ENTREGADA'], method: 'PATCH', path: (c) => `/rest/v1/ordenes_trabajo?id=eq.${c.ORDEN_ENTREGADA}`, body: { estatus: 'finalizado' }, expect: 'denied' }),
  tech({ id: 'SEC-54', desc: 'Un técnico no agrega avances a una orden entregada', needs: ['ORDEN_ENTREGADA'], method: 'POST', path: () => '/rest/v1/orden_avances', body: (c) => ({ orden_id: c.ORDEN_ENTREGADA, descripcion: 'PRUEBA' }), expect: 'denied' }),

  anon({ id: 'SEC-56', desc: 'Sin sesión no se marca un trabajo como hecho', method: 'POST', path: () => rpc('marcar_labor_completada'), body: { p_labor_id: ZERO_UUID }, expect: 'denied' }),
  tech({ id: 'SEC-57', desc: 'Un técnico no marca trabajo de una orden ajena', needs: ['LABOR_AJENA'], method: 'POST', path: () => rpc('marcar_labor_completada'), body: (c) => ({ p_labor_id: c.LABOR_AJENA }), expect: 'denied' }),
  tech({ id: 'SEC-58', desc: 'Un técnico no marca trabajo de una orden entregada', needs: ['LABOR_ENTREGADA'], method: 'POST', path: () => rpc('marcar_labor_completada'), body: (c) => ({ p_labor_id: c.LABOR_ENTREGADA }), expect: 'denied' }),
  tech({ id: 'SEC-59', desc: 'La columna nueva no abre orden_labor a un PATCH', needs: ['LABOR'], method: 'PATCH', path: (c) => `/rest/v1/orden_labor?id=eq.${c.LABOR}`, body: { completado_en: '2026-01-01T00:00:00Z' }, headers: { Prefer: 'return=representation' }, expect: 'denied-or-empty' }),
  // El estado de una línea lo cambian el presupuesto, la firma o una autorización registrada,
  // nunca un UPDATE a mano. Se pide un estado DISTINTO del actual a propósito: el trigger solo
  // salta cuando el valor cambia, así que pedir 'aprobado' sobre una línea ya aprobada no
  // probaba nada y pasaba o fallaba según cómo estuviera la orden de prueba.
  anon({ id: 'SEC-63', desc: 'Sin sesión no se dispara el barrido de órdenes vencidas', method: 'POST', path: () => rpc('recordar_ordenes_vencidas'), expect: 'denied' }),
  tech({ id: 'SEC-64', desc: 'Un técnico no dispara el barrido de órdenes vencidas', method: 'POST', path: () => rpc('recordar_ordenes_vencidas'), expect: 'denied' }),
  admin({ id: 'SEC-65', desc: 'Ni un admin dispara el barrido de órdenes vencidas', method: 'POST', path: () => rpc('recordar_ordenes_vencidas'), expect: 'denied' }),
  anon({ id: 'SEC-66', desc: 'Sin sesión no se deshace una importación bancaria', method: 'POST', path: () => rpc('deshacer_importacion_estado_cuenta'), body: { p_importacion_id: ZERO_UUID }, expect: 'denied' }),
  tech({ id: 'SEC-67', desc: 'Un técnico no deshace una importación bancaria', method: 'POST', path: () => rpc('deshacer_importacion_estado_cuenta'), body: { p_importacion_id: ZERO_UUID }, expect: 'denied' }),
  // Abrir una orden y asignar a alguien son de administración desde 20261004000000. Los ids
  // de cliente y vehículo son reales a propósito: así lo único que puede tumbar la petición
  // es la política, y no una clave foránea inventada.
  anon({ id: 'SEC-68', desc: 'Sin sesión no se abre una orden', method: 'POST', path: () => '/rest/v1/ordenes_trabajo', body: { sede_id: ZERO_UUID, cliente_id: ZERO_UUID, vehiculo_id: ZERO_UUID, tipo_trabajo: 'mecanica', millas_ingreso: 1, nivel_gasolina: '1/2' }, expect: 'denied' }),
  tech({ id: 'SEC-55', desc: 'Un técnico no abre una orden de trabajo', needs: ['ORDEN_ROW', 'TECH_SEDE'], method: 'POST', path: () => '/rest/v1/ordenes_trabajo', headers: { Prefer: 'return=representation' }, body: (c) => ({
    sede_id: c.TECH_SEDE,
    cliente_id: c.ORDEN_ROW.cliente_id,
    vehiculo_id: c.ORDEN_ROW.vehiculo_id,
    tipo_trabajo: 'mecanica',
    millas_ingreso: 1,
    nivel_gasolina: '1/2',
    fecha_estimada_entrega: '2030-01-01',
    inspeccion_360_notas: 'PRUEBA qa:security — no debería crearse',
  }), expect: 'denied' }),
  // El de fondo: la asignación dispara `sync_order_commissions`, así que auto-asignarse es
  // concederse una comisión. Se prueba sobre la orden que NO tiene asignada, que es el caso
  // que valía la pena para quien quisiera aprovecharlo.
  tech({ id: 'SEC-69', desc: 'Un técnico no se asigna a una orden (se concedería la comisión)', needs: ['ORDEN_AJENA', 'TECH_ID'], method: 'POST', path: () => '/rest/v1/orden_asignaciones', headers: { Prefer: 'return=representation' }, body: (c) => ({ orden_id: c.ORDEN_AJENA, usuario_id: c.TECH_ID, tipo_tarea: 'mecanica' }), expect: 'denied' }),
  tech({ id: 'SEC-39', desc: 'Un técnico tampoco se asigna a la orden que ya trabaja', needs: ['ORDEN', 'TECH_ID'], method: 'POST', path: () => '/rest/v1/orden_asignaciones', headers: { Prefer: 'return=representation' }, body: (c) => ({ orden_id: c.ORDEN, usuario_id: c.TECH_ID, tipo_tarea: 'pintura' }), expect: 'denied' }),
  admin({ id: 'SEC-60', desc: 'Ni un admin cambia el estado de una línea con un UPDATE', needs: ['ORDEN'], method: 'PATCH', path: (c) => `/rest/v1/orden_labor?orden_id=eq.${c.ORDEN}&estado=neq.rechazado`, body: { estado: 'rechazado' }, headers: { Prefer: 'return=representation' }, expect: 'denied' }),
  admin({ id: 'SEC-61', desc: 'Ni un admin sube PDFs al bucket de reportes', method: 'POST', path: () => '/storage/v1/object/reportes/prueba-qa-security.pdf', body: '%PDF-1.4', headers: { 'Content-Type': 'application/pdf' }, expect: 'denied' }),
  admin({ id: 'SEC-62', desc: 'Ni un admin revierte cobros por RPC', method: 'POST', path: () => rpc('reverse_order_delivery_finance'), body: { target_order_id: ZERO_UUID }, expect: 'denied' }),
  // Entregar con método de pago (20261008000000): solo administración entrega y consulta el
  // saldo; la cuenta interna no es una RPC. Con un id inexistente: aunque la regla fallara,
  // no hay orden que entregar.
  tech({ id: 'SEC-79', desc: 'Un técnico no entrega por la RPC de entrega', method: 'POST', path: () => rpc('entregar_orden'), body: { p_orden_id: ZERO_UUID, p_metodo: 'efectivo' }, expect: 'denied' }),
  tech({ id: 'SEC-80', desc: 'Un técnico no consulta el saldo de una orden', method: 'POST', path: () => rpc('saldo_orden'), body: { p_orden_id: ZERO_UUID }, expect: 'denied' }),
  anon({ id: 'SEC-81', desc: 'Sin sesión no se entrega una orden', method: 'POST', path: () => rpc('entregar_orden'), body: { p_orden_id: ZERO_UUID }, expect: 'denied' }),
  admin({ id: 'SEC-82', desc: 'Ni un admin llama la cuenta interna del saldo', method: 'POST', path: () => rpc('_saldo_orden'), body: { p_orden_id: ZERO_UUID }, expect: 'denied' }),
  // Comisiones por especialidad y por empleado (20261009000000): el pago de cada quien es de
  // administración, y un técnico no se sube su propio porcentaje.
  tech({ id: 'SEC-83', desc: 'Un técnico no se pone su propio porcentaje de comisión', needs: ['TECH_ID'], method: 'POST', path: () => '/rest/v1/perfiles_pago', body: (c) => ({ usuario_id: c.TECH_ID, esquema: 'comision', comision_porcentaje: 99 }), expect: 'denied' }),
  tech({ id: 'SEC-84', desc: 'Un técnico no ve el pago de sus compañeros', needs: ['TECH_ID'], method: 'GET', path: (c) => `/rest/v1/perfiles_pago?select=*&usuario_id=neq.${c.TECH_ID}`, expect: 'empty' }),
  tech({ id: 'SEC-85', desc: 'Un técnico no ve el resumen de un empleado', needs: ['OTRO_USUARIO'], method: 'POST', path: () => rpc('resumen_empleado'), body: (c) => ({ p_usuario_id: c.OTRO_USUARIO }), expect: 'denied' }),
  tech({ id: 'SEC-86', desc: 'Un técnico no ve la comisión de una orden ajena', needs: ['ORDEN_AJENA'], method: 'POST', path: () => rpc('comisiones_estimadas'), body: (c) => ({ p_orden_id: c.ORDEN_AJENA }), expect: 'denied' }),
  admin({ id: 'SEC-87', desc: 'Ni un admin llama el reparto interno de comisiones', method: 'POST', path: () => rpc('_reparto_comisiones'), body: { p_orden_id: ZERO_UUID }, expect: 'denied' }),
  // El margen por orden (20261010000000) es dinero de administración.
  tech({ id: 'SEC-88', desc: 'Un técnico no ve el balance de una orden', needs: ['ORDEN'], method: 'POST', path: () => rpc('balance_orden'), body: (c) => ({ p_orden_id: c.ORDEN }), expect: 'denied' }),
  tech({ id: 'SEC-89', desc: 'Un técnico no ve el margen de las órdenes', method: 'POST', path: () => rpc('margen_ordenes'), body: { p_sede_id: null, p_desde: '2020-01-01', p_hasta: '2100-01-01' }, expect: 'denied' }),
  admin({ id: 'SEC-90', desc: 'Ni un admin llama la cuenta interna del balance', method: 'POST', path: () => rpc('_balance_orden'), body: { p_orden_id: ZERO_UUID }, expect: 'denied' }),

  // Historial de la orden (20261010000004): solo un admin lo lee; nadie lo escribe por la API.
  anon({ id: 'SEC-91', desc: 'Sin sesión no se lee el historial de las órdenes', method: 'GET', path: () => '/rest/v1/historial_orden?select=id', expect: 'denied-or-empty' }),
  tech({ id: 'SEC-92', desc: 'Un técnico no lee el historial de las órdenes', method: 'GET', path: () => '/rest/v1/historial_orden?select=id', expect: 'empty' }),
  tech({ id: 'SEC-93', desc: 'Un técnico no escribe en el historial', method: 'POST', path: () => '/rest/v1/historial_orden', body: { orden_id: ZERO_UUID, origen: 'app', entidad: 'orden', accion: 'crear' }, expect: 'denied' }),
  admin({ id: 'SEC-94', desc: 'Ni un admin corrige el historial', method: 'PATCH', path: () => `/rest/v1/historial_orden?orden_id=eq.${ZERO_UUID}`, body: { actor_nombre: 'otra persona' }, expect: 'denied' }),
  admin({ id: 'SEC-95', desc: 'Ni un admin llama el trigger del historial como RPC', method: 'POST', path: () => rpc('trg_historial'), body: {}, expect: 'denied' }),

  // Reintentar correos (20261010000005): solo administración.
  anon({ id: 'SEC-96', desc: 'Sin sesión no se reintenta un correo', method: 'POST', path: () => rpc('reintentar_envio'), body: { p_id: ZERO_UUID }, expect: 'denied' }),
  tech({ id: 'SEC-97', desc: 'Un técnico no reintenta un correo', method: 'POST', path: () => rpc('reintentar_envio'), body: { p_id: ZERO_UUID }, expect: 'denied' }),
  tech({ id: 'SEC-98', desc: 'Un técnico no reintenta los correos fallidos', method: 'POST', path: () => rpc('reintentar_correos_fallidos'), body: {}, expect: 'denied' }),

  // Comisión por tarea (20261010000006): asignar una tarea es dinero, y es de administración.
  // SEC-99 y SEC-100 escriben el valor que ya tiene la fila y filtran por él: si la regla
  // fallara, la respuesta traería la fila (FAIL) sin haber movido ninguna comisión.
  tech({ id: 'SEC-99', desc: 'Un técnico no cambia el técnico de una tarea', needs: ['LABOR', 'LABOR_TECNICO'], method: 'PATCH', path: (c) => `/rest/v1/orden_labor?id=eq.${c.LABOR}&asignado_a=${c.LABOR_TECNICO.asignado_a ? `eq.${c.LABOR_TECNICO.asignado_a}` : 'is.null'}`, body: (c) => ({ asignado_a: c.LABOR_TECNICO.asignado_a }), headers: { Prefer: 'return=representation' }, expect: 'denied-or-empty' }),
  tech({ id: 'SEC-100', desc: 'Un técnico no edita su asignación (tipo de tarea)', needs: ['ASIGNACION_PROPIA'], method: 'PATCH', path: (c) => `/rest/v1/orden_asignaciones?id=eq.${c.ASIGNACION_PROPIA.id}&tipo_tarea=eq.${c.ASIGNACION_PROPIA.tipo_tarea}`, body: (c) => ({ tipo_tarea: c.ASIGNACION_PROPIA.tipo_tarea }), headers: { Prefer: 'return=representation' }, expect: 'denied-or-empty' }),
  tech({ id: 'SEC-101', desc: 'Un técnico no crea una tarea a su nombre', needs: ['ORDEN', 'TECH_ID'], method: 'POST', path: () => '/rest/v1/orden_labor', body: (c) => ({ orden_id: c.ORDEN, descripcion: 'PRUEBA qa:security', costo: 1, asignado_a: c.TECH_ID, reparto_heredado: false }), expect: 'denied' }),
  admin({ id: 'SEC-102', desc: 'Ni un admin llama el guardia del técnico de una tarea como RPC', method: 'POST', path: () => rpc('trg_guard_labor_tecnico'), body: {}, expect: 'denied' }),
  admin({ id: 'SEC-103', desc: 'Ni un admin llama el alta automática del técnico de una tarea como RPC', method: 'POST', path: () => rpc('trg_labor_tecnico_asignado'), body: {}, expect: 'denied' }),
  admin({ id: 'SEC-104', desc: 'Ni un admin llama el guardia de quitar a un técnico con tareas como RPC', method: 'POST', path: () => rpc('trg_guard_asignacion_con_tareas'), body: {}, expect: 'denied' }),
  admin({ id: 'SEC-105', desc: 'Ni un admin llama el recálculo de comisiones por línea como RPC', method: 'POST', path: () => rpc('trg_commissions_on_labor'), body: {}, expect: 'denied' }),
  // F6: hallazgos (20261010000011). Ningún caso escribe: el técnico choca con el rol antes de
  // buscar el hallazgo, y el resto no tiene permiso de ejecutar.
  anon({ id: 'SEC-106', desc: 'Sin sesión no se leen hallazgos', method: 'GET', path: () => '/rest/v1/orden_hallazgos?select=id', expect: 'denied-or-empty' }),
  anon({ id: 'SEC-107', desc: 'Sin sesión no se reporta un hallazgo', method: 'POST', path: () => rpc('reportar_hallazgo'), body: { p_orden_id: ZERO_UUID, p_descripcion: 'PRUEBA qa:security' }, expect: 'denied' }),
  tech({ id: 'SEC-108', desc: 'Un técnico no cotiza un hallazgo', method: 'POST', path: () => rpc('cotizar_hallazgo'), body: { p_hallazgo_id: ZERO_UUID }, expect: 'denied' }),
  tech({ id: 'SEC-109', desc: 'Un técnico no descarta un hallazgo', method: 'POST', path: () => rpc('descartar_hallazgo'), body: { p_hallazgo_id: ZERO_UUID, p_en_reporte: false, p_texto: null }, expect: 'denied' }),
  tech({ id: 'SEC-110', desc: 'Un técnico no escribe orden_hallazgos', needs: ['ORDEN', 'TECH_ID'], method: 'POST', path: () => '/rest/v1/orden_hallazgos', body: (c) => ({ orden_id: c.ORDEN, sede_id: ZERO_UUID, reportado_por: c.TECH_ID, descripcion: 'PRUEBA qa:security' }), expect: 'denied' }),
  admin({ id: 'SEC-111', desc: 'Ni un admin llama _salir_de_espera como RPC', method: 'POST', path: () => rpc('_salir_de_espera'), body: { p_orden_id: ZERO_UUID }, expect: 'denied' }),
  admin({ id: 'SEC-112', desc: 'Ni un admin llama el guardia del avance de un hallazgo como RPC', method: 'POST', path: () => rpc('trg_avance_hallazgo_interno'), body: {}, expect: 'denied' }),

  // ── F7: "Requiere atención" del panel (20261010000012) ──
  anon({ id: 'SEC-113', desc: 'Sin sesión no se pide lo que requiere atención', method: 'POST', path: () => rpc('requiere_atencion'), body: { p_sede_id: null, p_hoy: null }, expect: 'denied' }),
  tech({ id: 'SEC-114', desc: 'Un técnico no ve lo que requiere atención de la oficina', method: 'POST', path: () => rpc('requiere_atencion'), body: { p_sede_id: null, p_hoy: null }, expect: 'denied' }),
];

function evaluate(expect, r) {
  const empty = Array.isArray(r.json) && r.json.length === 0;
  const denied = r.status < 200 || r.status >= 300;
  if (expect === 'empty') return r.status >= 200 && r.status < 300 && empty;
  if (expect === 'denied') return denied;
  if (expect === 'denied-or-empty') return denied || empty;
  return r.status === expect.status;
}

const results = [];
for (const c of CASES) {
  const missing = (c.needs || []).find((k) => !ctx[k]);
  if (missing) {
    results.push({ id: c.id, desc: c.desc, estado: 'SKIP', motivo: `falta ${missing}` });
    continue;
  }
  const token = c.who === 'tech' ? ctx.TOKEN_TECH : c.who === 'admin' ? ctx.TOKEN_ADMIN : undefined;
  const body = typeof c.body === 'function' ? c.body(ctx) : c.body;
  const r = await call(c.method, c.path(ctx), { token, body, headers: c.headers });
  const ok = evaluate(c.expect, r);
  results.push({ id: c.id, desc: c.desc, estado: ok ? 'PASS' : 'FAIL', http: r.status, ...(ok ? {} : { respuesta: r.text.slice(0, 300) }) });
}

// SEC-17: las Edge Functions que usan la app y la base están desplegadas. Una que falta
// responde 404 y la pantalla falla sin más pista (pasó con update-employee, AUD-26).
{
  const FUNCTIONS = ['portal', 'process-outbox', 'cleanup-storage', 'create-employee', 'update-employee', 'delete-employee'];
  const missing = [];
  for (const name of FUNCTIONS) {
    const r = await call('OPTIONS', `/functions/v1/${name}`);
    if (r.status === 404) missing.push(name);
  }
  results.push({
    id: 'SEC-17',
    desc: `Las ${FUNCTIONS.length} Edge Functions están desplegadas`,
    estado: missing.length ? 'FAIL' : 'PASS',
    ...(missing.length ? { http: 404, respuesta: `No desplegadas: ${missing.join(', ')}` } : {}),
  });
}

// SEC-18: el registro público está apagado. Con él abierto cualquiera se crea una
// cuenta por la API; sin perfil no ve datos, pero gasta el cupo de correos de Auth (que
// es el de recuperar contraseñas). Se apaga en Authentication → Sign In / Providers.
{
  const r = await call('GET', '/auth/v1/settings');
  const open = r.json?.disable_signup !== true;
  results.push({
    id: 'SEC-18',
    desc: 'El registro público de cuentas está apagado',
    estado: open ? 'FAIL' : 'PASS',
    ...(open ? { http: r.status, respuesta: `disable_signup=${r.json?.disable_signup}. Apágalo en el panel: Authentication → Sign In / Providers → Allow new users to sign up` } : {}),
  });
}

const summary = {
  proyecto: SB_URL,
  sesiones: { tecnico: !!ctx.TOKEN_TECH, admin: !!ctx.TOKEN_ADMIN },
  ordenes: { ORDEN: ctx.ORDEN ?? null, ORDEN_AJENA: ctx.ORDEN_AJENA ?? null, ORDEN_ENTREGADA: ctx.ORDEN_ENTREGADA ?? null },
  pass: results.filter((r) => r.estado === 'PASS').length,
  fail: results.filter((r) => r.estado === 'FAIL').length,
  skip: results.filter((r) => r.estado === 'SKIP').length,
};

if (JSON_OUTPUT) {
  console.log(JSON.stringify({ ...summary, resultados: results }, null, 2));
} else {
  console.log(`Restorify — seguridad de la API contra ${SB_URL}`);
  console.log(`Sesión de técnico: ${summary.sesiones.tecnico ? 'sí' : 'no'} · de admin: ${summary.sesiones.admin ? 'sí' : 'no'}\n`);
  for (const r of results) {
    const extra = r.estado === 'FAIL' ? `  → HTTP ${r.http} ${r.respuesta ?? ''}` : r.estado === 'SKIP' ? `  (${r.motivo})` : '';
    console.log(`${r.estado.padEnd(5)} ${r.id.padEnd(7)} ${r.desc}${extra}`);
    if (r.creada) console.log(`              creada: ${r.creada}`);
  }
  console.log(`\nResultado: ${summary.pass} PASS · ${summary.fail} FAIL · ${summary.skip} SKIP`);
}
process.exit(summary.fail > 0 ? 1 : 0);
