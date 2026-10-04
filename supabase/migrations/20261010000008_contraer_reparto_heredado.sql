-- ------------------------------------------------------------------------------------
-- Contraer el reparto heredado de la fase 3 (plan-mejoras-2026-10, F3)
-- ------------------------------------------------------------------------------------
-- Una vez validada y publicada la aplicación en producción que manda explícitamente 
-- reparto_heredado = false para nuevas tareas, cambiamos el default a false para evitar
-- que líneas futuras queden sin asignar correctamente.
-- ------------------------------------------------------------------------------------

ALTER TABLE orden_labor ALTER COLUMN reparto_heredado SET DEFAULT false;
