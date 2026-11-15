import { supabase } from '../../lib/supabase';
import type {
  OrderMedia,
  OrderProgressUpdate,
  PendingWorkItem,
  WorkOrder,
} from '../../types/database';
import { mediaPath } from '../../lib/media/mime';
import { assertAffected, assertDeleted } from '../support';
import { mediaService } from '../media.service';

export const orderFollowUp = {
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

  /**
   * Las traducciones al inglés de lo que escribió el taller en la orden (`traducciones_orden`:
   * texto original → traducción). Lo que todavía no se tradujo no viene.
   */
  getOrderTranslations: async (orderId: string) => {
    const { data, error } = await supabase.rpc('traducciones_orden', { p_orden_id: orderId });
    if (error) throw error;
    return (data ?? {}) as Record<string, string>;
  },

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
   * Administración confirma que el vehículo está listo (`marcar_lista_para_entregar`): queda la
   * marca y se le avisa al cliente. Solo con la orden finalizada.
   */
  markReadyForPickup: async (orderId: string) => {
    const { data, error } = await supabase.rpc('marcar_lista_para_entregar', { p_orden_id: orderId });
    if (error) throw error;
    return data as { lista_para_entregar_en: string; ya_estaba: boolean };
  },

  /**
   * Lo que el cliente no autorizó (o no se hizo) en visitas anteriores de un vehículo, para
   * ofrecérselo de nuevo. Sin la orden que se está viendo. Solo administración.
   */
  getPendingWork: async (vehicleId: string, excludeOrderId?: string | null) => {
    const { data, error } = await supabase.rpc('trabajos_pendientes_vehiculo', {
      p_vehiculo_id: vehicleId,
      p_excluir_orden: excludeOrderId ?? null,
    });
    if (error) throw error;
    return (data ?? []) as PendingWorkItem[];
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
};
