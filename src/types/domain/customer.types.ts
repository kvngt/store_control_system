export interface Customer {
  id: string;
  sede_id: string;
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  notas_crm: string;
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
  sede_id: string;
}
