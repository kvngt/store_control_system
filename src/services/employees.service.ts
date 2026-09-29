// La sección Empleados: cómo se le paga a cada quien y qué ha hecho. El alta, la edición y la
// baja de la cuenta siguen en `users.service` (edge functions de administración).
import { supabase } from '../lib/supabase';
import type { EmployeeSummary, PayScheme } from '../types/database';

export interface RecentAssignment {
  orden_id: string;
  tipo_tarea: string;
  fecha_asignacion: string;
  orden: { id: string; numero_orden: string; estatus: string; fecha_estimada_entrega: string | null } | null;
}

export interface RecentProgress {
  id: string;
  orden_id: string;
  descripcion: string;
  creado_en: string;
  orden: { numero_orden: string } | null;
}

/** Cuántas filas "recientes" trae el detalle: es un vistazo, no un historial. */
const RECENT = 10;

export const employeesService = {
  /** Una fila por empleado con esquema propio. Quien no tiene fila cobra comisión al % de la sede. */
  getPaySchemes: async () => {
    const { data, error } = await supabase.from('perfiles_pago').select('*');
    if (error) throw error;
    return (data || []) as PayScheme[];
  },

  /**
   * Guarda el esquema de pago. Upsert por `usuario_id`: la primera vez crea la fila. Cambiarlo
   * recalcula en la base las comisiones pendientes de esa persona; lo pagado no se toca.
   */
  savePayScheme: async (scheme: Omit<PayScheme, 'actualizado_en'>) => {
    const { data, error } = await supabase
      .from('perfiles_pago')
      .upsert(scheme, { onConflict: 'usuario_id' })
      .select()
      .single();
    if (error) throw error;
    return data as PayScheme;
  },

  getSummary: async (userId: string) => {
    const { data, error } = await supabase.rpc('resumen_empleado', { p_usuario_id: userId });
    if (error) throw error;
    return data as EmployeeSummary;
  },

  getRecentAssignments: async (userId: string) => {
    const { data, error } = await supabase
      .from('orden_asignaciones')
      .select('orden_id, tipo_tarea, fecha_asignacion, orden:ordenes_trabajo!orden_id(id, numero_orden, estatus, fecha_estimada_entrega)')
      .eq('usuario_id', userId)
      .order('fecha_asignacion', { ascending: false })
      .limit(RECENT);
    if (error) throw error;
    return (data || []) as unknown as RecentAssignment[];
  },

  getRecentProgress: async (userId: string) => {
    const { data, error } = await supabase
      .from('orden_avances')
      .select('id, orden_id, descripcion, creado_en, orden:ordenes_trabajo!orden_id(numero_orden)')
      .eq('usuario_id', userId)
      .order('creado_en', { ascending: false })
      .limit(RECENT);
    if (error) throw error;
    return (data || []) as unknown as RecentProgress[];
  },
};
