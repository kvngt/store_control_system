// Vehicles. Always sede-scoped: a unit must never leak across workshops.
import { supabase } from '../lib/supabase';
import type { Customer, Vehicle, VehicleInput, WorkOrder } from '../types/database';
import { assertDeleted, fetchAll } from './support';

export const vehiclesService = {
  // Always scoped to a sede: vehicles must never leak across workshops, not
  // even for an admin (who simply switches sede to see the other one).
  getVehicles: async (sedeId?: string) => {
    const data = await fetchAll<Vehicle & { cliente?: { nombre: string } | null }>((from, to) => {
      let query = supabase
        .from('vehiculos')
        .select(`
          *,
          cliente:clientes(nombre)
        `)
        .order('creado_en', { ascending: false })
        .order('id');
      if (sedeId) query = query.eq('sede_id', sedeId);
      return query.range(from, to);
    });
    return data.map((v) => ({
      ...v,
      cliente_nombre: v.cliente?.nombre,
    })) as Vehicle[];
  },

  /**
   * Un vehículo con su dueño y todo lo que se le ha hecho.
   *
   * Es lo que sirve para responder "qué le hicimos la vez pasada". Las órdenes van con
   * `fetchAll`, no con un `select` suelto: un carro de flota puede pasar por el taller
   * muchas veces, y la API corta en 1.000 filas sin avisar. (`getCustomerDetail` sí lee sin
   * paginar; es deuda vieja y no vale copiarla.)
   */
  getVehicleDetail: async (vehicleId: string) => {
    const [{ data: vehicle, error }, orders] = await Promise.all([
      supabase.from('vehiculos').select('*, cliente:clientes(*)').eq('id', vehicleId).single(),
      fetchAll<WorkOrder>((from, to) =>
        supabase
          .from('ordenes_trabajo')
          // `montos` es solo admin (RLS): para un técnico llega en null.
          .select('*, montos:orden_montos(total_general)')
          .eq('vehiculo_id', vehicleId)
          .order('creado_en', { ascending: false })
          .order('id')
          .range(from, to)
      ),
    ]);
    if (error) throw error;
    const { cliente, ...rest } = vehicle as Vehicle & { cliente?: Customer | null };
    return {
      vehicle: { ...rest, cliente_nombre: cliente?.nombre } as Vehicle,
      customer: (cliente ?? null) as Customer | null,
      orders,
    };
  },

  getVehiclesByCustomer: async (customerId: string) => {
    const { data, error } = await supabase.from('vehiculos').select('*').eq('cliente_id', customerId);
    if (error) throw error;
    return data as Vehicle[];
  },

  // sede_id is filled in by the trg_vehiculo_sede trigger from the customer.
  createVehicle: async (input: VehicleInput) => {
    const { data, error } = await supabase.from('vehiculos').insert(input).select().single();
    if (error) throw error;
    return data as Vehicle;
  },

  updateVehicle: async (id: string, input: Partial<VehicleInput>) => {
    const { data, error } = await supabase.from('vehiculos').update(input).eq('id', id).select().single();
    if (error) throw error;
    return data as Vehicle;
  },

  // Admin-only, enforced by the `vehiculos_delete` RLS policy.
  deleteVehicle: async (id: string) => {
    const { data, error } = await supabase.from('vehiculos').delete().eq('id', id).select('id');
    if (error) throw error;
    assertDeleted(data, 'el vehículo');
  },
};
