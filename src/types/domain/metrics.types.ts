export interface TechnicianMetrics {
  usuario_id: string;
  nombre: string;
  horas_facturadas: number;
  horas_reloj: number;
  eficiencia: number | null;
  tareas_completadas: number;
}

export interface WorkshopMetrics {
  carros_recibidos: number;
  carros_entregados: number;
  ventas_mano_obra: number;
  ventas_repuestos: number;
  costo_repuestos: number;
  descuentos: number;
  ticket_promedio: number | null;
  comisiones: number;
  margen_mano_obra: number | null;
  margen_repuestos: number | null;
  horas_facturadas: number;
  tarifa_efectiva: number | null;
  horas_por_orden: number | null;
  tarifa_hora_sede: number | null;
  aprobacion_presupuestos: number | null;
  dias_promedio_en_taller: number | null;
  por_tecnico: TechnicianMetrics[];
}
