-- ------------------------------------------------------------------------------------
-- Deshacer una importación bancaria en una sola transacción
-- ------------------------------------------------------------------------------------
-- `deleteImportBatch` hacía dos DELETE desde el navegador: primero los movimientos, después
-- el lote. Son dos escrituras que no pueden quedar a medias, y la regla del proyecto
-- (ai-context.md §2.8b) dice que eso va en una RPC. Lo que pasaba si la segunda fallaba —
-- la red se cae, la pestaña se cierra — es que el dinero ya estaba borrado y el lote seguía
-- en la lista diciendo "12 transacciones importadas". No queda forma de saber que esas doce
-- ya no están.
--
-- Y hay un agujero peor por el camino: `finanzas_movimientos.importacion_id` es
-- `ON DELETE SET NULL`. Borrar solo el lote no borra sus movimientos, los deja con
-- `importacion_id` en null — dinero en los libros que ya no pertenece a ninguna importación
-- y que nadie puede volver a deshacer. El orden del servicio evitaba eso por casualidad;
-- aquí lo garantiza la transacción.
--
-- `SECURITY INVOKER`, igual que `importar_estado_cuenta`: la RLS de las dos tablas
-- (`current_user_role() = 'admin'`) sigue aplicando, y el `is_admin()` de arriba está para
-- dar el mensaje en español en vez de un "cero filas borradas" silencioso. Un DELETE que la
-- RLS rechaza no da error, así que el `ROW_COUNT` del lote es lo que distingue "borrado" de
-- "no te dejaron": si sale cero, la función levanta 42501 y el rollback deshace también los
-- movimientos.

CREATE OR REPLACE FUNCTION public.deshacer_importacion_estado_cuenta(p_importacion_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_movimientos INTEGER;
  v_lote        INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede deshacer una importación.' USING ERRCODE = '42501';
  END IF;
  IF p_importacion_id IS NULL THEN
    RAISE EXCEPTION 'Falta la importación que se quiere deshacer.';
  END IF;

  -- El lote se bloquea antes de tocar los movimientos: dos personas deshaciendo la misma
  -- importación a la vez borrarían las mismas filas, y la segunda reportaría un número de
  -- movimientos que no borró ella. Es el mismo cuidado que `pay_commissions`.
  PERFORM 1 FROM finanzas_importaciones WHERE id = p_importacion_id FOR UPDATE;

  DELETE FROM finanzas_movimientos WHERE importacion_id = p_importacion_id;
  GET DIAGNOSTICS v_movimientos = ROW_COUNT;

  DELETE FROM finanzas_importaciones WHERE id = p_importacion_id;
  GET DIAGNOSTICS v_lote = ROW_COUNT;

  IF v_lote = 0 THEN
    RAISE EXCEPTION 'La importación ya no existe o no tienes permiso para deshacerla.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_movimientos;
END;
$$;

REVOKE ALL ON FUNCTION public.deshacer_importacion_estado_cuenta(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deshacer_importacion_estado_cuenta(UUID) TO authenticated;
