// Customers and their CRM profile.
import { supabase } from '../lib/supabase';
import type { Customer, CustomerInput, Vehicle, WorkOrder } from '../types/database';
import { assertDeleted } from './support';

/** Cuántas filas hay por `cliente_id`, en una sola pasada. */
function countByCustomer(rows: { cliente_id: string }[] | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows || []) counts.set(row.cliente_id, (counts.get(row.cliente_id) || 0) + 1);
  return counts;
}

export const customersService = {
  getCustomers: async (sedeId?: string) => {
    let query = supabase.from('clientes').select('*').order('creado_en', { ascending: false });
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data: clientes, error } = await query;
    if (error) throw error;

    const clienteIds = (clientes || []).map((c) => c.id);
    const [{ data: vehiculos }, { data: ordenes }] = clienteIds.length
      ? await Promise.all([
          supabase.from('vehiculos').select('id, cliente_id').in('cliente_id', clienteIds),
          supabase.from('ordenes_trabajo').select('id, cliente_id').in('cliente_id', clienteIds),
        ])
      : [{ data: [] }, { data: [] }];

    // Contar con un índice y no con un `.filter` por cliente: con 1.000 clientes y 3.000
    // órdenes eran 4 millones de comparaciones en cada carga de la lista (PR #13).
    const vehicleCounts = countByCustomer(vehiculos);
    const orderCounts = countByCustomer(ordenes);

    return (clientes || []).map((c) => ({
      ...c,
      vehiculos_count: vehicleCounts.get(c.id) || 0,
      ordenes_count: orderCounts.get(c.id) || 0,
    })) as Customer[];
  },

  getCustomerDetail: async (customerId: string) => {
    const [{ data: customer, error }, { data: vehicles }, { data: orders }] = await Promise.all([
      supabase.from('clientes').select('*').eq('id', customerId).single(),
      supabase.from('vehiculos').select('*').eq('cliente_id', customerId),
      // `montos` es solo admin (RLS): para un técnico llega en null.
      supabase
        .from('ordenes_trabajo')
        .select('*, montos:orden_montos(total_general)')
        .eq('cliente_id', customerId)
        .order('creado_en', { ascending: false }),
    ]);
    if (error) throw error;
    return {
      customer: customer as Customer,
      vehicles: (vehicles || []) as Vehicle[],
      orders: (orders || []) as WorkOrder[],
    };
  },

  createCustomer: async (input: CustomerInput) => {
    const { data, error } = await supabase.from('clientes').insert(input).select().single();
    if (error) throw error;
    return data as Customer;
  },

  updateCustomer: async (id: string, input: Partial<CustomerInput>) => {
    const { data, error } = await supabase.from('clientes').update(input).eq('id', id).select().single();
    if (error) throw error;
    return data as Customer;
  },

  // Admin-only, enforced by the `clientes_delete` RLS policy. Deleting a
  // customer cascades to their vehicles, so a technician must never reach it.
  deleteCustomer: async (id: string) => {
    const { data, error } = await supabase.from('clientes').delete().eq('id', id).select('id');
    if (error) throw error;
    assertDeleted(data, 'el cliente');
  },
};
