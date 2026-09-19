-- ------------------------------------------------------------------------------------
-- Cada mano de obra, marcable como completada por quien la hizo
-- ------------------------------------------------------------------------------------
-- El mecánico tacha "cambio de aceite" cuando lo hizo, como en una lista de tareas. Es lo
-- que más se usa a diario y lo que hace que el admin sepa por dónde va la orden sin
-- preguntar.
--
-- POR QUÉ UNA RPC Y NO ABRIR LA TABLA: `orden_labor` es escritura solo de admin
-- (20260918000000), y con razón — esas filas son dinero. La RLS no se toca: el técnico
-- escribe por esta función, que verifica asignación por dentro y toca DOS columnas y nada
-- más. Efecto de eso: SEC-40 y SEC-60 de `npm run qa:security` siguen pasando sin cambios,
-- porque un PATCH directo a la tabla sigue rechazado.
--
-- POR QUÉ `estado = 'aprobado'` ES OBLIGATORIO, y no un capricho: `trg_guard_linea_presupuesto`
-- (20260924000000:281-285) reescribe en silencio `rechazado` → `borrador` en CUALQUIER
-- update de la línea. Si esta función aceptara una línea rechazada, marcarla como completada
-- la devolvería a borrador y `_agregar_borradores` la metería en el siguiente presupuesto:
-- un técnico resucitando sin querer algo que el cliente ya había rechazado. Además, tachar
-- un trabajo que el cliente no autorizó es invitar a hacerlo gratis.
--
-- LOS OTROS TRIGGERS DE LA TABLA NO ESTORBAN, y conviene dejarlo escrito:
--   * `trg_labor_delivered_guard` lee `auth.role()` y `is_admin()`, que `SECURITY DEFINER`
--     NO cambia, así que el guardia de orden entregada sigue aplicando al técnico dentro de
--     esta función. Se comprueba además aquí arriba para dar el mensaje bueno en vez de un
--     42501 pelado.
--   * `trg_labor_quote_guard` solo lanza si cambian `estado`, `presupuesto_id` o
--     `decidido_en`. No se tocan.
--   * `trg_labor_totals` → `recalculate_order_totals` no llega a escribir: sus UPDATE traen
--     `AND total_labor IS DISTINCT FROM labor_total` y el costo no cambió.

-- `completado_en` y `completado_por`, no un booleano: cuándo y quién es lo que se pregunta
-- cuando un cliente reclama, y un booleano no responde ninguna de las dos.
ALTER TABLE orden_labor ADD COLUMN IF NOT EXISTS completado_en TIMESTAMPTZ;
ALTER TABLE orden_labor ADD COLUMN IF NOT EXISTS completado_por UUID REFERENCES perfiles(id) ON DELETE SET NULL;


CREATE OR REPLACE FUNCTION public.marcar_labor_completada(
  p_labor_id   UUID,
  p_completado BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden_id UUID;
  v_sede     UUID;
  v_estatus  order_status;
  v_estado   TEXT;
  v_en       TIMESTAMPTZ;
  v_por      UUID;
BEGIN
  -- FOR UPDATE OF l: la fila de la línea queda bloqueada, no la de la orden.
  SELECT l.orden_id, o.sede_id, o.estatus, l.estado
  INTO v_orden_id, v_sede, v_estatus, v_estado
  FROM orden_labor l
  JOIN ordenes_trabajo o ON o.id = l.orden_id
  WHERE l.id = p_labor_id
  FOR UPDATE OF l;

  IF v_orden_id IS NULL THEN
    RAISE EXCEPTION 'Esa línea de trabajo ya no existe.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_admin()
    OR (v_sede = public.current_user_sede_id() AND public.is_assigned_to_order(v_orden_id))
  ) THEN
    RAISE EXCEPTION 'Solo el personal asignado puede marcar el trabajo de esta orden. Únete a la orden primero.'
      USING ERRCODE = '42501';
  END IF;

  IF v_estatus = 'entregado' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'La orden ya fue entregada. Sólo un administrador puede modificarla.'
      USING ERRCODE = '42501';
  END IF;

  -- COALESCE por los datos anteriores a la fase 5, que no tenían `estado`.
  IF COALESCE(v_estado, 'aprobado') <> 'aprobado' THEN
    RAISE EXCEPTION 'Solo se puede marcar un trabajo que el cliente ya autorizó.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE orden_labor
  SET completado_en  = CASE WHEN p_completado THEN NOW() END,
      completado_por = CASE WHEN p_completado THEN auth.uid() END
  WHERE id = p_labor_id
  RETURNING completado_en, completado_por INTO v_en, v_por;

  RETURN jsonb_build_object('id', p_labor_id, 'completado_en', v_en, 'completado_por', v_por);
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_labor_completada(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_labor_completada(UUID, BOOLEAN) TO authenticated;
