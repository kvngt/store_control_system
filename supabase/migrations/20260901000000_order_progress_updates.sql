-- ====================================================================================
-- RESTORIFY — Order Progress Updates ("Agregar Avance")
-- ====================================================================================
-- Lets a mechanic/painter document progress on an assigned order over time —
-- a short note plus photos — separate from the one-time 360° intake photos.

CREATE TABLE orden_avances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  orden_id UUID REFERENCES ordenes_trabajo(id) ON DELETE CASCADE NOT NULL,
  usuario_id UUID REFERENCES perfiles(id) ON DELETE SET NULL,
  descripcion TEXT NOT NULL,
  fotos TEXT[] DEFAULT '{}',
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_orden_avances_orden_id ON orden_avances(orden_id);

ALTER TABLE orden_avances ENABLE ROW LEVEL SECURITY;

-- Same scoping pattern as orden_labor/orden_repuestos: admins see everything,
-- everyone else only within their own sede's orders.
CREATE POLICY "orden_avances_all" ON orden_avances FOR ALL
  USING (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM ordenes_trabajo o
      WHERE o.id = orden_avances.orden_id AND o.sede_id = public.current_user_sede_id()
    )
  )
  WITH CHECK (
    public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM ordenes_trabajo o
      WHERE o.id = orden_avances.orden_id AND o.sede_id = public.current_user_sede_id()
    )
  );

-- 2. Progress (%) should reach 100 automatically on "finalizado" too, not
--    just "entregado" — matches the same rule already applied on delivery.
CREATE OR REPLACE FUNCTION public.trg_set_progress_on_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.estatus IN ('finalizado', 'entregado') AND OLD.estatus IS DISTINCT FROM NEW.estatus THEN
    NEW.porcentaje_avance := 100;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_progress_on_status ON ordenes_trabajo;
CREATE TRIGGER trg_progress_on_status
  BEFORE UPDATE ON ordenes_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_set_progress_on_status();
