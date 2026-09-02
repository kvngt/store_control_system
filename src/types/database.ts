// ===================================================
// RESTORIFY — TypeScript Database Types
// Mirrors the Supabase PostgreSQL schema
// ===================================================

// ===== Enums =====
export type UserRole = 'admin' | 'mecanico' | 'pintor';

export type WorkType = 'mecanica' | 'pintura' | 'combinado';

export type OrderStatus =
  | 'recepcion'
  | 'en_proceso'
  | 'espera_repuestos'
  | 'finalizado'
  | 'entregado';

export type TaskStatus = 'pendiente' | 'en_curso' | 'completada';

export type PhotoType = 'exterior_360' | 'interior' | 'combustible' | 'dano_previo';

export type TransactionType = 'ingreso' | 'egreso';

export type TransactionCategory =
  | 'pago_cliente'
  | 'compra_repuesto'
  | 'planilla'
  | 'gasto_operativo';

// ===== Core Entities =====

export interface Sede {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  capacidad: number;
  /** Accent colour as #rrggbb. Null = use the default Restorify gold. */
  color_tema?: string | null;
  logo_url?: string | null;
  fecha_creacion: string;
}

export interface UserProfile {
  id: string;
  nombre_completo: string;
  rol: UserRole;
  sede_id: string;
  telefono: string;
  email: string;
  avatar_url?: string;
  creado_en: string;
}

export interface Customer {
  id: string;
  sede_id: string;
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  notas_crm: string;
  creado_en: string;
  // Virtual fields from joins
  vehiculos_count?: number;
  ordenes_count?: number;
}

export interface Vehicle {
  id: string;
  cliente_id: string;
  /** Derived from the owning customer by a DB trigger; never sent by the app. */
  sede_id?: string;
  marca: string;
  modelo: string;
  anio: number;
  vin: string;
  placa: string;
  color: string;
  creado_en: string;
  // Virtual
  cliente_nombre?: string;
}

export interface WorkOrder {
  id: string;
  numero_orden: string;
  sede_id: string;
  cliente_id: string;
  vehiculo_id: string;
  tipo_trabajo: WorkType;
  estatus: OrderStatus;
  millas_ingreso: number;
  nivel_gasolina: string;
  deposito_inicial: number;
  inspeccion_360_notas: string;
  inspeccion_360_fotos?: (string | undefined)[];
  fecha_ingreso: string;
  fecha_estimada_entrega: string;
  fecha_finalizacion?: string;
  firma_cliente_url?: string | null;
  firma_fecha?: string | null;
  porcentaje_avance: number;
  total_labor: number;
  total_repuestos: number;
  total_general: number;
  creado_por: string;
  creado_en: string;
  // Virtual fields from joins
  cliente?: Customer;
  vehiculo?: Vehicle;
  asignaciones?: OrderAssignment[];
  fotos?: InspectionPhoto[];
  repuestos?: WorkOrderPart[];
  labor_items?: LaborItem[];
  avances?: OrderProgressUpdate[];
}

export interface OrderProgressUpdate {
  id: string;
  orden_id: string;
  usuario_id: string;
  descripcion: string;
  fotos: string[];
  creado_en: string;
  // Virtual
  usuario?: UserProfile;
}

export interface LaborItem {
  id: string;
  orden_id: string;
  descripcion: string;
  costo: number;
}

export interface OrderAssignment {
  id: string;
  orden_id: string;
  usuario_id: string;
  tipo_tarea: 'mecanica' | 'pintura';
  estatus_tarea: TaskStatus;
  // Virtual
  usuario?: UserProfile;
}

export interface InspectionPhoto {
  id: string;
  orden_id: string;
  url_imagen: string;
  tipo_foto: PhotoType;
  zona?: string;
  fecha_carga: string;
}

export interface WorkOrderPart {
  id: string;
  orden_id: string;
  descripcion: string;
  cantidad: number;
  costo_unitario: number;
  precio_venta_unitario: number;
  subtotal: number;
}

export interface FinancialTransaction {
  id: string;
  sede_id: string;
  referencia_orden_id?: string;
  importacion_id?: string;
  tipo: TransactionType;
  categoria: TransactionCategory;
  monto: number;
  descripcion: string;
  fecha: string;
  numero_cheque?: string | null;
  registrado_por?: string;
  creado_en: string;
}

// ===== Bank statement import =====
export interface BankStatementImport {
  id: string;
  sede_id: string;
  nombre_archivo: string;
  ruta_archivo: string;
  fecha_importacion: string;
  importado_por?: string;
  total_transacciones: number;
  creado_en: string;
}

export interface CategorizationRule {
  id: string;
  patron: string;
  categoria: TransactionCategory;
  activo: boolean;
  /** Higher wins when several patterns match; ties go to the longer one. */
  prioridad?: number;
}

// A transaction line as reconstructed from the PDF, before it's reviewed and
// possibly inserted into finanzas_movimientos.
export interface ParsedStatementTransaction {
  fecha: string; // ISO yyyy-mm-dd
  numero_cheque?: string;
  descripcion: string;
  monto: number;
  tipo: TransactionType;
}

// A parsed transaction augmented with the reviewer's decisions, tracked in the
// import review table.
export interface ReviewableTransaction extends ParsedStatementTransaction {
  rowId: string;
  categoria: TransactionCategory | '';
  incluir: boolean;
  posibleDuplicado: boolean;
  duplicadoDescripcion?: string;
}

export interface PayrollEntry {
  id: string;
  sede_id: string;
  usuario_id: string;
  periodo_inicio: string;
  periodo_fin: string;
  salario_base: number;
  bonos: number;
  deducciones: number;
  total_pagado: number;
  fecha_pago: string;
  // Virtual
  usuario?: UserProfile;
}

// ===== Dashboard / Stats =====
export interface DashboardStats {
  ordenes_activas: number;
  ordenes_finalizadas_mes: number;
  ingresos_mes: number;
  egresos_mes: number;
  clientes_nuevos_mes: number;
  tasa_ocupacion: number;
  ordenes_por_estatus: Record<OrderStatus, number>;
  ingresos_por_mes: { mes: string; ingresos: number; egresos: number }[];
}

// ===== Form Inputs =====
export interface CustomerInput {
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  notas_crm: string;
  sede_id: string;
}

export interface VehicleInput {
  cliente_id: string;
  marca: string;
  modelo: string;
  anio: number;
  vin: string;
  placa: string;
  color: string;
}

export interface WorkOrderInput {
  sede_id: string;
  cliente_id: string;
  vehiculo_id: string;
  tipo_trabajo: WorkType;
  millas_ingreso: number;
  nivel_gasolina: string;
  deposito_inicial: number;
  inspeccion_360_notas: string;
  fecha_estimada_entrega: string;
  labor_items: Omit<LaborItem, 'id' | 'orden_id'>[];
  repuestos: (Omit<WorkOrderPart, 'id' | 'orden_id' | 'subtotal' | 'costo_unitario'> & { costo_unitario?: number })[];
  asignaciones: { usuario_id: string; tipo_tarea: 'mecanica' | 'pintura' }[];
}
