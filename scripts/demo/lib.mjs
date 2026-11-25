import { createClient } from '@supabase/supabase-js';

export const DEMO_MARKER = ' · demo';

export const DEMO_ACCOUNTS = [
  { key: 'ADMIN', email: 'demo-admin@demo.restorify.test', rol: 'admin', nombre: 'Marcos Rivera' },
  { key: 'MECHANIC', email: 'demo-mecanico@demo.restorify.test', rol: 'mecanico', nombre: 'Elena Soto' },
  { key: 'PAINTER', email: 'demo-pintor@demo.restorify.test', rol: 'pintor', nombre: 'Iván Cárdenas' },
];

// PNG 1x1 válido para registrar firmas de recepción en Storage durante la demostración.
export const DEMO_SIGNATURE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export function markDemoName(name) {
  return name.endsWith(DEMO_MARKER) ? name : `${name}${DEMO_MARKER}`;
}

export function isDemoMarked(name) {
  return typeof name === 'string' && name.endsWith(DEMO_MARKER);
}

export function formatApiError(err) {
  if (!err || typeof err !== 'object') return String(err);
  const code = err.code ?? err.status ?? err.statusCode ?? 'ERROR';
  const message = err.message ?? String(err);
  const parts = [`[${code}] ${message}`];
  if (err.details) parts.push(`Detalle: ${err.details}`);
  if (err.hint) parts.push(`Sugerencia: ${err.hint}`);
  return parts.join(' | ');
}

export function assertRowsAffected(rows, entity) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw Object.assign(
      new Error(`La base no afectó ninguna fila al operar sobre ${entity}.`),
      { code: '42501' },
    );
  }
}

export async function signInClient(apiUrl, anonKey, email, password) {
  const client = createClient(apiUrl, anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error(`No se obtuvo sesión para ${email}.`);
  return client;
}

export async function fetchAllRows(buildPage, pageSize = 1000) {
  const rows = [];
  for (;;) {
    const { data, error } = await buildPage(rows.length, rows.length + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
}

export function localDateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export const DEMO_CUSTOMERS = [
  {
    key: 'c1',
    nombre: 'Carlos Mendoza',
    telefono: '+14105550101',
    email: 'carlos.mendoza@example.test',
    direccion: '412 Light St, Baltimore, MD 21202',
    notas_crm: 'Prefiere aviso por WhatsApp antes de pasar a recoger.',
    idioma: 'es',
    vehiculo: { marca: 'Toyota', modelo: 'Camry', anio: 2020, color: 'Plata', placa: '7DM4011', placa_estado: 'MD', vin: '1HGCM82633A900101' },
  },
  {
    key: 'c2',
    nombre: 'Sarah Jenkins',
    telefono: '+14105550102',
    email: 'sarah.jenkins@example.test',
    direccion: '881 Charles St, Towson, MD 21204',
    notas_crm: 'Works nearby; prefers email quote approvals.',
    idioma: 'en',
    vehiculo: { marca: 'Honda', modelo: 'CR-V', anio: 2021, color: 'Blue', placa: '7DM4012', placa_estado: 'MD', vin: '2T1BURHE0JC900102' },
  },
  {
    key: 'c3',
    nombre: 'Mateo Salgado',
    telefono: '+14105550103',
    email: 'mateo.salgado@example.test',
    direccion: '205 Eastern Ave, Baltimore, MD 21224',
    notas_crm: 'Cliente frecuente de mantenimiento preventivo.',
    idioma: 'es',
    vehiculo: { marca: 'Ford', modelo: 'F-150', anio: 2019, color: 'Negro', placa: '7DM4013', placa_estado: 'MD', vin: '3FA6P0H78JR900103' },
  },
  {
    key: 'c4',
    nombre: 'Lucía Navarro',
    telefono: '+14105550104',
    email: '',
    direccion: '119 Dundalk Ave, Dundalk, MD 21222',
    notas_crm: 'No usa correo; contactar solo por teléfono o WhatsApp.',
    idioma: 'es',
    vehiculo: { marca: 'Chevrolet', modelo: 'Malibu', anio: 2018, color: 'Blanco', placa: '7DM4014', placa_estado: 'MD', vin: '1G1ZE5ST9HF900104' },
  },
  {
    key: 'c5',
    nombre: 'David Miller',
    telefono: '+14105550105',
    email: 'david.miller@example.test',
    direccion: '640 York Rd, Timonium, MD 21093',
    notas_crm: 'Call before ordering OEM parts above $300.',
    idioma: 'en',
    vehiculo: { marca: 'Hyundai', modelo: 'Tucson', anio: 2022, color: 'Gray', placa: '7DM4015', placa_estado: 'MD', vin: '5NPE24AF8HH900105' },
  },
  {
    key: 'c6',
    nombre: 'Sofía Castillo',
    telefono: '+14105550106',
    email: 'sofia.castillo@example.test',
    direccion: '330 Fleet St, Baltimore, MD 21202',
    notas_crm: 'Cuida mucho el acabado de pintura perlada.',
    idioma: 'es',
    vehiculo: { marca: 'Jeep', modelo: 'Grand Cherokee', anio: 2021, color: 'Rojo', placa: '7DM4016', placa_estado: 'MD', vin: '1C4RJFBG5KC900106' },
  },
  {
    key: 'c7',
    nombre: 'Michael Brooks',
    telefono: '+14105550107',
    email: 'michael.brooks@example.test',
    direccion: '518 Frederick Rd, Catonsville, MD 21228',
    notas_crm: 'Usually picks up after 5:00 PM.',
    idioma: 'en',
    vehiculo: { marca: 'Mazda', modelo: 'CX-5', anio: 2020, color: 'White', placa: '7DM4017', placa_estado: 'MD', vin: 'JM1DKDB74K0900107' },
  },
  {
    key: 'c8',
    nombre: 'Valeria Ortega',
    telefono: '+14105550108',
    email: 'valeria.ortega@example.test',
    direccion: '742 Pulaski Hwy, Rosedale, MD 21237',
    notas_crm: 'Paga con tarjeta corporativa.',
    idioma: 'es',
    vehiculo: { marca: 'Toyota', modelo: 'RAV4', anio: 2023, color: 'Gris', placa: '7DM4018', placa_estado: 'MD', vin: '5XYZTDLB7JG900108' },
  },
  {
    key: 'c9',
    nombre: 'Hannah Cooper',
    telefono: '+14105550109',
    email: 'hannah.cooper@example.test',
    direccion: '95 Bel Air Rd, Perry Hall, MD 21128',
    notas_crm: 'Prefers Zelle for final settlement.',
    idioma: 'en',
    vehiculo: { marca: 'Nissan', modelo: 'Altima', anio: 2019, color: 'Black', placa: '7DM4019', placa_estado: 'MD', vin: '1N4BL4BV5LC900109' },
  },
  {
    key: 'c10',
    nombre: 'Jorge Paredes',
    telefono: '+14105550110',
    email: 'jorge.paredes@example.test',
    direccion: '408 Ritchie Hwy, Glen Burnie, MD 21061',
    notas_crm: 'Evalúa reparación de transmisión según presupuesto.',
    idioma: 'es',
    vehiculo: { marca: 'Audi', modelo: 'Q5', anio: 2017, color: 'Azul', placa: '7DM4020', placa_estado: 'MD', vin: 'WA1LFAFP5EA900110' },
  },
  {
    key: 'c11',
    nombre: 'Rachel Bennett',
    telefono: '+14105550111',
    email: 'rachel.bennett@example.test',
    direccion: '1502 Reisterstown Rd, Pikesville, MD 21208',
    notas_crm: 'Requested seasonal inspection next month.',
    idioma: 'en',
    vehiculo: { marca: 'Subaru', modelo: 'Outback', anio: 2022, color: 'Green', placa: '7DM4021', placa_estado: 'MD', vin: '' },
  },
  {
    key: 'c12',
    nombre: 'Andrew Foster',
    telefono: '+14105550112',
    email: 'andrew.foster@example.test',
    direccion: '2750 Loch Raven Rd, Baltimore, MD 21218',
    notas_crm: 'Fleet vehicle owner; two personal cars.',
    idioma: 'en',
    vehiculo: { marca: 'Volkswagen', modelo: 'Jetta', anio: 2020, color: 'Silver', placa: '7DM4022', placa_estado: 'MD', vin: '' },
  },
];
