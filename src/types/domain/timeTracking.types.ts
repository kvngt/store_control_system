import type { UserProfile } from './auth.types';

export interface LaborTimeEntry {
  id: string;
  labor_id: string;
  orden_id: string;
  usuario_id: string;
  inicio: string;
  fin: string | null;
  usuario?: Pick<UserProfile, 'id' | 'nombre_completo' | 'rol'> | null;
}
