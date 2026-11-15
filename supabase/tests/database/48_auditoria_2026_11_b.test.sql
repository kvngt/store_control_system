-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: Auditoría 2026-11 parte B (20261010000044)
-- ====================================================================================
-- Qué cubre (orden de trabajo 6):
--  1. idx_finanzas_importaciones_hash UNIQUE parcial e importar_estado_cuenta (23505).
--  2. Restricciones CHECK / UNIQUE en finanzas_movimientos y orden_asignaciones.
--  3. create_work_order tolera cadenas vacías ("") en campos numéricos opcionales.
--  4. Todas las políticas de storage.objects envuelven helpers y auth.uid() en (SELECT …).
--  5. margen_ordenes y resumen_panel usan 'America/New_York' como p_tz por defecto.
--  6. Portal con enlace vencido: datos_portal expone solo estado_enlace, taller y
--     cliente.{tiene_correo, acepta_correos}; baja permitida y alta/idioma bloqueados.
--
-- Cómo correrlo: npx supabase start && npm run test:db
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(31);

-- ------------------------------------------------------------------------------------
-- Datos base propios (UUIDs hexadecimales válidos con prefijo 48)
-- ------------------------------------------------------------------------------------
INSERT INTO sedes (id, nombre, direccion, telefono, zona_horaria) VALUES
  ('48000000-0000-0000-0000-000000000001', 'Sede QA 48-A', 'Calle 48A', '555-4801', 'America/New_York'),
  ('48000000-0000-0000-0000-000000000002', 'Sede QA 48-B', 'Calle 48B', '555-4802', 'America/New_York');

INSERT INTO auth.users (id, email) VALUES
  ('48a00000-0000-0000-0000-000000000001', 'admin48@prueba.com'),
  ('48b00000-0000-0000-0000-000000000001', 'tec48@prueba.com');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('48a00000-0000-0000-0000-000000000001', 'Admin 48', 'admin',    '48000000-0000-0000-0000-000000000001', 'admin48@prueba.com'),
  ('48b00000-0000-0000-0000-000000000001', 'Tec 48',   'mecanico', '48000000-0000-0000-0000-000000000001', 'tec48@prueba.com');

-- Cliente B creado el 2026-10-01 00:30 EDT (= 2026-10-01 04:30 UTC; en Chicago sería 2026-09-30 23:30)
INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion, acepta_correos, idioma, creado_en) VALUES
  ('48c00000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000001', 'Cliente 48A', '+15554801', 'cli48a@prueba.com', 'Ave 48A', true, 'es', '2026-09-15 12:00:00+00'),
  ('48c00000-0000-0000-0000-000000000002', '48000000-0000-0000-0000-000000000002', 'Cliente 48B', '+15554802', 'cli48b@prueba.com', 'Ave 48B', true, 'es', '2026-10-01 04:30:00+00');

INSERT INTO vehiculos (id, cliente_id, sede_id, marca, modelo, anio, vin, placa, color) VALUES
  ('48d00000-0000-0000-0000-000000000001', '48c00000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000001', 'Toyota', 'Corolla', 2021, '4T1BURHE0MC004801', 'QA-481', 'Gris'),
  ('48d00000-0000-0000-0000-000000000002', '48c00000-0000-0000-0000-000000000002', '48000000-0000-0000-0000-000000000002', 'Honda',  'Accord',  2022, '4T1BURHE0MC004802', 'QA-482', 'Azul'),
  ('48d00000-0000-0000-0000-000000000003', '48c00000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000001', 'Ford',   'Mustang', 2020, '4T1BURHE0MC004803', 'QA-483', 'Rojo'),
  ('48d00000-0000-0000-0000-000000000004', '48c00000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000001', 'Mazda',  'CX-5',    2023, '4T1BURHE0MC004804', 'QA-484', 'Negro');

-- Órdenes base:
--  ..01 en Sede A (puntos 2b, 6 enlace vigente)
--  ..02 entregada en Sede B con fecha_finalizacion = 2026-10-01 00:30 EDT (punto 5)
--  ..04 en Sede A para mismo cliente 48A (punto 6 enlace vencido)
INSERT INTO ordenes_trabajo (
  id, sede_id, cliente_id, vehiculo_id, tipo_trabajo, millas_ingreso, nivel_gasolina, fecha_estimada_entrega, creado_por, estatus
) VALUES
  ('48e00000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000001', '48c00000-0000-0000-0000-000000000001', '48d00000-0000-0000-0000-000000000001', 'mecanica', 1000, 'full', '2026-12-01', '48a00000-0000-0000-0000-000000000001', 'en_proceso'),
  ('48e00000-0000-0000-0000-000000000002', '48000000-0000-0000-0000-000000000002', '48c00000-0000-0000-0000-000000000002', '48d00000-0000-0000-0000-000000000002', 'mecanica', 2000, 'full', '2026-12-01', '48a00000-0000-0000-0000-000000000001', 'entregado'),
  ('48e00000-0000-0000-0000-000000000004', '48000000-0000-0000-0000-000000000001', '48c00000-0000-0000-0000-000000000001', '48d00000-0000-0000-0000-000000000004', 'mecanica', 4000, 'full', '2026-12-01', '48a00000-0000-0000-0000-000000000001', 'entregado');

UPDATE ordenes_trabajo
SET fecha_finalizacion = '2026-10-01 04:30:00+00', retirada_sin_reparar = false
WHERE id = '48e00000-0000-0000-0000-000000000002';

-- Cada orden nace con su enlace (trg_order_link_on_create): se ajusta ese en vez de crear otro,
-- que chocaría con uq_orden_enlaces_activo.
UPDATE orden_enlaces SET token = repeat('b8', 32), expira_en = NOW() + INTERVAL '30 days'
WHERE orden_id = '48e00000-0000-0000-0000-000000000001' AND revocado_en IS NULL;
UPDATE orden_enlaces SET token = repeat('c8', 32), expira_en = NOW() - INTERVAL '1 day'
WHERE orden_id = '48e00000-0000-0000-0000-000000000004' AND revocado_en IS NULL;


-- ====================================================================================
-- PUNTO 1: No duplicar estados de cuenta (idx_finanzas_importaciones_hash + 23505)
-- ====================================================================================
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub  = '48a00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

-- [1] Permitido: primera importación de un archivo en Sede A
SELECT lives_ok(
  $$ SELECT public.importar_estado_cuenta(
       jsonb_build_object(
         'sede_id', '48000000-0000-0000-0000-000000000001',
         'nombre_archivo', 'octubre.pdf',
         'ruta_archivo', 'sede-a/octubre.pdf',
         'hash_archivo', repeat('11', 32)
       ),
       '[{"tipo":"egreso","categoria":"gasto_operativo","monto":45.50,"descripcion":"Comision","fecha":"2026-10-05"}]'::jsonb
     ) $$,
  '1. primera importación con un hash en Sede A funciona normalmente'
);

-- [2] Falla sin la migración: importar el mismo hash otra vez en la misma sede
SELECT throws_ok(
  $$ SELECT public.importar_estado_cuenta(
       jsonb_build_object(
         'sede_id', '48000000-0000-0000-0000-000000000001',
         'nombre_archivo', 'octubre-reintento.pdf',
         'ruta_archivo', 'sede-a/octubre-reintento.pdf',
         'hash_archivo', repeat('11', 32)
       ),
       '[{"tipo":"egreso","categoria":"gasto_operativo","monto":45.50,"descripcion":"Comision","fecha":"2026-10-05"}]'::jsonb
     ) $$,
  '23505', 'Este estado de cuenta ya se importó.',
  '1. importar dos veces el mismo estado de cuenta en la misma sede rechaza con 23505'
);

-- [3] Permitido: mismo hash en otra sede sí se permite
SELECT lives_ok(
  $$ SELECT public.importar_estado_cuenta(
       jsonb_build_object(
         'sede_id', '48000000-0000-0000-0000-000000000002',
         'nombre_archivo', 'octubre.pdf',
         'ruta_archivo', 'sede-b/octubre.pdf',
         'hash_archivo', repeat('11', 32)
       ),
       '[{"tipo":"egreso","categoria":"gasto_operativo","monto":20.00,"descripcion":"Comision","fecha":"2026-10-05"}]'::jsonb
     ) $$,
  '1. el mismo archivo en otra sede sigue pudiendo importarse'
);

-- [4] Permitido: índice parcial (dos importaciones sin hash en la misma sede no chocan)
SELECT lives_ok(
  $$ DO $do$
     BEGIN
       PERFORM public.importar_estado_cuenta(
         jsonb_build_object(
           'sede_id', '48000000-0000-0000-0000-000000000001',
           'nombre_archivo', 'sin-hash-1.pdf',
           'ruta_archivo', 'sede-a/sin-hash-1.pdf'
         ),
         '[{"tipo":"egreso","categoria":"gasto_operativo","monto":10.00,"descripcion":"A","fecha":"2026-10-06"}]'::jsonb
       );
       PERFORM public.importar_estado_cuenta(
         jsonb_build_object(
           'sede_id', '48000000-0000-0000-0000-000000000001',
           'nombre_archivo', 'sin-hash-2.pdf',
           'ruta_archivo', 'sede-a/sin-hash-2.pdf'
         ),
         '[{"tipo":"egreso","categoria":"gasto_operativo","monto":12.00,"descripcion":"B","fecha":"2026-10-06"}]'::jsonb
       );
     END
     $do$ $$,
  '1. dos importaciones con hash NULL en la misma sede siguen permitidas (índice parcial)'
);

-- [5] Falla sin la migración: definición UNIQUE en pg_indexes
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'finanzas_importaciones'
      AND indexname  = 'idx_finanzas_importaciones_hash'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
  ),
  '1. idx_finanzas_importaciones_hash existe como índice UNIQUE'
);


-- ====================================================================================
-- PUNTO 2a: finanzas_movimientos CHECK (monto >= 0)
-- ====================================================================================
RESET ROLE;
SET LOCAL request.jwt.claim.role = '';
SET LOCAL request.jwt.claim.sub  = '';

-- [6] Falla sin la migración
SELECT throws_ok(
  $$ INSERT INTO public.finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, registrado_por)
     VALUES ('48000000-0000-0000-0000-000000000001', 'egreso', 'gasto_operativo', -10.00, 'Negativo', '2026-10-05', '48a00000-0000-0000-0000-000000000001') $$,
  '23514', NULL,
  '2a. finanzas_movimientos rechaza un monto negativo con CHECK (23514)'
);

-- [7] Permitido: monto = 0 sigue siendo válido
SELECT lives_ok(
  $$ INSERT INTO public.finanzas_movimientos (sede_id, tipo, categoria, monto, descripcion, fecha, registrado_por)
     VALUES ('48000000-0000-0000-0000-000000000001', 'ingreso', 'pago_cliente', 0.00, 'Cero válido', '2026-10-05', '48a00000-0000-0000-0000-000000000001') $$,
  '2a. finanzas_movimientos permite monto = 0'
);


-- ====================================================================================
-- PUNTO 2b: orden_asignaciones CHECK (tipo_tarea) y UNIQUE (orden_id, usuario_id, tipo_tarea)
-- ====================================================================================
-- [8] Falla sin la migración
SELECT throws_ok(
  $$ INSERT INTO public.orden_asignaciones (orden_id, usuario_id, tipo_tarea)
     VALUES ('48e00000-0000-0000-0000-000000000001', '48b00000-0000-0000-0000-000000000001', 'carroceria') $$,
  '23514', NULL,
  '2b. orden_asignaciones rechaza tipo_tarea fuera de mecanica/pintura (23514)'
);

-- [9] Permitido: asignar mecánica por primera vez
SELECT lives_ok(
  $$ INSERT INTO public.orden_asignaciones (orden_id, usuario_id, tipo_tarea)
     VALUES ('48e00000-0000-0000-0000-000000000001', '48b00000-0000-0000-0000-000000000001', 'mecanica') $$,
  '2b. orden_asignaciones permite insertar asignación válida de mecanica'
);

-- [10] Falla sin la migración: duplicar (orden_id, usuario_id, tipo_tarea)
SELECT throws_ok(
  $$ INSERT INTO public.orden_asignaciones (orden_id, usuario_id, tipo_tarea)
     VALUES ('48e00000-0000-0000-0000-000000000001', '48b00000-0000-0000-0000-000000000001', 'mecanica') $$,
  '23505', NULL,
  '2b. orden_asignaciones rechaza duplicado exacto de (orden_id, usuario_id, tipo_tarea) (23505)'
);

-- [11] Permitido: el mismo técnico sí puede tener otra especialidad ('pintura') en la misma orden
SELECT lives_ok(
  $$ INSERT INTO public.orden_asignaciones (orden_id, usuario_id, tipo_tarea)
     VALUES ('48e00000-0000-0000-0000-000000000001', '48b00000-0000-0000-0000-000000000001', 'pintura') $$,
  '2b. orden_asignaciones permite otro tipo_tarea (pintura) para el mismo usuario en la misma orden'
);


-- ====================================================================================
-- PUNTO 3: create_work_order tolera cadenas vacías ("") en numéricos opcionales
-- ====================================================================================
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub  = '48a00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

-- [12] Falla sin la migración (invalid input syntax for type numeric: "")
SELECT lives_ok(
  $$ SELECT public.create_work_order(
       jsonb_build_object(
         'sede_id', '48000000-0000-0000-0000-000000000001',
         'cliente_id', '48c00000-0000-0000-0000-000000000001',
         'vehiculo_id', '48d00000-0000-0000-0000-000000000003',
         'tipo_trabajo', 'mecanica',
         'millas_ingreso', '',
         'deposito_inicial', '',
         'nivel_gasolina', '1/2',
         'fecha_estimada_entrega', '2026-12-15',
         'creado_por', '48a00000-0000-0000-0000-000000000001'
       ),
       '[{"descripcion":"Revisión general","costo":50,"horas":"","especialidad":"mecanica"}]'::jsonb,
       '[{"descripcion":"Filtro de aire","cantidad":1,"costo_unitario":"","precio_venta_unitario":120}]'::jsonb,
       '[]'::jsonb
     ) $$,
  '3. create_work_order acepta costo_unitario, millas_ingreso, deposito_inicial y horas como cadena vacía'
);

-- [13] Permitido / respaldo: costo_unitario vacío toma precio_venta_unitario (120)
SELECT is(
  (
    SELECT r.costo_unitario
    FROM public.orden_repuestos r
    JOIN public.ordenes_trabajo o ON o.id = r.orden_id
    WHERE o.vehiculo_id = '48d00000-0000-0000-0000-000000000003'
    LIMIT 1
  ),
  120.00::numeric,
  '3. costo_unitario vacío usa precio_venta_unitario como respaldo'
);

-- [14] Permitido: millas_ingreso vacío cae a 0
SELECT is(
  (
    SELECT o.millas_ingreso
    FROM public.ordenes_trabajo o
    WHERE o.vehiculo_id = '48d00000-0000-0000-0000-000000000003'
    LIMIT 1
  ),
  0,
  '3. millas_ingreso vacío cae a 0'
);

-- [15] Permitido: deposito_inicial vacío cae a 0
SELECT is(
  (
    SELECT m.deposito_inicial
    FROM public.orden_montos m
    JOIN public.ordenes_trabajo o ON o.id = m.orden_id
    WHERE o.vehiculo_id = '48d00000-0000-0000-0000-000000000003'
    LIMIT 1
  ),
  0.00::numeric,
  '3. deposito_inicial vacío cae a 0.00'
);


-- ====================================================================================
-- PUNTO 4: Políticas de storage.objects envuelven helpers y auth.uid() en (SELECT …)
-- ====================================================================================
RESET ROLE;

-- [16] Falla sin la migración: ninguna política en storage.objects llama helpers sin SELECT
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND regexp_replace(
        COALESCE(qual, '') || ' ' || COALESCE(with_check, ''),
        '\(\s*SELECT\s+(?:public\.)?(?:is_admin|current_user_role|current_user_sede_id|is_assigned_to_order|auth\.uid)\s*\(',
        '',
        'gi'
      ) ~* '(?:is_admin|current_user_role|current_user_sede_id|is_assigned_to_order|auth\.uid)\s*\('
  ),
  '4. ninguna política de storage.objects evalúa helpers o auth.uid() sin envolver en (SELECT …)'
);

-- [17] Permitido: las 20 políticas recreadas están presentes en storage.objects
SELECT is(
  (
    SELECT COUNT(*)::int
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname IN (
        'estados_cuenta_admin_select', 'estados_cuenta_admin_insert', 'estados_cuenta_admin_delete',
        'sede_logos_admin_insert', 'sede_logos_admin_update', 'sede_logos_admin_delete',
        'avatares_own_insert', 'avatares_own_update', 'avatares_own_delete',
        'vehiculos_fotos_admin_select', 'vehiculos_fotos_admin_update', 'vehiculos_fotos_admin_delete',
        'firmas_admin_select', 'firmas_admin_update',
        'comprobantes_admin_select', 'comprobantes_admin_insert', 'comprobantes_admin_update', 'comprobantes_admin_delete',
        'reportes_admin_select',
        'orden_media_insert'
      )
  ),
  20,
  '4. las 20 políticas de storage.objects siguen definidas tras la migración'
);

SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub  = '48a00000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;

-- [18] Permitido: consultar storage.objects como admin evalúa las políticas SELECT sin error
SELECT lives_ok(
  $$ SELECT COUNT(*) FROM storage.objects $$,
  '4. las políticas SELECT envueltas en (SELECT …) de storage.objects se evalúan correctamente para admin'
);


-- ====================================================================================
-- PUNTO 5: Zona horaria por defecto 'America/New_York' en margen_ordenes y resumen_panel
-- ====================================================================================
-- La orden 48e00000-..-02 y el cliente 48c00000-..-02 de Sede B tienen marca temporal
-- 2026-10-01 04:30:00+00 -> 2026-10-01 00:30 en America/New_York, 2026-09-30 23:30 en America/Chicago.

-- [19] Falla sin la migración: margen_ordenes sin p_tz cuenta octubre desde America/New_York
SELECT is(
  public.margen_ordenes('48000000-0000-0000-0000-000000000002', '2026-10-01'::date, '2026-11-01'::date)->>'total_filas',
  '1',
  '5. margen_ordenes usa America/New_York como p_tz por defecto'
);

-- [20] Falla sin la migración: resumen_panel.ordenes_finalizadas_mes sin p_tz
SELECT is(
  public.resumen_panel('48000000-0000-0000-0000-000000000002', '2026-10-15'::date)->>'ordenes_finalizadas_mes',
  '1',
  '5. resumen_panel cuenta ordenes_finalizadas_mes usando America/New_York por defecto'
);

-- [21] Falla sin la migración: resumen_panel.clientes_nuevos_mes sin p_tz
SELECT is(
  public.resumen_panel('48000000-0000-0000-0000-000000000002', '2026-10-15'::date)->>'clientes_nuevos_mes',
  '1',
  '5. resumen_panel cuenta clientes_nuevos_mes usando America/New_York por defecto'
);

-- [22] Permitido: pasar p_tz explícito sigue respetando otra zona horaria
SELECT is(
  public.margen_ordenes('48000000-0000-0000-0000-000000000002', '2026-10-01'::date, '2026-11-01'::date, 25, 0, 'America/Chicago')->>'total_filas',
  '0',
  '5. margen_ordenes respeta p_tz cuando se pasa explícitamente'
);


-- ====================================================================================
-- PUNTO 6: Darse de baja con el enlace vencido (>90 días)
-- ====================================================================================
RESET ROLE;
SET LOCAL request.jwt.claim.role = 'service_role';
SET LOCAL request.jwt.claim.sub  = '';
SET LOCAL ROLE service_role;

-- [23] Estado vencido
SELECT is(
  public.datos_portal(repeat('c8', 32))->>'estado_enlace',
  'vencido',
  '6. datos_portal devuelve estado_enlace = vencido'
);

-- [24] Falla sin la migración: datos_portal vencido devuelve SOLO cliente.{tiene_correo, acepta_correos}
SELECT is(
  public.datos_portal(repeat('c8', 32))->'cliente',
  '{"tiene_correo": true, "acepta_correos": true}'::jsonb,
  '6. datos_portal vencido devuelve únicamente tiene_correo y acepta_correos dentro de cliente'
);

-- [25] Seguridad conservada: datos_portal vencido no expone orden ni cuenta
SELECT ok(
  NOT (public.datos_portal(repeat('c8', 32)) ? 'orden')
  AND NOT (public.datos_portal(repeat('c8', 32)) ? 'cuenta'),
  '6. datos_portal vencido no expone orden ni cuenta'
);

-- [26] Falla sin la migración: darse de baja (p_acepta = false) con enlace vencido sí funciona
SELECT is(
  public.preferencia_correos_portal(repeat('c8', 32), false),
  '{"ok": true, "acepta_correos": false}'::jsonb,
  '6. preferencia_correos_portal permite darse de baja con enlace vencido'
);

-- [27] Confirmar persistencia en clientes.acepta_correos
SELECT is(
  (SELECT acepta_correos FROM public.clientes WHERE id = '48c00000-0000-0000-0000-000000000001'),
  false,
  '6. la baja con enlace vencido actualiza clientes.acepta_correos a false'
);

-- [28] Seguridad: volver a recibir correos (p_acepta = true) con enlace vencido NO se permite
SELECT is(
  public.preferencia_correos_portal(repeat('c8', 32), true),
  '{"ok": false}'::jsonb,
  '6. preferencia_correos_portal rechaza reactivar correos con enlace vencido'
);

-- [29] Permitido: con enlace vigente sí se puede reactivar correos (p_acepta = true)
SELECT is(
  public.preferencia_correos_portal(repeat('b8', 32), true),
  '{"ok": true, "acepta_correos": true}'::jsonb,
  '6. preferencia_correos_portal permite reactivar correos con enlace vigente'
);

-- [30] Falla sin la migración: preferencia_idioma_portal rechaza enlace vencido
SELECT is(
  public.preferencia_idioma_portal(repeat('c8', 32), 'en'),
  '{"ok": false}'::jsonb,
  '6. preferencia_idioma_portal rechaza cambiar el idioma con enlace vencido'
);

-- [31] Permitido: preferencia_idioma_portal funciona con enlace vigente
SELECT is(
  public.preferencia_idioma_portal(repeat('b8', 32), 'en'),
  '{"ok": true, "idioma": "en"}'::jsonb,
  '6. preferencia_idioma_portal permite cambiar el idioma con enlace vigente'
);

SELECT * FROM finish();
ROLLBACK;
