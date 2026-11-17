import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  TEST_DATA_PREFIX,
} from './fixtures.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';

/**
 * Imagen JPEG mínima para comprobantes de pago (el campo acepta image/* y PDF).
 * Nota: para subidas por galería que pasan por `<canvas>` (`compressImage`), generar
 * un JPEG con canvas en el navegador garantiza un archivo decodificable por `<img>`.
 */
export const RECEIPT: { name: string; mimeType: string; buffer: Buffer } = {
  name: 'comprobante.jpg',
  mimeType: 'image/jpeg',
  buffer: Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
    'base64',
  ),
};

export type TestSpecialty = 'mecanica' | 'pintura';
export type TestPaymentMethod = 'efectivo' | 'tarjeta' | 'zelle' | 'transferencia' | 'cheque';

export interface TestLaborInput {
  descripcion: string;
  costo: number;
  especialidad?: TestSpecialty;
  asignado_a?: string | null;
  reparto_heredado?: boolean;
}

export interface TestPartInput {
  descripcion: string;
  cantidad: number;
  precio_venta_unitario: number;
  costo_unitario?: number;
}

export interface TestAssignmentInput {
  usuario_id: string;
  tipo_tarea?: TestSpecialty;
}

export interface CreateTestOrderOptions {
  label?: string;
  tipoTrabajo?: TestSpecialty | 'combinado';
  labor?: TestLaborInput[];
  parts?: TestPartInput[];
  assignTo?: string | TestAssignmentInput[];
  authorized?: boolean;
  deposit?: number;
  depositMethod?: TestPaymentMethod;
}

export interface CreatedTestOrder {
  id: string;
  numero: string;
  sedeId: string;
  clienteId: string;
  vehiculoId: string;
}

let uniqueSeq = 0;

function nextUniqueSuffix(): { digits: string; plate: string } {
  uniqueSeq += 1;
  const seqDigit = String(uniqueSeq % 10);
  const rand2 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
  const digits = `${Date.now().toString().slice(-4)}${rand2}${seqDigit}`;
  const plateTime = Date.now().toString(36).slice(-3).toUpperCase();
  const plateRand = Math.floor(Math.random() * 1296).toString(36).padStart(2, '0').toUpperCase();
  const plateSeq = (uniqueSeq % 36).toString(36).toUpperCase();
  return { digits, plate: `PW${plateTime}${plateRand}${plateSeq}` };
}

/**
 * Crea un cliente de Supabase autenticado con `email` y `password` contra la base configurada
 * en `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
 */
export async function clientFor(email: string, password: string): Promise<SupabaseClient> {
  const db = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return db;
}

/** Cliente de Supabase autenticado con las credenciales de administración de e2e. */
export async function adminClient(): Promise<SupabaseClient> {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('Faltan E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD para crear la sesión de admin.');
  }
  return clientFor(ADMIN_EMAIL, ADMIN_PASSWORD);
}

/** Devuelve el `id` (`perfiles.id` / `auth.users.id`) del usuario con ese correo. */
export async function userIdOf(db: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await db
    .from('perfiles')
    .select('id')
    .eq('email', email)
    .single();
  if (error) throw error;
  return data.id as string;
}

/**
 * Crea cliente y vehículo con prefijo `PWTEST` y la orden mediante la RPC `create_work_order`.
 * Usa la sesión activa de `db` (debe ser admin) para obtener `creado_por` y `sede_id`.
 */
export async function createTestOrder(
  db: SupabaseClient,
  options: CreateTestOrderOptions = {},
): Promise<CreatedTestOrder> {
  const {
    label = 'Orden',
    tipoTrabajo = 'mecanica',
    labor = [],
    parts = [],
    assignTo = [],
    authorized = false,
    deposit = 0,
    depositMethod = 'efectivo',
  } = options;

  const { data: userData, error: userError } = await db.auth.getUser();
  if (userError || !userData.user) {
    throw userError ?? new Error('No hay usuario autenticado en el cliente de Supabase.');
  }
  const userId = userData.user.id;

  const { data: perfil, error: perfilError } = await db
    .from('perfiles')
    .select('sede_id')
    .eq('id', userId)
    .single();
  if (perfilError) throw perfilError;
  const sedeId = perfil.sede_id as string;

  const { digits, plate } = nextUniqueSuffix();

  const { data: cliente, error: clienteError } = await db
    .from('clientes')
    // Sin correo, como la app: la columna guarda '' (el cliente puede no tener correo).
    .insert({
      sede_id: sedeId,
      nombre: `${TEST_DATA_PREFIX} ${label} ${digits}`,
      telefono: `+1410${digits}`,
      email: '',
      direccion: '',
    })
    .select('id')
    .single();
  if (clienteError) throw clienteError;

  const { data: vehiculo, error: vehiculoError } = await db
    .from('vehiculos')
    .insert({
      sede_id: sedeId,
      cliente_id: cliente.id,
      marca: 'Toyota',
      modelo: 'Camry',
      anio: 2019,
      color: 'Gris',
      vin: '',
      placa: plate,
      placa_estado: 'MD',
    })
    .select('id')
    .single();
  if (vehiculoError) throw vehiculoError;

  const pAssignments =
    typeof assignTo === 'string'
      ? [{ usuario_id: assignTo, tipo_tarea: tipoTrabajo === 'pintura' ? 'pintura' : 'mecanica' }]
      : assignTo.map((a) => ({
          usuario_id: a.usuario_id,
          tipo_tarea: a.tipo_tarea ?? (tipoTrabajo === 'pintura' ? 'pintura' : 'mecanica'),
        }));

  const pLabor = labor.map((l) => ({
    descripcion: l.descripcion,
    costo: l.costo,
    especialidad: l.especialidad ?? (tipoTrabajo === 'pintura' ? 'pintura' : 'mecanica'),
    asignado_a: l.asignado_a ?? null,
    reparto_heredado: l.reparto_heredado ?? false,
  }));

  const pParts = parts.map((p) => ({
    descripcion: p.descripcion,
    cantidad: p.cantidad,
    precio_venta_unitario: p.precio_venta_unitario,
    costo_unitario: p.costo_unitario ?? p.precio_venta_unitario,
  }));

  const { data: orden, error: ordenError } = await db.rpc('create_work_order', {
    p_order: {
      sede_id: sedeId,
      cliente_id: cliente.id,
      vehiculo_id: vehiculo.id,
      tipo_trabajo: tipoTrabajo,
      millas_ingreso: 1000,
      nivel_gasolina: '1/2',
      deposito_inicial: deposit,
      ...(deposit > 0 ? { deposito_metodo: depositMethod } : {}),
      inspeccion_360_notas: '',
      fecha_estimada_entrega: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10),
      creado_por: userId,
      autorizado_en_recepcion: authorized,
    },
    p_labor: pLabor,
    p_parts: pParts,
    p_assignments: pAssignments,
  });
  if (ordenError) throw ordenError;

  const created = orden as { id: string; numero_orden: string };
  return {
    id: created.id,
    numero: created.numero_orden,
    sedeId,
    clienteId: cliente.id as string,
    vehiculoId: vehiculo.id as string,
  };
}
