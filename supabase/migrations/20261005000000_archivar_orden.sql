-- ------------------------------------------------------------------------------------
-- Archivar una orden entregada a mano
-- ------------------------------------------------------------------------------------
-- Pedido del taller: "cuando una orden ya está entregada no me aparece la opción de
-- archivarla". Hasta hoy el archivo era solo automático — `getWorkOrders` deja fuera las
-- entregadas de más de 90 días — así que una orden recién entregada se quedaba tres meses en
-- la columna "Entregado" del tablero, y en el teléfono esa columna es una lista que crece.
--
-- Ahora un admin puede mandarla al archivo en cuanto la entrega. Los 90 días siguen como
-- respaldo para las que nadie archiva.
--
-- Una columna y no un estado nuevo: archivar no es una etapa del trabajo, es sacar la orden
-- de la vista. Un valor más en `order_status` habría obligado a tocar cada lugar que pregunta
-- `estatus = 'entregado'` — el cobro, las comisiones, el portal, el resumen del panel — y una
-- orden archivada sigue estando entregada para todos ellos.
--
-- Quién puede: el admin. Nadie más necesita nada nuevo para que así sea:
--   * `trg_guard_order_technician` ya no deja a un técnico tocar una orden entregada, y
--     además `to_jsonb(NEW) - v_permitidas` protege sola cualquier columna nueva.
--   * La RLS de UPDATE de `ordenes_trabajo` ya es la de siempre.
-- Archivar no mueve dinero: ninguno de los triggers de cobro ni de comisiones mira esta
-- columna.

ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS archivada_en TIMESTAMPTZ;

-- Solo lo entregado se archiva. Sin esto, una orden en proceso archivada desaparecería de las
-- dos listas: el tablero la excluye por archivada y el archivo solo muestra entregadas.
ALTER TABLE ordenes_trabajo
  ADD CONSTRAINT ordenes_trabajo_archivada_solo_entregada
  CHECK (archivada_en IS NULL OR estatus = 'entregado');

-- Y por el mismo motivo, sacar una orden de "Entregado" la desarchiva. Se corrige en vez de
-- rechazar: quien la reabre está corrigiendo una entrega, no pensando en el archivo, y un
-- error del CHECK ahí sería un obstáculo sin sentido.
CREATE OR REPLACE FUNCTION public.trg_desarchivar_al_reabrir()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.estatus IS DISTINCT FROM 'entregado' THEN
    NEW.archivada_en := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Solo la llama su trigger.
REVOKE ALL ON FUNCTION public.trg_desarchivar_al_reabrir() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_order_unarchive_on_reopen ON ordenes_trabajo;
CREATE TRIGGER trg_order_unarchive_on_reopen
  BEFORE UPDATE OF estatus ON ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.trg_desarchivar_al_reabrir();
