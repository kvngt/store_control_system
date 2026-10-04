import type { OrderStatus } from './enums';
import type { Specialty } from './payroll.types';
import type { LineState } from './quote.types';

export interface DashboardStats {
  ordenes_activas: number;
  ordenes_finalizadas_mes: number;
  ingresos_mes: number;
  egresos_mes: number;
  /** Todo lo registrado en la sede, de siempre (tarjetas de Finanzas). */
  ingresos_total: number;
  egresos_total: number;
  clientes_nuevos_mes: number;
  tasa_ocupacion: number;
  ordenes_por_estatus: Record<OrderStatus, number>;
  ingresos_por_mes: { mes: string; ingresos: number; egresos: number }[];
}

/** Una orden a la que lleva un aviso de "Requiere atención". */
export interface AttentionOrder {
  id: string;
  numero_orden: string;
}

/** Cuántos hay de un tipo de pendiente y las primeras órdenes (la que más espera primero). */
export interface AttentionGroup {
  total: number;
  ordenes: AttentionOrder[];
}

/** Lo que devuelve `requiere_atencion` (20261010000012): lo que espera a la oficina. */
export interface AttentionSummary {
  hallazgos: AttentionGroup;
  presupuestos: AttentionGroup;
  sin_tecnico: AttentionGroup;
  vencidas: AttentionGroup;
  correos: { total: number };
}

/** Una tarea en "Mis tareas" del panel del técnico (F7): la línea y su orden. */
export interface MyTask {
  id: string;
  orden_id: string;
  descripcion: string;
  especialidad: Specialty;
  estado: LineState;
  completado_en: string | null;
  orden: {
    id: string;
    numero_orden: string;
    estatus: OrderStatus;
    fecha_estimada_entrega: string | null;
    vehiculo: { marca: string; modelo: string; anio: number | null } | null;
  };
}
