-- ------------------------------------------------------------------------------------
-- Las notas de voz de la recepción nacen internas
-- ------------------------------------------------------------------------------------
-- Acordado con el taller (octubre 2026), al abrir la inspección 360° del alta a videos y
-- notas de voz: todo lo de la recepción nacía visible para el cliente, porque eran fotos
-- del estado en que llegó el auto, lo mismo que el cliente firma. Una nota de voz es otra
-- cosa: es el taller hablando, muchas veces para sí mismo ("tiene un golpe que no quiso
-- reconocer"), y salía al portal sin que nadie lo decidiera.
--
-- Cambio: una nota de voz de la recepción nace interna. Un administrador la publica desde
-- la tarjeta Inspección 360° de la orden, como cualquier archivo suelto. Fotos y videos de
-- la recepción siguen naciendo visibles. Vale igual si se graba en el alta o después desde
-- la orden, y para cualquiera que la suba: lo decide esta función, no el navegador.
--
-- Las notas de voz que ya se subieron no se tocan: ocultarlas ahora podría quitarle al
-- cliente algo que ya vio.
--
-- Los archivos de un avance no cambian: siguen la visibilidad del avance que el técnico
-- decide mostrar (20260930000001).
--
-- La función se reescribe entera, partiendo de 20260930000001. Única línea distinta: el
-- primer caso del CASE de `visible_cliente`.
-- ------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_prepare_orden_media()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sede    UUID;
  v_prefijo TEXT;
BEGIN
  SELECT sede_id INTO v_sede FROM ordenes_trabajo WHERE id = NEW.orden_id;
  IF v_sede IS NULL THEN
    RAISE EXCEPTION 'La orden % no existe.', NEW.orden_id;
  END IF;

  IF NEW.avance_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM orden_avances WHERE id = NEW.avance_id AND orden_id = NEW.orden_id
  ) THEN
    RAISE EXCEPTION 'El avance no pertenece a esta orden.';
  END IF;

  -- La fila solo puede describir un archivo de la carpeta de su propia orden.
  -- Sin esto, una fila podía apuntar a un archivo de otra orden de la sede y
  -- publicarlo en el reporte equivocado.
  v_prefijo := v_sede::text || '/' || NEW.orden_id::text || '/';
  IF left(NEW.ruta, length(v_prefijo)) <> v_prefijo
     OR (NEW.ruta_miniatura IS NOT NULL AND left(NEW.ruta_miniatura, length(v_prefijo)) <> v_prefijo) THEN
    RAISE EXCEPTION 'La ruta del archivo no corresponde a la orden.' USING ERRCODE = '42501';
  END IF;

  NEW.sede_id := v_sede;
  NEW.subido_por := COALESCE(auth.uid(), NEW.subido_por);
  NEW.visible_cliente := CASE
    -- Una nota de voz de la recepción es el taller hablando: la publica un admin (20261010000003).
    WHEN NEW.origen = 'recepcion' AND NEW.tipo = 'audio' THEN false
    WHEN NEW.origen = 'recepcion' THEN true
    ELSE COALESCE((SELECT a.visible_cliente FROM orden_avances a WHERE a.id = NEW.avance_id), false)
  END;
  NEW.proveedor := 'supabase';
  NEW.creado_en := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_prepare_orden_media() FROM PUBLIC, anon, authenticated;
