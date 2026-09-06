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
  /**
   * Share of an order's profit paid out as commission, 0-100. Per sede rather
   * than global: the split is a local arrangement with the crew of one
   * workshop, not a company-wide constant. Defaults to 35 in the database.
   */
  comision_porcentaje?: number;
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
