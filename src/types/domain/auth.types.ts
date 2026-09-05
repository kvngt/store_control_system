import type { UserRole } from './enums';

export interface Sede {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  capacidad: number;
  /** Accent colour as #rrggbb. Null = use the default Restorify gold. */
  color_tema?: string | null;
  logo_url?: string | null;
  fecha_creacion: string;
}

export interface UserProfile {
  id: string;
  nombre_completo: string;
  rol: UserRole;
  sede_id: string;
  telefono: string;
  email: string;
  avatar_url?: string;
  creado_en: string;
}
