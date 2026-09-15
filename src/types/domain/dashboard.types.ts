import type { OrderStatus } from './enums';

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
