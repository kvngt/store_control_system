-- ------------------------------------------------------------------------------------
-- Reintentar un correo que falló
-- ------------------------------------------------------------------------------------
-- Reporte del taller (03/10/2026): los correos al cliente fallaban con
-- `Resend HTTP 400: API key is invalid`. Es configuración (el secreto RESEND_API_KEY), pero
-- dejó a la vista otro hueco: `process-outbox` marca cualquier 4xx como `error` definitivo,
-- sin reintento, y desde la app no había forma de volver a mandarlo. Corregida la llave, los
-- correos que fallaron mientras tanto se quedaban perdidos.
--
-- Dos RPC, solo para administración:
--   * `reintentar_envio(id)`: un correo concreto, desde la tarjeta del enlace del cliente.
--   * `reintentar_correos_fallidos(horas)`: todos los que fallaron en las últimas horas (72 por
--     defecto), desde Configuración, para después de arreglar la llave.
--
-- Reintentar es devolver la misma fila a `pendiente` con `intentos = 0`: el cron de
-- `process-outbox` la toma en el siguiente minuto. Se reusa la fila, no se copia, así que
-- Resend recibe el mismo `Idempotency-Key` (el id); un envío que falló con 4xx no se procesó,
-- y la llave no lo bloquea.
--
-- Lo que no se reintenta:
--   * Lo que no es correo ni lo que no falló.
--   * Un correo cuya `clave_dedupe` ya tiene otro pendiente: el índice único
--     `uq_cola_envios_dedupe` no lo permitiría, y además ya va a salir uno más nuevo con lo
--     mismo. En el reintento masivo, de varios fallidos con la misma clave sale el más nuevo.
--   * En el masivo, lo de hace más de `p_horas` (tope 30 días): el correo lleva los datos de
--     cuando se encoló, y un "su vehículo está listo" de hace una semana confunde más de lo que
--     informa. Uno viejo se puede reintentar a mano, de uno en uno.
-- ------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reintentar_envio(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fila cola_envios;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede reintentar un correo.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_fila FROM cola_envios WHERE id = p_id FOR UPDATE;

  IF NOT FOUND OR v_fila.canal <> 'email' THEN
    RAISE EXCEPTION 'Ese correo ya no existe.' USING ERRCODE = '42501';
  END IF;

  IF v_fila.estado <> 'error' THEN
    RAISE EXCEPTION 'Solo se puede reintentar un correo que falló.' USING ERRCODE = '42501';
  END IF;

  IF v_fila.clave_dedupe IS NOT NULL AND EXISTS (
    SELECT 1 FROM cola_envios
    WHERE clave_dedupe = v_fila.clave_dedupe AND estado = 'pendiente'
  ) THEN
    RAISE EXCEPTION 'Ya hay un correo igual esperando para salir.' USING ERRCODE = '42501';
  END IF;

  UPDATE cola_envios
  SET estado = 'pendiente',
      intentos = 0,
      ultimo_error = NULL,
      bloqueado_en = NULL,
      enviar_despues_de = NOW()
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reintentar_envio(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reintentar_envio(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.reintentar_correos_fallidos(p_horas INTEGER DEFAULT 72)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administración puede reintentar los correos.' USING ERRCODE = '42501';
  END IF;

  WITH candidatos AS (
    -- Un candidato por clave (el más nuevo); los que no tienen clave, cada uno el suyo.
    SELECT DISTINCT ON (COALESCE(c.clave_dedupe, c.id::text)) c.id
    FROM cola_envios c
    WHERE c.canal = 'email'
      AND c.estado = 'error'
      AND c.creado_en >= NOW() - make_interval(hours => LEAST(GREATEST(COALESCE(p_horas, 72), 1), 720))
      AND (c.clave_dedupe IS NULL OR NOT EXISTS (
        SELECT 1 FROM cola_envios p
        WHERE p.clave_dedupe = c.clave_dedupe AND p.estado = 'pendiente'
      ))
    ORDER BY COALESCE(c.clave_dedupe, c.id::text), c.creado_en DESC
  )
  UPDATE cola_envios
  SET estado = 'pendiente',
      intentos = 0,
      ultimo_error = NULL,
      bloqueado_en = NULL,
      enviar_despues_de = NOW()
  WHERE id IN (SELECT id FROM candidatos);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.reintentar_correos_fallidos(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reintentar_correos_fallidos(INTEGER) TO authenticated;
