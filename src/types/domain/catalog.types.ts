export interface CatalogJobLine {
  id?: string;
  catalogo_id?: string;
  tipo: 'mano_obra' | 'repuesto';
  descripcion: string;
  especialidad?: 'mecanica' | 'pintura' | null;
  cantidad: number;
  precio: number;
  costo_unitario?: number | null;
  posicion: number;
  horas?: number | null;
}

export interface CatalogJob {
  id: string;
  sede_id?: string;
  nombre: string;
  activo: boolean;
  total: number;
  lineas: CatalogJobLine[];
}

export interface OrderJob {
  id: string;
  titulo: string;
  catalogo_id: string | null;
  total: number;
  total_aprobado: number;
  lineas: number;
}
