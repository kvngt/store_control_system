import type { UserRole } from './enums';

export type SedeTelefonoTipo = 'oficina' | 'celular';

export interface SedeTelefono {
  label: string;
  numero: string;
  tipo: SedeTelefonoTipo;
  whatsapp: boolean;
}

export interface Sede {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string;
  telefonos?: SedeTelefono[];
  capacidad: number;
  /** Accent colour as #rrggbb. Null = use the default Restorify gold. */
  color_tema?: string | null;
  logo_url?: string | null;
  /** Reply-To de los correos al cliente: sus respuestas llegan aquí. */
  email_contacto?: string | null;
  /** Respaldo heredado: el primer teléfono con WhatsApp; lo escribe solo sedesService. */
  whatsapp?: string | null;
  /**
   * Share of an order's profit paid out as commission, 0-100. Per sede rather
   * than global: the split is a local arrangement with the crew of one
   * workshop, not a company-wide constant. Defaults to 35 in the database.
   */
  comision_porcentaje?: number;
  /** Tarifa de mano de obra por hora de referencia (referencia informativa, no calcula precios). */
  tarifa_hora?: number | null;
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
