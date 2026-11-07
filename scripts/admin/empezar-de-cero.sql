-- =====================================================================================
-- Empezar de cero conservando las cuentas, los clientes y sus vehículos
-- =====================================================================================
-- IRREVERSIBLE. Antes, un respaldo del momento fuera del repositorio (lleva datos de
-- clientes): cada tabla de la lista con `SELECT json_agg(t) FROM <tabla> t` y los archivos
-- de `orden_media` con `supabase storage cp -r`. Así se hizo el 06/11/2026 (bitácora).
--
-- Se usó el 06/11/2026: el taller quiso empezar de nuevo cuando se fue su administradora.
-- Esa vez la lista llevaba también `vehiculos`; el taller los quiso de vuelta y se
-- devolvieron del respaldo. Por eso ya no está en la lista.
--
-- Qué borra:  las órdenes con todo lo que cuelga de ellas (líneas, montos, trabajos,
--             asignaciones, avances, hallazgos, multimedia, enlaces, presupuestos,
--             inspecciones, relojes, parqueo, próximo servicio e historial), Finanzas
--             (movimientos e importaciones), comisiones y sus pagos, avisos, correos en
--             cola, traducciones guardadas y el contador de folios (la próxima orden vuelve
--             a -001).
-- Qué deja:   las cuentas (`auth.users`, `perfiles`, `perfiles_pago`, push), los clientes y
--             sus vehículos, las sedes y su configuración (teléfonos, logo, parqueo, catálogo,
--             plantillas de inspección, reglas de categorización bancaria).
-- Qué NO borra: los archivos de Storage. Los de `orden_media` se borran aparte, por su ruta
--             exacta (`supabase storage rm ss:///orden_media/<ruta> ...`, la lista sale de
--             `storage.objects`), o con `vaciar-storage.mjs`. Nunca
--             `storage rm -r ss:///<bucket>`: borra también el bucket.
--
-- Diferencia con `limpiar-operacion.sql`: aquel también borra los clientes y los vehículos.
--
-- Cómo usarlo (una sola instrucción: un TRUNCATE de varias tablas se aplica entero o no):
--   npx -y supabase@3 db query --remote=<ref> --yes -f scripts/admin/empezar-de-cero.sql
-- TRUNCATE no dispara los triggers por fila: no se revierten cobros, no salen correos y no
-- frenan los guardias de órdenes entregadas o comisiones pagadas. Si una tabla nueva apunta
-- a una de estas, falla sin borrar nada: agrégala a la lista.
-- Para ensayarlo sin borrar, envuélvelo en `DO $$ BEGIN <TRUNCATE>; RAISE EXCEPTION
-- 'ensayo'; END $$;`: la excepción lo revierte.
-- =====================================================================================

TRUNCATE
  ordenes_trabajo, orden_montos, orden_labor, orden_repuestos, orden_trabajos, orden_asignaciones,
  orden_avances, orden_hallazgos, orden_media, orden_enlaces, presupuestos,
  orden_inspecciones, orden_inspeccion_puntos, orden_labor_tiempos, orden_parqueo,
  orden_proximo_servicio, historial_orden,
  comisiones, comision_pagos, finanzas_movimientos, finanzas_importaciones,
  notificaciones, cola_envios, traducciones, numero_orden_contadores;
