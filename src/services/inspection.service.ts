import { supabase } from '../lib/supabase';
import type {
  InspectionPoint,
  InspectionPointState,
  InspectionTemplate,
  OrderInspection,
  SaveInspectionTemplateInput,
} from '../types/database';

export const inspectionService = {
  /**
   * Obtiene la inspección por puntos de una orden con sus puntos (lectura con RLS).
   */
  getForOrder: async (orderId: string): Promise<OrderInspection | null> => {
    const { data, error } = await supabase
      .from('orden_inspecciones')
      .select('*, puntos:orden_inspeccion_puntos(*)')
      .eq('orden_id', orderId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const puntos = ((data.puntos as InspectionPoint[]) ?? []).sort((a, b) => a.posicion - b.posicion);
    return {
      ...(data as OrderInspection),
      puntos,
    };
  },

  /**
   * Inicia la inspección de una orden usando la plantilla especificada o la predeterminada de la sede.
   */
  start: async (orderId: string, templateId?: string | null): Promise<string> => {
    const { data, error } = await supabase.rpc('iniciar_inspeccion', {
      p_orden_id: orderId,
      p_plantilla_id: templateId ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  /**
   * Marca el estado y nota de un punto de la inspección.
   */
  markPoint: async (pointId: string, estado: InspectionPointState, nota?: string | null): Promise<void> => {
    const { error } = await supabase.rpc('marcar_punto_inspeccion', {
      p_punto_id: pointId,
      p_estado: estado,
      p_nota: nota ?? null,
    });
    if (error) throw error;
  },

  /**
   * Completa la inspección cuando no quedan puntos pendientes y notifica a administración.
   */
  complete: async (inspectionId: string): Promise<void> => {
    const { error } = await supabase.rpc('completar_inspeccion', {
      p_inspeccion_id: inspectionId,
    });
    if (error) throw error;
  },

  /**
   * Publica o retira la inspección del reporte web del cliente (solo administración).
   */
  publish: async (inspectionId: string, publicar: boolean): Promise<void> => {
    const { error } = await supabase.rpc('publicar_inspeccion', {
      p_inspeccion_id: inspectionId,
      p_publicar: publicar,
    });
    if (error) throw error;
  },

  /**
   * Lista las plantillas de inspección de una sede (solo administración).
   */
  listTemplates: async (sedeId: string): Promise<InspectionTemplate[]> => {
    const { data, error } = await supabase.rpc('plantillas_inspeccion', {
      p_sede_id: sedeId,
    });
    if (error) throw error;
    return (data ?? []) as InspectionTemplate[];
  },

  /**
   * Guarda o actualiza una plantilla de inspección con sus puntos (solo administración).
   */
  saveTemplate: async (input: SaveInspectionTemplateInput): Promise<string> => {
    const { data, error } = await supabase.rpc('guardar_plantilla_inspeccion', {
      p_id: input.id ?? null,
      p_sede_id: input.sede_id,
      p_nombre: input.nombre.trim(),
      p_activo: input.activo ?? true,
      p_predeterminada: input.predeterminada ?? false,
      p_puntos: input.puntos.map((p, idx) => ({
        seccion: p.seccion.trim(),
        nombre: p.nombre.trim(),
        posicion: p.posicion ?? idx + 1,
      })),
    });
    if (error) throw error;
    return data as string;
  },

  /**
   * Elimina una plantilla de inspección (solo administración).
   */
  deleteTemplate: async (templateId: string): Promise<void> => {
    const { error } = await supabase.rpc('borrar_plantilla_inspeccion', {
      p_id: templateId,
    });
    if (error) throw error;
  },
};
