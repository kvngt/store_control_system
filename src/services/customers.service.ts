// Customers and their CRM profile.
import { supabase } from '../lib/supabase';
import type { Customer, CustomerInput, Vehicle, WorkOrder } from '../types/database';
import { assertDeleted, fetchAll } from './support';

/** Un cliente tal como llega con sus conteos embebidos (`vehiculos(count)`). */
type CustomerRow = Customer & {
  vehiculos?: { count: number }[];
  ordenes_trabajo?: { count: number }[];
};

export const customersService = {
  getCustomers: async (sedeId?: string) => {
    // Los conteos los hace la base en la misma consulta (`vehiculos(count)`). Antes eran
    // dos consultas más con `.in('cliente_id', [...todos los ids])`: con unos cientos de
    // clientes la URL pasaba el límite del servidor y la lista fallaba, y con más de
    // 1.000 vehículos u órdenes los conteos salían cortos.
    const rows = await fetchAll<CustomerRow>((from, to) => {
      let query = supabase
        .from('clientes')
        .select('*, vehiculos(count), ordenes_trabajo(count)')
        .order('creado_en', { ascending: false })
        .order('id');
      if (sedeId) query = query.eq('sede_id', sedeId);
      return query.range(from, to);
    });

    return rows.map(({ vehiculos, ordenes_trabajo, ...c }) => ({
      ...c,
      vehiculos_count: vehiculos?.[0]?.count ?? 0,
      ordenes_count: ordenes_trabajo?.[0]?.count ?? 0,
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
