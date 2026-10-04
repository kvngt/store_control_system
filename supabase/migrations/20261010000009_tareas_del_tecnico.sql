-- ------------------------------------------------------------------------------------
-- F5: Tareas por hacer del técnico (plan-mejoras-2026-10)
-- ------------------------------------------------------------------------------------
-- Permite vincular un avance de orden (nota, fotos, etc.) a una línea específica de
-- mano de obra (tarea) para que el técnico reporte el avance de cada tarea individual.
-- ------------------------------------------------------------------------------------

ALTER TABLE orden_avances ADD COLUMN labor_id UUID REFERENCES orden_labor(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION trg_avance_labor_match()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.labor_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM orden_labor WHERE id = NEW.labor_id AND orden_id = NEW.orden_id) THEN
      RAISE EXCEPTION 'La tarea % no pertenece a la orden %.', NEW.labor_id, NEW.orden_id
        USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER avance_labor_match
BEFORE INSERT OR UPDATE ON orden_avances
FOR EACH ROW EXECUTE FUNCTION trg_avance_labor_match();

-- ------------------------------------------------------------------------------------
-- Comprobación: ya existía marcar_labor_completada con notificaciones 'tarea_completada'
-- desde migraciones previas.
-- ------------------------------------------------------------------------------------
