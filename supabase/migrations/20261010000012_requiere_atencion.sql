-- ====================================================================================
-- F7: "Requiere atención" en el panel de administración (plan-mejoras-2026-10)
-- ====================================================================================
-- Lo que espera una decisión de la oficina, contado en la base y en una sola llamada. La
-- lista de órdenes del navegador no sirve para esto: deja fuera el histórico, y contar ahí
-- sería sumar en el navegador (regla 0 de docs/ai-context.md). El panel ya tenía un aviso de
-- hallazgos, pero lo sacaba de las cinco órdenes más recientes: un hallazgo en la sexta no
-- salía.
--
-- Por grupo, cuántos hay y las primeras cinco órdenes (la que más lleva esperando primero),
-- para que la tarjeta lleve directo a cada una:
--   hallazgos     trabajo adicional reportado sin decidir: pendiente, o cotizado que todavía
--                 no salió en un presupuesto (lo mismo que `findingsToReview` en la app).
--   presupuestos  presupuestos enviados que el cliente no ha contestado.
--   sin_tecnico   tareas de la app (no heredadas) sin técnico y no rechazadas: nadie cobrará
--                 su comisión hasta que se les asigne uno (F3).
--   vencidas      órdenes sin terminar con la fecha estimada de entrega ya pasada (la misma
--                 regla que `orderDueState`: lo finalizado no vence).
--   correos       correos al cliente con error en las últimas 72 horas, contados como los
--                 cuenta `reintentar_correos_fallidos` (uno por clave, y no los que ya tienen
--                 otro pendiente): el número es lo que volvería a salir al reintentar.
-- Lo entregado no cuenta: ya no hay nada que decidir en la orden.
--
-- `p_sede_id` NULL = todas las sedes. `p_hoy` es la fecha local de quien mira, como en la
-- app (`todayLocal`): la de la base es UTC y de noche contaría vencida una orden de hoy.
--
-- Solo administración. SECURITY INVOKER: un admin ya lee todas estas tablas por RLS, y la
-- función no necesita ver más que quien la llama. Solo agrega: la app publicada no la usa.
-- ====================================================================================

CREATE OR REPLACE FUNCTION public.requiere_atencion(p_sede_id UUID DEFAULT NULL, p_hoy DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_hoy      DATE := COALESCE(p_hoy, CURRENT_DATE);
  v_grupos   JSONB;
  v_correos  INTEGER;
  v_vacio    CONSTANT JSONB := jsonb_build_object('total', 0, 'ordenes', '[]'::jsonb);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración ve lo que requiere atención.' USING ERRCODE = '42501';
  END IF;

  WITH abiertas AS (
    SELECT o.id, o.numero_orden, o.estatus, o.fecha_estimada_entrega
    FROM ordenes_trabajo o
    WHERE o.estatus <> 'entregado'
      AND (p_sede_id IS NULL OR o.sede_id = p_sede_id)
  ),
  -- Una fila por orden y grupo: cuántas cosas tiene esa orden y desde cuándo espera.
  por_orden AS (
    SELECT 'hallazgos'::text AS grupo, a.id, a.numero_orden, MIN(h.creado_en) AS desde, COUNT(*)::int AS n
    FROM abiertas a
    JOIN orden_hallazgos h ON h.orden_id = a.id
    WHERE h.estado = 'pendiente' OR (h.estado = 'cotizado' AND h.presupuesto_id IS NULL)
    GROUP BY a.id, a.numero_orden

    UNION ALL
    SELECT 'presupuestos', a.id, a.numero_orden, MIN(p.creado_en), COUNT(*)::int
    FROM abiertas a
    JOIN presupuestos p ON p.orden_id = a.id
    WHERE p.estado = 'enviado'
    GROUP BY a.id, a.numero_orden

    UNION ALL
    SELECT 'sin_tecnico', a.id, a.numero_orden, MIN(l.creado_en), COUNT(*)::int
    FROM abiertas a
    JOIN orden_labor l ON l.orden_id = a.id
    WHERE l.asignado_a IS NULL
      AND NOT l.reparto_heredado
      AND l.estado <> 'rechazado'
    GROUP BY a.id, a.numero_orden

    UNION ALL
    SELECT 'vencidas', a.id, a.numero_orden, a.fecha_estimada_entrega::timestamptz, 1
    FROM abiertas a
    WHERE a.estatus <> 'finalizado'
      AND a.fecha_estimada_entrega < v_hoy
  ),
  ordenadas AS (
    SELECT po.*, row_number() OVER (PARTITION BY po.grupo ORDER BY po.desde, po.numero_orden) AS rk
    FROM por_orden po
  )
  SELECT jsonb_object_agg(
           x.grupo,
           jsonb_build_object('total', x.total, 'ordenes', x.ordenes)
         )
  INTO v_grupos
  FROM (
    SELECT grupo,
           SUM(n)::int AS total,
           COALESCE(
             jsonb_agg(jsonb_build_object('id', id, 'numero_orden', numero_orden) ORDER BY rk)
               FILTER (WHERE rk <= 5),
             '[]'::jsonb
           ) AS ordenes
    FROM ordenadas
    GROUP BY grupo
  ) x;

  SELECT COUNT(*)::int INTO v_correos
  FROM (
    SELECT DISTINCT COALESCE(c.clave_dedupe, c.id::text)
    FROM cola_envios c
    LEFT JOIN ordenes_trabajo o ON o.id = c.orden_id
    WHERE c.canal = 'email'
      AND c.estado = 'error'
      AND c.creado_en >= NOW() - INTERVAL '72 hours'
      AND (p_sede_id IS NULL OR o.sede_id = p_sede_id)
      AND (c.clave_dedupe IS NULL OR NOT EXISTS (
        SELECT 1 FROM cola_envios p
        WHERE p.clave_dedupe = c.clave_dedupe AND p.estado = 'pendiente'
      ))
  ) e;

  v_grupos := COALESCE(v_grupos, '{}'::jsonb);
  RETURN jsonb_build_object(
    'hallazgos',    COALESCE(v_grupos->'hallazgos', v_vacio),
    'presupuestos', COALESCE(v_grupos->'presupuestos', v_vacio),
    'sin_tecnico',  COALESCE(v_grupos->'sin_tecnico', v_vacio),
    'vencidas',     COALESCE(v_grupos->'vencidas', v_vacio),
    'correos',      jsonb_build_object('total', v_correos)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.requiere_atencion(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requiere_atencion(UUID, DATE) TO authenticated;
