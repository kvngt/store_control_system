-- ====================================================================================
-- RESTORIFY — Pruebas de base de datos: módulo de parqueo (20261010000028)
-- ====================================================================================
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(44);

-- ------------------------------------------------------------------------------------
-- PARTE 1: Pruebas unitarias de _parqueo_calculo (casos de la tabla §3.2)
-- ------------------------------------------------------------------------------------

-- 1. Caso Seguro (evento 10-01, cobra día evento, gracia 0, tramo $40, hasta 10-10) -> 10 días, $400
SELECT is(
  public._parqueo_calculo(
    jsonb_build_object('cobra_dia_evento', true, 'dias_gracia', 0, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 40))),
    '2026-10-01'::date, '2026-10-10'::date, NULL, '{}'::jsonb
  ),
  jsonb_build_object('inicio', '2026-10-01', 'dias', 10, 'monto', 400.00, 'tope_aplicado', false, 'detalle', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'hasta_dia', 10, 'dias', 10, 'tarifa', 40, 'subtotal', 400.00))),
  'Caso 1 (Seguro): inicio 10-01, 10 días, $400'
);

-- 2. Caso Particular (evento 10-09, no cobra día, gracia 2 cal, tramo $40, hasta 10-14) -> inicio 10-12, 3 días, $120
SELECT is(
  public._parqueo_calculo(
    jsonb_build_object('cobra_dia_evento', false, 'dias_gracia', 2, 'gracia_dias_habiles', false, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 40))),
    '2026-10-09'::date, '2026-10-14'::date, NULL, '{}'::jsonb
  ),
  jsonb_build_object('inicio', '2026-10-12', 'dias', 3, 'monto', 120.00, 'tope_aplicado', false, 'detalle', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'hasta_dia', 3, 'dias', 3, 'tarifa', 40, 'subtotal', 120.00))),
  'Caso 2 (Particular): inicio 10-12, 3 días, $120'
);

-- 3. Caso Gracia hábil (evento 10-09 vie, no cobra día, gracia 2 hábiles) -> inicio 10-14 mié
SELECT is(
  (public._parqueo_calculo(
    jsonb_build_object('cobra_dia_evento', false, 'dias_gracia', 2, 'gracia_dias_habiles', true, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 40))),
    '2026-10-09'::date, '2026-10-14'::date, NULL, '{}'::jsonb
  )->>'inicio')::date,
  '2026-10-14'::date,
  'Caso 3 (Gracia hábil): inicio 10-14 mié'
);

-- 4. Caso Tramos (1->$40, 8->$60, 10 días: 7x40 + 3x60 = $460)
SELECT is(
  (public._parqueo_calculo(
    jsonb_build_object('cobra_dia_evento', true, 'dias_gracia', 0, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 40), jsonb_build_object('desde_dia', 8, 'tarifa_diaria', 60))),
    '2026-10-01'::date, '2026-10-10'::date, NULL, '{}'::jsonb
  )->>'monto')::numeric,
  460.00,
  'Caso 4 (Tramos): 7x40 + 3x60 = $460'
);

-- 5a. Caso Tope monto (tope $300 sobre los 10 días de $40 = $400) -> $300, tope_aplicado true
SELECT is(
  public._parqueo_calculo(
    jsonb_build_object('cobra_dia_evento', true, 'dias_gracia', 0, 'tope_monto', 300, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 40))),
    '2026-10-01'::date, '2026-10-10'::date, NULL, '{}'::jsonb
  )->>'tope_aplicado',
  'true',
  'Caso 5a (Tope monto): tope_aplicado true'
);

-- 5b. Caso Tope días (tope 5 días sobre 10 días) -> 5 días, $200
SELECT is(
  (public._parqueo_calculo(
    jsonb_build_object('cobra_dia_evento', true, 'dias_gracia', 0, 'tope_dias', 5, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 40))),
    '2026-10-01'::date, '2026-10-10'::date, NULL, '{}'::jsonb
  )->>'dias')::int,
  5,
  'Caso 5b (Tope días): 5 días'
);

-- 6. Caso Exonerados (10 días con 2 exonerados = 8 días, $320)
SELECT is(
  (public._parqueo_calculo(
    jsonb_build_object('cobra_dia_evento', true, 'dias_gracia', 0, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 40))),
    '2026-10-01'::date, '2026-10-10'::date, NULL, jsonb_build_object('dias_exonerados', 2)
  )->>'monto')::numeric,
  320.00,
  'Caso 6 (Exonerados): 8 días, $320'
);

-- 7. Caso Tarifa manual ($25 sobre 10 días = $250)
SELECT is(
  (public._parqueo_calculo(
    jsonb_build_object('cobra_dia_evento', true, 'dias_gracia', 0, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 40))),
    '2026-10-01'::date, '2026-10-10'::date, NULL, jsonb_build_object('tarifa_manual', 25)
  )->>'monto')::numeric,
  250.00,
  'Caso 7 (Tarifa manual): 10 días a $25 = $250'
);

-- 8. Caso Vigente desde (evento 10-01, vigente 10-05 -> inicio 10-05, 6 días, $240)
SELECT is(
  (public._parqueo_calculo(
    jsonb_build_object('cobra_dia_evento', true, 'dias_gracia', 0, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 40))),
    '2026-10-01'::date, '2026-10-10'::date, '2026-10-05'::date, '{}'::jsonb
  )->>'inicio')::date,
  '2026-10-05'::date,
  'Caso 8 (Vigente desde): inicio 10-05'
);

-- 9. Caso Sin evento (particular sin lista para entregar) -> inicio NULL, 0 días, $0
SELECT is(
  public._parqueo_calculo(
    jsonb_build_object('cobra_dia_evento', false, 'dias_gracia', 2, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 40))),
    NULL, '2026-10-10'::date, NULL, '{}'::jsonb
  ),
  jsonb_build_object('inicio', NULL, 'dias', 0, 'monto', 0, 'detalle', '[]'::jsonb, 'tope_aplicado', false),
  'Caso 9 (Sin evento): inicio NULL, 0 días, $0'
);

-- 10. Caso Inicio manual (sin evento pero con inicio manual 10-08 hasta 10-10) -> 3 días, $120
SELECT is(
  (public._parqueo_calculo(
    jsonb_build_object('cobra_dia_evento', false, 'dias_gracia', 2, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 40))),
    NULL, '2026-10-10'::date, NULL, jsonb_build_object('inicio_manual', '2026-10-08')
  )->>'dias')::int,
  3,
  'Caso 10 (Inicio manual): 3 días'
);

-- ------------------------------------------------------------------------------------
-- PARTE 2: Pruebas con tablas e integración
-- ------------------------------------------------------------------------------------

INSERT INTO sedes (id, nombre, direccion, telefono, zona_horaria) VALUES
  ('33000000-0000-0000-0000-000000000001', 'Sede Parqueo QA', 'Calle 33', '555-3300', 'America/New_York');

INSERT INTO auth.users (id, email) VALUES
  ('33a00000-0000-0000-0000-000000000001', 'admin33@prueba.local'),
  ('33b00000-0000-0000-0000-000000000002', 'mecanico33@prueba.local');

INSERT INTO perfiles (id, nombre_completo, rol, sede_id, email) VALUES
  ('33a00000-0000-0000-0000-000000000001', 'Admin Parqueo', 'admin', '33000000-0000-0000-0000-000000000001', 'admin33@prueba.local'),
  ('33b00000-0000-0000-0000-000000000002', 'Mecanico Parqueo', 'mecanico', '33000000-0000-0000-0000-000000000001', 'mecanico33@prueba.local');

INSERT INTO clientes (id, sede_id, nombre, telefono, email, direccion) VALUES
  ('33c00000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', 'Cliente Parqueo', '+15553301', 'cli33@prueba.local', 'Ave 33');

INSERT INTO vehiculos (id, cliente_id, marca, modelo, anio, vin, placa, color) VALUES
  ('33d00000-0000-0000-0000-000000000001', '33c00000-0000-0000-0000-000000000001', 'Toyota', 'Corolla', 2021, '1HGCR2F83HA003301', 'PRQ-33', 'Gris');

CREATE TEMP TABLE t_orden (k text primary key, id uuid);
GRANT ALL ON t_orden TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '33a00000-0000-0000-0000-000000000001';

-- 11. Módulo apagado: orden nace con parqueo inactivo
DO $$
DECLARE
  v_o ordenes_trabajo;
BEGIN
  v_o := create_work_order(jsonb_build_object(
    'sede_id', '33000000-0000-0000-0000-000000000001',
    'cliente_id', '33c00000-0000-0000-0000-000000000001',
    'vehiculo_id', '33d00000-0000-0000-0000-000000000001',
    'tipo_trabajo', 'mecanica',
    'millas_ingreso', 50000,
    'nivel_gasolina', '1/2',
    'inspeccion_360_notas', 'Sin detalles',
    'fecha_estimada_entrega', (((now() AT TIME ZONE 'America/New_York')::date) + 5)::text,
    'con_seguro', true,
    'creado_por', '33a00000-0000-0000-0000-000000000001'
  ));
  INSERT INTO t_orden VALUES ('seguro', v_o.id);
  UPDATE ordenes_trabajo
  SET fecha_ingreso = (((now() AT TIME ZONE 'America/New_York')::date) - 5)::timestamp
  WHERE id = v_o.id;
END;
$$;

SELECT is(
  (SELECT estado FROM orden_parqueo WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro')),
  'inactivo',
  '12. Con módulo apagado el estado es inactivo y monto 0'
);

-- 13. guardar_config_parqueo rechaza perfil habilitado con tarifa 0 en tramo 1
SELECT throws_ok(
  $$
    SELECT public.guardar_config_parqueo('33000000-0000-0000-0000-000000000001', jsonb_build_object(
      'habilitado', true,
      'perfiles', jsonb_build_object(
        'seguro', jsonb_build_object('habilitado', true, 'evento_inicio', 'ingreso', 'cobra_dia_evento', true, 'dias_gracia', 0, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 0))),
        'particular', jsonb_build_object('habilitado', true, 'evento_inicio', 'lista_para_entregar', 'cobra_dia_evento', false, 'dias_gracia', 2, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 20)))
      )
    ))
  $$,
  '22023',
  NULL,
  '13. Rechaza perfil habilitado con tarifa 0'
);

-- 14. Guardar configuración válida y verificar que orden con seguro acumula. El módulo se
-- enciende con "vigente desde" hoy: una fecha pasada se rechaza (ver 31 y 32).
DO $$
BEGIN
  PERFORM public.guardar_config_parqueo('33000000-0000-0000-0000-000000000001', jsonb_build_object(
    'habilitado', true,
    'vigente_desde', ((now() AT TIME ZONE 'America/New_York')::date)::text,
    'incluir_ordenes_previas', true,
    'perfiles', jsonb_build_object(
      'seguro', jsonb_build_object('habilitado', true, 'evento_inicio', 'ingreso', 'cobra_dia_evento', true, 'dias_gracia', 0, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 40))),
      'particular', jsonb_build_object('habilitado', true, 'evento_inicio', 'lista_para_entregar', 'cobra_dia_evento', false, 'dias_gracia', 2, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 25)))
    )
  ));
END;
$$;

SELECT is(
  (SELECT estado FROM orden_parqueo WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro')),
  'acumulando',
  '14. Orden con seguro pasa a acumulando tras habilitar módulo'
);

-- 15. Orden particular sin marcar lista queda en 'esperando'
DO $$
DECLARE
  v_o ordenes_trabajo;
BEGIN
  v_o := create_work_order(jsonb_build_object(
    'sede_id', '33000000-0000-0000-0000-000000000001',
    'cliente_id', '33c00000-0000-0000-0000-000000000001',
    'vehiculo_id', '33d00000-0000-0000-0000-000000000001',
    'tipo_trabajo', 'mecanica',
    'millas_ingreso', 30000,
    'nivel_gasolina', 'full',
    'inspeccion_360_notas', 'Sin detalles',
    'fecha_estimada_entrega', (((now() AT TIME ZONE 'America/New_York')::date) + 5)::text,
    'con_seguro', false,
    'creado_por', '33a00000-0000-0000-0000-000000000001'
  ));
  INSERT INTO t_orden VALUES ('particular', v_o.id);
END;
$$;

SELECT is(
  (SELECT estado FROM orden_parqueo WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'particular')),
  'esperando',
  '15. Orden particular sin marcar lista queda en esperando'
);

-- 16. Marcar lista la orden particular la pone en 'por_empezar' (dentro de los 2 días de gracia)
DO $$
BEGIN
  UPDATE ordenes_trabajo SET estatus = 'finalizado' WHERE id = (SELECT id FROM t_orden WHERE k = 'particular');
  PERFORM public.marcar_lista_para_entregar((SELECT id FROM t_orden WHERE k = 'particular'));
END;
$$;

SELECT is(
  (SELECT estado FROM orden_parqueo WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'particular')),
  'por_empezar',
  '16. Orden particular recién marcada lista queda en por_empezar'
);

-- 17. Ajustar cobrar = false deja la orden en 'sin_cobro' y total_general resta el parqueo
DO $$
BEGIN
  PERFORM public.ajustar_parqueo_orden((SELECT id FROM t_orden WHERE k = 'seguro'), jsonb_build_object('cobrar', false));
END;
$$;

SELECT is(
  (SELECT estado FROM orden_parqueo WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro')),
  'sin_cobro',
  '17. Desactivar cobrar deja la orden en sin_cobro'
);

-- 18. Orden previa a vigente_desde
DO $$
BEGIN
  -- Reactivar cobro en orden seguro
  PERFORM public.ajustar_parqueo_orden((SELECT id FROM t_orden WHERE k = 'seguro'), jsonb_build_object('cobrar', true));
  -- Modificar config para que vigente_desde sea hoy y no incluya previas
  PERFORM public.guardar_config_parqueo('33000000-0000-0000-0000-000000000001', jsonb_build_object(
    'habilitado', true,
    'vigente_desde', ((now() AT TIME ZONE 'America/New_York')::date)::text,
    'incluir_ordenes_previas', false,
    'perfiles', jsonb_build_object(
      'seguro', jsonb_build_object('habilitado', true, 'evento_inicio', 'ingreso', 'cobra_dia_evento', true, 'dias_gracia', 0, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 40))),
      'particular', jsonb_build_object('habilitado', true, 'evento_inicio', 'lista_para_entregar', 'cobra_dia_evento', false, 'dias_gracia', 2, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 25)))
    )
  ));
END;
$$;

SELECT is(
  (SELECT estado FROM orden_parqueo WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro')),
  'orden_previa',
  '18. Orden anterior a vigente_desde queda en orden_previa'
);

-- 19. total_general incluye mano de obra + repuestos - descuento + parqueo
DO $$
BEGIN
  -- Habilitar incluir_ordenes_previas (la orden ingresó hace 5 días: cobra desde hoy)
  PERFORM public.guardar_config_parqueo('33000000-0000-0000-0000-000000000001', jsonb_build_object(
    'habilitado', true,
    'vigente_desde', ((now() AT TIME ZONE 'America/New_York')::date)::text,
    'incluir_ordenes_previas', true,
    'perfiles', jsonb_build_object(
      'seguro', jsonb_build_object('habilitado', true, 'evento_inicio', 'ingreso', 'cobra_dia_evento', true, 'dias_gracia', 0, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 40))),
      'particular', jsonb_build_object('habilitado', true, 'evento_inicio', 'lista_para_entregar', 'cobra_dia_evento', false, 'dias_gracia', 2, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 25)))
    )
  ));
  -- Agregar labor aprobada de $100 con su mecánico: al entregar genera su comisión (por tarea,
  -- como las crea la app desde 20261010000006; quien recibe la tarea entra solo a la orden).
  PERFORM set_config('restorify.presupuesto', 'on', true);
  INSERT INTO orden_labor (orden_id, descripcion, costo, especialidad, estado, asignado_a)
  VALUES ((SELECT id FROM t_orden WHERE k = 'seguro'), 'Labor QA', 100, 'mecanica', 'aprobado',
          '33b00000-0000-0000-0000-000000000002');
END;
$$;

SELECT is(
  (SELECT total_general FROM orden_montos WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro')),
  (100 + (SELECT monto FROM orden_parqueo WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro'))),
  '19. total_general suma labor + repuestos + parqueo'
);

-- 20. Descuento máximo permitido no descuenta parqueo (solo labor + repuestos)
SELECT throws_ok(
  format(
    $$ SELECT public.aplicar_descuento('%s'::uuid, 150, 'Descuento excesivo') $$,
    (SELECT id FROM t_orden WHERE k = 'seguro')
  ),
  '22023',
  NULL,
  '20. Descuento no puede superar subtotal de labor y repuestos ($100)'
);

-- 21. entregar_orden cobra el saldo con el parqueo: el pago final es la mano de obra más el
-- parqueo contado hasta hoy (no hay depósito), y el parqueo queda cerrado.
DO $$
BEGIN
  PERFORM public.entregar_orden((SELECT id FROM t_orden WHERE k = 'seguro'), 'efectivo');
END;
$$;

SELECT is(
  (SELECT estado FROM orden_parqueo WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro')),
  'cerrado',
  '21a. Al entregar la orden el parqueo queda en estado cerrado'
);

SELECT is(
  (SELECT monto FROM orden_parqueo WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro')),
  40.00,
  '21b. Con seguro y vigente desde hoy, un día de parqueo: $40'
);

SELECT is(
  (SELECT monto FROM finanzas_movimientos
   WHERE referencia_orden_id = (SELECT id FROM t_orden WHERE k = 'seguro') AND descripcion LIKE 'Pago final%'),
  140.00,
  '21c. El pago final de la entrega lleva la mano de obra ($100) más el parqueo ($40)'
);

-- 22. Congelado: fin_congelado es el día de la entrega, y contar días después no cambia nada.
SELECT is(
  (SELECT fin_congelado FROM orden_parqueo WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro')),
  ((now() AT TIME ZONE 'America/New_York')::date),
  '22a. fin_congelado quedó fijado en el día de la entrega'
);

RESET ROLE;
SELECT is(
  (public._parqueo_calcular(
     (SELECT id FROM t_orden WHERE k = 'seguro'),
     ((now() AT TIME ZONE 'America/New_York')::date) + 5
   )->>'monto')::numeric,
  40.00,
  '22b. Contar cinco días después no cambia el parqueo de una orden entregada'
);
SET LOCAL ROLE authenticated;

-- 23. Sacar de entregado descongela fin_congelado
DO $$
BEGIN
  UPDATE ordenes_trabajo SET estatus = 'en_proceso' WHERE id = (SELECT id FROM t_orden WHERE k = 'seguro');
END;
$$;

SELECT is(
  (SELECT fin_congelado FROM orden_parqueo WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro')),
  NULL,
  '23. Reabrir orden descongela el parqueo'
);

-- 24. Ajustar orden entregada asienta el ajuste en finanzas_movimientos
DO $$
BEGIN
  -- Re-entregar orden
  PERFORM public.entregar_orden((SELECT id FROM t_orden WHERE k = 'seguro'), 'efectivo');
  -- Ajustar tarifa manual para generar un delta
  PERFORM public.ajustar_parqueo_orden((SELECT id FROM t_orden WHERE k = 'seguro'), jsonb_build_object('tarifa_manual', 80));
END;
$$;

SELECT ok(
  EXISTS (
    SELECT 1 FROM finanzas_movimientos
    WHERE referencia_orden_id = (SELECT id FROM t_orden WHERE k = 'seguro')
      AND descripcion LIKE 'Ajuste por cargo adicional%'
  ),
  '24. Ajustar parqueo en orden entregada registra movimiento financiero'
);

-- 25. saldo_retiro incluye parqueo
SELECT is(
  ((public.saldo_retiro((SELECT id FROM t_orden WHERE k = 'seguro'), 0, '{}'))->>'parqueo')::numeric,
  (SELECT monto FROM orden_parqueo WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro')),
  '25. saldo_retiro incluye el campo y monto de parqueo'
);

-- 26. datos_portal: el desglose del parqueo y el total con el parqueo, como los guarda la base.
RESET ROLE;
CREATE TEMP TABLE t_portal33 AS
SELECT public.datos_portal((
  SELECT token FROM orden_enlaces
  WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro') AND revocado_en IS NULL
  LIMIT 1
)) AS d;

SELECT is(
  (SELECT (d->'cuenta'->'parqueo'->>'monto')::numeric FROM t_portal33),
  (SELECT monto FROM orden_parqueo WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro')),
  '26a. datos_portal manda el parqueo en la cuenta'
);

SELECT is(
  (SELECT (d->'cuenta'->>'total')::numeric FROM t_portal33),
  (SELECT total_general FROM orden_montos WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro')),
  '26b. El total del portal ya trae el parqueo'
);

-- 27. RLS: Técnico lee 0 filas de tablas de parqueo
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '33b00000-0000-0000-0000-000000000002';

SELECT is(
  (SELECT COUNT(*) FROM parqueo_config),
  0::bigint,
  '27. Técnico lee 0 filas de parqueo_config'
);

-- 28. Técnico no puede llamar guardar_config_parqueo (42501)
SELECT throws_ok(
  $$
    SELECT public.guardar_config_parqueo('33000000-0000-0000-0000-000000000001', '{}'::jsonb)
  $$,
  '42501',
  NULL,
  '28. Técnico denegado al llamar guardar_config_parqueo'
);

-- 29. Las comisiones salen de la mano de obra, nunca del parqueo: cambiar el parqueo de una
-- orden entregada mueve su total pero no sus comisiones.
SET LOCAL request.jwt.claim.sub = '33a00000-0000-0000-0000-000000000001';

DO $$
DECLARE
  v_com   NUMERIC;
  v_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(monto), 0) INTO v_com
  FROM comisiones WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro');
  SELECT total_general INTO v_total
  FROM orden_montos WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro');
  PERFORM set_config('t33.comision_antes', v_com::text, true);
  PERFORM set_config('t33.total_antes', v_total::text, true);
  PERFORM public.ajustar_parqueo_orden((SELECT id FROM t_orden WHERE k = 'seguro'), jsonb_build_object('tarifa_manual', 150));
END;
$$;

SELECT ok(
  current_setting('t33.comision_antes')::numeric > 0,
  '29a. La orden entregada tiene comisión (hay un mecánico asignado)'
);

SELECT is(
  (SELECT COALESCE(SUM(monto), 0) FROM comisiones WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro')),
  current_setting('t33.comision_antes')::numeric,
  '29b. Cambiar el parqueo de la orden no mueve sus comisiones'
);

SELECT isnt(
  (SELECT total_general FROM orden_montos WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'seguro')),
  current_setting('t33.total_antes')::numeric,
  '29c. … aunque el total de la orden sí cambió'
);

-- 30. Una orden entregada antes de este módulo (sin fila en orden_parqueo, sin fin_congelado)
-- nunca se vuelve a contar. Antes, abrirla con el módulo encendido le cargaba el parqueo hasta
-- hoy y asentaba un "cargo adicional" que nadie pagó (auditoría del 10/10/2026).
DO $$
DECLARE
  v_o ordenes_trabajo;
BEGIN
  v_o := create_work_order(jsonb_build_object(
    'sede_id', '33000000-0000-0000-0000-000000000001',
    'cliente_id', '33c00000-0000-0000-0000-000000000001',
    'vehiculo_id', '33d00000-0000-0000-0000-000000000001',
    'tipo_trabajo', 'mecanica',
    'millas_ingreso', 40000,
    'nivel_gasolina', 'full',
    'inspeccion_360_notas', 'Orden vieja',
    'fecha_estimada_entrega', ((now() AT TIME ZONE 'America/New_York')::date)::text,
    'con_seguro', true,
    'creado_por', '33a00000-0000-0000-0000-000000000001'
  ));
  INSERT INTO t_orden VALUES ('vieja', v_o.id);
  PERFORM set_config('restorify.presupuesto', 'on', true);
  INSERT INTO orden_labor (orden_id, descripcion, costo, especialidad, estado)
  VALUES (v_o.id, 'Labor vieja', 100, 'mecanica', 'aprobado');
  -- Se entrega sin parqueo, como se entregaba antes de este módulo.
  PERFORM public.ajustar_parqueo_orden(v_o.id, jsonb_build_object('cobrar', false));
  PERFORM public.entregar_orden(v_o.id, 'efectivo');
END;
$$;

RESET ROLE;
-- Así queda una orden entregada antes de la migración: llegó hace 20 días y no tiene fila.
UPDATE ordenes_trabajo
SET fecha_ingreso = now() - interval '20 days'
WHERE id = (SELECT id FROM t_orden WHERE k = 'vieja');
DELETE FROM orden_parqueo WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'vieja');
SET LOCAL ROLE authenticated;

SELECT is(
  (public.parqueo_de_orden((SELECT id FROM t_orden WHERE k = 'vieja'))->>'monto')::numeric,
  0::numeric,
  '30a. Abrir una orden entregada antes del módulo no le cuenta parqueo'
);

SELECT is(
  (public.ajustar_parqueo_orden((SELECT id FROM t_orden WHERE k = 'vieja'), jsonb_build_object('nota', 'revisión'))->>'monto')::numeric,
  0::numeric,
  '30b. Tampoco al ajustarla: se queda con lo guardado'
);

SELECT is(
  (SELECT total_general FROM orden_montos WHERE orden_id = (SELECT id FROM t_orden WHERE k = 'vieja')),
  100.00,
  '30c. Su total sigue siendo lo que se cobró'
);

SELECT is(
  (SELECT COUNT(*) FROM finanzas_movimientos
   WHERE referencia_orden_id = (SELECT id FROM t_orden WHERE k = 'vieja')
     AND (descripcion LIKE 'Ajuste por%' OR descripcion LIKE 'Reembolso por ajuste%')),
  0::bigint,
  '30d. No se asienta ningún ajuste de cobro'
);

-- 31. "Vigente desde" no va hacia atrás: con el cobro encendido desde hoy, ponerlo ayer se rechaza.
SELECT throws_ok(
  $$
    SELECT public.guardar_config_parqueo('33000000-0000-0000-0000-000000000001', jsonb_build_object(
      'habilitado', true,
      'vigente_desde', (((now() AT TIME ZONE 'America/New_York')::date) - 1)::text,
      'incluir_ordenes_previas', true,
      'perfiles', jsonb_build_object(
        'seguro', jsonb_build_object('habilitado', true, 'evento_inicio', 'ingreso', 'cobra_dia_evento', true, 'dias_gracia', 0, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 40))),
        'particular', jsonb_build_object('habilitado', true, 'evento_inicio', 'lista_para_entregar', 'cobra_dia_evento', false, 'dias_gracia', 2, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 25)))
      )
    ))
  $$,
  '22023',
  NULL,
  '31. Con el cobro encendido, "vigente desde" no se mueve hacia atrás'
);

-- 32. Encender el cobro con una fecha pasada se rechaza (otra sede, sin configuración).
RESET ROLE;
INSERT INTO sedes (id, nombre, direccion, telefono, zona_horaria) VALUES
  ('33000000-0000-0000-0000-000000000002', 'Sede Parqueo QA 2', 'Calle 34', '555-3400', 'America/New_York');
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.guardar_config_parqueo('33000000-0000-0000-0000-000000000002', jsonb_build_object(
      'habilitado', true,
      'vigente_desde', (((now() AT TIME ZONE 'America/New_York')::date) - 3)::text,
      'perfiles', jsonb_build_object(
        'seguro', jsonb_build_object('habilitado', true, 'evento_inicio', 'ingreso', 'cobra_dia_evento', true, 'dias_gracia', 0, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 40))),
        'particular', jsonb_build_object('habilitado', true, 'evento_inicio', 'lista_para_entregar', 'cobra_dia_evento', false, 'dias_gracia', 2, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 25)))
      )
    ))
  $$,
  '22023',
  NULL,
  '32. Encender el cobro con "vigente desde" en el pasado se rechaza'
);

-- 33–34. Tramos inválidos: el primero no empieza en el día 1, o se repite un día.
SELECT throws_ok(
  $$
    SELECT public.guardar_config_parqueo('33000000-0000-0000-0000-000000000002', jsonb_build_object(
      'habilitado', false,
      'perfiles', jsonb_build_object(
        'seguro', jsonb_build_object('habilitado', true, 'evento_inicio', 'ingreso', 'cobra_dia_evento', true, 'dias_gracia', 0, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 2, 'tarifa_diaria', 40))),
        'particular', jsonb_build_object('habilitado', true, 'evento_inicio', 'lista_para_entregar', 'cobra_dia_evento', false, 'dias_gracia', 2, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 25)))
      )
    ))
  $$,
  '22023',
  NULL,
  '33. Un primer tramo que no empieza en el día 1 se rechaza'
);

SELECT throws_ok(
  $$
    SELECT public.guardar_config_parqueo('33000000-0000-0000-0000-000000000002', jsonb_build_object(
      'habilitado', false,
      'perfiles', jsonb_build_object(
        'seguro', jsonb_build_object('habilitado', true, 'evento_inicio', 'ingreso', 'cobra_dia_evento', true, 'dias_gracia', 0, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 40), jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 60))),
        'particular', jsonb_build_object('habilitado', true, 'evento_inicio', 'lista_para_entregar', 'cobra_dia_evento', false, 'dias_gracia', 2, 'tramos', jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', 25)))
      )
    ))
  $$,
  '22023',
  NULL,
  '34. Dos tramos que empiezan el mismo día se rechazan'
);

-- 35. Sin sesión no se pide la configuración del parqueo.
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.parqueo_config_sede('33000000-0000-0000-0000-000000000001') $$,
  '42501',
  NULL,
  '35. Sin sesión no se pide la configuración del parqueo'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
