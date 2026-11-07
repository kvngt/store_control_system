-- =====================================================================================
-- El técnico no desmarca una tarea de una orden terminada (06/11/2026)
-- =====================================================================================
-- En el recorrido de la primera orden después de empezar de cero: con la orden ya
-- `finalizado`, el técnico seguía viendo «Reabrir tarea» y la base se lo aceptaba. La orden
-- quedaba terminada al 100 % con su tarea sin hacer, aunque administración ya la estuviera
-- revisando o el cliente ya tuviera el aviso de «lista para entregar». Un técnico no reabre
-- una finalizada (docs/ai-context.md): desmarcar una tarea es reabrirla por otra puerta.
--
-- Qué cambia: `marcar_labor_completada` rechaza (42501) que un técnico desmarque una tarea
-- de una orden `finalizado`. Marcar como hecha una que quedó sin marcar sí puede, y
-- administración puede todo, como antes.
--
-- Reescrita entera desde 20261010000006 (la versión vigente, `npm run db:donde`). Los
-- permisos (REVOKE y GRANT) son los mismos.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.marcar_labor_completada(p_labor_id UUID, p_completado BOOLEAN DEFAULT true)
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
  v_asignado UUID;
  v_desc     TEXT;
  v_antes    TIMESTAMPTZ;
  v_en       TIMESTAMPTZ;
  v_por      UUID;
  v_admin    BOOLEAN := public.is_admin();
  d          JSONB;
BEGIN
  -- FOR UPDATE OF l: la fila de la línea queda bloqueada, no la de la orden.
  SELECT l.orden_id, o.sede_id, o.estatus, l.estado, l.asignado_a, l.descripcion, l.completado_en
  INTO v_orden_id, v_sede, v_estatus, v_estado, v_asignado, v_desc, v_antes
  FROM orden_labor l
  JOIN ordenes_trabajo o ON o.id = l.orden_id
  WHERE l.id = p_labor_id
  FOR UPDATE OF l;

  IF v_orden_id IS NULL THEN
    RAISE EXCEPTION 'Esa línea de trabajo ya no existe.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    v_admin
    OR (v_sede = public.current_user_sede_id() AND public.is_assigned_to_order(v_orden_id))
  ) THEN
    RAISE EXCEPTION 'Solo el personal asignado puede marcar el trabajo de esta orden. Pide a administración que te asigne.'
      USING ERRCODE = '42501';
  END IF;

  -- Una tarea con técnico es de ese técnico.
  IF NOT v_admin AND v_asignado IS NOT NULL AND v_asignado IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Esta tarea está asignada a otro técnico. Solo esa persona o administración pueden marcarla.'
      USING ERRCODE = '42501';
  END IF;

  IF v_estatus = 'entregado' AND NOT v_admin THEN
    RAISE EXCEPTION 'La orden ya fue entregada. Sólo un administrador puede modificarla.'
      USING ERRCODE = '42501';
  END IF;

  -- Una orden terminada ya la revisa administración (y quizá ya se le avisó al cliente): el
  -- técnico no le quita una tarea hecha. Marcar una que quedó sin marcar sí puede (06/11/2026).
  IF v_estatus = 'finalizado' AND NOT v_admin AND NOT p_completado THEN
    RAISE EXCEPTION 'La orden ya está terminada. Si falta algo, pide a administración que la reabra.'
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

  -- Aviso a administración cuando un técnico termina una tarea (no al volver a marcarla).
  IF p_completado AND NOT v_admin AND v_antes IS NULL THEN
    BEGIN
      d := public.datos_orden_aviso(v_orden_id) || jsonb_build_object(
        'labor_id', p_labor_id,
        'descripcion', v_desc,
        'usuario_id', auth.uid(),
        'tecnico', (SELECT nombre_completo FROM perfiles WHERE id = auth.uid())
      );
      PERFORM public.notificar(
        public.admins_de_sede(v_sede),
        'tarea_completada',
        'Tarea hecha · ' || (d->>'numero_orden'),
        concat_ws(': ', NULLIF(d->>'tecnico', ''), v_desc),
        d,
        v_orden_id
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'marcar_labor_completada (aviso): %', SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object('id', p_labor_id, 'completado_en', v_en, 'completado_por', v_por);
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_labor_completada(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_labor_completada(UUID, BOOLEAN) TO authenticated;
