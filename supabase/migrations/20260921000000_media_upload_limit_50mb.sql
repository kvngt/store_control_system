-- ====================================================================================
-- RESTORIFY — Tope de 50 MB por archivo de multimedia
-- ====================================================================================
-- La migración 20260919000000 creó el bucket `orden_media` con 100 MB y pedía
-- subir a mano el límite GLOBAL de Storage del proyecto, que Supabase aplica antes
-- que el del bucket. En el plan Free ese límite global no puede pasar de 50 MB, así
-- que el paso manual era imposible y el bucket prometía algo que nunca iba a pasar.
--
-- 50 MB alcanza con margen: el navegador comprime antes de subir y un video de
-- 2 minutos a 720p pesa ~24 MB. Solo un video de galería que el teléfono no pudo
-- convertir se sube tal cual, y ese caso ya se rechaza en el cliente con un mensaje
-- que pide grabarlo desde la app (`MAX_UPLOAD_BYTES` en src/lib/media/constants.ts).
--
-- Con bucket y cliente en 50 MB no hace falta tocar ningún ajuste del panel, en
-- Free ni en Pro.

UPDATE storage.buckets
SET file_size_limit = 52428800 -- 50 MB
WHERE id = 'orden_media';
