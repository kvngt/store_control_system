-- ------------------------------------------------------------------------------------
-- La firma de recepción la toma solo administración
-- ------------------------------------------------------------------------------------
-- Acordado en la reunión con el taller (septiembre 2026): el mecánico podía capturar la
-- firma del cliente en cualquier momento, incluso con la orden ya en proceso.
--
-- No es un detalle de pantalla. La firma es el respaldo de lo que el cliente aceptó, y
-- `trg_quote_on_signature` hace que **la primera firma apruebe lo cotizado**: pasa los
-- borradores a `aprobado`, y con eso cambian los totales, el enlace del portal y el correo
-- de recepción. Una firma tomada por el técnico, fuera de su momento o por error, autorizaba
-- dinero.
--
-- La recepción es trabajo de mostrador y abrir la orden ya es solo de administración
-- (`20261004000000`), así que la firma va con ella. El técnico sigue viendo si la orden está
-- firmada; no la captura, no la cambia y no la quita.
--
-- Cambio: `firma_ruta` y `firma_fecha` salen de `v_permitidas` de
-- `trg_guard_order_technician`. La función se reescribe entera, igual que en
-- `20260929000000`, para que el cuerpo vigente se lea aquí. El resto no cambia, salvo dos
-- mensajes:
--   * El de la firma: antes solo cubría quitarla; ahora cubre cualquier cambio, con un
--     texto que dice qué hacer.
--   * "Únete a la orden primero" ya no aplica: unirse a una orden se quitó en
--     `20261004000000`. Ahora dice a quién pedírselo.
--
-- La comprobación de la carpeta (la firma tiene que estar en la carpeta de ESTA orden) sigue
-- valiendo para todos, admin incluido.
-- ------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_guard_order_technician()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Lo único que un técnico cambia desde la app: estado (con su fecha de
  -- finalización y, si pide autorización, su motivo) y porcentaje de avance.
  -- total_labor lo vigila trg_guard_order_money, que deja pasar el recálculo del sistema.
  -- La firma ya no está: la toma administración (20261006000000).
  v_permitidas CONSTANT TEXT[] := ARRAY[
    'estatus', 'fecha_finalizacion', 'porcentaje_avance',
    'total_labor', 'motivo_autorizacion'
  ];
  -- Los estados a los que el taller mueve una orden por su cuenta. `recepcion` no
  -- está: se sale de ahí, no se vuelve. `entregado` tampoco, y además lo para
  -- trg_guard_order_money.
  v_estados_tecnico CONSTANT order_status[] := ARRAY[
    'en_proceso', 'espera_autorizacion', 'finalizado'
  ]::order_status[];
BEGIN
  -- Normalización, antes de la salida del admin porque vale para todos: un motivo en
  -- blanco es no tener motivo, y el motivo solo significa algo mientras la orden espera
  -- autorización. Dejarlo puesto después mostraría un banner que ya no es cierto.
  NEW.motivo_autorizacion := NULLIF(btrim(left(COALESCE(NEW.motivo_autorizacion, ''), 1000)), '');
  IF NEW.estatus IS DISTINCT FROM 'espera_autorizacion' THEN
    NEW.motivo_autorizacion := NULL;
  END IF;

  -- La firma es un archivo de la carpeta de ESTA orden en el bucket privado. Vale
  -- para todos, admin incluido: apuntar a otra ruta mostraría en el reporte una
  -- firma que no es la de esta orden.
  IF NEW.firma_ruta IS DISTINCT FROM OLD.firma_ruta
     AND NEW.firma_ruta IS NOT NULL
     AND NEW.firma_ruta NOT LIKE NEW.sede_id::text || '/' || NEW.id::text || '/%' THEN
    RAISE EXCEPTION 'La firma debe guardarse en la carpeta de esta orden.'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_admin() OR auth.role() IS DISTINCT FROM 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF OLD.estatus = 'entregado' THEN
    RAISE EXCEPTION 'La orden ya fue entregada. Sólo un administrador puede modificarla.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_assigned_to_order(OLD.id) THEN
    RAISE EXCEPTION 'Solo el personal asignado puede modificar esta orden. Pide a administración que te asigne.'
      USING ERRCODE = '42501';
  END IF;

  -- A dónde puede llevarla.
  IF NEW.estatus IS DISTINCT FROM OLD.estatus
     AND NOT (NEW.estatus = ANY (v_estados_tecnico)) THEN
    IF NEW.estatus = 'recepcion' THEN
      RAISE EXCEPTION 'Solo un administrador puede devolver una orden a Recepción.'
        USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Solo un administrador puede poner la orden en ese estado.'
      USING ERRCODE = '42501';
  END IF;

  -- Pedir autorización sin decir por qué deja al admin adivinando qué cotizar.
  IF NEW.estatus = 'espera_autorizacion' AND NEW.motivo_autorizacion IS NULL THEN
    RAISE EXCEPTION 'Escribe por qué la orden necesita autorización.'
      USING ERRCODE = '42501';
  END IF;

  -- La primera firma aprueba lo cotizado y cualquier cambio rehace el respaldo de lo que
  -- el cliente aceptó. La comparación de abajo ya lo rechazaría; esto es para que el
  -- mensaje diga de qué se trata.
  IF NEW.firma_ruta IS DISTINCT FROM OLD.firma_ruta
     OR NEW.firma_fecha IS DISTINCT FROM OLD.firma_fecha THEN
    RAISE EXCEPTION 'La firma del cliente la toma administración en la recepción.'
      USING ERRCODE = '42501';
  END IF;

  -- Comparar la fila completa menos lo permitido, en vez de listar lo prohibido:
  -- una columna que se agregue mañana queda protegida sin acordarse de este trigger.
  IF (to_jsonb(NEW) - v_permitidas) IS DISTINCT FROM (to_jsonb(OLD) - v_permitidas) THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar los datos de recepción de una orden.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_guard_order_technician() FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------------------------------
-- El mismo mensaje viejo en `marcar_labor_completada`
-- ------------------------------------------------------------------------------------
-- Idéntica a `20260930000000` salvo el texto del 42501: "Únete a la orden primero" mandaba
-- al técnico a buscar un botón que ya no existe.
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
    RAISE EXCEPTION 'Solo el personal asignado puede marcar el trabajo de esta orden. Pide a administración que te asigne.'
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
