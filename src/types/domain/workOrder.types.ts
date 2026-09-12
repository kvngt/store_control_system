import type { OrderStatus, PhotoType, TaskStatus, WorkType } from './enums';
import type { Customer } from './customer.types';
import type { UserProfile } from './auth.types';
import type { Vehicle } from './vehicle.types';

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
  inspeccion_360_notas: string;
  inspeccion_360_fotos?: (string | undefined)[];
  fecha_ingreso: string;
  fecha_estimada_entrega: string;
  fecha_finalizacion?: string;
  firma_cliente_url?: string | null;
  firma_fecha?: string | null;
  porcentaje_avance: number;
  /** Visible para toda la sede: la comisión del técnico sale de aquí. */
  total_labor: number;
  creado_por: string;
  creado_en: string;
  // Virtual fields from joins
  /**
   * El dinero de la orden. Vive en `orden_montos`, que solo un administrador
   * puede leer: para un mecánico o pintor PostgREST devuelve `null` en el embed.
   * Por eso es opcional y nullable, y ninguna pantalla debe asumir que existe.
   */
  montos?: OrderAmounts | null;
  cliente?: Customer;
  vehiculo?: Vehicle;
  asignaciones?: OrderAssignment[];
  fotos?: InspectionPhoto[];
  /** Solo administradores (RLS). Para un técnico llega vacío. */
  repuestos?: WorkOrderPart[];
  /** Qué piezas lleva la orden, sin precios. Lo que ve un técnico. */
  repuestos_resumen?: PartSummary[];
  labor_items?: LaborItem[];
  avances?: OrderProgressUpdate[];
}

/** Totales y depósito de una orden. Solo administradores (ver `orden_montos`). */
export interface OrderAmounts {
  total_repuestos: number;
  total_general: number;
  deposito_inicial: number;
}

/**
 * Un repuesto como lo ve un técnico: qué pieza y cuántas, sin precio.
 * Viene de la función `repuestos_de_orden`, no de la tabla.
 */
export interface PartSummary {
  id: string;
  descripcion: string;
  cantidad: number;
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

export interface WorkOrderInput {
  sede_id: string;
  cliente_id: string;
  vehiculo_id: string;
  tipo_trabajo: WorkType;
  millas_ingreso: number;
  nivel_gasolina: string;
  /** Solo lo toma `create_work_order` si quien llama es admin. */
  deposito_inicial: number;
  inspeccion_360_notas: string;
  fecha_estimada_entrega: string;
  labor_items: Omit<LaborItem, 'id' | 'orden_id'>[];
  /** Only the price; `costo_unitario` is mirrored from it by the database. */
  repuestos: Omit<WorkOrderPart, 'id' | 'orden_id' | 'subtotal' | 'costo_unitario'>[];
  asignaciones: { usuario_id: string; tipo_tarea: 'mecanica' | 'pintura' }[];
}
