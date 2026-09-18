-- ------------------------------------------------------------------------------------
-- Qué estados puede fijar un técnico, y quién puede anular una firma
-- ------------------------------------------------------------------------------------
-- `trg_guard_order_technician` (20260922000000) trataba `estatus` como una columna
-- libre: comprobaba QUIÉN modifica la orden, pero no A QUÉ valor la lleva. Un
-- mecánico o pintor asignado podía devolver la orden a `recepcion`, que es la etapa
-- donde se captura la firma y donde la primera firma autoriza lo cotizado. Volver
-- ahí es una decisión de administración.
--
-- La misma laguna dejaba anular la firma por API (`firma_ruta := NULL`). La interfaz
-- ya no lo hace — volver a firmar sustituye la imagen de una sola vez, sin pasar por
-- NULL — pero el navegador habla directo con la base, así que la regla se escribe
-- donde se puede exigir. Importa porque `trg_quote_on_signature` solo corre cuando
-- `OLD.firma_ruta IS NULL`: dejar la firma en NULL y volver a firmar aprobaría los
-- borradores que hubiera en ese momento.
--
-- Solo se restringe el DESTINO, no el origen: mover `recepcion -> en_proceso` sigue
-- siendo trabajo normal del taller.
--
-- El cuerpo se transcribe entero de 20260922000000 con los dos controles nuevos. Una
-- errata en `v_permitidas` ensancharía los permisos del técnico en silencio, así que
-- lo cubre 03_permisos_tecnico.test.sql.
CREATE OR REPLACE FUNCTION public.trg_guard_order_technician()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Lo único que un técnico cambia desde la app: estado (con su fecha de
  -- finalización), porcentaje de avance y firma. total_labor lo vigila
  -- trg_guard_order_money, que deja pasar el recálculo del sistema.
  v_permitidas CONSTANT TEXT[] := ARRAY[
    'estatus', 'fecha_finalizacion', 'porcentaje_avance',
    'firma_ruta', 'firma_fecha', 'total_labor'
  ];
  -- Los estados a los que el taller mueve una orden por su cuenta. `recepcion` no
  -- está: se sale de ahí, no se vuelve. `entregado` tampoco, y además lo para
  -- trg_guard_order_money.
  v_estados_tecnico CONSTANT order_status[] := ARRAY[
    'en_proceso', 'espera_repuestos', 'finalizado'
  ]::order_status[];
BEGIN
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
    RAISE EXCEPTION 'Solo el personal asignado puede modificar esta orden. Únete a la orden primero.'
      USING ERRCODE = '42501';
  END IF;

  -- Nuevo: a dónde puede llevarla.
  IF NEW.estatus IS DISTINCT FROM OLD.estatus
     AND NOT (NEW.estatus = ANY (v_estados_tecnico)) THEN
    IF NEW.estatus = 'recepcion' THEN
      RAISE EXCEPTION 'Solo un administrador puede devolver una orden a Recepción.'
        USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Solo un administrador puede poner la orden en ese estado.'
      USING ERRCODE = '42501';
  END IF;

  -- Nuevo: quitar la firma rehace el respaldo de lo que el cliente autorizó.
  IF OLD.firma_ruta IS NOT NULL AND NEW.firma_ruta IS NULL THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar la firma de recepción.'
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

-- El trigger no cambia de firma; se reemite por consistencia con la migración que
-- lo creó.
DROP TRIGGER IF EXISTS trg_order_technician_guard ON ordenes_trabajo;
CREATE TRIGGER trg_order_technician_guard
  BEFORE UPDATE ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_guard_order_technician();
