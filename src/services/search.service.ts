// The header's global search box.
import { supabase } from '../lib/supabase';
import type { OrderStatus } from '../types/database';

export const searchService = {
  globalSearch: async (query: string, sedeId?: string) => {
    const q = query.trim();
    if (q.length < 2) return { customers: [], vehicles: [], orders: [] };
    // `,` and `(`/`)` are structural in PostgREST's .or() filter syntax (clause
    // separator and grouping) — strip them so typed search text can't break out
    // of the intended ilike clause into an unrelated column/operator.
    const safeQ = q.replace(/[,()]/g, '');

    let customerQuery = supabase
      .from('clientes')
      .select('id, nombre, telefono')
      .or(`nombre.ilike.%${safeQ}%,telefono.ilike.%${safeQ}%`)
      .limit(5);
    if (sedeId) customerQuery = customerQuery.eq('sede_id', sedeId);

    let vehicleQuery = supabase
      .from('vehiculos')
      .select('id, marca, modelo, placa, vin, cliente:clientes(nombre)')
      .or(`placa.ilike.%${safeQ}%,vin.ilike.%${safeQ}%,marca.ilike.%${safeQ}%,modelo.ilike.%${safeQ}%`)
      .limit(5);
    if (sedeId) vehicleQuery = vehicleQuery.eq('sede_id', sedeId);

    let orderQuery = supabase
      .from('ordenes_trabajo')
      .select('id, numero_orden, estatus, cliente:clientes(nombre)')
      .ilike('numero_orden', `%${safeQ}%`)
      .limit(5);
    if (sedeId) orderQuery = orderQuery.eq('sede_id', sedeId);

    const [{ data: customers }, { data: vehicles }, { data: orders }] = await Promise.all([
      customerQuery,
      vehicleQuery,
      orderQuery,
    ]);

    return {
      customers: (customers || []) as { id: string; nombre: string; telefono: string }[],
      vehicles: (vehicles || []) as unknown as { id: string; marca: string; modelo: string; placa: string; vin: string; cliente?: { nombre: string } }[],
      orders: (orders || []) as unknown as { id: string; numero_orden: string; estatus: OrderStatus; cliente?: { nombre: string } }[],
    };
  },
};
