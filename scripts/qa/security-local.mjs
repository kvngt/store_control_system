// Corre `qa:security` contra el Supabase LOCAL preparando antes las órdenes de prueba.
//
//   npx supabase start            (o el stack local que ya tengas corriendo)
//   npm run qa:security:local     (argumentos extra van a api-security.mjs: -- --json)
//
// Qué hace:
// 1. Toma URL y llaves del stack local y asegura las 4 cuentas de prueba (`local-stack.mjs`).
//    Se niega a seguir si la URL no es de esta máquina.
// 2. Inicia sesión como el admin de prueba por la API de Auth (sin usar la llave de servicio)
//    y crea por `create_work_order` / `entregar_orden` los datos que `api-security.mjs` necesita
//    para no marcar ningún SKIP.
// 3. Lanza `scripts/qa/api-security.mjs` pisando en el entorno todas las variables de `.env.local`
//    y `.env.test.local`, y sale con su mismo código.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { ensureTestAccounts, localStack } from '../lib/local-stack.mjs';

const stack = await localStack();
const { apiUrl, anonKey } = stack;
const { password, cuentas, sedes } = await ensureTestAccounts(stack);

const adminAccount = cuentas.find((c) => c.key === 'ADMIN');
const techAccount = cuentas.find((c) => c.key === 'MECHANIC');
const sedeId = sedes[0].id;

async function api(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // no es JSON
  }
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
  return json;
}

const adminAuth = await api('POST', '/auth/v1/token?grant_type=password', {
  body: { email: adminAccount.email, password },
});
const adminToken = adminAuth.access_token;
const adminId = adminAuth.user?.id ?? adminAccount.id;
const techId = techAccount.id;

const numTag = String(Date.now()).slice(-7);
const plateTag = randomBytes(3).toString('hex').toUpperCase();

// Dos clientes y vehículos distintos: así `ORDEN_AJENA` tiene su propio cliente que el técnico
// no ve en ninguna de sus órdenes (cubre SEC-78).
const [clientePropio] = await api('POST', '/rest/v1/clientes', {
  token: adminToken,
  headers: { Prefer: 'return=representation' },
  body: {
    sede_id: sedeId,
    nombre: `PWTEST QA Propio ${numTag}`,
    telefono: `+1410${numTag}`,
    email: '',
    direccion: '',
  },
});

const [vehiculoPropio] = await api('POST', '/rest/v1/vehiculos', {
  token: adminToken,
  headers: { Prefer: 'return=representation' },
  body: {
    sede_id: sedeId,
    cliente_id: clientePropio.id,
    marca: 'Toyota',
    modelo: 'Camry',
    anio: 2020,
    color: 'Gris',
    vin: '',
    placa: `Q1${plateTag}`,
    placa_estado: 'MD',
  },
});

const [clienteAjeno] = await api('POST', '/rest/v1/clientes', {
  token: adminToken,
  headers: { Prefer: 'return=representation' },
  body: {
    sede_id: sedeId,
    nombre: `PWTEST QA Ajeno ${numTag}`,
    telefono: `+1443${numTag}`,
    email: '',
    direccion: '',
  },
});

const [vehiculoAjeno] = await api('POST', '/rest/v1/vehiculos', {
  token: adminToken,
  headers: { Prefer: 'return=representation' },
  body: {
    sede_id: sedeId,
    cliente_id: clienteAjeno.id,
    marca: 'Honda',
    modelo: 'Civic',
    anio: 2021,
    color: 'Azul',
    vin: '',
    placa: `Q2${plateTag}`,
    placa_estado: 'MD',
  },
});

const fechaEstimada = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);

async function createOrder({ clienteId, vehiculoId, labor, autorizar = true, assignments = [] }) {
  return api('POST', '/rest/v1/rpc/create_work_order', {
    token: adminToken,
    body: {
      p_order: {
        sede_id: sedeId,
        cliente_id: clienteId,
        vehiculo_id: vehiculoId,
        tipo_trabajo: 'mecanica',
        millas_ingreso: 1000,
        nivel_gasolina: '1/2',
        deposito_inicial: 0,
        inspeccion_360_notas: '',
        fecha_estimada_entrega: fechaEstimada,
        creado_por: adminId,
        autorizado_en_recepcion: autorizar,
      },
      p_labor: labor,
      p_parts: [],
      p_assignments: assignments,
    },
  });
}

// 1. Orden asignada al mecánico, autorizada, firmada y sin entregar (ORDEN + ORDEN_FIRMADA).
const ordenActiva = await createOrder({
  clienteId: clientePropio.id,
  vehiculoId: vehiculoPropio.id,
  labor: [{ descripcion: 'PWTEST QA Activa', costo: 100, especialidad: 'mecanica', asignado_a: techId, reparto_heredado: false }],
});
await api('PATCH', `/rest/v1/ordenes_trabajo?id=eq.${ordenActiva.id}`, {
  token: adminToken,
  body: {
    firma_ruta: `${sedeId}/${ordenActiva.id}/firma-qa.png`,
    firma_fecha: new Date().toISOString(),
  },
});

// 2. Orden de la misma sede sin asignar al mecánico, con una tarea aprobada (ORDEN_AJENA + LABOR_AJENA).
const ordenAjena = await createOrder({
  clienteId: clienteAjeno.id,
  vehiculoId: vehiculoAjeno.id,
  labor: [{ descripcion: 'PWTEST QA Ajena', costo: 100, especialidad: 'mecanica', asignado_a: null, reparto_heredado: false }],
});

// 3. Orden asignada al mecánico y entregada por la RPC de entrega (ORDEN_ENTREGADA + LABOR_ENTREGADA).
const ordenEntregada = await createOrder({
  clienteId: clientePropio.id,
  vehiculoId: vehiculoPropio.id,
  labor: [{ descripcion: 'PWTEST QA Entregada', costo: 100, especialidad: 'mecanica', asignado_a: techId, reparto_heredado: false }],
});
await api('POST', '/rest/v1/rpc/entregar_orden', {
  token: adminToken,
  body: {
    p_orden_id: ordenEntregada.id,
    p_metodo: 'efectivo',
    p_numero_cheque: null,
    p_comprobante_ruta: null,
  },
});

// 4. Orden asignada al mecánico en estado finalizado, con tarea aprobada sin completar (LABOR_FINALIZADA / SEC-211).
const ordenFinalizada = await createOrder({
  clienteId: clientePropio.id,
  vehiculoId: vehiculoPropio.id,
  labor: [{ descripcion: 'PWTEST QA Finalizada', costo: 100, especialidad: 'mecanica', asignado_a: techId, reparto_heredado: false }],
});
await api('PATCH', `/rest/v1/ordenes_trabajo?id=eq.${ordenFinalizada.id}`, {
  token: adminToken,
  body: {
    estatus: 'finalizado',
    fecha_finalizacion: new Date().toISOString(),
    porcentaje_avance: 100,
  },
});

// 5. Orden asignada al mecánico con lo cotizado sin autorizar (ORDEN_SIN_AUTORIZAR / SEC-215, B-02).
const ordenSinAutorizar = await createOrder({
  clienteId: clientePropio.id,
  vehiculoId: vehiculoPropio.id,
  labor: [{ descripcion: 'PWTEST QA Sin autorizar', costo: 100, especialidad: 'mecanica', asignado_a: techId, reparto_heredado: false }],
  autorizar: false,
  assignments: [{ usuario_id: techId, tipo_tarea: 'mecanica' }],
});

const extraArgs = process.argv.slice(2);
const childEnv = {
  ...process.env,
  // Pisar todas las variables que `api-security.mjs` pueda leer de `.env.local` o `.env.test.local`.
  SB_URL: apiUrl,
  SB_ANON: anonKey,
  VITE_SUPABASE_URL: apiUrl,
  VITE_SUPABASE_ANON_KEY: anonKey,
  TOKEN_TECH: '',
  TOKEN_ADMIN: '',
  QA_ADMIN_EMAIL: adminAccount.email,
  QA_ADMIN_PASSWORD: password,
  QA_TECH_EMAIL: techAccount.email,
  QA_TECH_PASSWORD: password,
  E2E_ADMIN_EMAIL: adminAccount.email,
  E2E_ADMIN_PASSWORD: password,
  E2E_MECHANIC_EMAIL: techAccount.email,
  E2E_MECHANIC_PASSWORD: password,
  ORDEN: ordenActiva.id,
  ORDEN_AJENA: ordenAjena.id,
  ORDEN_ENTREGADA: ordenEntregada.id,
  ORDEN_FINALIZADA: ordenFinalizada.id,
  ORDEN_FIRMADA: ordenActiva.id,
  ORDEN_SIN_AUTORIZAR: ordenSinAutorizar.id,
};

if (!extraArgs.includes('--json')) {
  console.log(`qa:security:local contra ${apiUrl} · sedes: ${sedes.map((s) => s.nombre).join(', ')}`);
}
const child = spawn(process.execPath, ['scripts/qa/api-security.mjs', ...extraArgs], {
  stdio: 'inherit',
  env: childEnv,
});
child.on('exit', (code) => process.exit(code ?? 1));
