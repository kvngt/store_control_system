// Aggregated KPIs for the dashboard and the finance summary cards.
import { supabase } from '../lib/supabase';
import type { DashboardStats, OrderStatus } from '../types/database';
import { todayLocal } from '../lib/dates';

/** Capacidad que se asume cuando una sede no tiene una configurada. */
export const DEFAULT_CAPACITY = 10;

/** Lo que devuelve `resumen_panel` (ver la migración 20260927000000). */
interface ResumenPanel {
  ordenes_activas: number;
  ordenes_finalizadas_mes: number;
  ingresos_mes: number;
  egresos_mes: number;
  ingresos_total: number;
  egresos_total: number;
  clientes_nuevos_mes: number;
  ordenes_por_estatus: Record<OrderStatus, number>;
  ingresos_por_mes: { mes_inicio: string; ingresos: number; egresos: number }[];
}

/** La zona horaria del navegador: "este mes" es el mes del taller, no el del servidor. */
export function shopTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';
  } catch {
    return 'America/Chicago';
  }
}

/** `2026-09-01` → "sept", sin pasar por UTC (que en EE. UU. lo movería a agosto). */
export function monthLabel(isoDate: string): string {
  const [year, month] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('es', { month: 'short' });
}

export const dashboardService = {
  /**
   * Los totales los suma la base (`resumen_panel`). Antes se descargaban todas las
   * órdenes y todos los movimientos para sumarlos aquí: la API devuelve como máximo
   * 1.000 filas, así que con la importación bancaria los ingresos del mes salían mal
   * sin ningún error. La función respeta RLS: un técnico recibe ceros en el dinero.
   */
  getDashboardStats: async (sedeId?: string, capacity: number = DEFAULT_CAPACITY): Promise<DashboardStats> => {
    const { data, error } = await supabase.rpc('resumen_panel', {
      p_sede_id: sedeId ?? null,
      p_hoy: todayLocal(),
      p_tz: shopTimeZone(),
    });
    if (error) throw error;
    const r = data as ResumenPanel;
    const safeCapacity = capacity > 0 ? capacity : DEFAULT_CAPACITY;

    return {
      ordenes_activas: Number(r.ordenes_activas),
      ordenes_finalizadas_mes: Number(r.ordenes_finalizadas_mes),
      ingresos_mes: Number(r.ingresos_mes),
      egresos_mes: Number(r.egresos_mes),
      ingresos_total: Number(r.ingresos_total),
      egresos_total: Number(r.egresos_total),
      clientes_nuevos_mes: Number(r.clientes_nuevos_mes),
      tasa_ocupacion: Math.min(100, Math.round((Number(r.ordenes_activas) / safeCapacity) * 100)),
      ordenes_por_estatus: r.ordenes_por_estatus,
      ingresos_por_mes: (r.ingresos_por_mes ?? []).map((m) => ({
        mes: monthLabel(m.mes_inicio),
        ingresos: Number(m.ingresos),
        egresos: Number(m.egresos),
      })),
    };
  },
};
