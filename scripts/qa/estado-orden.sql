-- =====================================================================================
-- Restorify — Todo lo que la base sabe de una orden, en una sola fila JSON
-- =====================================================================================
-- Solo lectura. Sirve para comprobar el "resultado esperado" de los casos del plan de
-- pruebas (docs/plan-de-pruebas.md) sin abrir cinco pantallas: dinero, líneas,
-- presupuestos, comisiones, enlace, correos, multimedia y avisos.
--
-- 1. Cambia el número de orden de la línea marcada con <<< .
-- 2. npx supabase db query --linked -f scripts/qa/estado-orden.sql
--
-- Si la orden no existe no devuelve filas.
-- =====================================================================================
WITH p AS (
  SELECT 'ORD-2026-001'::text AS numero   -- <<< número de orden
),
o AS (
  SELECT t.* FROM ordenes_trabajo t, p WHERE t.numero_orden = p.numero
)
SELECT jsonb_pretty(jsonb_build_object(
  'orden', (SELECT jsonb_build_object(
      'numero', o.numero_orden, 'estatus', o.estatus, 'avance', o.porcentaje_avance,
      'sede', (SELECT nombre FROM sedes WHERE id = o.sede_id),
      'cliente', (SELECT jsonb_build_object('nombre', c.nombre, 'email', c.email, 'acepta_correos', c.acepta_correos) FROM clientes c WHERE c.id = o.cliente_id),
      'firma_ruta', o.firma_ruta, 'fecha_finalizacion', o.fecha_finalizacion, 'creado_por', o.creado_por
    ) FROM o),
  'montos', (SELECT jsonb_build_object(
      'total_labor', o.total_labor, 'total_repuestos', m.total_repuestos,
      'total_general', m.total_general, 'deposito', m.deposito_inicial
    ) FROM o JOIN orden_montos m ON m.orden_id = o.id),
  'cobrado_al_cliente', (SELECT COALESCE(SUM(CASE WHEN f.tipo = 'ingreso' THEN f.monto ELSE -f.monto END), 0)
      FROM finanzas_movimientos f, o WHERE f.referencia_orden_id = o.id AND f.categoria = 'pago_cliente'),
  'costo_repuestos_asentado', (SELECT COALESCE(SUM(CASE WHEN f.tipo = 'egreso' THEN f.monto ELSE -f.monto END), 0)
      FROM finanzas_movimientos f, o WHERE f.referencia_orden_id = o.id AND f.categoria = 'compra_repuesto'),
  'movimientos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'fecha', f.fecha, 'tipo', f.tipo, 'categoria', f.categoria, 'monto', f.monto, 'descripcion', f.descripcion
    ) ORDER BY f.creado_en), '[]'::jsonb) FROM finanzas_movimientos f, o WHERE f.referencia_orden_id = o.id),
  'lineas', (SELECT COALESCE(jsonb_agg(l ORDER BY l->>'creado_en'), '[]'::jsonb) FROM (
      SELECT jsonb_build_object('tipo', 'mano_obra', 'descripcion', lb.descripcion, 'monto', lb.costo, 'estado', lb.estado, 'creado_en', lb.creado_en) AS l
      FROM orden_labor lb, o WHERE lb.orden_id = o.id
      UNION ALL
      SELECT jsonb_build_object('tipo', 'repuesto', 'descripcion', r.descripcion, 'cantidad', r.cantidad, 'monto', r.subtotal, 'estado', r.estado, 'creado_en', r.creado_en)
      FROM orden_repuestos r, o WHERE r.orden_id = o.id
    ) x),
  'presupuestos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'numero', pr.numero, 'estado', pr.estado, 'via', pr.respondido_via, 'nombre', pr.respondido_por_nombre,
      'total_propuesto', pr.total_propuesto, 'total_aprobado', pr.total_aprobado, 'comentario', pr.comentario_cliente
    ) ORDER BY pr.numero), '[]'::jsonb) FROM presupuestos pr, o WHERE pr.orden_id = o.id),
  'asignados', (SELECT COALESCE(jsonb_agg(pf.nombre_completo ORDER BY pf.nombre_completo), '[]'::jsonb)
      FROM orden_asignaciones a JOIN perfiles pf ON pf.id = a.usuario_id, o WHERE a.orden_id = o.id),
  'comisiones', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'tecnico', pf.nombre_completo, 'base', c.base_ganancia, 'porcentaje', c.porcentaje, 'monto', c.monto, 'pagada', c.pago_id IS NOT NULL
    ) ORDER BY pf.nombre_completo), '[]'::jsonb)
      FROM comisiones c JOIN perfiles pf ON pf.id = c.usuario_id, o WHERE c.orden_id = o.id),
  'enlace', (SELECT jsonb_build_object('activo', e.revocado_en IS NULL, 'expira_en', e.expira_en, 'accesos', e.accesos, 'ultimo_acceso', e.ultimo_acceso_en)
      FROM orden_enlaces e, o WHERE e.orden_id = o.id ORDER BY e.creado_en DESC LIMIT 1),
  'correos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'plantilla', q.plantilla, 'estado', q.estado, 'destinatario', q.destinatario, 'motivo', q.ultimo_error,
      'enviar_despues_de', q.enviar_despues_de, 'enviado_en', q.enviado_en
    ) ORDER BY q.creado_en), '[]'::jsonb) FROM cola_envios q, o WHERE q.orden_id = o.id AND q.canal = 'email'),
  'multimedia', (SELECT jsonb_build_object(
      'total', COUNT(*),
      'visibles_cliente', COUNT(*) FILTER (WHERE mm.visible_cliente),
      'fotos', COUNT(*) FILTER (WHERE mm.tipo = 'foto'),
      'videos', COUNT(*) FILTER (WHERE mm.tipo = 'video'),
      'audios', COUNT(*) FILTER (WHERE mm.tipo = 'audio')
    ) FROM orden_media mm, o WHERE mm.orden_id = o.id),
  'avisos', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'para', pf.nombre_completo, 'tipo', n.tipo, 'titulo', n.titulo, 'leido', n.leida_en IS NOT NULL
    ) ORDER BY n.creado_en), '[]'::jsonb)
      FROM notificaciones n JOIN perfiles pf ON pf.id = n.usuario_id, o WHERE n.orden_id = o.id)
)) AS estado
FROM p
WHERE EXISTS (SELECT 1 FROM o);
