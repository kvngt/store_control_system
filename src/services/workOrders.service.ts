// Work orders and everything that hangs off one: labor, parts, assignments,
// progress log, 360-degree intake photos and the customer signature.
import { supabase } from '../lib/supabase';
import type {
  LaborItem,
  OrderProgressUpdate,
  OrderStatus,
  WorkOrder,
  WorkOrderInput,
  WorkOrderPart,
} from '../types/database';
import { assertDeleted } from './support';
import { storageService } from './storage.service';

// Fallback for environments where the `create_work_order` function has not
// been applied yet. PostgREST gives no transaction across these four inserts,
// so a failure on any child row is compensated by deleting the order it
// belongs to before the error is re-thrown — otherwise a failed create leaves
// a half-built order on the board that nobody knows about. The row's own
// children cascade with it.
async function createWorkOrderWithoutRpc(
  input: WorkOrderInput & { creado_por: string },
  orderPayload: Record<string, unknown>
): Promise<WorkOrder> {
  const totalLabor = input.labor_items.reduce((sum, l) => sum + l.costo, 0);
  const totalParts = input.repuestos.reduce((sum, p) => sum + p.cantidad * p.precio_venta_unitario, 0);

  const { data: order, error } = await supabase
    .from('ordenes_trabajo')
    .insert({
      ...orderPayload,
      estatus: 'recepcion',
      porcentaje_avance: 0,
      total_labor: totalLabor,
      total_repuestos: totalParts,
      total_general: totalLabor + totalParts,
    })
    .select()
    .single();
  if (error) throw error;

  try {
    if (input.labor_items.length) {
      const { error: laborError } = await supabase
        .from('orden_labor')
        .insert(input.labor_items.map((l) => ({ ...l, orden_id: order.id })));
      if (laborError) throw laborError;
    }

    if (input.repuestos.length) {
      const { error: partsError } = await supabase
        .from('orden_repuestos')
        .insert(input.repuestos.map((p) => ({
          ...p,
          orden_id: order.id,
          costo_unitario: p.costo_unitario ?? 0,
          subtotal: p.cantidad * p.precio_venta_unitario,
        })));
      if (partsError) throw partsError;
    }

    if (input.asignaciones.length) {
      const { error: assignError } = await supabase
        .from('orden_asignaciones')
        .insert(input.asignaciones.map((a) => ({
          ...a,
          orden_id: order.id,
          estatus_tarea: 'pendiente',
        })));
      if (assignError) throw assignError;
    }
  } catch (childError) {
    // Best-effort: if the rollback itself fails (offline, RLS) the original
    // error is still what the user needs to see, so it's the one re-thrown.
    await supabase.from('ordenes_trabajo').delete().eq('id', order.id);
    throw childError;
  }

  return order as WorkOrder;
}

export const workOrdersService = {
  getWorkOrders: async (sedeId?: string) => {
    let query = supabase.from('ordenes_trabajo').select(`
      *,
      cliente:clientes(*),
      vehiculo:vehiculos(*),
      asignaciones:orden_asignaciones(*, usuario:perfiles(*))
    `).order('creado_en', { ascending: false });
    if (sedeId) query = query.eq('sede_id', sedeId);

    const { data, error } = await query;
    if (error) throw error;
    return data as WorkOrder[];
  },

  getWorkOrderDetail: async (orderId: string) => {
    const { data, error } = await supabase.from('ordenes_trabajo').select(`
      *,
      cliente:clientes(*),
      vehiculo:vehiculos(*),
      labor_items:orden_labor(*),
      repuestos:orden_repuestos(*),
      asignaciones:orden_asignaciones(*, usuario:perfiles(*))
    `).eq('id', orderId).single();
    if (error) throw error;

    // Progress updates are fetched separately and tolerantly: if the
    // orden_avances migration hasn't been applied to this environment yet,
    // the order detail must still load instead of erroring out entirely.
    const { data: avances } = await supabase
      .from('orden_avances')
      .select('*, usuario:perfiles(*)')
      .eq('orden_id', orderId)
      .order('creado_en', { ascending: false });

    return { ...data, avances: (avances || []) as OrderProgressUpdate[] } as WorkOrder;
  },

  createWorkOrder: async (input: WorkOrderInput & { creado_por: string }) => {
    // numero_orden is generated atomically by a DB trigger (trg_numero_orden) to
    // avoid duplicate order numbers when two orders are created concurrently.
    const orderPayload = {
      sede_id: input.sede_id,
      cliente_id: input.cliente_id,
      vehiculo_id: input.vehiculo_id,
      tipo_trabajo: input.tipo_trabajo,
      millas_ingreso: input.millas_ingreso,
      nivel_gasolina: input.nivel_gasolina,
      deposito_inicial: input.deposito_inicial,
      inspeccion_360_notas: input.inspeccion_360_notas,
      fecha_estimada_entrega: input.fecha_estimada_entrega,
      creado_por: input.creado_por,
    };

    // One transaction on the database side: the order and its labor, parts and
    // assignments either all land or none do. See the
    // 20260911000000_create_work_order_rpc migration for why.
    const { data, error } = await supabase.rpc('create_work_order', {
      p_order: orderPayload,
      p_labor: input.labor_items,
      p_parts: input.repuestos.map((p) => ({ ...p, costo_unitario: p.costo_unitario ?? 0 })),
      p_assignments: input.asignaciones,
    });

    if (!error) return data as WorkOrder;

    // An environment that hasn't had the migration applied yet reports the
    // function as missing (PGRST202 from PostgREST's schema cache, 42883 from
    // Postgres). Anything else is a real failure — a violated constraint, an
    // RLS refusal — and has to reach the user unchanged.
    const code = (error as { code?: string }).code;
    if (code !== 'PGRST202' && code !== '42883') throw error;

    return createWorkOrderWithoutRpc(input, orderPayload);
  },

  updateWorkOrderStatus: async (orderId: string, estatus: OrderStatus) => {
    const updates: Record<string, unknown> = { estatus };
    if (estatus === 'finalizado' || estatus === 'entregado') {
      updates.fecha_finalizacion = new Date().toISOString();
      updates.porcentaje_avance = 100;
    }
    const { error } = await supabase.from('ordenes_trabajo').update(updates).eq('id', orderId);
    if (error) throw error;
  },

  updateWorkOrderProgress: async (orderId: string, porcentaje: number) => {
    const { error } = await supabase.from('ordenes_trabajo').update({ porcentaje_avance: porcentaje }).eq('id', orderId);
    if (error) throw error;
  },

  deleteWorkOrder: async (orderId: string) => {
    // Remove the automatic finanzas_movimientos entries (deposit, final
    // payment) the order-lifecycle triggers created for this order first —
    // otherwise deleting the order just orphans them (referencia_orden_id
    // set to null) instead of keeping the books consistent.
    const { error: finanzasError } = await supabase
      .from('finanzas_movimientos')
      .delete()
      .eq('referencia_orden_id', orderId);
    if (finanzasError) throw finanzasError;

    // Admin-only, enforced by the `ordenes_trabajo_delete` RLS policy.
    const { data, error } = await supabase
      .from('ordenes_trabajo')
      .delete()
      .eq('id', orderId)
      .select('id');
    if (error) throw error;
    assertDeleted(data, 'la orden');
  },

  // ===== Labor / Parts / Assignments on an existing order =====
  // Totals (total_labor / total_repuestos / total_general) are recomputed
  // automatically by database triggers whenever these rows change.
  addLaborItem: async (orderId: string, item: { descripcion: string; costo: number }) => {
    const { data, error } = await supabase
      .from('orden_labor')
      .insert({ ...item, orden_id: orderId })
      .select()
      .single();
    if (error) throw error;
    return data as LaborItem;
  },

  updateLaborItem: async (id: string, item: { descripcion: string; costo: number }) => {
    const { data, error } = await supabase
      .from('orden_labor')
      .update(item)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as LaborItem;
  },

  removeLaborItem: async (id: string) => {
    const { error } = await supabase.from('orden_labor').delete().eq('id', id);
    if (error) throw error;
  },

  // costo_unitario is optional: the shop only captures the sale price, so it
  // defaults to 0 (the column is NOT NULL and also carries a DB default).
  addPart: async (orderId: string, item: { descripcion: string; cantidad: number; costo_unitario?: number; precio_venta_unitario: number }) => {
    const { data, error } = await supabase
      .from('orden_repuestos')
      .insert({
        ...item,
        orden_id: orderId,
        costo_unitario: item.costo_unitario ?? 0,
        subtotal: item.cantidad * item.precio_venta_unitario,
      })
      .select()
      .single();
    if (error) throw error;
    return data as WorkOrderPart;
  },

  updatePart: async (id: string, item: { descripcion: string; cantidad: number; costo_unitario?: number; precio_venta_unitario: number }) => {
    const { data, error } = await supabase
      .from('orden_repuestos')
      .update({ ...item, subtotal: item.cantidad * item.precio_venta_unitario })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as WorkOrderPart;
  },

  removePart: async (id: string) => {
    const { error } = await supabase.from('orden_repuestos').delete().eq('id', id);
    if (error) throw error;
  },

  addAssignment: async (orderId: string, usuarioId: string, tipoTarea: 'mecanica' | 'pintura') => {
    const { error } = await supabase
      .from('orden_asignaciones')
      .insert({ orden_id: orderId, usuario_id: usuarioId, tipo_tarea: tipoTarea, estatus_tarea: 'pendiente' });
    if (error) throw error;
  },

  removeAssignment: async (id: string) => {
    const { error } = await supabase.from('orden_asignaciones').delete().eq('id', id);
    if (error) throw error;
  },

  updateAssignmentStatus: async (id: string, estatus: 'pendiente' | 'en_curso' | 'completada') => {
    const { error } = await supabase.from('orden_asignaciones').update({ estatus_tarea: estatus }).eq('id', id);
    if (error) throw error;
  },

  // ===== Progress updates ("Agregar Avance") =====
  // Lets the assigned mechanic/painter document progress over time with a
  // note and optional photos, separate from the one-time 360° intake photos.
  addProgressUpdate: async (orderId: string, usuarioId: string, descripcion: string, files: File[]) => {
    const fotos: string[] = [];
    for (const file of files) {
      const path = `${orderId}/avance-${Date.now()}-${file.name}`;
      const url = await storageService.uploadPhoto(file, path);
      fotos.push(url);
    }
    const { data, error } = await supabase
      .from('orden_avances')
      .insert({ orden_id: orderId, usuario_id: usuarioId, descripcion, fotos })
      .select('*, usuario:perfiles(*)')
      .single();
    if (error) throw error;
    return data as OrderProgressUpdate;
  },

  removeProgressUpdate: async (id: string) => {
    const { error } = await supabase.from('orden_avances').delete().eq('id', id);
    if (error) throw error;
  },

  uploadOrderPhotos: async (orderId: string, files: { zone: string; file: File }[]) => {
    const urls: string[] = [];
    for (const { zone, file } of files) {
      const path = `${orderId}/${zone}-${Date.now()}-${file.name}`;
      const url = await storageService.uploadPhoto(file, path);
      urls.push(url);
    }
    const { error } = await supabase
      .from('ordenes_trabajo')
      .update({ inspeccion_360_fotos: urls })
      .eq('id', orderId);
    if (error) throw error;
    return urls;
  },

  // ===== Customer signature =====
  // The signature is drawn on a canvas and arrives as a PNG data URL. It's
  // stored in the public `firmas` bucket and linked from the order so the PDF
  // can reprint it long after the tablet that captured it is gone.
  uploadSignature: async (orderId: string, dataUrl: string) => {
    const blob = await (await fetch(dataUrl)).blob();
    const path = `${orderId}/firma-${Date.now()}.png`;
    const { error } = await supabase.storage
      .from('firmas')
      .upload(path, blob, { contentType: 'image/png', upsert: true });
    if (error) throw error;

    const { data } = supabase.storage.from('firmas').getPublicUrl(path);
    const firmaFecha = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('ordenes_trabajo')
      .update({ firma_cliente_url: data.publicUrl, firma_fecha: firmaFecha })
      .eq('id', orderId);
    if (updateError) throw updateError;

    return { url: data.publicUrl, fecha: firmaFecha };
  },

  // Unlinks the signature so it can be re-captured. The stored file is left in
  // place on purpose: an order's signature history is worth keeping.
  clearSignature: async (orderId: string) => {
    const { error } = await supabase
      .from('ordenes_trabajo')
      .update({ firma_cliente_url: null, firma_fecha: null })
      .eq('id', orderId);
    if (error) throw error;
  },
};
