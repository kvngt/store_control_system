import { supabase } from '../../lib/supabase';
import type {
  LaborItem,
  OrderJob,
  PartOrderState,
  Specialty,
  WorkOrderPart,
} from '../../types/database';
import { assertAffected, assertDeleted } from '../support';

export const orderLines = {
  // Por RPC y no con un UPDATE: `orden_labor` es escritura solo de admin, y así sigue.
  // La función comprueba por dentro la asignación y toca dos columnas, nada más.
  setLaborCompleted: async (laborId: string, completado: boolean) => {
    const { error } = await supabase.rpc('marcar_labor_completada', {
      p_labor_id: laborId,
      p_completado: completado,
    });
    if (error) throw error;
  },

  // ===== Labor / Parts on an existing order =====
  // Totals are recomputed by database triggers whenever these rows change:
  // `total_labor` on the order, `total_repuestos` / `total_general` on
  // `orden_montos`. All writers below are admin-only by RLS.
  //
  // Una tarea nueva lleva su técnico (`asignado_a`, o nulo = sin técnico: nadie cobra) y
  // `reparto_heredado: false` siempre: el reparto por especialidad es solo de las líneas de
  // antes de la comisión por tarea (20261010000006). La columna nace con default true para la
  // app que estaba publicada; esta lo manda explícito en cada alta.
  addLaborItem: async (
    orderId: string,
    item: { descripcion: string; costo: number; especialidad?: Specialty; asignado_a?: string | null; horas?: number | null }
  ) => {
    const { data, error } = await supabase
      .from('orden_labor')
      .insert({
        ...item,
        asignado_a: item.asignado_a ?? null,
        reparto_heredado: false,
        orden_id: orderId,
      })
      .select()
      .single();
    if (error) throw error;
    return data as LaborItem;
  },

  /**
   * El técnico de una tarea (solo administración). Cambiar solo el técnico no toca lo cotizado:
   * una línea pendiente sigue pendiente y una rechazada sigue rechazada. Asignar técnico a una
   * línea heredada la saca del reparto por especialidad para siempre (`reparto_heredado:
   * false`); quitarle el técnico después la deja sin técnico, no de vuelta en el reparto.
   * La base rechaza (42501, con la frase para el taller) si su comisión ya se pagó o si el
   * técnico no es mecánico o pintor de la sede de la orden.
   */
  setLaborTechnician: async (id: string, asignadoA: string | null) => {
    const patch: { asignado_a: string | null; reparto_heredado?: boolean } = { asignado_a: asignadoA };
    if (asignadoA) patch.reparto_heredado = false;
    const { data, error } = await supabase.from('orden_labor').update(patch).eq('id', id).select('id');
    if (error) throw error;
    assertAffected(data, 'la tarea');
  },

  /** A qué bolsa va una tarea. Igual que el técnico, no cambia el estado de la línea. */
  setLaborSpecialty: async (id: string, especialidad: Specialty) => {
    const { data, error } = await supabase.from('orden_labor').update({ especialidad }).eq('id', id).select('id');
    if (error) throw error;
    assertAffected(data, 'la tarea');
  },

  updateLaborItem: async (
    id: string,
    item: { descripcion: string; costo: number; especialidad?: Specialty; horas?: number | null }
  ) => {
    const { data, error } = await supabase
      .from('orden_labor')
      .update(item)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as LaborItem;
  },

  // Un DELETE que RLS no permite no da error: borra cero filas. Sin
  // `assertDeleted` la pantalla quitaba la línea y volvía a aparecer al recargar.
  removeLaborItem: async (id: string) => {
    const { data, error } = await supabase.from('orden_labor').delete().eq('id', id).select('id');
    if (error) throw error;
    assertDeleted(data, 'la línea de mano de obra');
  },

  // El costo (lo que pagó el taller) es por defecto el precio, y administración lo cambia
  // cuando lo sabe (decisión del taller, 05/10/2026). Al crear la línea se manda siempre: la
  // columna es NOT NULL, y depender del trigger hizo fallar el alta de repuestos en producción
  // cuando la base todavía no lo tenía ("falta completar un campo obligatorio").
  addPart: async (
    orderId: string,
    item: { descripcion: string; cantidad: number; precio_venta_unitario: number; costo_unitario?: number | null }
  ) => {
    const { data, error } = await supabase
      .from('orden_repuestos')
      .insert({
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precio_venta_unitario: item.precio_venta_unitario,
        orden_id: orderId,
        costo_unitario: item.costo_unitario ?? item.precio_venta_unitario,
        subtotal: item.cantidad * item.precio_venta_unitario,
      })
      .select()
      .single();
    if (error) throw error;
    return data as WorkOrderPart;
  },

  // Al editar, el costo viaja solo si administración lo escribió: sin él, la base lo deja como
  // estaba o, si seguía al precio, lo mueve con el precio (`trg_part_cost_follows_price`).
  // Mandarlo siempre igual al precio borraba el costo real en cada corrección del precio.
  updatePart: async (
    id: string,
    item: { descripcion: string; cantidad: number; precio_venta_unitario: number; costo_unitario?: number | null }
  ) => {
    const updates: Record<string, unknown> = {
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      precio_venta_unitario: item.precio_venta_unitario,
      subtotal: item.cantidad * item.precio_venta_unitario,
    };
    if (item.costo_unitario != null) updates.costo_unitario = item.costo_unitario;
    const { data, error } = await supabase
      .from('orden_repuestos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as WorkOrderPart;
  },

  /** Pedido → llegó (o nulo: no se sigue). Al llegar, la base avisa a los técnicos de la orden. */
  setPartOrderState: async (id: string, estado: PartOrderState | null) => {
    const { data, error } = await supabase
      .from('orden_repuestos')
      .update({ estado_pedido: estado })
      .eq('id', id)
      .select('id');
    if (error) throw error;
    assertAffected(data, 'el repuesto');
  },

  removePart: async (id: string) => {
    const { data, error } = await supabase.from('orden_repuestos').delete().eq('id', id).select('id');
    if (error) throw error;
    assertDeleted(data, 'el repuesto');
  },

  /** Agrega un trabajo del catálogo frecuente con sus líneas a la orden (solo admin). */
  addJobFromCatalog: async (orderId: string, catalogId: string, asignadoA?: string | null): Promise<string> => {
    const { data, error } = await supabase.rpc('agregar_trabajo_del_catalogo', {
      p_orden_id: orderId,
      p_catalogo_id: catalogId,
      p_asignado_a: asignadoA ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  /** Quita un trabajo de la orden y todas sus líneas (solo admin). */
  removeJob: async (id: string): Promise<void> => {
    const { error } = await supabase.rpc('quitar_trabajo', {
      p_trabajo_id: id,
    });
    if (error) throw error;
  },

  /** Renombra un trabajo agrupado de la orden (solo admin). */
  renameJob: async (id: string, titulo: string): Promise<void> => {
    const { error } = await supabase.rpc('renombrar_trabajo', {
      p_trabajo_id: id,
      p_titulo: titulo.trim(),
    });
    if (error) throw error;
  },

  /** Obtiene la lista de trabajos agrupados de la orden con sus totales (solo admin). */
  getOrderJobs: async (orderId: string): Promise<OrderJob[]> => {
    const { data, error } = await supabase.rpc('trabajos_de_orden', {
      p_orden_id: orderId,
    });
    if (error) throw error;
    return (data ?? []) as OrderJob[];
  },
};
