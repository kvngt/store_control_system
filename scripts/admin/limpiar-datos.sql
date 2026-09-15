-- =====================================================================================
-- Dejar la plataforma limpia: sin datos de operación y sin usuarios de prueba
-- =====================================================================================
-- IRREVERSIBLE si se confirma. En el plan Free no hay respaldo del que volver.
--
-- Qué borra:  clientes, vehículos, órdenes (y sus líneas, montos, asignaciones, avances,
--             multimedia, enlaces y presupuestos), movimientos e importaciones de
--             Finanzas, comisiones y pagos, notificaciones, cola de correos y push,
--             suscripciones push, contadores de folio (la próxima orden vuelve a -001),
--             y todas las cuentas que NO estén en la lista de abajo.
-- Qué deja:   las cuentas de la lista (con su perfil), las sedes y sus logos, las reglas
--             de categorización bancaria, la estructura y la configuración.
-- Qué NO puede borrar: los archivos de Storage (Supabase lo impide por SQL). Después,
--             en el panel → Storage, vaciar los buckets `orden_media`, `firmas`,
--             `reportes`, `comprobantes`, `estados_cuenta_bancarios`, `vehiculos_fotos`
--             y, de `avatares`, las carpetas de las cuentas borradas.
--
-- Cómo usarlo (panel → SQL Editor, o `npx supabase db query --linked -f` con permiso):
--   1. Escribe en la lista los correos que se quedan. Al menos un administrador.
--   2. Córrelo tal cual: termina en ROLLBACK, así que solo muestra el resumen.
--   3. Si el resumen es el esperado, cambia el ROLLBACK final por COMMIT y córrelo otra vez.
-- Probado contra el Supabase local con las 36 migraciones.
-- =====================================================================================
BEGIN;

CREATE TEMP TABLE conservar (email TEXT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO conservar (email) VALUES
  ('CAMBIAR-por-el-correo-del-admin@ejemplo.com');

-- Sin un administrador que se quede, nadie podría volver a entrar ni crear cuentas
-- (el registro público está apagado). Se detiene antes de borrar nada.
DO $$
DECLARE
  v_faltan TEXT;
BEGIN
  SELECT string_agg(c.email, ', ') INTO v_faltan
  FROM conservar c
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = lower(c.email));
  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Estos correos no tienen cuenta: %. Corrige la lista. No se borró nada.', v_faltan;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    JOIN perfiles p ON p.id = u.id
    JOIN conservar c ON lower(c.email) = lower(u.email)
    WHERE p.rol = 'admin'
  ) THEN
    RAISE EXCEPTION 'Ninguna cuenta de la lista es administrador. Sin uno nadie podría entrar. No se borró nada.';
  END IF;
END $$;

-- Lo que hay antes, para el resumen.
CREATE TEMP TABLE antes ON COMMIT DROP AS
SELECT
  (SELECT COUNT(*) FROM auth.users)          AS usuarios,
  (SELECT COUNT(*) FROM ordenes_trabajo)     AS ordenes,
  (SELECT COUNT(*) FROM clientes)            AS clientes,
  (SELECT COUNT(*) FROM finanzas_movimientos) AS movimientos,
  (SELECT COUNT(*) FROM comisiones)          AS comisiones;

-- Datos de operación. TRUNCATE no dispara los triggers de dinero ni de avisos: nada
-- intenta revertir cobros ni mandar correos por lo que se borra. Si alguna tabla nueva
-- apunta a estas, TRUNCATE falla y no borra nada: agrégala a la lista.
TRUNCATE
  orden_montos, orden_labor, orden_repuestos, orden_asignaciones, orden_avances,
  orden_media, orden_enlaces, presupuestos, comisiones, comision_pagos,
  finanzas_movimientos, finanzas_importaciones, notificaciones, cola_envios,
  push_suscripciones, ordenes_trabajo, vehiculos, clientes, numero_orden_contadores;

-- Cuentas. El perfil se va en cascada con la cuenta de Auth. También quita los perfiles
-- de demostración que dejó la migración inicial (cuentas sin contraseña).
DELETE FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM conservar c WHERE lower(c.email) = lower(u.email));
DELETE FROM perfiles p WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);

-- Opcional: las dos sedes de demostración ("El Arca Auto Body - Main" y "- Branch") que
-- dejó la migración `20240101000002_seed`. Quita los comentarios para borrarlas. Si no
-- queda ninguna otra sede, crea una y mueve ahí a quien se conserva (renómbrala después
-- desde Configuración → Sedes): `perfiles.sede_id` no admite vacío.
/*
DO $$
DECLARE
  v_demo UUID[] := ARRAY['b87f11ea-011f-4726-b160-10d8ebd60337','b2530f41-0f27-4ad5-8b61-aad9d5b98810']::UUID[];
  v_sede UUID;
BEGIN
  SELECT id INTO v_sede FROM sedes WHERE NOT (id = ANY(v_demo))
  ORDER BY fecha_creacion NULLS LAST, nombre LIMIT 1;

  IF v_sede IS NULL THEN
    INSERT INTO sedes (nombre, direccion, telefono) VALUES ('Taller principal', '', '')
    RETURNING id INTO v_sede;
  END IF;

  UPDATE perfiles SET sede_id = v_sede WHERE sede_id = ANY(v_demo);
  DELETE FROM sedes WHERE id = ANY(v_demo);
END $$;
*/

-- Resumen: antes → después.
SELECT 'usuarios' AS que, a.usuarios AS antes, (SELECT COUNT(*) FROM auth.users) AS despues FROM antes a
UNION ALL SELECT 'órdenes', a.ordenes, (SELECT COUNT(*) FROM ordenes_trabajo) FROM antes a
UNION ALL SELECT 'clientes', a.clientes, (SELECT COUNT(*) FROM clientes) FROM antes a
UNION ALL SELECT 'movimientos', a.movimientos, (SELECT COUNT(*) FROM finanzas_movimientos) FROM antes a
UNION ALL SELECT 'comisiones', a.comisiones, (SELECT COUNT(*) FROM comisiones) FROM antes a
UNION ALL SELECT 'sedes (se conservan)', NULL, (SELECT COUNT(*) FROM sedes);

SELECT u.email, p.nombre_completo, p.rol, s.nombre AS sede
FROM auth.users u
LEFT JOIN perfiles p ON p.id = u.id
LEFT JOIN sedes s ON s.id = p.sede_id
ORDER BY u.email;

-- Cambiar por COMMIT solo después de revisar el resumen.
ROLLBACK;
