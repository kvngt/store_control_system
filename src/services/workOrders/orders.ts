import { supabase } from '../../lib/supabase';
import type { OrderMedia, OrderStatus, WorkOrder, WorkOrderInput } from '../../types/database';
import type { DamageMark } from '../../lib/vehicleDiagram';
import { assertAffected, assertDeleted } from '../support';
import { mediaService } from '../media.service';

export const orders = {
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
      con_seguro: input.con_seguro ?? false,
      aseguradora: input.con_seguro ? (input.aseguradora?.trim() || null) : null,
      numero_reclamo: input.con_seguro ? (input.numero_reclamo?.trim() || null) : null,
      autorizado_en_recepcion: input.autorizado_en_recepcion ?? false,
      marcas_danos: input.marcas_danos ?? [],
      trabajos: input.trabajos ?? [],
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
      // `grupo` (20261010000034) va solo en lo que pertenece a un trabajo: lo pone quien arma la carga.
      p_labor: input.labor_items,
      // Sin costo, la base usa el precio (20261010000017).
      p_parts: input.repuestos.map((p) => ({
        ...p,
        costo_unitario: p.costo_unitario ?? p.precio_venta_unitario,
      })),
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

  /**
   * Guarda los daños marcados en el dibujo del vehículo. Solo admin y antes de que el cliente firme
   * la recepción (la base impone el candado con trg_marcas_danos_firmadas).
   */
  updateDamageMarks: async (orderId: string, marks: DamageMark[]) => {
    const { data, error } = await supabase
      .from('ordenes_trabajo')
      .update({ marcas_danos: marks })
      .eq('id', orderId)
      .select('id');
    if (error) throw error;
    assertAffected(data, 'la orden');
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

  /**
   * Actualiza los datos de seguro de la orden (Fase A, 20261010000027). Solo admin.
   */
  updateInsurance: async (
    orderId: string,
    insurance: { con_seguro: boolean; aseguradora?: string | null; numero_reclamo?: string | null }
  ) => {
    const payload = {
      con_seguro: insurance.con_seguro,
      aseguradora: insurance.con_seguro ? (insurance.aseguradora?.trim() || null) : null,
      numero_reclamo: insurance.con_seguro ? (insurance.numero_reclamo?.trim() || null) : null,
    };
    const { data, error } = await supabase
      .from('ordenes_trabajo')
      .update(payload)
      .eq('id', orderId)
      .select('id');
    if (error) throw error;
    assertAffected(data, 'la orden');
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
};
