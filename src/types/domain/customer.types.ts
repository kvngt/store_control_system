export interface Customer {
  id: string;
  sede_id: string;
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  notas_crm: string;
  /** Recepción y cambios de estado por correo. El cliente puede darse de baja desde su enlace. */
  acepta_correos?: boolean;
  creado_en: string;
  // Virtual fields from joins
  vehiculos_count?: number;
  ordenes_count?: number;
}

export interface CustomerInput {
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  notas_crm: string;
  acepta_correos?: boolean;
  sede_id: string;
}
