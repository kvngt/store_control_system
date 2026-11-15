### [CRÍTICO] Condición de carrera sin `FOR UPDATE` en `recalculate_order_totals` y entrega simultánea con el portal
- Dónde: _esquema-vigente.sql:6927-6952 (`recalculate_order_totals`), _esquema-vigente.sql:2742-2768 (`aplicar_descuento`), _esquema-vigente.sql:4638-4705 (`entregar_orden`), _esquema-vigente.sql:7571-7597 (`responder_presupuesto_portal`), _esquema-vigente.sql:5263-5278 (`handle_order_delivery_payment`)
- Evidencia:
```sql
  SELECT COALESCE(SUM(costo), 0) INTO labor_total
  FROM orden_labor WHERE orden_id = target_order_id AND estado = 'aprobado';
  SELECT COALESCE(SUM(subtotal), 0) INTO parts_total
  FROM orden_repuestos WHERE orden_id = target_order_id AND estado = 'aprobado';
  SELECT COALESCE(descuento, 0) INTO v_descuento
  FROM orden_montos WHERE orden_id = target_order_id;
  SELECT COALESCE(monto, 0) INTO v_parqueo
  FROM orden_parqueo WHERE orden_id = target_order_id;
```
- Escenario:
  1. Un administrador aplica un descuento de $100 con `aplicar_descuento` mientras otra pestaña o trigger ejecuta `recalculate_order_totals` (por ejemplo al editar/autorizar una línea). Como `recalculate_order_totals` lee `orden_montos.descuento` sin `FOR UPDATE` antes de actualizar `orden_montos`, puede leer `v_descuento = 0` y, al desbloquearse tras el `COMMIT` de `aplicar_descuento`, sobrescribir `total_general` ignorando el descuento (y si la orden está entregada, `handle_delivered_order_adjustment` en _esquema-vigente.sql:5218-5246 asienta un movimiento de ajuste erróneo).
  2. En paralelo, si un administrador llama a `entregar_orden` (toma `FOR UPDATE` solo sobre `ordenes_trabajo` y calcula `_saldo_orden` en la línea 4652) y el cliente aprueba un presupuesto en ese instante con `responder_presupuesto_portal` (toma `FOR UPDATE` solo sobre `presupuestos`), al ejecutarse la línea 4702 `trg_guard_entrega_con_presupuesto` ya no bloquea porque el presupuesto dejó de estar `'enviado'`, y `handle_order_delivery_payment` asienta un segundo cobro en `finanzas_movimientos` sin `metodo_pago`.
- Arreglo propuesto: Tomar `FOR UPDATE` sobre `ordenes_trabajo` (o `orden_montos` primero y en orden consistente) al inicio de `recalculate_order_totals`, `responder_presupuesto_portal` y las funciones que leen/escriben montos de una orden (`handle_delivered_order_adjustment`, `sync_order_parts_expense`), y no depender de lecturas sin candado entre `entregar_orden` y `_resolver_presupuesto`.
- Confianza: alta

### [ALTO] Cualquier usuario autenticado puede cambiar su `perfiles.email` y desviar avisos internos
- Dónde: _esquema-vigente.sql:1257-1259 (`perfiles_update`), _esquema-vigente.sql:9391-9404 (`trg_guard_perfil_privilegios`), _esquema-vigente.sql:6177-6185 (`notificar`), _esquema-vigente.sql:7521 (`requiere_atencion`)
- Evidencia:
```sql
  IF NEW.rol IS DISTINCT FROM OLD.rol THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el rol de un usuario.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.sede_id IS DISTINCT FROM OLD.sede_id THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar la sede de un usuario.'
      USING ERRCODE = '42501';
  END IF;
```
- Escenario: Según docs/ai-context.md:358, el correo solo se edita desde `update-employee`, pero `perfiles_update` deja al propio usuario actualizar su fila y `trg_guard_perfil_privilegios` únicamente bloquea `id`, `rol` y `sede_id`. Un técnico con su token llama `PATCH /rest/v1/perfiles?id=eq.<su_uid>` enviando `email = 'externo@dominio.com'`, desincronizando `perfiles.email` respecto a `auth.users.email` y haciendo que `notificar` envíe correos internos de la plantilla `empleado` a esa dirección arbitraria.
- Arreglo propuesto: Añadir `IF NEW.email IS DISTINCT FROM OLD.email` en `trg_guard_perfil_privilegios` (cuando `NOT public.is_admin()` y sin bandera interna de `update-employee`) o restringir las columnas actualizables por el propio perfil.
- Confianza: alta

### [ALTO] Storage permite al técnico borrar archivos de una inspección ya publicada
- Dónde: _esquema-vigente.sql:1383-1387 (`orden_media_delete`), _esquema-vigente.sql:8845-8857 (`trg_guard_inspeccion_media`)
- Evidencia:
```sql
POLICY orden_media_delete ON storage.objects FOR DELETE TO public
  USING: ((bucket_id = 'orden_media'::text) AND (is_admin() OR ((owner = auth.uid()) AND (NOT (EXISTS ( SELECT 1
   FROM ordenes_trabajo o
  WHERE (((o.id)::text = (storage.foldername(objects.name))[2]) AND (o.estatus = 'entregado'::order_status))))))))
  WITH CHECK: -
```
- Escenario: Un mecánico o pintor sube fotos a los puntos de una inspección, completa la inspección y administración la publica (`orden_inspecciones.publicada_en IS NOT NULL`). El trigger `trg_guard_inspeccion_media` le prohíbe borrar o reasignar filas en `orden_media`, pero la política `orden_media_delete` sobre `storage.objects` solo exige `owner = auth.uid()` y `o.estatus <> 'entregado'`. El técnico llama directo a la API de Storage para borrar el archivo físico del bucket `orden_media`, rompiendo las fotos visibles en el portal del cliente y en el PDF mientras el registro sigue publicado.
- Arreglo propuesto: Excluir en `orden_media_delete` los objetos cuya ruta pertenezca a una fila de `orden_media` vinculada a una inspección con `publicada_en IS NOT NULL` (y reforzar el mismo criterio en `orden_media_insert` si corresponde).
- Confianza: alta

### [ALTO] El técnico puede modificar `fecha_finalizacion` incluso con la orden en `finalizado`, sin rastro en historial
- Dónde: _esquema-vigente.sql:9268-9271 y _esquema-vigente.sql:9304-9307 (`trg_guard_order_technician`), _esquema-vigente.sql:1489 (`trg_historial`), _esquema-vigente.sql:7728-7735 (`resumen_panel`)
- Evidencia:
```sql
  v_permitidas CONSTANT TEXT[] := ARRAY[
    'estatus', 'fecha_finalizacion', 'porcentaje_avance',
    'total_labor', 'motivo_autorizacion'
  ];
...
  IF OLD.estatus = 'finalizado' AND NEW.estatus IS DISTINCT FROM OLD.estatus THEN
    RAISE EXCEPTION 'La orden ya está finalizada. Solo un administrador puede reabrirla.'
      USING ERRCODE = '42501';
  END IF;
```
- Escenario: Un técnico asignado a una orden que ya está en `finalizado` envía un `PATCH /rest/v1/ordenes_trabajo?id=eq.<orden_id>` modificando únicamente `fecha_finalizacion` (sin cambiar `estatus`). Pasa el guardia porque `fecha_finalizacion` está en `v_permitidas` y `NEW.estatus` no cambia, y ni siquiera deja entrada en `orden_historial` (el trigger `trg_historial` de la línea 1489 no escucha `fecha_finalizacion`). Con ello altera el conteo `ordenes_finalizadas_mes` de `resumen_panel` y las fechas mostradas al cliente.
- Arreglo propuesto: Quitar `fecha_finalizacion` de `v_permitidas` y asignarla dentro de un trigger de transición cuando `estatus` pasa a `finalizado`/`entregado` (o impedir cualquier `UPDATE` del técnico si `OLD.estatus = 'finalizado'`), además de añadir `fecha_finalizacion` a `trg_historial` si administración puede editarla.
- Confianza: alta

### [ALTO] Las políticas de `traducciones` limitan a administración a una sola sede
- Dónde: _esquema-vigente.sql:1305-1312 (`traducciones_admin_select`, `traducciones_admin_update`)
- Evidencia:
```sql
POLICY traducciones_admin_select ON public.traducciones FOR SELECT TO authenticated
  USING: (( SELECT is_admin() AS is_admin) AND (sede_id = ( SELECT current_user_sede_id() AS current_user_sede_id)))
  WITH CHECK: -

POLICY traducciones_admin_update ON public.traducciones FOR UPDATE TO authenticated
  USING: (( SELECT is_admin() AS is_admin) AND (sede_id = ( SELECT current_user_sede_id() AS current_user_sede_id)))
  WITH CHECK: (( SELECT is_admin() AS is_admin) AND (sede_id = ( SELECT current_user_sede_id() AS current_user_sede_id)))
```
- Escenario: Según docs/ai-context.md:37, un administrador ve y opera todas las sedes. Si existen dos sedes y un administrador consulta o corrige traducciones de una orden de otra sede vía `traducciones`, RLS le devuelve cero filas silenciosamente mientras en las demás tablas sí tiene acceso global.
- Arreglo propuesto: Eliminar la condición `sede_id = (SELECT current_user_sede_id())` de `traducciones_admin_select` y `traducciones_admin_update` para que dependan únicamente de `(SELECT is_admin())`.
- Confianza: alta

### [MEDIO] Borrar una orden no entregada elimina movimientos de dinero ya cobrados en `finanzas_movimientos`
- Dónde: _esquema-vigente.sql:3247-3252 (`cleanup_order_finance`), _esquema-vigente.sql:9126-9132 (`trg_guard_order_delete_entregada`), _esquema-vigente.sql:9145-9149 (`trg_guard_order_delete_paid`)
- Evidencia:
```sql
BEGIN
  DELETE FROM finanzas_movimientos
  WHERE referencia_orden_id = OLD.id
    AND importacion_id IS NULL;
  RETURN OLD;
END;
```
- Escenario: Un cliente deja un anticipo (`deposito_inicial > 0`, que asienta un `ingreso` en `finanzas_movimientos` mediante `trg_order_montos_deposit`). Mientras la orden siga en `recepcion`, `en_proceso`, `espera_autorizacion` o `finalizado`, ningún guardia impide borrarla salvo que tenga comisiones ya pagadas (`trg_guard_order_delete_paid`). Si un administrador elimina la orden, `cleanup_order_finance` borra silenciosamente el ingreso del anticipo en `finanzas_movimientos`, descuadrando caja sin registrar devolución.
- Arreglo propuesto: Bloquear en `trg_guard_order_delete_*` la eliminación de cualquier orden que tenga movimientos en `finanzas_movimientos` (o al menos con `deposito_inicial > 0` / pagos asentados), obligando a devolver o anular antes el dinero.
- Confianza: alta

### [MEDIO] `importar_estado_cuenta` y `finanzas_importaciones` permiten duplicar todo un extracto por doble clic o reintento
- Dónde: _esquema-vigente.sql:164 (`idx_finanzas_importaciones_hash`), _esquema-vigente.sql:5331-5353 (`importar_estado_cuenta`)
- Evidencia:
```sql
CREATE INDEX idx_finanzas_importaciones_hash ON public.finanzas_importaciones USING btree (sede_id, hash_archivo) WHERE (hash_archivo IS NOT NULL)
...
  INSERT INTO finanzas_importaciones (sede_id, nombre_archivo, ruta_archivo, importado_por, total_transacciones, hash_archivo)
  VALUES (
    v_sede,
    p_importacion->>'nombre_archivo',
    p_importacion->>'ruta_archivo',
    auth.uid(),
    jsonb_array_length(p_movimientos),
    NULLIF(p_importacion->>'hash_archivo', '')
  )
  RETURNING id INTO v_id;
```
- Escenario: Un administrador sube un estado de cuenta CSV/PDF y, por doble clic o reintento de red, el navegador envía dos llamadas concurrentes a `importar_estado_cuenta` con el mismo `hash_archivo`. Como `idx_finanzas_importaciones_hash` no es `UNIQUE` y la RPC no verifica ni bloquea duplicados, Postgres inserta dos importaciones y duplica todas las filas en `finanzas_movimientos`.
- Arreglo propuesto: Convertir `idx_finanzas_importaciones_hash` en un `CREATE UNIQUE INDEX` sobre `(sede_id, hash_archivo) WHERE hash_archivo IS NOT NULL` (y devolver un mensaje claro en `importar_estado_cuenta` si colisiona o si falta `hash_archivo`).
- Confianza: alta

### [MEDIO] El técnico puede editar o borrar avances ya publicados o ligados a hallazgos (borrando sus fotos)
- Dónde: _esquema-vigente.sql:1106-1110 (`orden_avances_delete`), _esquema-vigente.sql:1122-1126 (`orden_avances_update`), _esquema-vigente.sql:368 (`orden_hallazgos.avance_id`), _esquema-vigente.sql:513 (`orden_media.avance_id`)
- Evidencia:
```sql
POLICY orden_avances_delete ON public.orden_avances FOR DELETE TO public
  USING: (( SELECT is_admin() AS is_admin) OR ((usuario_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM ordenes_trabajo o
  WHERE ((o.id = orden_avances.orden_id) AND (o.estatus <> 'entregado'::order_status))))))
  WITH CHECK: -
```
- Escenario: Un técnico reporta un trabajo adicional con fotos (lo que crea un `orden_avances` vinculado por `orden_hallazgos.avance_id` y adjunta las fotos en `orden_media.avance_id` con `ON DELETE CASCADE`) o un administrador publica su avance (`visible_cliente = true`) al cliente. Mientras la orden no esté en `entregado`, el técnico sigue cumpliendo `orden_avances_delete` / `orden_avances_update` y puede alterar el texto publicado al cliente o borrar el avance, eliminando en cascada todas las fotos en `orden_media`.
- Arreglo propuesto: Restringir `orden_avances_delete` y `orden_avances_update` para no-admin a `visible_cliente = false` y `NOT EXISTS (SELECT 1 FROM orden_hallazgos h WHERE h.avance_id = orden_avances.id)` (y exigir también que la orden siga asignada al técnico).
- Confianza: alta

### [MEDIO] `is_assigned_to_order` omite validar `sede_id`, divergiendo de `mis_ordenes_asignadas`
- Dónde: _esquema-vigente.sql:5800-5810 (`is_assigned_to_order`), _esquema-vigente.sql:6101-6112 (`mis_ordenes_asignadas`), _esquema-vigente.sql:3410 (`completar_inspeccion`), _esquema-vigente.sql:5621 (`iniciar_inspeccion`), _esquema-vigente.sql:5997 (`marcar_punto_inspeccion`), _esquema-vigente.sql:7323 (`reportar_hallazgo`)
- Evidencia:
```sql
CREATE OR REPLACE FUNCTION public.is_assigned_to_order(p_orden_id uuid) ...
  SELECT EXISTS (
    SELECT 1 FROM orden_asignaciones
    WHERE orden_id = p_orden_id AND usuario_id = auth.uid()
  );
-- Frente a mis_ordenes_asignadas():
  JOIN ordenes_trabajo o ON o.id = a.orden_id
  WHERE a.usuario_id = auth.uid() AND o.sede_id = public.current_user_sede_id();
```
- Escenario: Si administración cambia de sede a un técnico (`perfiles.sede_id`) sin quitar su fila en `orden_asignaciones`, las políticas `SELECT` basadas en `mis_ordenes_asignadas()` dejan de mostrarle esa orden de su sede anterior, pero las RPCs `SECURITY DEFINER` que validan solo con `is_assigned_to_order` (`iniciar_inspeccion`, `marcar_punto_inspeccion`, `completar_inspeccion`, `reportar_hallazgo`) siguen dejándolo escribir en ella.
- Arreglo propuesto: Hacer el `JOIN ordenes_trabajo o ON o.id = a.orden_id` dentro de `is_assigned_to_order` exigiendo `o.sede_id = public.current_user_sede_id()`, igual que `mis_ordenes_asignadas()`.
- Confianza: alta

### [MEDIO] `descartar_hallazgo` no impide descartar hallazgos en órdenes ya entregadas
- Dónde: _esquema-vigente.sql:4425-4465 (`descartar_hallazgo`)
- Evidencia:
```sql
  SELECT * INTO v_h FROM orden_hallazgos WHERE id = p_hallazgo_id FOR UPDATE;
  IF v_h.id IS NULL THEN
    RAISE EXCEPTION 'No se encontró ese trabajo adicional.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_h.estado = 'pendiente' OR (v_h.estado = 'cotizado' AND v_h.presupuesto_id IS NULL)) THEN
    RAISE EXCEPTION 'Este trabajo adicional ya se resolvió.' USING ERRCODE = '42501';
  END IF;
```
- Escenario: Una orden se entrega (`estatus = 'entregado'`) quedando con un hallazgo en estado `'pendiente'` o `'cotizado'` sin presupuesto. Si posteriormente un administrador llama a `descartar_hallazgo` con `p_en_reporte = true`, la RPC lo marca `'descartado'`, modifica el reporte visible de una orden ya cerrada y llama a `_salir_de_espera(v_h.orden_id)` sin comprobar antes si la orden está en `'entregado'`.
- Arreglo propuesto: Consultar `ordenes_trabajo` con `FOR UPDATE` en `descartar_hallazgo` y rechazar con `42501` cuando `estatus = 'entregado'`.
- Confianza: alta

### [MEDIO] `traducciones_portal` conserva `EXECUTE` para `anon` sin uso en el portal y sin validar formato de token
- Dónde: _esquema-vigente.sql:8346-8367 (`traducciones_portal`), supabase/functions/portal/index.ts, src/portal/portal.api.ts:3
- Evidencia:
```sql
  SELECT orden_id INTO v_orden_id
  FROM orden_enlaces
  WHERE token = p_token
    AND revocado_en IS NULL
    AND (expira_en IS NULL OR expira_en > now());
  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN public._diccionario_traducciones(v_orden_id);
-- EXECUTE: anon, service_role
```
- Escenario: El portal público del cliente no usa PostgREST ni el cliente de Supabase (`portal.api.ts` solo llama a la edge function `portal`, la cual usa `service_role` y no invoca `traducciones_portal`). Aun así, `traducciones_portal` permanece expuesta a `anon` vía RPC pública sin validar `p_token ~ '^[0-9a-f]{64}$'` (a diferencia de `responder_presupuesto_portal`), permitiendo sondear tokens directamente contra Postgres sin pasar por la edge function.
- Arreglo propuesto: Revocar `EXECUTE` a `anon` y `authenticated` en `traducciones_portal` dejándola solo para `service_role` (o eliminarla si ya no se usa), y validar el formato hexadecimal de 64 caracteres del token.
- Confianza: alta

### [BAJO] Políticas de `storage.objects` evalúan funciones auxiliares sin `(SELECT ...)`
- Dónde: _esquema-vigente.sql:1337-1405 (`avatares_own_insert`, `avatares_own_update`, `comprobantes_*`, `estados_cuenta_*`, `firmas_*`, `orden_media_delete`, `orden_media_insert`, `reportes_*`, y también `sede_logos_*` / `vehiculos_fotos_*`)
- Evidencia:
```sql
POLICY estados_cuenta_admin_delete ON storage.objects FOR DELETE TO public
  USING: ((bucket_id = 'estados_cuenta_bancarios'::text) AND (current_user_role() = 'admin'::user_role))

POLICY estados_cuenta_admin_insert ON storage.objects FOR INSERT TO public
  WITH CHECK: ((bucket_id = 'estados_cuenta_bancarios'::text) AND (current_user_role() = 'admin'::user_role))
```
- Escenario: Mientras `orden_media_select` (_esquema-vigente.sql:1395-1397) envuelve `is_admin()`, `current_user_sede_id()` y `mis_ordenes_asignadas()` en `(SELECT ...)`, el resto de políticas de `storage.objects` llaman directamente a `is_admin()`, `current_user_role()`, `current_user_sede_id()` o `is_assigned_to_order()`, impidiendo el InitPlan y provocando reevaluación por cada objeto listado o verificado.
- Arreglo propuesto: Envolver todas las llamadas a helpers (`is_admin()`, `current_user_role()`, `current_user_sede_id()`, `auth.uid()`) dentro de `(SELECT ...)` en las políticas de `storage.objects`.
- Confianza: alta

### [BAJO] `create_work_order` falla con `costo_unitario: ""` en un repuesto
- Dónde: _esquema-vigente.sql:3695-3707 (`create_work_order`)
- Evidencia:
```sql
      GREATEST(COALESCE((item->>'cantidad')::int, 1), 1),
      COALESCE(
        NULLIF(GREATEST(COALESCE((item->>'costo_unitario')::numeric, -1), -1), -1),
        COALESCE((item->>'precio_venta_unitario')::numeric, 0)
      ),
      COALESCE((item->>'precio_venta_unitario')::numeric, 0),
```
- Escenario: A diferencia de `horas` en la línea 3684 (`NULLIF(btrim(COALESCE(item->>'horas', '')), '')::numeric`), si un cliente de la RPC envía `"costo_unitario": ""` en `p_parts`, `(item->>'costo_unitario')::numeric` lanza `invalid input syntax for type numeric: ""` y aborta toda la creación de la orden.
- Arreglo propuesto: Reemplazar `(item->>'costo_unitario')::numeric` por `NULLIF(btrim(COALESCE(item->>'costo_unitario', '')), '')::numeric`.
- Confianza: alta

### [BAJO] Restricciones faltantes y valores por defecto con `CURRENT_DATE` / `'America/Chicago'`
- Dónde: _esquema-vigente.sql:100 (`comision_pagos.fecha_pago`), _esquema-vigente.sql:173 (`finanzas_movimientos.monto`), _esquema-vigente.sql:299-308 (`orden_asignaciones`), _esquema-vigente.sql:6046 (`margen_ordenes`), _esquema-vigente.sql:7702 (`resumen_panel`)
- Evidencia:
```sql
  fecha_pago date NOT NULL DEFAULT CURRENT_DATE        -- comision_pagos
  monto numeric(10,2) NOT NULL                         -- finanzas_movimientos (sin CHECK >= 0)
  tipo_tarea text NOT NULL                             -- orden_asignaciones (sin CHECK ni UNIQUE)
  CREATE OR REPLACE FUNCTION public.margen_ordenes(..., p_tz text DEFAULT 'America/Chicago'::text)
  CREATE OR REPLACE FUNCTION public.resumen_panel(..., p_tz text DEFAULT 'America/Chicago'::text)
```
- Escenario: Un inserto en `comision_pagos` sin `fecha_pago` explícita usa `CURRENT_DATE` (UTC) en lugar de `hoy_taller(sede_id)`, mientras `margen_ordenes` y `resumen_panel` siguen tomando `'America/Chicago'` por defecto si alguien omite `p_tz` (cuando el taller está en Maryland, zona `America/New_York`). Además, `finanzas_movimientos.monto` carece de `CHECK (monto >= 0)` y `orden_asignaciones` carece de `CHECK (tipo_tarea IN ('mecanica', 'pintura'))` y de `UNIQUE (orden_id, usuario_id, tipo_tarea)` (aunque `create_work_order` ya evita duplicados manualmente en las líneas 3717-3719).
- Arreglo propuesto: Añadir `CHECK (monto >= 0)` en `finanzas_movimientos`, `CHECK` + `UNIQUE` en `orden_asignaciones`, cambiar el default de `p_tz` a `'America/New_York'` (o leer `sedes.zona_horaria`) y usar `hoy_taller` donde se registre `fecha_pago`.
- Confianza: alta

## Lo que revisé y está bien
- **Triggers auxiliares aislados**: Todos los triggers de historial (`trg_historial`), cola de traducciones (`trg_encolar_traduccion`), notificaciones (`trg_notify_*`), avance automático, cierre de reloj y avisos de portal están envueltos en bloques `BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING ... END;` y no tumban la escritura principal.
- **Totales y filtrado de `estado = 'aprobado'`**: Tanto `recalculate_order_totals`, `_reparto_comisiones`, `aplicar_descuento`, `indicadores_taller`, `sync_order_parts_expense` y `saldo_retiro` filtran correctamente por `estado = 'aprobado'`.
- **Fechas contables automáticas**: Los movimientos generados en `finanzas_movimientos` por triggers/RPCs (`entregar_orden`, `handle_order_delivery_payment`, `handle_delivered_order_adjustment`, `trg_order_deposit_sync`) usan `public.hoy_taller(sede_id)` y no `CURRENT_DATE`.
- **Resto de funciones `anon` (`current_user_role`, `current_user_sede_id`, `is_admin`)**: Solo consultan `perfiles WHERE id = auth.uid()`, devolviendo `NULL` o `false` sin sesión, sin exponer datos.
- **Separación de montos y repuestos para técnicos**: `orden_montos` y `orden_repuestos` permanecen cerradas para técnicos por RLS y solo leen repuestos sin precios mediante `repuestos_de_orden`, mientras `trg_guard_order_money` y `trg_guard_linea_presupuesto` impiden alterar precios o líneas ya resueltas/entregadas.
- **Protección contra borrado e inmutabilidad financiera**: `trg_guard_order_delete_entregada` impide borrar órdenes entregadas (salvo mantenimiento sin sesión o `delete_sede_cascade` con su bandera) y el uso de `origen` (`manual` vs `sistema`) impide editar o borrar por API movimientos generados por el sistema.
