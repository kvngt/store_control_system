// Vehicles. Always sede-scoped: a unit must never leak across workshops.
import { supabase } from '../lib/supabase';
import type { Vehicle, VehicleInput } from '../types/database';
import { assertDeleted } from './support';

export const vehiclesService = {
  // Always scoped to a sede: vehicles must never leak across workshops, not
  // even for an admin (who simply switches sede to see the other one).
  getVehicles: async (sedeId?: string) => {
    let query = supabase.from('vehiculos').select(`
      *,
      cliente:clientes(nombre)
    `);
    if (sedeId) query = query.eq('sede_id', sedeId);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((v) => ({
      ...v,
      cliente_nombre: v.cliente?.nombre,
    })) as Vehicle[];
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
