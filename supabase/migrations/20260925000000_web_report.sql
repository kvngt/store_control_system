-- ====================================================================================
-- RESTORIFY — Fase 6: el reporte es el enlace web, no un PDF subido
-- ====================================================================================
-- Hasta aquí "Generar y enviar" armaba un PDF en el navegador, lo subía al bucket
-- `reportes` y compartía un enlace firmado de 30 días por WhatsApp o por el correo
-- del admin. El pedido del cliente: que el reporte sea una vista web con videos,
-- imágenes y audio, enviada solo por administración o por el sistema.
--
-- Eso ya existe desde la fase 4 (el portal del cliente). Esta migración:
--   1. Agrega el correo "reporte": un admin lo manda desde la app y sale por Resend,
--      con el nombre del taller y el enlace personal del cliente.
--   2. Cierra la escritura del bucket `reportes`: la app ya no sube PDFs. Lo que
--      quedó ahí se puede leer y borrar (solo admin), para no perder nada.
--
-- El PDF sigue existiendo, pero se genera y se descarga en el navegador para
-- imprimir o archivar: no se sube a ningún lado.
-- ====================================================================================


-- ------------------------------------------------------------------------------------
-- 1. "Enviar reporte por correo"
-- ------------------------------------------------------------------------------------
-- Un minuto de espera con clave única: dos toques seguidos son un solo correo. El
-- enlace se crea si la orden todavía no tiene uno (una orden sin firma, por ejemplo).
CREATE OR REPLACE FUNCTION public.enviar_reporte_cliente(p_orden_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enlace orden_enlaces;
  v_id     UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede enviar el reporte al cliente.' USING ERRCODE = '42501';
  END IF;

  v_enlace := public.asegurar_enlace_orden(p_orden_id);
  v_id := public.encolar_correo_cliente(p_orden_id, 'reporte', '{}'::jsonb, 'reporte:' || p_orden_id, INTERVAL '1 minute');

  RETURN jsonb_build_object(
    'correo', CASE WHEN v_id IS NULL THEN 'sin_correo' ELSE 'encolado' END,
    'token', v_enlace.token
  );
END;
$$;

REVOKE ALL ON FUNCTION public.enviar_reporte_cliente(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enviar_reporte_cliente(UUID) TO authenticated;


-- ------------------------------------------------------------------------------------
-- 2. El bucket `reportes` ya no recibe archivos
-- ------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "reportes_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "reportes_admin_update" ON storage.objects;
-- Se conservan reportes_admin_select y reportes_admin_delete: un admin puede
-- descargar o borrar los PDF que se compartieron antes de este cambio.
