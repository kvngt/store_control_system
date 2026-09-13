-- ====================================================================================
-- RESTORIFY — El bucket viejo de firmas deja de ser público
-- ====================================================================================
-- La migración 20260922000000 quitó la política de lectura sin rol del bucket
-- `firmas`, pero el bucket mismo seguía marcado como público. En un bucket público
-- Storage sirve cualquier archivo por su URL `/object/public/...` sin consultar
-- políticas, así que las firmas anteriores seguían descargables sin sesión.
--
-- La app ya no usa este bucket (las firmas viven en `orden_media`, privado). Con
-- esto solo un admin puede leer lo que quedó, vía la política firmas_admin_select.

UPDATE storage.buckets SET public = false WHERE id = 'firmas';
