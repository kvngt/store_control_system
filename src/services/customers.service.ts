// Customers and their CRM profile.
import { supabase } from '../lib/supabase';
import type { Customer, CustomerInput, Vehicle, WorkOrder } from '../types/database';
import { assertDeleted } from './support';

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

    // Optimization: Pre-calculate counts using a hash map to reduce complexity
    // from O(N*M) nested filtering to O(N+M), significantly improving
    // customer list render times for shops with many records.
    const vehiclesCount = (vehiculos || []).reduce((acc: Record<string, number>, v) => {
      acc[v.cliente_id] = (acc[v.cliente_id] || 0) + 1;
      return acc;
    }, {});

    const ordersCount = (ordenes || []).reduce((acc: Record<string, number>, o) => {
      acc[o.cliente_id] = (acc[o.cliente_id] || 0) + 1;
      return acc;
    }, {});

    return (clientes || []).map((c) => ({
      ...c,
      vehiculos_count: vehiclesCount[c.id] || 0,
      ordenes_count: ordersCount[c.id] || 0,
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
