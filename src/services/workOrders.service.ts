// Work orders and everything that hangs off one: labor, parts, assignments,
// progress log, 360-degree intake photos and the customer signature.
import { supabase } from '../lib/supabase';
import type {
  LaborItem,
  OrderMedia,
  OrderProgressUpdate,
  OrderStatus,
  PartSummary,
  WorkOrder,
  WorkOrderInput,
  WorkOrderPart,
} from '../types/database';
import { mediaPath } from '../lib/media/mime';
import { assertAffected, assertDeleted, fetchAll } from './support';
import { daysFromTodayLocal } from '../lib/dates';

/** Desde cuándo una orden entregada deja el tablero y pasa al archivo. */
const ARCHIVE_DAYS = 90;
import { mediaService } from './media.service';
import { quotesService } from './quotes.service';

export const workOrdersService = {
  // El tablero deja de arrastrar el histórico: una orden entregada hace tres años
  // competía con las activas en la lista, en el Kanban y en el buscador, y venía con su
  // cliente, su vehículo y sus asignaciones embebidos. Las entregadas de más de 90 días se
  // piden aparte, en `getArchivedWorkOrders`.
  //
  // El `fecha_finalizacion.is.null` del `or` no es decorativo: una orden 'entregado' sin
  // fecha existe (el trigger de progreso no la escribe, solo lo hace el servicio), y sin esa
  // cláusula desaparecería de las dos listas.
  getWorkOrders: async (sedeId?: string) => {
    const corte = daysFromTodayLocal(-ARCHIVE_DAYS);
    // `montos` llega en null para mecánicos y pintores: `orden_montos` es solo
    // admin por RLS, y PostgREST resuelve un embed bloqueado como vacío en vez de
    // fallar. Una sola consulta sirve a los dos roles.
    const page = (from: number, to: number) => {
      let query = supabase.from('ordenes_trabajo').select(`
        *,
        montos:orden_montos(total_repuestos, total_general, deposito_inicial),
        cliente:clientes(*),
        vehiculo:vehiculos(*),
        asignaciones:orden_asignaciones(*, usuario:perfiles(*))
      `).order('creado_en', { ascending: false }).order('id');
      if (sedeId) query = query.eq('sede_id', sedeId);
      query = query.or(
        `estatus.neq.entregado,fecha_finalizacion.is.null,fecha_finalizacion.gte.${corte}`
      );
      return query.range(from, to);
    };

    // Qué órdenes esperan la respuesta del cliente a un presupuesto. Tolerante: si
    // falla, la lista se ve igual, sin la marca.
    const [data, waiting] = await Promise.all([
      fetchAll<WorkOrder>(page),
      quotesService.waitingOrderIds().catch(() => new Set<string>()),
    ]);
    return data.map((order) => ({ ...order, esperando_autorizacion: waiting.has(order.id) }));
  },

  /**
   * Las órdenes archivadas: entregadas hace más de 90 días.
   *
   * Con `limit` y "cargar más" en vez de `fetchAll`, y buscando **en el servidor**: es la
   * lista que crece sin fin, y traérsela entera sería recrear al otro lado del filtro el
   * problema que este filtro resuelve. Embeds mínimos por lo mismo.
   */
  getArchivedWorkOrders: async (
    sedeId: string | undefined,
    { search = '', limit = 25, offset = 0 }: { search?: string; limit?: number; offset?: number } = {}
  ) => {
    const corte = daysFromTodayLocal(-ARCHIVE_DAYS);
    let query = supabase
      .from('ordenes_trabajo')
      .select(`
        id, numero_orden, estatus, tipo_trabajo, fecha_finalizacion, fecha_estimada_entrega,
        montos:orden_montos(total_general),
        cliente:clientes(nombre),
        vehiculo:vehiculos(marca, modelo, anio, placa)
      `)
      .eq('estatus', 'entregado')
      .lt('fecha_finalizacion', corte)
      .order('fecha_finalizacion', { ascending: false })
      .order('id');
    if (sedeId) query = query.eq('sede_id', sedeId);
    const termino = search.trim();
    if (termino) {
      // En el servidor: el archivo no está en memoria, así que filtrarlo en el cliente
      // solo buscaría dentro de la página que se pidió.
      query = query.or(`numero_orden.ilike.%${termino}%,clientes.nombre.ilike.%${termino}%`);
    }
    const { data, error } = await query.range(offset, offset + limit - 1);
    if (error) throw error;
    return (data || []) as unknown as WorkOrder[];
  },

  getWorkOrderDetail: async (orderId: string) => {
    // `montos` y `repuestos` vienen vacíos para un técnico (RLS solo admin);
    // `repuestos_resumen` es lo que él sí puede ver: qué piezas, sin precio.
    const [{ data, error }, { data: resumen }, media] = await Promise.all([
      supabase.from('ordenes_trabajo').select(`
        *,
        montos:orden_montos(total_repuestos, total_general, deposito_inicial),
        cliente:clientes(*),
        vehiculo:vehiculos(*),
        labor_items:orden_labor(*),
        repuestos:orden_repuestos(*),
        asignaciones:orden_asignaciones(*, usuario:perfiles(*))
      `)
        .eq('id', orderId)
        // Las líneas en el orden en que se agregaron: es el orden del presupuesto.
        .order('creado_en', { referencedTable: 'orden_labor', ascending: true })
        .order('creado_en', { referencedTable: 'orden_repuestos', ascending: true })
        .single(),
      supabase.rpc('repuestos_de_orden', { p_orden_id: orderId }),
      // Fotos, videos y notas de voz de la recepción y de cada avance. Tolerante
      // como los avances: una falla aquí no debe impedir abrir la orden.
      mediaService.listOrderMedia(orderId).catch(() => [] as OrderMedia[]),
    ]);
    if (error) throw error;

    // Progress updates are fetched separately and tolerantly: if the
    // orden_avances migration hasn't been applied to this environment yet,
    // the order detail must still load instead of erroring out entirely.
    const { data: avances } = await supabase
      .from('orden_avances')
      .select('*, usuario:perfiles(*)')
      .eq('orden_id', orderId)
      .order('creado_en', { ascending: false });

    return {
      ...data,
      avances: (avances || []) as OrderProgressUpdate[],
      repuestos_resumen: (resumen || []) as PartSummary[],
      media,
    } as WorkOrder;
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

    // Una transacción del lado de la base: la orden y su labor, repuestos y
    // asignaciones entran juntas o no entra nada (ver 20260911000000).
    //
    // Ya no hay camino alternativo sin RPC. Aquel fallback insertaba los montos
    // directamente en `ordenes_trabajo`, que desde 20260918000000 no los tiene,
    // y la función también decide qué puede registrar quien llama: un técnico
    // crea la recepción y queda asignado, pero depósito, labor y repuestos solo
    // los toma de un administrador.
    const { data, error } = await supabase.rpc('create_work_order', {
      p_order: orderPayload,
      p_labor: input.labor_items,
      p_parts: input.repuestos.map((p) => ({ ...p, costo_unitario: p.precio_venta_unitario })),
      p_assignments: input.asignaciones,
    });
    if (error) throw error;
    return data as WorkOrder;
  },

  // `motivo` solo viaja hacia "espera de autorización", que es el único estado que lo
  // exige (la base responde 42501 sin él). Al salir de ese estado no hay que mandar nada:
  // el trigger limpia el motivo, porque dejarlo puesto mostraría un banner que ya no es
  // cierto.
  updateWorkOrderStatus: async (orderId: string, estatus: OrderStatus, motivo?: string) => {
    const isClosed = estatus === 'finalizado' || estatus === 'entregado';
    const updates: Record<string, unknown> = isClosed
      ? { estatus, fecha_finalizacion: new Date().toISOString(), porcentaje_avance: 100 }
      : { estatus, fecha_finalizacion: null };
    if (estatus === 'espera_autorizacion') updates.motivo_autorizacion = motivo ?? null;

    const { error } = await supabase.from('ordenes_trabajo').update(updates).eq('id', orderId);
    if (error) throw error;
  },

  // Por RPC y no con un UPDATE: `orden_labor` es escritura solo de admin, y así sigue.
  // La función comprueba por dentro la asignación y toca dos columnas, nada más.
  // El texto y la visibilidad viajan juntos porque el diálogo deja corregir la nota antes
  // de publicarla: es el mismo campo que lee el taller.
  //
  // Una política que no deja pasar la fila devuelve 0 filas SIN error, así que se pide la
  // fila de vuelta para no reportar un éxito que no ocurrió.
  setProgressVisibility: async (id: string, visible: boolean, descripcion?: string) => {
    const updates: Record<string, unknown> = { visible_cliente: visible };
    if (descripcion !== undefined) updates.descripcion = descripcion;
    const { data, error } = await supabase.from('orden_avances').update(updates).eq('id', id).select('id');
    if (error) throw error;
    assertAffected(data, 'el avance');
  },

  setLaborCompleted: async (laborId: string, completado: boolean) => {
    const { error } = await supabase.rpc('marcar_labor_completada', {
      p_labor_id: laborId,
      p_completado: completado,
    });
    if (error) throw error;
  },

  updateWorkOrderProgress: async (orderId: string, porcentaje: number) => {
    const { error } = await supabase.from('ordenes_trabajo').update({ porcentaje_avance: porcentaje }).eq('id', orderId);
    if (error) throw error;
  },

  deleteWorkOrder: async (orderId: string) => {
    // Los movimientos automáticos de Finanzas (depósito, pago final, costo de
    // repuestos) los borra el trigger `cleanup_order_finance` en la misma
    // transacción que la orden. Antes este cliente los borraba primero, en otra
    // petición: si después el borrado de la orden fallaba (sin red, o la base lo
    // rechazaba por tener comisiones pagadas), la orden seguía ahí sin su dinero.
    //
    // Las filas de `orden_media` se van en cascada con la orden, pero la base no
    // puede borrar objetos de Storage: sin esto, cada orden borrada dejaría sus
    // videos ocupando la cuota del plan para siempre. Se leen antes de borrar la
    // orden, porque después ya no hay filas que digan qué archivos eran.
    const [media, { data: firma }] = await Promise.all([
      mediaService.listOrderMedia(orderId).catch(() => [] as OrderMedia[]),
      supabase.from('ordenes_trabajo').select('firma_ruta').eq('id', orderId).maybeSingle(),
    ]);

    // Admin-only, enforced by the `ordenes_trabajo_delete` RLS policy.
    const { data, error } = await supabase
      .from('ordenes_trabajo')
      .delete()
      .eq('id', orderId)
      .select('id');
    if (error) throw error;
    assertDeleted(data, 'la orden');

    // Mejor esfuerzo: la orden ya no existe, y un archivo que no se pudo borrar
    // no es motivo para decirle al admin que el borrado falló.
    await mediaService
      .removeStoragePaths([
        ...media.flatMap((m) => [m.ruta, m.ruta_miniatura]),
        (firma as { firma_ruta?: string | null } | null)?.firma_ruta,
      ])
      .catch(() => {});
  },

  // ===== Labor / Parts / Assignments on an existing order =====
  // Totals are recomputed by database triggers whenever these rows change:
  // `total_labor` on the order, `total_repuestos` / `total_general` on
  // `orden_montos`. All four writers below are admin-only by RLS.
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

  // Un DELETE que RLS no permite no da error: borra cero filas. Sin
  // `assertDeleted` la pantalla quitaba la línea y volvía a aparecer al recargar.
  removeLaborItem: async (id: string) => {
    const { data, error } = await supabase.from('orden_labor').delete().eq('id', id).select('id');
    if (error) throw error;
    assertDeleted(data, 'la línea de mano de obra');
  },

  // Only the sale price is captured in the UI. `costo_unitario` is still
  // written explicitly here rather than left to the database, and that is
  // deliberate: the column is NOT NULL, and omitting it makes the insert depend
  // on a DEFAULT and a trigger both being present on whichever environment this
  // is talking to. Adding a part to an existing order broke in production for
  // exactly that reason — the write reached a database where the pass-through
  // trigger had not been applied yet, and came back as "falta completar un
  // campo obligatorio", which reads to the user as a broken form.
  //
  // A part is billed on at what it cost the shop, so cost and price carry the
  // same number. The trg_part_cost_passthrough trigger enforces that rule for
  // every other writer; sending it here too costs nothing and makes this path
  // work with or without the migration.
  addPart: async (orderId: string, item: { descripcion: string; cantidad: number; precio_venta_unitario: number }) => {
    const { data, error } = await supabase
      .from('orden_repuestos')
      .insert({
        ...item,
        orden_id: orderId,
        costo_unitario: item.precio_venta_unitario,
        subtotal: item.cantidad * item.precio_venta_unitario,
      })
      .select()
      .single();
    if (error) throw error;
    return data as WorkOrderPart;
  },

  updatePart: async (id: string, item: { descripcion: string; cantidad: number; precio_venta_unitario: number }) => {
    const { data, error } = await supabase
      .from('orden_repuestos')
      .update({
        ...item,
        costo_unitario: item.precio_venta_unitario,
        subtotal: item.cantidad * item.precio_venta_unitario,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as WorkOrderPart;
  },

  removePart: async (id: string) => {
    const { data, error } = await supabase.from('orden_repuestos').delete().eq('id', id).select('id');
    if (error) throw error;
    assertDeleted(data, 'el repuesto');
  },

  addAssignment: async (orderId: string, usuarioId: string, tipoTarea: 'mecanica' | 'pintura') => {
    const { error } = await supabase
      .from('orden_asignaciones')
      .insert({ orden_id: orderId, usuario_id: usuarioId, tipo_tarea: tipoTarea, estatus_tarea: 'pendiente' });
    if (error) throw error;
  },

  removeAssignment: async (id: string) => {
    const { data, error } = await supabase.from('orden_asignaciones').delete().eq('id', id).select('id');
    if (error) throw error;
    assertDeleted(data, 'la asignación');
  },

  updateAssignmentStatus: async (id: string, estatus: 'pendiente' | 'en_curso' | 'completada') => {
    const { error } = await supabase.from('orden_asignaciones').update({ estatus_tarea: estatus }).eq('id', id);
    if (error) throw error;
  },

  // ===== Progress updates ("Agregar Avance") =====
  // Una nota del técnico. Sus fotos, videos y notas de voz ya no viajan aquí:
  // entran a la cola de subida con el id de este avance y suben en segundo
  // plano (ver `MediaUploadQueue`), así que crear el avance es instantáneo aunque
  // lleve un video de 25 MB.
  addProgressUpdate: async (orderId: string, usuarioId: string, descripcion: string) => {
    const { data, error } = await supabase
      .from('orden_avances')
      .insert({ orden_id: orderId, usuario_id: usuarioId, descripcion })
      .select('*, usuario:perfiles(*)')
      .single();
    if (error) throw error;
    return data as OrderProgressUpdate;
  },

  /** Borra el avance y, después, los archivos que colgaban de él. */
  removeProgressUpdate: async (id: string, media: Pick<OrderMedia, 'ruta' | 'ruta_miniatura'>[] = []) => {
    const { data, error } = await supabase.from('orden_avances').delete().eq('id', id).select('id');
    if (error) throw error;
    assertDeleted(data, 'el avance');
    await mediaService.removeStoragePaths(media.flatMap((m) => [m.ruta, m.ruta_miniatura])).catch(() => {});
  },

  // ===== Customer signature =====
  // La firma se dibuja en un canvas y llega como data URL PNG. Va al bucket
  // privado de la orden — junto a sus fotos — y la orden guarda la ruta, no una
  // URL pública: una firma no debería estar a una URL adivinable. Se lee con una
  // URL firmada, igual que el resto de la multimedia.
  uploadSignature: async (order: Pick<WorkOrder, 'id' | 'sede_id'>, dataUrl: string) => {
    const blob = await (await fetch(dataUrl)).blob();
    const path = mediaPath(order.sede_id, order.id, `firma-${Date.now()}.png`);
    await mediaService.uploadSmallFile(path, blob, 'image/png');

    const firmaFecha = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('ordenes_trabajo')
      .update({ firma_ruta: path, firma_fecha: firmaFecha })
      .eq('id', order.id);
    if (updateError) throw updateError;

    return { ruta: path, fecha: firmaFecha };
  },

};
