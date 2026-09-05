// Aggregated KPIs for the dashboard and the finance summary cards.
import { supabase } from '../lib/supabase';
import type { DashboardStats, OrderStatus } from '../types/database';
import { isSameMonth } from './support';

const DEFAULT_CAPACITY = 10;

export const dashboardService = {
  getDashboardStats: async (sedeId?: string, capacity: number = DEFAULT_CAPACITY): Promise<DashboardStats> => {
    let ordersQuery = supabase.from('ordenes_trabajo').select('*');
    if (sedeId) ordersQuery = ordersQuery.eq('sede_id', sedeId);
    const { data: ordersData, error: ordersError } = await ordersQuery;
    if (ordersError) throw ordersError;
    const orders = ordersData || [];

    let txnQuery = supabase.from('finanzas_movimientos').select('*');
    if (sedeId) txnQuery = txnQuery.eq('sede_id', sedeId);
    const { data: txnData } = await txnQuery;
    const transactions = txnData || [];

    let customerQuery = supabase.from('clientes').select('id, creado_en');
    if (sedeId) customerQuery = customerQuery.eq('sede_id', sedeId);
    const { data: customerData } = await customerQuery;
    const customers = customerData || [];

    const now = new Date();
    const activeOrders = orders.filter((o) => !['finalizado', 'entregado'].includes(o.estatus));
    const finishedThisMonth = orders.filter(
      (o) => o.estatus === 'finalizado' && o.fecha_finalizacion && isSameMonth(o.fecha_finalizacion, now)
    );

    const incomeMonth = transactions
      .filter((t) => t.tipo === 'ingreso' && isSameMonth(t.fecha, now))
      .reduce((sum, t) => sum + Number(t.monto), 0);
    const expenseMonth = transactions
      .filter((t) => t.tipo === 'egreso' && isSameMonth(t.fecha, now))
      .reduce((sum, t) => sum + Number(t.monto), 0);

    const statusCounts: Record<OrderStatus, number> = {
      recepcion: 0,
      en_proceso: 0,
      espera_repuestos: 0,
      finalizado: 0,
      entregado: 0,
    };
    orders.forEach((o) => {
      statusCounts[o.estatus as OrderStatus] = (statusCounts[o.estatus as OrderStatus] || 0) + 1;
    });

    const ingresos_por_mes: { mes: string; ingresos: number; egresos: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ingresos = transactions
        .filter((t) => t.tipo === 'ingreso' && isSameMonth(t.fecha, ref))
        .reduce((sum, t) => sum + Number(t.monto), 0);
      const egresos = transactions
        .filter((t) => t.tipo === 'egreso' && isSameMonth(t.fecha, ref))
        .reduce((sum, t) => sum + Number(t.monto), 0);
      ingresos_por_mes.push({ mes: ref.toLocaleDateString('es', { month: 'short' }), ingresos, egresos });
    }

    return {
      ordenes_activas: activeOrders.length,
      ordenes_finalizadas_mes: finishedThisMonth.length,
      ingresos_mes: incomeMonth,
      egresos_mes: expenseMonth,
      clientes_nuevos_mes: customers.filter((c) => isSameMonth(c.creado_en, now)).length,
      tasa_ocupacion: Math.min(100, Math.round((activeOrders.length / capacity) * 100)),
      ordenes_por_estatus: statusCounts,
      ingresos_por_mes,
    };
  },
};
