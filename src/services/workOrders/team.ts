import { supabase } from '../../lib/supabase';
import { assertAffected, assertDeleted } from '../support';

export const orderTeam = {
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
};
