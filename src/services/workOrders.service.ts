// Work orders and everything that hangs off one: labor, parts, assignments,
// progress log, 360-degree intake photos and the customer signature.
import { supabase } from '../lib/supabase';
import type {
  LaborItem,
  MyTask,
  OrderBalance,
  OrderHistoryEntry,
  OrderMedia,
  OrderProgressUpdate,
  OrderStatus,
  PartSummary,
  PaymentMethod,
  Specialty,
  WorkOrder,
  WorkOrderInput,
  WorkOrderPart,
} from '../types/database';
import { mediaPath } from '../lib/media/mime';
import { assertAffected, assertDeleted, fetchAll } from './support';
import { daysFromTodayLocal } from '../lib/dates';

/** Desde cuándo una orden entregada deja el tablero y pasa al archivo. */
const ARCHIVE_DAYS = 90;

/**
 * Cuántos clientes se resuelven al buscar en el archivo. Sus ids viajan en la URL, que
 * tiene un largo máximo; buscar "a" no puede convertirse en una petición de 8 KB.
 */
const CLIENTES_EN_BUSQUEDA = 100;

import { mediaService } from './media.service';
import { quotesService } from './quotes.service';

/**
 * Las tablas de la orden que publica Realtime (20261010000002). Una hija nueva que otra
 * persona necesite ver al momento va aquí y en una migración que la agregue a la publicación.
 */
const ORDER_TABLES = [
  'ordenes_trabajo', 'orden_asignaciones', 'orden_labor', 'orden_repuestos',
  'orden_avances', 'orden_media', 'presupuestos', 'orden_hallazgos'
] as const;

/**
 * Un nombre de canal por suscripción. `supabase.channel(nombre)` devuelve el que ya exista con
 * ese nombre, y el anterior puede seguir cerrándose (cerrar sesión y entrar con otra cuenta):
 * agregarle escuchas a un canal ya suscrito falla.
 */
let channelSeq = 0;

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
        asignaciones:orden_asignaciones(*, usuario:perfiles(*)),
        hallazgos:orden_hallazgos(*)
      `).order('creado_en', { ascending: false }).order('id');
      if (sedeId) query = query.eq('sede_id', sedeId);
      // Lo que un admin archivó a mano sale del tablero en el acto, sin esperar los 90 días.
      query = query.is('archivada_en', null);
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
        id, numero_orden, estatus, tipo_trabajo, fecha_finalizacion, fecha_estimada_entrega, archivada_en,
        montos:orden_montos(total_general),
        cliente:clientes(nombre),
        vehiculo:vehiculos(marca, modelo, anio, placa)
      `)
      .eq('estatus', 'entregado')
      // Archivada a mano, o entregada hace más de 90 días. Es el complemento exacto del filtro
      // del tablero: toda entregada está en una de las dos listas y en una sola. Si la búsqueda
      // agrega su propio `or` más abajo, PostgREST combina los dos con AND (comprobado contra
      // la API el 28/09).
      .or(`archivada_en.not.is.null,fecha_finalizacion.lt.${corte}`)
      .order('fecha_finalizacion', { ascending: false })
      .order('id');
    if (sedeId) query = query.eq('sede_id', sedeId);
    const termino = search.trim();
    if (termino) {
      // En el servidor: el archivo no está en memoria, así que filtrarlo en el cliente
      // solo buscaría dentro de la página que se pidió.
      //
      // El nombre del cliente se resuelve ANTES, en su propia consulta. Un `or` de
      // PostgREST no puede nombrar una tabla embebida — `clientes.nombre.ilike...` dentro
      // de un `or` responde 400 "failed to parse logic tree" — pero `cliente_id` sí es
      // columna de la orden, así que se filtra por los ids que casan.
      const { data: clientes } = await supabase
        .from('clientes')
        .select('id')
        .ilike('nombre', `%${termino}%`)
        .limit(CLIENTES_EN_BUSQUEDA);
      const ids = (clientes || []).map((c) => c.id);

      // Dentro de un `or` los comodines son `*`, y una coma o un paréntesis en el término
      // partirían el árbol lógico: un cliente llamado "Pérez, Juan" devolvía un 400.
      const seguro = termino.replace(/[(),*%]/g, ' ').trim();
      const partes = [`numero_orden.ilike.*${seguro}*`];
      if (ids.length) partes.push(`cliente_id.in.(${ids.join(',')})`);
      query = query.or(partes.join(','));
    }
    const { data, error } = await query.range(offset, offset + limit - 1);
    if (error) throw error;
    return (data || []) as unknown as WorkOrder[];
  },

  /**
   * El historial de una orden, del más nuevo al más viejo (solo admin; la RLS lo impone).
   * Paginado: crece con cada cambio y la API no devuelve más de 1.000 filas sin avisar.
   */
  getHistory: async (orderId: string, limit: number) => {
    const { data, error } = await supabase
      .from('historial_orden')
      .select('id, ocurrido_en, actor_nombre, origen, entidad, entidad_id, accion, resumen, cambios')
      .eq('orden_id', orderId)
      .order('ocurrido_en', { ascending: false })
      .order('id', { ascending: false })
      .range(0, limit - 1);
    if (error) throw error;
    return (data || []) as OrderHistoryEntry[];
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
        labor_items:orden_labor(*, tecnico:perfiles!asignado_a(id, nombre_completo, rol)),
        repuestos:orden_repuestos(*),
        asignaciones:orden_asignaciones(*, usuario:perfiles(*)),
        hallazgos:orden_hallazgos(*)
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

  /**
   * "Mis tareas" del panel del técnico (F7): las tareas que tiene asignadas en órdenes sin
   * entregar, con su orden y vehículo. La RLS ya le deja ver solo sus órdenes; el filtro por
   * `asignado_a` saca las de compañeros en una orden compartida. Las rechazadas por el
   * cliente no se hacen y no aparecen.
   */
  getMyTasks: async (userId: string): Promise<MyTask[]> => {
    type Row = Omit<MyTask, 'orden'> & { ordenes_trabajo: MyTask['orden'] };
    const rows = await fetchAll<Row>((from, to) =>
      supabase
        .from('orden_labor')
        // `!inner`: filtrar por el estatus de la orden deja fuera la línea, no solo el embebido.
        .select('id, orden_id, descripcion, especialidad, estado, completado_en, ordenes_trabajo!inner(id, numero_orden, estatus, fecha_estimada_entrega, vehiculo:vehiculos(marca, modelo, anio))')
        .eq('asignado_a', userId)
        .neq('estado', 'rechazado')
        .neq('ordenes_trabajo.estatus', 'entregado')
        .order('creado_en', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
        // Sin tipos generados, supabase-js infiere cada embebido como arreglo; son uno a uno.
        .overrideTypes<Row[], { merge: false }>()
    );
    return rows.map(({ ordenes_trabajo, ...task }) => ({ ...task, orden: ordenes_trabajo }));
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
      // Los nombres que lee `create_work_order` (20261010000007). Hasta el 04/10/2026 iban como
      // `deposito_cheque` y `deposito_comprobante`, la base no los reconocía y el número de
      // cheque y el comprobante del alta se perdían sin error.
      deposito_metodo: input.deposito_metodo || null,
      deposito_numero_cheque: input.deposito_cheque || null,
      deposito_comprobante_ruta: input.deposito_comprobante || null,
      inspeccion_360_notas: input.inspeccion_360_notas,
      fecha_estimada_entrega: input.fecha_estimada_entrega,
      creado_por: input.creado_por,
    };

    // Una transacción del lado de la base: la orden y su labor, repuestos y
    // asignaciones entran juntas o no entra nada (ver 20260911000000).
    //
    // Ya no hay camino alternativo sin RPC. Aquel fallback insertaba los montos
    // directamente en `ordenes_trabajo`, que desde 20260918000000 no los tiene,
    // y la función también decide qué puede registrar quien llama. Desde 20261004000000
    // solo llega un admin: `create_work_order` es SECURITY INVOKER y el INSERT pasa por
    // `ordenes_trabajo_insert`, que es `is_admin()`. Las guardas de dinero de dentro de la
    // función se quedan como segunda capa.
    const { data, error } = await supabase.rpc('create_work_order', {
      p_order: orderPayload,
      p_labor: input.labor_items,
      p_parts: input.repuestos.map((p) => ({ ...p, costo_unitario: p.precio_venta_unitario })),
      p_assignments: input.asignaciones,
    });
    if (error) throw error;
    return data as WorkOrder;
  },

  // ----- hallazgos (F6, 20261010000011) ----------------------------------------------
  // El técnico reporta trabajo adicional: la base crea el hallazgo, un avance interno para
  // sus fotos y pone la orden en pausa, todo junto. Devuelve el avance para que las fotos
  // suban a él por la cola de siempre.
  reportFinding: async (orderId: string, descripcion: string): Promise<{ hallazgo_id: string; avance_id: string | null }> => {
    const { data, error } = await supabase.rpc('reportar_hallazgo', {
      p_orden_id: orderId,
      p_descripcion: descripcion,
    });
    if (error) throw error;
    // Antes de `20261010000011` la RPC devolvía solo el id del hallazgo (sin avance): la app
    // publicada puede llegar antes que el `db push`, así que se acepta esa forma también.
    if (data && typeof data === 'object') return data as { hallazgo_id: string; avance_id: string | null };
    return { hallazgo_id: String(data), avance_id: null };
  },

  /** Solo admin. Devuelve el texto del hallazgo para precargar la tarea. */
  quoteFinding: async (findingId: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc('cotizar_hallazgo', { p_hallazgo_id: findingId });
    if (error) throw error;
    // Antes de `20261010000011` no devolvía nada: quien llama usa el texto que ya tiene.
    return (data as { descripcion?: string } | null)?.descripcion ?? null;
  },

  /** Solo admin. `texto` es lo que verá el cliente si `enReporte`; nunca la descripción interna. */
  discardFinding: async (findingId: string, enReporte: boolean, texto: string) => {
    const { error } = await supabase.rpc('descartar_hallazgo', {
      p_hallazgo_id: findingId,
      p_en_reporte: enReporte,
      p_texto: texto,
    });
    if (error) throw error;
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

    // Con `.select('id')`: una política de RLS que no deja pasar la fila devuelve cero
    // filas y **ningún error**, así que sin esto la pantalla pintaría el estado nuevo sobre
    // una orden que no cambió. Las políticas de SELECT y de UPDATE de `ordenes_trabajo`
    // tienen la misma condición, así que pedir la fila de vuelta nunca falla por sí solo.
    const { data, error } = await supabase
      .from('ordenes_trabajo')
      .update(updates)
      .eq('id', orderId)
      .select('id');
    if (error) throw error;
    assertAffected(data, 'la orden');
  },

  // ===== Entregar =====
  // Entregar asienta dinero, así que va por la RPC `entregar_orden` y no por
  // `updateWorkOrderStatus`: en una transacción asienta el pago final con su método (o la
  // devolución) y marca la orden entregada, y rechaza una segunda entrega.

  /** Lo que falta cobrar, o devolver si es negativo. Lo calcula la base (regla 0). */
  getBalance: async (orderId: string) => {
    const { data, error } = await supabase.rpc('saldo_orden', { p_orden_id: orderId });
    if (error) throw error;
    return data as OrderBalance;
  },

  /**
   * Foto del cheque o de la transferencia. Bucket privado `comprobantes`, en la carpeta de la
   * sede de la orden (la RPC lo comprueba). Del nombre original solo se usa la extensión.
   */
  uploadReceipt: async (sedeId: string, numeroOrden: string, file: File) => {
    const ext = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${sedeId}/comprobante-${numeroOrden}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('comprobantes')
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
    if (error) throw error;
    return path;
  },

  /** Si la entrega falló después de subir el comprobante, que no quede huérfano. */
  removeDeliveryReceipt: async (path: string) => {
    await supabase.storage.from('comprobantes').remove([path]);
  },

  deliver: async (input: {
    orderId: string;
    metodo: PaymentMethod | null;
    numeroCheque?: string | null;
    comprobanteRuta?: string | null;
  }) => {
    const { data, error } = await supabase.rpc('entregar_orden', {
      p_orden_id: input.orderId,
      p_metodo: input.metodo,
      p_numero_cheque: input.numeroCheque ?? null,
      p_comprobante_ruta: input.comprobanteRuta ?? null,
    });
    if (error) throw error;
    return data as { saldo: number; tipo: 'ingreso' | 'egreso' | null; movimiento_id: string | null };
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

  /**
   * Manda una orden entregada al archivo, o la devuelve al tablero con `null`.
   *
   * La base impone el resto: solo lo entregado se archiva (CHECK) y un técnico no toca una
   * orden entregada. `assertAffected` por lo de siempre: un UPDATE que la RLS no deja pasar
   * devuelve cero filas sin error.
   */
  setArchived: async (orderId: string, archivada: boolean) => {
    const { data, error } = await supabase
      .from('ordenes_trabajo')
      .update({ archivada_en: archivada ? new Date().toISOString() : null })
      .eq('id', orderId)
      .select('id');
    if (error) throw error;
    assertAffected(data, 'la orden');
  },

  setLaborCompleted: async (laborId: string, completado: boolean) => {
    const { error } = await supabase.rpc('marcar_labor_completada', {
      p_labor_id: laborId,
      p_completado: completado,
    });
    if (error) throw error;
  },

  updateWorkOrderProgress: async (orderId: string, porcentaje: number) => {
    const { data, error } = await supabase
      .from('ordenes_trabajo')
      .update({ porcentaje_avance: porcentaje })
      .eq('id', orderId)
      .select('id');
    if (error) throw error;
    assertAffected(data, 'el avance de la orden');
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
  //
  // Una tarea nueva lleva su técnico (`asignado_a`, o nulo = sin técnico: nadie cobra) y
  // `reparto_heredado: false` siempre: el reparto por especialidad es solo de las líneas de
  // antes de la comisión por tarea (20261010000006). La columna nace con default true para la
  // app que estaba publicada; esta lo manda explícito en cada alta.
  addLaborItem: async (
    orderId: string,
    item: { descripcion: string; costo: number; especialidad?: Specialty; asignado_a?: string | null }
  ) => {
    const { data, error } = await supabase
      .from('orden_labor')
      .insert({ ...item, asignado_a: item.asignado_a ?? null, reparto_heredado: false, orden_id: orderId })
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

  /**
   * Qué comisiones de la orden ya se pagaron, para no ofrecer cambiarle el técnico o la bolsa
   * a esas tareas: la base lo rechaza. `labor_id` nulo = la bolsa heredada de esa especialidad.
   * Solo administración lee `comisiones`.
   */
  getPaidCommissionKeys: async (orderId: string) =>
    fetchAll<{ id: string; labor_id: string | null; especialidad: Specialty }>((from, to) =>
      supabase
        .from('comisiones')
        .select('id, labor_id, especialidad')
        .eq('orden_id', orderId)
        .not('pago_id', 'is', null)
        .order('id')
        .range(from, to)
    ),

  updateLaborItem: async (id: string, item: { descripcion: string; costo: number; especialidad?: Specialty }) => {
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

  /**
   * Si la persona entra al reparto heredado por especialidad ('manual') o cobra solo sus tareas
   * ('tarea'). Solo administración (20261010000006); la base lo rechaza si esa bolsa ya se pagó,
   * con la frase para el taller.
   */
  setAssignmentOrigin: async (id: string, origen: 'manual' | 'tarea') => {
    const { data, error } = await supabase.from('orden_asignaciones').update({ origen }).eq('id', id).select('id');
    if (error) throw error;
    assertAffected(data, 'la asignación');
  },

  removeAssignment: async (id: string) => {
    const { data, error } = await supabase.from('orden_asignaciones').delete().eq('id', id).select('id');
    if (error) throw error;
    assertDeleted(data, 'la asignación');
  },

  updateAssignmentStatus: async (id: string, estatus: 'pendiente' | 'en_curso' | 'completada') => {
    const { data, error } = await supabase
      .from('orden_asignaciones')
      .update({ estatus_tarea: estatus })
      .eq('id', id)
      .select('id');
    if (error) throw error;
    assertAffected(data, 'la tarea');
  },

  // ===== Progress updates ("Agregar Avance") =====
  // Una nota del técnico. Sus fotos, videos y notas de voz ya no viajan aquí:
  // entran a la cola de subida con el id de este avance y suben en segundo
  // plano (ver `MediaUploadQueue`), así que crear el avance es instantáneo aunque
  // lleve un video de 25 MB.
  addProgressUpdate: async (orderId: string, usuarioId: string, descripcion: string, visible_cliente?: boolean, labor_id?: string) => {
    const { data, error } = await supabase
      .from('orden_avances')
      .insert({ orden_id: orderId, usuario_id: usuarioId, descripcion, visible_cliente, labor_id })
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

    // El más importante de los `assertAffected` de este archivo. La imagen ya está en
    // Storage; si el UPDATE se queda en cero filas sin error, esta función devolvía la ruta
    // y la fecha como si todo hubiera ido bien: la pantalla decía "firmada", la orden se
    // quedaba sin firma y — porque la primera firma es la que autoriza lo cotizado — el
    // total seguía en cero. El cliente firma en la tableta y no queda registrado.
    const firmaFecha = new Date().toISOString();
    const { data, error: updateError } = await supabase
      .from('ordenes_trabajo')
      .update({ firma_ruta: path, firma_fecha: firmaFecha })
      .eq('id', order.id)
      .select('id');
    if (updateError) throw updateError;
    assertAffected(data, 'la firma');

    return { ruta: path, fecha: firmaFecha };
  },

  /**
   * Avisa qué orden cambió, en cuanto cambia, la haya cambiado quien la haya cambiado.
   *
   * Realtime aplica la RLS de cada tabla con la sesión de quien escucha, así que un técnico
   * solo se entera de sus órdenes. Del evento se usa solo el id: los datos se vuelven a leer
   * por las consultas de siempre, que traen las relaciones y pasan por las mismas reglas.
   * Un DELETE llega solo con la llave primaria (Realtime no puede revisar una fila que ya no
   * existe): sirve para la orden borrada, y el de una hija, que no dice de qué orden era, se
   * ignora.
   *
   * `onReconnect` corre cuando el canal vuelve después de un corte (red, teléfono dormido):
   * lo que cambió mientras tanto no se reenvía. Devuelve la función que cancela.
   */
  subscribeToChanges: (onChange: (orderId: string) => void, onReconnect: () => void) => {
    let channel = supabase.channel(`ordenes:${++channelSeq}`);
    for (const table of ORDER_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const row = Object.keys(payload.new ?? {}).length > 0 ? payload.new : payload.old ?? {};
          const orderId = table === 'ordenes_trabajo' ? row.id : row.orden_id;
          if (typeof orderId === 'string') onChange(orderId);
        }
      );
    }

    let joined = false;
    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return;
      // La primera vez no: las pantallas acaban de leer.
      if (joined) onReconnect();
      joined = true;
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  },
};
