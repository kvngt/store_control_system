-- ====================================================================================
-- RESTORIFY — Vaciar los datos de prueba
-- ====================================================================================
-- Deja la base limpia para una tanda nueva de pruebas, SIN perder el acceso:
-- las sedes, los usuarios y las reglas de categorización se conservan.
--
-- Cómo ejecutarlo, de cualquiera de las dos formas:
--   npx supabase db query --linked -f scripts/reset-test-data.sql
--   panel de Supabase → SQL Editor → pegar todo → Run.
--
-- ⚠️  Esto borra datos de forma irreversible. Está pensado para el entorno de
--     pruebas. NO lo ejecutes contra la base del taller en operación.
--
-- ------------------------------------------------------------------------------------
-- Qué se borra
--   clientes, vehículos, órdenes de trabajo (con su mano de obra, repuestos,
--   asignaciones y avances), movimientos financieros, importaciones de estados
--   de cuenta, comisiones acumuladas y sus pagos.
--
-- Qué se conserva y por qué
--   sedes ............................ sin ellas nadie puede entrar ni crear nada
--   perfiles / auth.users ............ son las cuentas con las que inicias sesión
--   finanzas_reglas_categorizacion ... son configuración (56 reglas), no datos
-- ------------------------------------------------------------------------------------

BEGIN;

-- El orden importa: las órdenes de trabajo referencian clientes y vehículos con
-- ON DELETE RESTRICT, así que las órdenes se van primero.

-- Los pagos de comisión van primero: su trigger de borrado elimina el egreso
-- que crearon en Finanzas, y referencian perfiles con ON DELETE RESTRICT, así
-- que ninguna cascada los recoge.
DELETE FROM comision_pagos;
DELETE FROM comisiones;

-- Los movimientos apuntan a las importaciones, así que van antes que ellas.
DELETE FROM finanzas_movimientos;
DELETE FROM finanzas_importaciones;

DELETE FROM orden_avances;

-- Al borrar la orden se van en cascada orden_labor, orden_repuestos y
-- orden_asignaciones.
DELETE FROM ordenes_trabajo;

-- Segunda pasada: los triggers del ciclo de vida de la orden (ajustes de pago,
-- costo de repuestos) pueden insertar movimientos mientras la orden se borra.
DELETE FROM finanzas_movimientos;

DELETE FROM vehiculos;
DELETE FROM clientes;

-- Reinicia la numeración para que la próxima orden vuelva a ser ORD-<año>-001.
DELETE FROM numero_orden_contadores;

COMMIT;

-- ------------------------------------------------------------------------------------
-- Comprobación: todo debe dar 0 salvo las tres últimas columnas.
-- ------------------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM clientes)                       AS clientes,
  (SELECT count(*) FROM vehiculos)                      AS vehiculos,
  (SELECT count(*) FROM ordenes_trabajo)                AS ordenes,
  (SELECT count(*) FROM orden_labor)                    AS labor,
  (SELECT count(*) FROM orden_repuestos)                AS repuestos,
  (SELECT count(*) FROM orden_asignaciones)             AS asignaciones,
  (SELECT count(*) FROM orden_avances)                  AS avances,
  (SELECT count(*) FROM finanzas_movimientos)           AS movimientos,
  (SELECT count(*) FROM finanzas_importaciones)         AS importaciones,
  (SELECT count(*) FROM comisiones)                     AS comisiones,
  (SELECT count(*) FROM comision_pagos)                 AS pagos_comision,
  -- Estas tres se conservan a propósito:
  (SELECT count(*) FROM sedes)                          AS sedes_conservadas,
  (SELECT count(*) FROM perfiles)                       AS usuarios_conservados,
  (SELECT count(*) FROM finanzas_reglas_categorizacion) AS reglas_conservadas;

-- ------------------------------------------------------------------------------------
-- Nota sobre los archivos subidos
-- ------------------------------------------------------------------------------------
-- Las fotos de inspección, las firmas y los PDF de estados de cuenta viven en
-- Storage, no en estas tablas, así que este script no los toca. Quedan
-- huérfanos (nada los referencia) y son inofensivos. Para vaciarlos también:
-- panel de Supabase → Storage → seleccionar los archivos de cada bucket
-- (vehiculos_fotos, firmas, estados_cuenta_bancarios) → eliminar.
--
-- Conviene hacerlo desde el panel y no por SQL: borrar filas de storage.objects
-- deja el archivo físico ocupando espacio sin forma de recuperarlo ni verlo.
