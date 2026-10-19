-- 20261010000039_vehiculos_vin_y_placa_unicos.sql
-- Un carro no se registra dos veces (QA 19/10/2026, §8 #16).
--
-- Hasta hoy `vehiculos` solo tenía su llave primaria: se podía crear el mismo VIN o la misma placa
-- cuantas veces se quisiera, y cada copia juntaba sus propias órdenes, así que el historial de un
-- carro quedaba partido. Ahora:
--
--   * el VIN es único en todo el sistema (un VIN identifica un solo carro en el mundo), sin
--     importar mayúsculas ni espacios alrededor;
--   * la placa es única por estado (la misma placa existe en estados distintos), también sin
--     importar mayúsculas ni espacios; un carro sin placa (subasta) no cuenta.
--
-- Si el carro cambia de dueño, se edita el dueño del vehículo que ya existe; no se crea otro.
-- Un admin ve todas las sedes, así que el mismo carro atendido en dos sedes es un solo vehículo.
--
-- Antes de crear los índices se revisa que no haya repetidos: si los hubiera, la migración se detiene
-- con una frase que dice cuáles son, en vez de un error de índice que nadie entiende.

DO $$
DECLARE
  v_vin   TEXT;
  v_placa TEXT;
BEGIN
  SELECT string_agg(vin_norm, ', ') INTO v_vin
  FROM (
    SELECT upper(btrim(vin)) AS vin_norm
    FROM public.vehiculos
    WHERE vin IS NOT NULL AND btrim(vin) <> ''
    GROUP BY 1 HAVING COUNT(*) > 1
  ) d;

  SELECT string_agg(placa_n || ' (' || COALESCE(NULLIF(estado_n, ''), 'sin estado') || ')', ', ') INTO v_placa
  FROM (
    SELECT upper(btrim(placa)) AS placa_n, COALESCE(upper(btrim(placa_estado)), '') AS estado_n
    FROM public.vehiculos
    WHERE placa IS NOT NULL AND btrim(placa) <> ''
    GROUP BY 1, 2
    HAVING COUNT(*) > 1
  ) d;

  IF v_vin IS NOT NULL OR v_placa IS NOT NULL THEN
    RAISE EXCEPTION 'Hay vehículos repetidos: unifícalos antes de aplicar esta migración. VIN: %. Placa: %.',
      COALESCE(v_vin, 'ninguno'), COALESCE(v_placa, 'ninguna');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vehiculos_vin
  ON public.vehiculos (upper(btrim(vin)))
  WHERE vin IS NOT NULL AND btrim(vin) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_vehiculos_placa
  ON public.vehiculos (upper(btrim(placa)), COALESCE(upper(btrim(placa_estado)), ''))
  WHERE placa IS NOT NULL AND btrim(placa) <> '';
