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
      '/rest/v1/ordenes_trabajo?select=id,estatus,cliente_id,vehiculo_id,asignaciones:orden_asignaciones(usuario_id)&order=creado_en.desc&limit=200',
      { token: ctx.TOKEN_TECH }
    );
    const list = Array.isArray(orders.json) ? orders.json : [];
    const mine = (o) => (o.asignaciones || []).some((a) => a.usuario_id === ctx.TECH_ID);
    ctx.ORDEN ||= list.find((o) => mine(o) && o.estatus !== 'entregado')?.id;
    ctx.ORDEN_ENTREGADA ||= list.find((o) => mine(o) && o.estatus === 'entregado')?.id;
    ctx.ORDEN_AJENA ||= list.find((o) => !mine(o) && o.estatus !== 'entregado')?.id;
    // SEC-55 solo necesita un `cliente_id` y un `vehiculo_id` reales, para que lo único que
    // pueda tumbar su POST sea la política y no una clave foránea inventada. Cae a cualquier
    // orden visible: si el técnico de prueba no tiene ninguna asignada, el caso se saltaba
    // sin necesidad.
    ctx.ORDEN_ROW = list.find((o) => o.id === ctx.ORDEN) ?? list[0];

    const lineaDe = async (ordenId) => {
      if (!ordenId) return undefined;
      const r = await call(
        'GET',
        `/rest/v1/orden_labor?select=id&estado=eq.aprobado&orden_id=eq.${ordenId}&limit=1`,
        { token: ctx.TOKEN_TECH }
      );
      return r.json?.[0]?.id;
    };
    ctx.LABOR ||= await lineaDe(ctx.ORDEN);
    ctx.LABOR_AJENA ||= await lineaDe(ctx.ORDEN_AJENA);
    ctx.LABOR_ENTREGADA ||= await lineaDe(ctx.ORDEN_ENTREGADA);
  }
}

// ------------------------------------------------------------------------------------
// Casos
// ------------------------------------------------------------------------------------
// Los identificadores **SEC-70 en adelante están tomados** por los casos manuales de
// plan-de-pruebas.md §5 (curl a mano contra Storage y órdenes ajenas). Para un caso nuevo
// automatizado usa un hueco de abajo — quedan libres SEC-19, SEC-36, SEC-37 y SEC-38 — o
// sigue desde SEC-71 solo si antes lo reservas en ese documento.
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
  tech({ id: 'SEC-44', desc: 'Nadie firma con un archivo de otra orden', needs: ['ORDEN'], method: 'PATCH', path: (c) => `/rest/v1/ordenes_trabajo?id=eq.${c.ORDEN}`, body: { firma_ruta: 'otra/orden/firma.png' }, expect: 'denied' }),
  tech({ id: 'SEC-45', desc: 'Un técnico no publica archivos al cliente', needs: ['ORDEN'], method: 'PATCH', path: (c) => `/rest/v1/orden_media?orden_id=eq.${c.ORDEN}`, body: { visible_cliente: true }, headers: { Prefer: 'return=representation' }, expect: 'empty' }),
  tech({ id: 'SEC-46', desc: 'Un técnico no crea el enlace del cliente', needs: ['ORDEN'], method: 'POST', path: () => rpc('crear_enlace_cliente'), body: (c) => ({ p_orden_id: c.ORDEN }), expect: 'denied' }),
  tech({ id: 'SEC-47', desc: 'Un técnico no envía presupuestos', needs: ['ORDEN'], method: 'POST', path: () => rpc('enviar_presupuesto'), body: (c) => ({ p_orden_id: c.ORDEN }), expect: 'denied' }),
  tech({ id: 'SEC-48', desc: 'Un técnico no envía el reporte', needs: ['ORDEN'], method: 'POST', path: () => rpc('enviar_reporte_cliente'), body: (c) => ({ p_orden_id: c.ORDEN }), expect: 'denied' }),
  tech({ id: 'SEC-49', desc: 'Un técnico no avisa novedades al cliente', needs: ['ORDEN'], method: 'POST', path: () => rpc('notificar_cliente_avance'), body: (c) => ({ p_orden_id: c.ORDEN }), expect: 'denied' }),
  tech({ id: 'SEC-50', desc: 'Un técnico no asigna a otra persona', needs: ['ORDEN', 'OTRO_USUARIO'], method: 'POST', path: () => '/rest/v1/orden_asignaciones', body: (c) => ({ orden_id: c.ORDEN, usuario_id: c.OTRO_USUARIO, tipo_tarea: 'mecanica' }), expect: 'denied' }),
  tech({ id: 'SEC-51', desc: 'Un técnico no mueve el avance de una orden ajena', needs: ['ORDEN_AJENA'], method: 'PATCH', path: (c) => `/rest/v1/ordenes_trabajo?id=eq.${c.ORDEN_AJENA}`, body: { porcentaje_avance: 50 }, expect: 'denied' }),
  tech({ id: 'SEC-52', desc: 'Un técnico no agrega avances a una orden ajena', needs: ['ORDEN_AJENA'], method: 'POST', path: () => '/rest/v1/orden_avances', body: (c) => ({ orden_id: c.ORDEN_AJENA, descripcion: 'PRUEBA' }), expect: 'denied' }),
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
