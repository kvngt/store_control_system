import { supabase } from '../../lib/supabase';
import type {
  MyTask,
  OrderHistoryEntry,
  OrderMedia,
  OrderProgressUpdate,
  PartSummary,
  WorkOrder,
} from '../../types/database';
import { fetchAll } from '../support';
import { daysFromTodayLocal } from '../../lib/dates';
import { sanitizeDamageMarks } from '../../lib/vehicleDiagram';
import { mediaService } from '../media.service';
import { quotesService } from '../quotes.service';

/** Desde cuándo una orden entregada deja el tablero y pasa al archivo. */
const ARCHIVE_DAYS = 90;

/**
 * Cuántos clientes se resuelven al buscar en el archivo. Sus ids viajan en la URL, que
 * tiene un largo máximo; buscar "a" no puede convertirse en una petición de 8 KB.
 */
const CLIENTES_EN_BUSQUEDA = 100;

export const orderQueries = {
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

    // Qué órdenes esperan la respuesta del cliente a un presupuesto, y cuáles una pieza.
    // Tolerantes: si fallan, la lista se ve igual, sin la marca.
    const [data, waiting, waitingParts] = await Promise.all([
      fetchAll<WorkOrder>(page),
      quotesService.waitingOrderIds().catch(() => new Set<string>()),
      orderQueries.waitingPartsOrderIds().catch(() => new Set<string>()),
    ]);
    return data.map((order) => ({
      ...order,
      esperando_autorizacion: waiting.has(order.id),
      esperando_repuestos: waitingParts.has(order.id),
    }));
  },

  /** Órdenes abiertas con una pieza pedida que no ha llegado (20261010000017). */
  waitingPartsOrderIds: async () => {
    const { data, error } = await supabase.rpc('ordenes_esperando_repuestos');
    if (error) throw error;
    return new Set(((data as string[] | null) ?? []).map(String));
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
        montos:orden_montos(total_repuestos, total_general, deposito_inicial, descuento, descuento_motivo),
        cliente:clientes(*),
        vehiculo:vehiculos(*),
        labor_items:orden_labor(*, tecnico:perfiles!asignado_a(id, nombre_completo, rol)),
        repuestos:orden_repuestos(*),
        asignaciones:orden_asignaciones(*, usuario:perfiles(*)),
        hallazgos:orden_hallazgos(*),
        trabajos:orden_trabajos(id, titulo, catalogo_id)
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
      marcas_danos: sanitizeDamageMarks(data.marcas_danos),
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
};
