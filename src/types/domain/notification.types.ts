/** Una fila de `notificaciones`: un aviso para una persona. */
export interface AppNotification {
  id: string;
  usuario_id: string;
  sede_id: string | null;
  /** asignacion | desasignacion | recepcion_tecnico | avance_tecnico | orden_finalizada | comision_generada */
  tipo: string;
  /** En español, redactado por la base. Es lo que se manda por push. */
  titulo: string;
  cuerpo: string;
  /** Los mismos datos sin redactar, para traducir el aviso al idioma de la pantalla. */
  datos: Record<string, unknown>;
  orden_id: string | null;
  url: string | null;
  leida_en: string | null;
  creado_en: string;
}
