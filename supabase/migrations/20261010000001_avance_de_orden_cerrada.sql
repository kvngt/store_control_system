-- ------------------------------------------------------------------------------------
-- Una orden cerrada está al 100 %, siempre
-- ------------------------------------------------------------------------------------
-- Reportado por el taller (octubre 2026): una mecánica finalizó una orden y quedó en 80 %,
-- con el control del avance ya bloqueado ("la orden ya está cerrada"). Después la misma
-- orden apareció Finalizada en 0 %.
--
-- `trg_set_progress_on_status` ponía 100 solo en el UPDATE que **cambiaba** el estatus a
-- finalizado o entregado. Un UPDATE posterior que tocara solo `porcentaje_avance` pasaba
-- sin más: `trg_guard_order_technician` deja al técnico asignado escribir el avance en
-- cualquier estado menos entregado, y a un admin en todos. El candado de la pantalla
-- ("la orden ya está cerrada") vivía solo en React.
--
-- Y la pantalla mandaba esas escrituras sin orden: el control deslizante hacía un UPDATE
-- por cada paso de 5 mientras se arrastraba, sin esperar a ninguno, y la casilla convertía
-- un campo vacío en 0 %. Una escritura que salía antes de "Finalizado" podía llegar a la
-- base después y dejar la orden cerrada en un valor intermedio. La pantalla ya no lo hace
-- (`useWorkOrderDetail.commitProgress`), pero la regla tiene que estar aquí.
--
-- Cambio: la regla deja de depender de la transición. Mientras la orden esté finalizada o
-- entregada, el avance es 100, lo mande quien lo mande. Se corrige en silencio en vez de
-- rechazarse: una escritura atrasada de la propia pantalla no es culpa de quien la usa, y
-- un 42501 le mostraría un error por algo que no hizo. Reabrir la orden conserva el 100 y
-- el técnico lo puede bajar, como hasta ahora.
--
-- Solo cambia la función; el trigger es el mismo (BEFORE UPDATE). Es el último BEFORE
-- UPDATE de la tabla en orden alfabético, así que actúa sobre lo que los guardias dejaron
-- pasar. No hace falta en INSERT: `create_work_order` siempre abre en `recepcion`.
-- ------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_set_progress_on_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estatus IN ('finalizado', 'entregado') THEN
    NEW.porcentaje_avance := 100;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_set_progress_on_status() FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------------------------------
-- Las que ya quedaron cerradas por debajo de 100
-- ------------------------------------------------------------------------------------
-- No cambia el estatus ni ningún total, así que de los triggers de la tabla no actúa
-- ninguno más: los AFTER UPDATE de entrega, reversión, repuestos y comisiones miran el
-- cambio de estatus; los de portal, avisos, presupuesto y archivo son `UPDATE OF estatus`
-- o `firma_ruta`; y los guardias salen al principio porque la migración no corre como
-- `authenticated`.
UPDATE ordenes_trabajo
SET porcentaje_avance = 100
WHERE estatus IN ('finalizado', 'entregado')
  AND porcentaje_avance <> 100;
