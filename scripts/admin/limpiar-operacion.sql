-- =====================================================================================
-- Dejar la interfaz limpia conservando TODOS los usuarios
-- =====================================================================================
-- IRREVERSIBLE. Antes, revisa que haya un respaldo reciente (panel → Database → Backups).
--
-- Qué borra:  órdenes (con sus líneas, montos, asignaciones, avances, hallazgos,
--             multimedia, enlaces, presupuestos e historial), clientes, vehículos,
--             movimientos e importaciones de Finanzas, comisiones y sus pagos, avisos,
--             correos pendientes, traducciones guardadas y los contadores de folio (la
--             próxima orden vuelve a -001).
-- Qué deja:   todas las cuentas con su perfil, su pago (`perfiles_pago`) y sus
--             suscripciones push; las sedes y sus logos; las reglas de categorización
--             bancaria; la estructura y la configuración.
-- Qué NO borra: los archivos de Storage (Supabase no deja borrarlos por SQL). Para eso,
--             `scripts/admin/vaciar-storage.mjs`.
--
-- Diferencia con `limpiar-datos.sql`: aquel deja solo las cuentas de una lista; este no
-- toca ninguna cuenta.
--
-- Cómo usarlo:
--   npx supabase db query --linked -f scripts/admin/limpiar-operacion.sql
-- o pegarlo en el panel → SQL Editor. Es una sola instrucción a propósito: `db query` no
-- acepta varias, y un TRUNCATE de varias tablas se aplica entero o no se aplica.
-- Para ver lo que hay antes y después:
--   npx supabase db query --linked "SELECT (SELECT COUNT(*) FROM auth.users) AS usuarios,
--     (SELECT COUNT(*) FROM ordenes_trabajo) AS ordenes, (SELECT COUNT(*) FROM clientes) AS clientes,
--     (SELECT COUNT(*) FROM vehiculos) AS vehiculos"
-- Probado contra el Supabase local con 77 migraciones (07/10/2026).
-- =====================================================================================

-- TRUNCATE no dispara los triggers de dinero ni de avisos: nada intenta revertir cobros
-- ni mandar correos por lo que se borra. Si una tabla nueva apunta a estas, TRUNCATE
-- falla y no borra nada: agrégala a la lista.
TRUNCATE
  orden_montos, orden_labor, orden_repuestos, orden_asignaciones, orden_avances,
  orden_hallazgos, orden_media, orden_enlaces, presupuestos, historial_orden,
  comisiones, comision_pagos, finanzas_movimientos, finanzas_importaciones,
  notificaciones, cola_envios, traducciones,
  ordenes_trabajo, vehiculos, clientes, numero_orden_contadores;
