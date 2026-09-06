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
  /** Only the price; `costo_unitario` is mirrored from it by the database. */
  repuestos: Omit<WorkOrderPart, 'id' | 'orden_id' | 'subtotal' | 'costo_unitario'>[];
  asignaciones: { usuario_id: string; tipo_tarea: 'mecanica' | 'pintura' }[];
}
