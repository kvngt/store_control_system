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

  /**
   * Un cliente con su flota y su historial completo.
   *
   * Las dos listas van con `fetchAll` por dos razones, y la segunda importa más que la
   * primera. Una: la API corta en 1.000 filas sin avisar, y un cliente de flota con años
   * de historial perdería órdenes en silencio justo en la pantalla donde se revisa lo que
   * se le ha cobrado. Dos: `{ data: orders }` descartaba el `error`, así que una consulta
   * caída se volvía `[]` y la pantalla decía "este cliente no tiene órdenes" — un dato
   * falso en lugar de un error. `fetchAll` lanza.
   */
  getCustomerDetail: async (customerId: string) => {
    const [{ data: customer, error }, vehicles, orders] = await Promise.all([
      supabase.from('clientes').select('*').eq('id', customerId).single(),
      fetchAll<Vehicle>((from, to) =>
        supabase
          .from('vehiculos')
          .select('*')
          .eq('cliente_id', customerId)
          .order('creado_en', { ascending: false })
          .order('id')
          .range(from, to)
      ),
      // `montos` es solo admin (RLS): para un técnico llega en null.
      fetchAll<WorkOrder>((from, to) =>
        supabase
          .from('ordenes_trabajo')
          .select('*, montos:orden_montos(total_general)')
          .eq('cliente_id', customerId)
          .order('creado_en', { ascending: false })
          .order('id')
          .range(from, to)
      ),
    ]);
    if (error) throw error;
    return { customer: customer as Customer, vehicles, orders };
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
