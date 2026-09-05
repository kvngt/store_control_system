import type { OrderStatus } from './enums';

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
