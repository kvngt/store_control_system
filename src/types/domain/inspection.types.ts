export type InspectionPointState = 'pendiente' | 'bien' | 'atencion' | 'urgente' | 'no_aplica';

export interface InspectionPoint {
  id: string;
  inspeccion_id: string;
  orden_id: string;
  seccion: string;
  nombre: string;
  posicion: number;
  estado: InspectionPointState;
  nota: string | null;
  actualizado_por: string | null;
  actualizado_en: string | null;
}

export interface OrderInspection {
  id: string;
  orden_id: string;
  plantilla_id: string | null;
  nombre: string;
  creado_por: string | null;
  creado_en: string;
  completada_en: string | null;
  completada_por: string | null;
  publicada_en: string | null;
  puntos?: InspectionPoint[];
}

export interface InspectionTemplatePoint {
  id?: string;
  seccion: string;
  nombre: string;
  posicion?: number;
}

export interface InspectionTemplate {
  id: string;
  sede_id: string;
  nombre: string;
  activo: boolean;
  predeterminada: boolean;
  creado_en: string;
  actualizado_en: string;
  puntos: InspectionTemplatePoint[];
}

export interface SaveInspectionTemplateInput {
  id?: string | null;
  sede_id: string;
  nombre: string;
  activo?: boolean;
  predeterminada?: boolean;
  puntos: InspectionTemplatePoint[];
}
