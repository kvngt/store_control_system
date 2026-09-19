-- ------------------------------------------------------------------------------------
-- Los avances que el técnico decide mostrar al cliente
-- ------------------------------------------------------------------------------------
-- Hasta ahora, lo que el mecánico escribía no salía del taller: `datos_portal` no incluía
-- los avances, y sus fotos y videos nacían invisibles y las publicaba un admin de una en
-- una. El cliente veía archivos sueltos sin saber qué eran.
--
-- Ahora el técnico marca el avance y con él salen su texto y sus archivos. La interfaz le
-- muestra antes el texto tal como lo va a leer el cliente, para que lo confirme o lo
-- corrija: es el mismo campo que la nota del taller, así que esa confirmación es la única
-- red que hay.
--
-- Lo que NO cambia: al cliente no le llega el autor. Que el reporte no nombre a los
-- técnicos es una regla aparte (ver docs/ai-context.md) y sigue en pie.
--
-- Lo que escribe el técnico es la columna nueva sobre SU propio avance, que su RLS ya le
-- permite (`orden_avances_update`, 20260922000000), y `trg_avance_owner_immutable` solo
-- congela `orden_id` y `usuario_id`. No hace falta ninguna política nueva.

ALTER TABLE orden_avances ADD COLUMN IF NOT EXISTS visible_cliente BOOLEAN NOT NULL DEFAULT false;


-- ------------------------------------------------------------------------------------
-- 1. Un archivo hereda la visibilidad de su avance
-- ------------------------------------------------------------------------------------
-- Transcrito de 20260919000000 con una sola línea distinta. Antes imponía
-- `visible_cliente := (origen = 'recepcion')`, así que un archivo que subiera DESPUÉS de
-- publicar el avance nacía interno — y ese es el caso normal, no el raro: la cola de subida
-- vive en el IndexedDB del teléfono y un video aterriza minutos después de guardarse el
-- avance.
--
-- Sigue siendo una asignación y no un `COALESCE(NEW.visible_cliente, …)`: lo que manda el
-- navegador se ignora igual que antes. Quien decide es el avance padre.
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
    WHEN NEW.origen = 'recepcion' THEN true
    ELSE COALESCE((SELECT a.visible_cliente FROM orden_avances a WHERE a.id = NEW.avance_id), false)
  END;
  NEW.proveedor := 'supabase';
  NEW.creado_en := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_prepare_orden_media() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orden_media_prepare ON orden_media;
CREATE TRIGGER trg_orden_media_prepare
  BEFORE INSERT ON orden_media
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_prepare_orden_media();


-- ------------------------------------------------------------------------------------
-- 2. Publicar el avance publica los archivos que ya tenía
-- ------------------------------------------------------------------------------------
-- El trigger de arriba cubre los archivos que llegan después; este, los que ya estaban.
--
-- Por qué `SECURITY DEFINER`: la política `orden_media_rows_update` exige `is_admin()`, y
-- así se queda — publicar un archivo suelto sigue siendo decisión de administración. El
-- técnico nunca hace un UPDATE sobre `orden_media`: actualiza SU avance, y la base propaga.
CREATE OR REPLACE FUNCTION public.trg_publicar_archivos_avance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE orden_media
  SET visible_cliente = NEW.visible_cliente
  WHERE avance_id = NEW.id
    AND visible_cliente IS DISTINCT FROM NEW.visible_cliente;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_publicar_archivos_avance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_avance_publicar_archivos ON orden_avances;
CREATE TRIGGER trg_avance_publicar_archivos
  AFTER UPDATE OF visible_cliente ON orden_avances
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_publicar_archivos_avance();


-- ------------------------------------------------------------------------------------
-- 3. El portal: los avances publicados
-- ------------------------------------------------------------------------------------
-- Transcrito de 20260924000000 con dos añadidos, escritos a mano y nunca con
-- `to_jsonb(fila)`: `avance_id` en cada archivo, para que el portal pueda agrupar las fotos
-- bajo su avance, y la clave `avances`.
--
-- Solo se listan los avances publicados que tengan algo que mostrar — texto o al menos un
-- archivo visible — para no pintar una tarjeta vacía en el portal. Sin autor: al cliente no
-- le llegan los nombres de los técnicos.
CREATE OR REPLACE FUNCTION public.datos_portal(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enlace orden_enlaces;
  v_orden  ordenes_trabajo;
  v_taller JSONB;
  v_pagado NUMERIC;
  v_montos orden_montos;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('estado_enlace', 'no_encontrado');
  END IF;

  SELECT * INTO v_enlace FROM orden_enlaces WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('estado_enlace', 'no_encontrado');
  END IF;

  SELECT jsonb_build_object(
    'nombre', s.nombre,
    'direccion', s.direccion,
    'telefono', s.telefono,
    'email', NULLIF(btrim(s.email_contacto), ''),
    'whatsapp', NULLIF(btrim(s.whatsapp), ''),
    'logo_url', s.logo_url,
    'color', s.color_tema
  ) INTO v_taller
  FROM sedes s WHERE s.id = v_enlace.sede_id;

  IF v_enlace.revocado_en IS NOT NULL THEN
    RETURN jsonb_build_object('estado_enlace', 'revocado', 'taller', v_taller);
  END IF;
  IF v_enlace.expira_en IS NOT NULL AND v_enlace.expira_en <= NOW() THEN
    RETURN jsonb_build_object('estado_enlace', 'vencido', 'taller', v_taller);
  END IF;

  UPDATE orden_enlaces
  SET accesos = accesos + 1, ultimo_acceso_en = NOW()
  WHERE id = v_enlace.id;

  SELECT * INTO v_orden FROM ordenes_trabajo WHERE id = v_enlace.orden_id;
  SELECT * INTO v_montos FROM orden_montos WHERE orden_id = v_orden.id;

  SELECT COALESCE(SUM(CASE WHEN tipo = 'ingreso' THEN monto ELSE -monto END), 0)
  INTO v_pagado
  FROM finanzas_movimientos
  WHERE referencia_orden_id = v_orden.id AND categoria = 'pago_cliente';

  RETURN jsonb_build_object(
    'estado_enlace', 'ok',
    'taller', v_taller,
    'enlace', jsonb_build_object('expira_en', v_enlace.expira_en),
    'orden', jsonb_build_object(
      'numero', v_orden.numero_orden,
      'estatus', v_orden.estatus,
      'tipo_trabajo', v_orden.tipo_trabajo,
      'porcentaje_avance', v_orden.porcentaje_avance,
      'fecha_ingreso', v_orden.fecha_ingreso,
      'fecha_estimada_entrega', v_orden.fecha_estimada_entrega,
      'fecha_finalizacion', v_orden.fecha_finalizacion,
      'millas_ingreso', v_orden.millas_ingreso,
      'nivel_gasolina', v_orden.nivel_gasolina,
      'notas_recepcion', v_orden.inspeccion_360_notas,
      'firma_ruta', v_orden.firma_ruta,
      'firma_fecha', v_orden.firma_fecha
    ),
    'cliente', (
      SELECT jsonb_build_object(
        'nombre', c.nombre,
        'tiene_correo', public.es_correo_valido(c.email),
        'acepta_correos', c.acepta_correos
      )
      FROM clientes c WHERE c.id = v_orden.cliente_id
    ),
    'vehiculo', (
      SELECT jsonb_build_object(
        'marca', v.marca,
        'modelo', v.modelo,
        'anio', v.anio,
        'color', v.color,
        'placa', v.placa,
        'vin_final', right(v.vin, 6)
      )
      FROM vehiculos v WHERE v.id = v_orden.vehiculo_id
    ),
    'multimedia', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'tipo', m.tipo,
          'origen', m.origen,
          'avance_id', m.avance_id,
          'zona', m.zona,
          'ruta', m.ruta,
          'ruta_miniatura', m.ruta_miniatura,
          'mime', m.mime,
          'duracion_seg', m.duracion_seg,
          'ancho', m.ancho,
          'alto', m.alto,
          'creado_en', m.creado_en
        ) ORDER BY m.creado_en
      )
      FROM orden_media m
      WHERE m.orden_id = v_orden.id AND m.visible_cliente
    ), '[]'::jsonb),
    -- Los avances que el técnico decidió mostrar. Sin autor, y solo si tienen algo que
    -- contar: un avance publicado sin texto ni archivos visibles sería una tarjeta en blanco.
    'avances', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'fecha', a.creado_en,
        'mensaje', NULLIF(btrim(a.descripcion), '')
      ) ORDER BY a.creado_en DESC)
      FROM orden_avances a
      WHERE a.orden_id = v_orden.id
        AND a.visible_cliente
        AND (
          NULLIF(btrim(a.descripcion), '') IS NOT NULL
          OR EXISTS (SELECT 1 FROM orden_media m WHERE m.avance_id = a.id AND m.visible_cliente)
        )
    ), '[]'::jsonb),
    -- El presupuesto que espera su respuesta. Los ids de las líneas viajan porque el
    -- cliente responde línea por línea.
    'presupuesto', (
      SELECT jsonb_build_object(
        'id', p.id,
        'numero', p.numero,
        'enviado_en', p.creado_en,
        'total', p.total_propuesto,
        'lineas', COALESCE((
          SELECT jsonb_agg(l.linea ORDER BY l.creado_en, l.descripcion)
          FROM (
            SELECT lb.creado_en, lb.descripcion, jsonb_build_object(
              'id', lb.id, 'tipo', 'mano_obra', 'descripcion', lb.descripcion,
              'cantidad', 1, 'precio_unitario', lb.costo, 'monto', lb.costo
            ) AS linea
            FROM orden_labor lb WHERE lb.presupuesto_id = p.id AND lb.estado = 'pendiente'
            UNION ALL
            SELECT r.creado_en, r.descripcion, jsonb_build_object(
              'id', r.id, 'tipo', 'repuesto', 'descripcion', r.descripcion,
              'cantidad', r.cantidad, 'precio_unitario', r.precio_venta_unitario, 'monto', r.subtotal
            )
            FROM orden_repuestos r WHERE r.presupuesto_id = p.id AND r.estado = 'pendiente'
          ) l
        ), '[]'::jsonb)
      )
      FROM presupuestos p
      WHERE p.orden_id = v_orden.id AND p.estado = 'enviado'
    ),
    -- Constancia de lo que ya respondió (o firmó).
    'presupuestos_respondidos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'numero', p.numero,
        'respondido_en', p.respondido_en,
        'via', p.respondido_via,
        'nombre', p.respondido_por_nombre,
        'total_aprobado', p.total_aprobado,
        'autorizados', (SELECT COUNT(*) FROM orden_labor WHERE presupuesto_id = p.id AND estado = 'aprobado')
                     + (SELECT COUNT(*) FROM orden_repuestos WHERE presupuesto_id = p.id AND estado = 'aprobado'),
        'rechazados', (SELECT COUNT(*) FROM orden_labor WHERE presupuesto_id = p.id AND estado = 'rechazado')
                    + (SELECT COUNT(*) FROM orden_repuestos WHERE presupuesto_id = p.id AND estado = 'rechazado')
      ) ORDER BY p.numero DESC)
      FROM presupuestos p
      WHERE p.orden_id = v_orden.id AND p.estado = 'respondido'
    ), '[]'::jsonb),
    -- Lo que se cobra: solo lo aprobado, a precio de venta.
    'cuenta', jsonb_build_object(
      'mano_obra', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('descripcion', l.descripcion, 'monto', l.costo) ORDER BY l.creado_en, l.descripcion)
        FROM orden_labor l WHERE l.orden_id = v_orden.id AND l.estado = 'aprobado'
      ), '[]'::jsonb),
      'repuestos', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'descripcion', r.descripcion,
          'cantidad', r.cantidad,
          'precio_unitario', r.precio_venta_unitario,
          'subtotal', r.subtotal
        ) ORDER BY r.creado_en, r.descripcion)
        FROM orden_repuestos r WHERE r.orden_id = v_orden.id AND r.estado = 'aprobado'
      ), '[]'::jsonb),
      'no_autorizados', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('descripcion', x.descripcion, 'monto', x.monto) ORDER BY x.creado_en)
        FROM (
          SELECT descripcion, costo AS monto, creado_en FROM orden_labor WHERE orden_id = v_orden.id AND estado = 'rechazado'
          UNION ALL
          SELECT descripcion, subtotal, creado_en FROM orden_repuestos WHERE orden_id = v_orden.id AND estado = 'rechazado'
        ) x
      ), '[]'::jsonb),
      'total_mano_obra', v_orden.total_labor,
      'total_repuestos', COALESCE(v_montos.total_repuestos, 0),
      'total', COALESCE(v_montos.total_general, 0),
      'deposito', COALESCE(v_montos.deposito_inicial, 0),
      'pagado', v_pagado,
      'saldo', GREATEST(COALESCE(v_montos.total_general, 0) - v_pagado, 0)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.datos_portal(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datos_portal(TEXT) TO service_role;
