# Tareas para Gemini: trabajo con seguro y módulo de cobro por parqueo

> Arquitecto: Claude Code (10/10/2026). Implementa: Gemini. Si algo de aquí no se puede hacer
> como está escrito, **detente y dilo en la bitácora**; no improvises otro diseño.
>
> **Dos entregas.** Primero la **Fase A** (seguro en la orden): la implementas, la verificas,
> escribes tu entrada en la bitácora y **te detienes** para que se revise. Las **Fases B, C y D**
> (el módulo de parqueo) solo cuando te lo pidan.

## 0. Antes de empezar (obligatorio, en cada entrega)

1. Lee `AGENTS.md`, `docs/ai-context.md` (sobre todo "El dinero lo calcula la base", "Entregar es
   `entregar_orden`", "Un trigger auxiliar nunca bloquea una escritura de la orden" y las reglas de
   oro) y la bitácora de `docs/historico/plan-mejoras-2026-10.md`.
2. `git status` y `npm run db:check`. Mira la última migración con
   `ls supabase/migrations | tail -3`: las tuyas van **después** de la última (si la última es la
   `026`, las tuyas son la `027` y la `028`).
3. Antes de reescribir cualquier función SQL: `npm run db:donde -- <nombre>` y parte de **esa**
   versión, entera.
4. Reglas de este trabajo. Romper una es un error aunque las pruebas pasen:
   - Toda función nueva en `public` lleva `REVOKE ALL … FROM PUBLIC, anon, authenticated`; las
     RPC llevan `GRANT EXECUTE … TO authenticated` y verifican `is_admin()` por dentro. Cada
     función nueva tiene su caso en `scripts/qa/api-security.mjs`.
   - El navegador **nunca** calcula el parqueo ni un total: lo hace la base y la pantalla lo pinta.
   - Una RPC lee las claves de un JSONB **por nombre exacto**: una clave mal escrita se ignora sin
     error (ya pasó con el depósito). Fija cada nombre en una prueba del servicio.
   - Todo texto visible en i18n, español **e** inglés (la app en `src/i18n/translations.ts`; el
     portal en `src/portal/strings.ts`; el PDF y los correos tienen los suyos). Dinero con
     `lib/money.ts`. Colores solo con tokens.
   - Ni commit, ni `supabase db push`, ni `functions deploy`, ni push a `main`.
   - En la bitácora pones **lo que de verdad hiciste y corriste**, copiado de la salida. Una
     entrada anterior tuya describía una migración que no era la del archivo: revisa tu entrada
     contra el código antes de terminar.

## 1. El pedido del taller

1. **Seguro (primero):** cada orden dice si se trabaja con seguro. Por defecto, **no**. Se puede
   marcar al abrir la orden y cambiar después.
2. **Cobro por parqueo (después), como módulo aparte:**
   - se habilita o deshabilita por sede;
   - con el módulo habilitado, cada orden nueva cobra parqueo por defecto, y en cada orden se puede
     apagar o ajustar;
   - **con seguro:** cobra desde el primer día, con su propia tarifa diaria;
   - **sin seguro:** empieza a cobrar cuando la orden se marca **lista para entregar** y pasan los
     **días de gracia**, con su propia tarifa diaria;
   - todo configurable, y el cargo aparece en el desglose de la cuenta del enlace del cliente.

## 2. Lo que dice la investigación (por qué el diseño es así)

- Lo habitual es cobrar el parqueo **por día calendario**. Con seguro se cobra desde que el
  vehículo llega (el seguro paga un parqueo "razonable"). Sin seguro, se cobra cuando el cliente no
  recoge un vehículo que ya está listo.
- Las tarifas varían muchísimo ($35 a $350 por día), hay propuestas de ley con **topes** y
  **tramos** (una tarifa los primeros días y otra después), y los seguros cuentan plazos en **días
  hábiles**. Por eso la tarifa va por tramos, con tope de días y de monto, y la gracia puede
  contarse en días hábiles.
- En Maryland, el resumen del condado de Montgomery dice que el taller debe **avisar su política
  de parqueo** y que no se cobra en las **24 horas** siguientes a terminar la reparación, salvo
  acuerdo. El taller está en Hyattsville (condado de Prince George's) y no encontramos la regla
  estatal exacta. El diseño deja el día del evento sin cobro por defecto en el perfil sin seguro y
  muestra la política al cliente. **Que lo confirme el taller con quien lo asesore legalmente**;
  no es asesoría legal.

## 3. Diseño (decidido; no lo cambies)

### 3.1 Conceptos

- **Perfil de cobro:** cada sede tiene dos, `seguro` y `particular` (sin seguro). La orden usa uno
  según `ordenes_trabajo.con_seguro`. Cada perfil tiene:
  - si está habilitado;
  - el **evento de inicio**: `ingreso` (llegada del vehículo) o `lista_para_entregar` (la marca de
    `marcar_lista_para_entregar`);
  - si se cobra el **día del evento**;
  - los **días de gracia**, y si se cuentan en días hábiles (lunes a viernes);
  - sus **tramos** de tarifa diaria;
  - un **tope de días** y un **tope de monto** opcionales.
- **Tramos:** lista de `{desde_dia, tarifa_diaria}`. El primero siempre es `desde_dia = 1`. El día
  N del cobro paga la tarifa del tramo con el `desde_dia` mayor que no pase de N. Con un solo tramo
  es una tarifa fija.
- **Vigente desde:** fecha en que la sede empezó a cobrar. Ningún día anterior se cobra, y las
  órdenes que ingresaron antes **no** cobran salvo que se marque "incluir órdenes previas". Así,
  habilitar el módulo no le cae de golpe a las órdenes que ya estaban en el taller.
- **Ajustes por orden (admin):**
  - `cobrar` (por defecto `true`);
  - `tarifa_manual` (reemplaza los tramos);
  - `inicio_manual` (reemplaza el cálculo de la fecha de inicio);
  - `dias_exonerados` (días que no se cobran);
  - `nota`.
- **Congelado:** al entregar, el último día que se cuenta queda fijo (`fin_congelado`). Si se saca
  la orden de "Entregado", se descongela.

### 3.2 Cómo se cuenta (un solo lugar: `_parqueo_calculo`)

1. Inicio:
   - si hay `inicio_manual`, es esa fecha;
   - si no, `inicio = fecha_evento + (cobra_dia_evento ? 0 : 1)`, más los días de gracia:
     - en días calendario, `+ dias_gracia`;
     - en días hábiles, se avanzan días hasta haber pasado `dias_gracia` días de lunes a viernes;
       los fines de semana de en medio tampoco se cobran;
   - después, `inicio = GREATEST(inicio, vigente_desde)`.
2. Días:
   - `dias = max(0, hasta − inicio + 1 − dias_exonerados)`;
   - con tope de días, `dias = min(dias, tope_dias)`.
3. Monto: suma por tramos sobre los días 1..dias (o `dias × tarifa_manual`). Con tope de monto,
   `monto = min(monto, tope_monto)`. Siempre `round(…, 2)`.
4. `hasta` = `fin_congelado` si la orden está entregada; si no, `hoy_taller(sede)`. Las fechas de
   evento son locales del taller: `(timestamp AT TIME ZONE sedes.zona_horaria)::date`. Nunca
   `CURRENT_DATE`.

Ejemplos, que serán las pruebas. 2026-10-09 es viernes y 2026-10-10, sábado:

| Caso | Datos | Resultado |
|---|---|---|
| Seguro | evento 10-01, cobra el día del evento, gracia 0, tramo 1 a $40, hasta 10-10 | inicio 10-01, 10 días, $400 |
| Particular | evento 10-09, no cobra el día del evento, gracia 2 (calendario), $40, hasta 10-14 | inicio 10-12, 3 días, $120 |
| Gracia hábil | evento 10-09 (vie), no cobra el día, gracia 2 hábiles | inicio 10-14 (mié) |
| Tramos | 1→$40, 8→$60, 10 días | 7×40 + 3×60 = $460 |
| Topes | caso Seguro con tope $300 / con tope 5 días | $300 / 5 días = $200, `tope_aplicado` |
| Exonerados | caso Seguro con 2 días exonerados | 8 días, $320 |
| Tarifa manual | caso Seguro con tarifa manual $25 | $250 |
| Vigente desde | caso Seguro con vigente desde 10-05 | inicio 10-05, 6 días, $240 |
| Sin evento | particular sin marca de lista | inicio `NULL`, 0 días, $0 |
| Inicio manual | sin evento, inicio manual 10-08, hasta 10-10 | 3 días |

### 3.3 Estado del parqueo de una orden

| Estado | Cuándo | Monto |
|---|---|---|
| `inactivo` | el módulo o el perfil están apagados | 0 |
| `sin_cobro` | la orden tiene `cobrar = false` | 0 |
| `orden_previa` | ingresó antes de "vigente desde" y no se incluyen las previas | 0 |
| `esperando` | falta el evento (particular sin marca de lista) | 0 |
| `por_empezar` | ya hay fecha de inicio, pero es después de hoy | 0 |
| `acumulando` | cobrando, orden sin entregar | el calculado |
| `cerrado` | entregada (`fin_congelado`) | el calculado al entregar |

### 3.4 Dónde entra el dinero

- `recalculate_order_totals` suma el parqueo:
  `total_general = GREATEST(mano de obra + repuestos − descuento, 0) + orden_parqueo.monto`. Con
  eso, el saldo, `entregar_orden`, el ajuste de una orden ya entregada, el margen
  (`_balance_orden`) y la cuenta del portal lo incluyen sin tocar cada uno.
- **No cambian:**
  - el descuento, que sigue siendo sobre mano de obra + repuestos (`aplicar_descuento`);
  - las comisiones, que salen solo de la mano de obra.
- Ajustar el parqueo de una orden ya entregada mueve `total_general`, y
  `handle_delivered_order_adjustment` asienta el ajuste, igual que un descuento tardío.
- Quién paga (cliente o aseguradora) se maneja como hoy: el parqueo es parte de la cuenta de la
  orden.

### 3.5 Cuándo se recalcula

- Cada hora, por `pg_cron` (`recalcular_parqueo_pendiente`).
- Al cambiar en la orden `estatus`, `con_seguro`, `lista_para_entregar_en` o `fecha_ingreso`
  (trigger), y al crear la orden.
- Al guardar la configuración de la sede (todas sus órdenes sin entregar) y al ajustar una orden.
- Dentro de `entregar_orden`, **antes** de calcular el saldo: el cobro final lleva el parqueo
  hasta hoy.
- En `datos_portal`, antes de armar la cuenta, y en la RPC `parqueo_de_orden` (que la pantalla
  llama al abrir la cuenta y el diálogo de entrega).
- El trigger sobre la orden atrapa cualquier error y solo deja un `WARNING`, como el historial.
  Un fallo del parqueo **nunca** debe impedir editar una orden (ver el incidente del 04–05/10 en
  `ai-context.md`). Dentro de `entregar_orden`, en cambio, el error sí sube: no se entrega con el
  parqueo mal.

## 4. Fase A — Trabajo con seguro (entrega 1)

### A1. Migración `AAAAMMDDHHMMSS_orden_con_seguro.sql` (la siguiente libre; p. ej. `20261010000027`)

- En `ordenes_trabajo`:
  - `con_seguro BOOLEAN NOT NULL DEFAULT false`;
  - `aseguradora TEXT`;
  - `numero_reclamo TEXT`;
  - CHECK `ordenes_trabajo_seguro_datos_check`:
    `con_seguro OR (aseguradora IS NULL AND numero_reclamo IS NULL)`.
- `create_work_order`: reescríbela entera desde su versión vigente y lee de `p_order` las claves
  **`con_seguro`**, **`aseguradora`** y **`numero_reclamo`** (con `btrim` y `NULLIF` en los
  textos). `con_seguro` ausente = `false`.
- `trg_historial`: reescríbela desde su versión vigente. Suma las tres columnas a la lista de
  campos de `ordenes_trabajo` y al `UPDATE OF` del trigger.
- Permisos: no hace falta tocar el guardia del técnico. `trg_guard_order_technician` compara
  `to_jsonb(NEW) - permitidas`, así que una columna nueva queda solo para admin. Pruébalo.

### A2. pgTAP `supabase/tests/database/32_orden_con_seguro.test.sql`

Verifica:
- una orden nueva nace con `con_seguro = false`;
- `create_work_order` guarda las tres claves;
- el CHECK rechaza `aseguradora` con `con_seguro = false`;
- un técnico asignado no puede cambiar `con_seguro` (`42501`);
- el historial registra el cambio.

### A3. Aplicación

- Tipos: `WorkOrder` suma `con_seguro: boolean`, `aseguradora?: string | null` y
  `numero_reclamo?: string | null`.
- Alta (`workOrderForm.schema.ts`): campos `withInsurance` (default `false`), `insurer` y
  `claimNumber`, en el paso **`work`** de `INTAKE_STEPS` (lo exige
  `workOrderForm.schema.test.ts`). En `WorkOrderCreateModal`, la casilla "Trabajo con seguro"; al
  marcarla aparecen "Aseguradora" y "Número de reclamo" (opcionales). Al desmarcarla se mandan
  `null`.
- `workOrders.service.ts`: el alta manda `con_seguro`, `aseguradora` y `numero_reclamo` en
  `p_order` (fíjalo en `workOrders.service.test.ts`, como el depósito). Agrega
  `updateInsurance(orderId, { con_seguro, aseguradora, numero_reclamo })` con
  `.select('id')` + `assertAffected`.
- Detalle de la orden (admin): en la primera sección del Resumen, una fila "Seguro: Sí
  (Aseguradora · reclamo #) / No" con "Editar" (diálogo pequeño: casilla y los dos campos). Para
  el técnico solo se lee. Una ficha **"Seguro"** en el encabezado del detalle y en la tarjeta del
  tablero (Kanban) y de la lista.
- El cliente **no** ve estos datos (ni portal ni PDF) por ahora.
- i18n es/en de todo lo nuevo. Pruebas Vitest: el alta manda las claves, el diálogo de edición y
  la ficha.

### A4. Cierre de la entrega 1

Corre la verificación del §8 y escribe tu entrada en la bitácora: qué hiciste, la salida real y el
orden de publicación de la Fase A (`db push` de su migración y, **enseguida**, push a `main`). En
la tabla de Estado, la fila "Seguro y parqueo" queda "Fase A hecha, sin publicar". **Detente.**

## 5. Fase B — Módulo de parqueo en la base (entrega 2)

### B1. Migración `AAAAMMDDHHMMSS_modulo_parqueo.sql` (la siguiente libre)

**Tablas.** Todas con RLS y solo `SELECT` para `is_admin()`. **Sin** políticas de escritura:
solo se escriben por las funciones `SECURITY DEFINER` de abajo.

```sql
CREATE TABLE public.parqueo_config (
  sede_id                 UUID PRIMARY KEY REFERENCES public.sedes(id) ON DELETE CASCADE,
  habilitado              BOOLEAN NOT NULL DEFAULT false,
  vigente_desde           DATE,
  incluir_ordenes_previas BOOLEAN NOT NULL DEFAULT false,
  avisar_cliente          BOOLEAN NOT NULL DEFAULT true,
  politica_es             TEXT,
  politica_en             TEXT,
  actualizado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por         UUID REFERENCES public.perfiles(id) ON DELETE SET NULL
);

CREATE TABLE public.parqueo_perfiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id             UUID NOT NULL REFERENCES public.sedes(id) ON DELETE CASCADE,
  tipo                TEXT NOT NULL CHECK (tipo IN ('seguro', 'particular')),
  habilitado          BOOLEAN NOT NULL DEFAULT true,
  evento_inicio       TEXT NOT NULL CHECK (evento_inicio IN ('ingreso', 'lista_para_entregar')),
  cobra_dia_evento    BOOLEAN NOT NULL,
  dias_gracia         INT NOT NULL DEFAULT 0 CHECK (dias_gracia BETWEEN 0 AND 365),
  gracia_dias_habiles BOOLEAN NOT NULL DEFAULT false,
  tope_dias           INT CHECK (tope_dias > 0),
  tope_monto          NUMERIC(12,2) CHECK (tope_monto > 0),
  UNIQUE (sede_id, tipo)
);

CREATE TABLE public.parqueo_tramos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id     UUID NOT NULL REFERENCES public.parqueo_perfiles(id) ON DELETE CASCADE,
  desde_dia     INT NOT NULL CHECK (desde_dia >= 1),
  tarifa_diaria NUMERIC(12,2) NOT NULL CHECK (tarifa_diaria >= 0),
  UNIQUE (perfil_id, desde_dia)
);

CREATE TABLE public.orden_parqueo (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id        UUID NOT NULL UNIQUE REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  -- Lo decide administración (por `ajustar_parqueo_orden`):
  cobrar          BOOLEAN NOT NULL DEFAULT true,
  tarifa_manual   NUMERIC(12,2) CHECK (tarifa_manual >= 0),
  inicio_manual   DATE,
  dias_exonerados INT NOT NULL DEFAULT 0 CHECK (dias_exonerados >= 0),
  nota            TEXT,
  -- Lo calcula la base (por `_recalcular_parqueo`):
  perfil          TEXT CHECK (perfil IN ('seguro', 'particular')),
  estado          TEXT NOT NULL DEFAULT 'inactivo',
  inicio_cobro    DATE,
  fin_congelado   DATE,
  dias_cobrados   INT NOT NULL DEFAULT 0,
  monto           NUMERIC(12,2) NOT NULL DEFAULT 0,
  detalle         JSONB NOT NULL DEFAULT '[]'::jsonb,
  tope_aplicado   BOOLEAN NOT NULL DEFAULT false,
  calculado_hasta DATE,
  calculado_en    TIMESTAMPTZ
);
```

Agrega un CHECK a `orden_parqueo.estado` con los siete estados del §3.3. No hay filas por defecto:
- una sede sin `parqueo_config` está deshabilitada, y `parqueo_config_sede` devuelve los valores
  por defecto del §6;
- una orden sin fila en `orden_parqueo` se trata como `cobrar = true` sin ajustes, y
  `_recalcular_parqueo` crea la fila con `INSERT … ON CONFLICT (orden_id) DO UPDATE`.

**El cálculo, una sola función pura** (no lee tablas; se prueba sola y la usa también la vista
previa). Escríbela así, o equivalente con los mismos resultados del §3.2:

```sql
CREATE OR REPLACE FUNCTION public._parqueo_calculo(
  p_perfil        JSONB,          -- {cobra_dia_evento, dias_gracia, gracia_dias_habiles, tope_dias, tope_monto, tramos:[{desde_dia, tarifa_diaria}]}
  p_fecha_evento  DATE,           -- NULL: el evento todavía no pasa
  p_hasta         DATE,           -- último día que se cuenta
  p_vigente_desde DATE DEFAULT NULL,
  p_ajustes       JSONB DEFAULT '{}'::jsonb  -- {tarifa_manual, inicio_manual, dias_exonerados}
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_gracia     INT := GREATEST(COALESCE((p_perfil->>'dias_gracia')::int, 0), 0);
  v_tope_dias  INT := NULLIF((p_perfil->>'tope_dias')::int, 0);
  v_tope_monto NUMERIC := NULLIF((p_perfil->>'tope_monto')::numeric, 0);
  v_ini_manual DATE := NULLIF(p_ajustes->>'inicio_manual', '')::date;
  v_tarifa_man NUMERIC := NULLIF(p_ajustes->>'tarifa_manual', '')::numeric;
  v_exonerados INT := GREATEST(COALESCE((p_ajustes->>'dias_exonerados')::int, 0), 0);
  v_inicio     DATE;
  v_dias       INT;
  v_monto      NUMERIC := 0;
  v_detalle    JSONB := '[]'::jsonb;
  v_tope       BOOLEAN := false;
BEGIN
  IF v_ini_manual IS NOT NULL THEN
    v_inicio := v_ini_manual;
  ELSIF p_fecha_evento IS NULL THEN
    RETURN jsonb_build_object('inicio', NULL, 'dias', 0, 'monto', 0, 'detalle', '[]'::jsonb, 'tope_aplicado', false);
  ELSE
    v_inicio := p_fecha_evento
      + CASE WHEN COALESCE((p_perfil->>'cobra_dia_evento')::boolean, false) THEN 0 ELSE 1 END;
    IF COALESCE((p_perfil->>'gracia_dias_habiles')::boolean, false) THEN
      WHILE v_gracia > 0 LOOP
        IF extract(isodow FROM v_inicio) < 6 THEN
          v_gracia := v_gracia - 1;
        END IF;
        v_inicio := v_inicio + 1;
      END LOOP;
    ELSE
      v_inicio := v_inicio + v_gracia;
    END IF;
    IF p_vigente_desde IS NOT NULL AND v_inicio < p_vigente_desde THEN
      v_inicio := p_vigente_desde;
    END IF;
  END IF;

  v_dias := GREATEST(p_hasta - v_inicio + 1 - v_exonerados, 0);
  IF v_tope_dias IS NOT NULL AND v_dias > v_tope_dias THEN
    v_dias := v_tope_dias;
    v_tope := true;
  END IF;

  IF v_dias > 0 THEN
    WITH t AS (
      SELECT (e->>'desde_dia')::int AS desde, (e->>'tarifa_diaria')::numeric AS tarifa
      FROM jsonb_array_elements(
        CASE WHEN v_tarifa_man IS NOT NULL
             THEN jsonb_build_array(jsonb_build_object('desde_dia', 1, 'tarifa_diaria', v_tarifa_man))
             ELSE COALESCE(p_perfil->'tramos', '[]'::jsonb) END
      ) e
    ), r AS (
      SELECT desde, tarifa,
             LEAST(COALESCE(lead(desde) OVER (ORDER BY desde) - 1, v_dias), v_dias) AS hasta
      FROM t
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'desde_dia', desde, 'hasta_dia', hasta, 'dias', hasta - desde + 1,
             'tarifa', tarifa, 'subtotal', round((hasta - desde + 1) * tarifa, 2)
           ) ORDER BY desde), '[]'::jsonb),
           COALESCE(SUM(round((hasta - desde + 1) * tarifa, 2)), 0)
      INTO v_detalle, v_monto
    FROM r
    WHERE desde <= v_dias;
  END IF;

  IF v_tope_monto IS NOT NULL AND v_monto > v_tope_monto THEN
    v_monto := v_tope_monto;
    v_tope := true;
  END IF;

  RETURN jsonb_build_object('inicio', v_inicio, 'dias', v_dias, 'monto', round(v_monto, 2),
                            'detalle', v_detalle, 'tope_aplicado', v_tope);
END;
$$;
REVOKE ALL ON FUNCTION public._parqueo_calculo(JSONB, DATE, DATE, DATE, JSONB) FROM PUBLIC, anon, authenticated;
```

**Funciones internas.** Todas `SECURITY DEFINER`, `SET search_path = public`, con `REVOKE` y sin
`GRANT`.

- `_parqueo_calcular(p_orden_id UUID, p_hasta DATE) RETURNS JSONB` arma la entrada y llama a
  `_parqueo_calculo`.
  - Lee la orden, su sede (`zona_horaria`), `parqueo_config`, el perfil según `con_seguro` con sus
    tramos (como JSONB) y los ajustes de `orden_parqueo`.
  - Decide el estado del §3.3. Para los estados sin cobro devuelve `monto 0`. Usa `fin_congelado`
    si existe en lugar de `p_hasta`.
  - Devuelve el resultado del cálculo más `perfil`, `estado` y, para el aviso al cliente,
    `tarifa_inicial` (la de `desde_dia = 1` o la manual), `dias_gracia` y `evento_inicio`.
- `_recalcular_parqueo(p_orden_id UUID) RETURNS VOID`.
  - Calcula con `hoy_taller(sede)` y hace upsert de los campos calculados de `orden_parqueo`
    (solo si algo cambió).
  - Llama `recalculate_order_totals(p_orden_id)`.
- `recalcular_parqueo_pendiente() RETURNS INT` recalcula las órdenes no entregadas de las sedes con
  el módulo habilitado. Cada orden va en su propio `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE
  WARNING` para que una no tumbe las demás. Devuelve cuántas recalculó.
  `cron.schedule('restorify-parqueo', '7 * * * *', $$SELECT public.recalcular_parqueo_pendiente()$$)`
  (mira el patrón en `20261001000000_recordatorio_fecha_entrega.sql`).
- `trg_parqueo_orden()`: trigger `AFTER INSERT OR UPDATE OF estatus, con_seguro,
  lista_para_entregar_en, fecha_ingreso ON ordenes_trabajo`.
  - Al pasar a `entregado`, fija `fin_congelado = hoy_taller(sede)` (con upsert).
  - Al salir de `entregado`, lo borra.
  - En todo caso, recalcula.
  - Todo dentro de `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING`.
  - Separa las ramas `INSERT`/`UPDATE`: en una rama de `INSERT` no se lee `OLD`.

**RPC para la app.** `SECURITY DEFINER`, `is_admin()` adentro, `GRANT … TO authenticated`.

- `parqueo_config_sede(p_sede_id UUID) RETURNS JSONB`: la configuración con sus dos perfiles y
  tramos, o los valores por defecto del §6 si no hay fila.
- `guardar_config_parqueo(p_sede_id UUID, p_config JSONB) RETURNS JSONB`.
  - Valida y guarda todo **en una transacción**: config, los dos perfiles y los tramos, que
    reemplaza.
  - Forma de `p_config`, con estos nombres exactos:
    `{habilitado, vigente_desde, incluir_ordenes_previas, avisar_cliente, politica_es,
    politica_en, perfiles: {seguro: {...}, particular: {...}}}`. Cada perfil:
    `{habilitado, evento_inicio, cobra_dia_evento, dias_gracia, gracia_dias_habiles, tope_dias,
    tope_monto, tramos: [{desde_dia, tarifa_diaria}]}`.
  - Valida:
    - tramos no vacíos, el primero con `desde_dia = 1`, `desde_dia` crecientes y sin repetir,
      tarifas ≥ 0;
    - un perfil habilitado necesita tarifa > 0 en su primer tramo;
    - al pasar a habilitado sin `vigente_desde`, se usa `hoy_taller(sede)`.
  - Errores en español para el taller (`22023`).
  - Después recalcula todas las órdenes no entregadas de la sede. Guarda `actualizado_por`.
- `vista_previa_parqueo(p_perfil JSONB, p_fecha_evento DATE, p_hasta DATE) RETURNS JSONB` llama a
  `_parqueo_calculo` con la configuración que se está editando (sin guardarla).
- `parqueo_de_orden(p_orden_id UUID) RETURNS JSONB` recalcula (si no está congelada) y devuelve la
  fila de `orden_parqueo` con el estado y la `tarifa_inicial`.
- `ajustar_parqueo_orden(p_orden_id UUID, p_ajustes JSONB) RETURNS JSONB`.
  - Claves exactas: `cobrar`, `tarifa_manual`, `inicio_manual`, `dias_exonerados`, `nota`. Una
    clave ausente no cambia ese campo; `null` lo borra.
  - Valida (sin negativos), guarda (upsert), recalcula y devuelve como `parqueo_de_orden`.
  - Vale también sobre una orden entregada: el total cambia y el ajuste de cobro lo asienta.

**Reescribir desde su versión vigente** (`npm run db:donde`):

- `recalculate_order_totals`: suma `COALESCE(orden_parqueo.monto, 0)` al total, como en el §3.4.
- `entregar_orden`: `PERFORM public._recalcular_parqueo(p_orden_id)` **antes** de
  `v_saldo := …`.
- `saldo_retiro`: suma el parqueo guardado (`orden_parqueo.monto`) al `cobro` y lo devuelve como
  `parqueo`. Si no, el diálogo de retiro diría un saldo distinto del que se cobra.
- `datos_portal`:
  - antes de armar la cuenta, si la orden no está entregada, `PERFORM _recalcular_parqueo` dentro
    de `BEGIN … EXCEPTION … WARNING`;
  - en `cuenta`, agrega `'parqueo'` (`estado`, `inicio`, `dias`, `monto`, `detalle`,
    `tope_aplicado`, `tarifa_inicial`, `dias_gracia`, `evento_inicio`, `cobra_dia_evento`,
    `politica_es`, `politica_en`) **solo** si el estado no es `inactivo`, `sin_cobro` ni
    `orden_previa`. Si no, `null`;
  - `subtotal` sigue siendo mano de obra + repuestos y `total` ya trae el parqueo. Campo por
    campo, nunca `to_jsonb(fila)`.
- `datos_correo`: agrega `'parqueo'` (`estado`, `inicio`, `tarifa_inicial`) cuando
  `avisar_cliente` y el estado es `por_empezar` o `acumulando`.
- `trg_historial`: rama `orden_parqueo` (entidad `parqueo`; campos `cobrar`, `tarifa_manual`,
  `inicio_manual`, `dias_exonerados`, `nota`) y trigger `AFTER INSERT OR UPDATE OF` **solo esas
  columnas**. Las calculadas cambian cada día y no deben llenar el historial.

`orden_parqueo` **no** va en la publicación de Realtime: cuando cambia el monto, cambia
`orden_montos`, que ya avisa.

### B2. pgTAP `supabase/tests/database/33_parqueo.test.sql`

- `_parqueo_calculo`: los diez casos de la tabla del §3.2, con los números exactos.
- Con tablas, cada uno con su comprobación:
  - módulo apagado → `inactivo`, $0;
  - perfil seguro con orden `con_seguro`;
  - particular `esperando` hasta marcarla lista y `por_empezar` dentro de la gracia;
  - `cobrar = false` → `sin_cobro`;
  - orden previa a "vigente desde";
  - `total_general` = mano de obra + repuestos − descuento + parqueo;
  - el descuento máximo sigue siendo mano de obra + repuestos;
  - `entregar_orden` cobra el saldo con el parqueo, y después `fin_congelado` = hoy;
  - recalcular otro día no lo cambia;
  - sacar de Entregado lo descongela;
  - ajustar una orden entregada asienta el ajuste;
  - `saldo_retiro` incluye el parqueo;
  - `datos_portal` trae `cuenta.parqueo` y el `total` con el parqueo;
  - `guardar_config_parqueo` rechaza tramos inválidos y perfil habilitado con tarifa 0;
  - un técnico no lee ninguna tabla del módulo (0 filas) ni llama sus RPC (`42501`);
  - anon tampoco.
- Las comisiones de una orden con parqueo no cambian.

### B3. `scripts/qa/api-security.mjs`

Casos nuevos:
- anon y técnico **denegados** en las cinco RPC;
- **ni un admin** llama las cuatro internas (`_parqueo_calculo`, `_parqueo_calcular`,
  `_recalcular_parqueo`, `recalcular_parqueo_pendiente`);
- un técnico lee **0 filas** de `parqueo_config`, `parqueo_perfiles`, `parqueo_tramos` y
  `orden_parqueo`.

## 6. Fase C — Pantallas del módulo (entrega 2)

Todo el módulo vive aparte:
- `src/features/parking/`;
- servicio `src/services/parking.service.ts`;
- tipos `src/types/domain/parking.types.ts`;
- claves de caché `parkingConfig(sedeId)` y `orderParking(orderId)` en `lib/queryClient.ts`.

Después de cada mutación, invalida también `workOrderDetail` y `orderBalance`.

### C1. Configuración: `ParkingSettingsCard` (en `pages/Settings.tsx`, solo admin)

- **Arriba:**
  - selector de sede (por defecto la actual);
  - interruptor **"Cobrar parqueo en esta sede"**;
  - "Vigente desde" (fecha);
  - "Incluir órdenes que ya estaban en el taller";
  - "Avisar al cliente cuándo empieza el cobro";
  - política para el cliente en español y en inglés (opcional).
- **Dos paneles iguales, "Con seguro" y "Sin seguro",** cada uno con:
  - habilitado;
  - "Empieza a contar": Llegada del vehículo / Marcada lista para entregar;
  - "Cobrar el día del evento";
  - días de gracia, y si se cuentan en hábiles;
  - tramos ("Desde el día 1: $__ por día" fijo, más "Agregar tramo");
  - tope de días y tope de monto (opcionales).
- **Vista previa en vivo** con `vista_previa_parqueo`, con un retraso de ~400 ms entre tecleos:
  "Si el evento es el {fecha}, se cobra desde el {inicio}; a los {N} días: {monto}". La cuenta
  la hace la base.
- **Valores por defecto** (también en `parqueo_config_sede`):
  - módulo apagado, avisar al cliente encendido;
  - **Con seguro:** habilitado, desde la llegada, cobra el día de llegada, gracia 0, tramo 1 a $0
    (el admin pone la tarifa);
  - **Sin seguro:** habilitado, desde "lista para entregar", **no** cobra ese día, gracia 2
    (calendario), tramo 1 a $0.
- Los errores de `guardar_config_parqueo` (en español) se muestran en un toast.

### C2. Detalle de la orden: sección `parqueo`

- En la pestaña **Cobro**: `TAB_SECTIONS.cobro = ['totales', 'parqueo', 'balance', 'enlace']`
  (`WorkOrderDetail.tsx`). Es un `ParkingCard` dentro de `CollapsibleSection`, solo admin y solo
  si la sede **de la orden** (`orderSede`, no `currentSede`) tiene el módulo habilitado.
- Al abrir llama `parqueo_de_orden`.
- Muestra:
  - perfil (Con seguro / Sin seguro);
  - estado en palabras: "Empieza el {fecha}", "Acumulando desde el {fecha}", "Cerrado al
    entregar", "Esperando que la orden se marque lista", "Sin cobro en esta orden"…;
  - el desglose por tramos (`{dias} días × {tarifa}`) y el total;
  - "Tope aplicado" si corresponde.
- Controles (admin): "Cobrar parqueo en esta orden", tarifa manual, inicio manual, días exonerados
  y nota, que guardan con `ajustar_parqueo_orden`.
- `OrderTotalsCard` muestra la línea "Parqueo" entre el descuento y el total cuando el monto
  es > 0.

### C3. Entrega y retiro

- `DeliveryModal`: al abrir, llama `parqueo_de_orden` y después lee el saldo. Muestra "Incluye
  parqueo: {monto} ({dias} días)".
- El diálogo de retirada sin reparar (el que usa `saldo_retiro`) muestra la línea `parqueo`.

### C4. Enlace del cliente (`src/portal/`)

- `portal.types.ts`: `cuenta.parqueo` (opcional; el portal no debe romperse si no viene).
- En `AccountSection`, la línea **"Parqueo"** entre el descuento y el total: `{dias} días ×
  {tarifa}`, o el desglose por tramos si hay más de uno, y el monto.
- Arriba de la cuenta, un aviso según el estado:
  - `por_empezar`: "Su vehículo está listo. Puede recogerlo sin costo hasta el {día anterior al
    inicio}; desde el {inicio} se cobra parqueo de {tarifa} por día.";
  - `esperando`: la política, si la hay, o "Cuando su vehículo esté listo, tendrá {N} días para
    recogerlo sin costo; después se cobra parqueo de {tarifa} por día.";
  - `acumulando` con seguro: "Parqueo desde el {inicio}.".
- La política escrita por el taller se muestra en el idioma del cliente.
- Textos es/en en `strings.ts`. Pruebas en `CustomerPortal.test.tsx`.

### C5. PDF y correo

- PDF (`workOrderPdf.ts`): la línea "Parqueo ({dias} días)" en el resumen, entre el descuento y el
  total, con su texto en es/en. Los datos vienen de `parqueo_de_orden`, pedido junto a lo demás en
  `useWorkOrderDetail` (el `Promise.all` del PDF).
- Correo de "listo para entregar" (`_shared/email/templates.ts`, que lo arma con `datos_correo`):
  si viene `parqueo` en `por_empezar`, una frase es/en con la fecha de inicio y la tarifa.
  `process-outbox` suma `parqueo` a su tipo `EmailData`. Hay que desplegar `process-outbox`.

### C6. Pruebas Vitest

- `parking.service.test.ts`: los nombres exactos de las claves de `guardar_config_parqueo` y
  `ajustar_parqueo_orden`.
- `ParkingSettingsCard`: tramos, validaciones y vista previa (con el servicio simulado).
- `ParkingCard`: estados y ajustes.
- `DeliveryModal`: la línea de parqueo.
- Portal: línea y avisos.
- PDF y correo: la línea y la frase.

## 7. Fase D — Documentación (entrega 2)

- **`docs/parqueo.md` nuevo:** qué es, perfiles, tramos, estados, cómo se cuenta (la tabla del
  §3.2), cuándo se recalcula, dónde entra el dinero, permisos, la nota legal del §2 y las ideas
  futuras del §10.
- **`docs/ai-context.md`, una viñeta en §1:** el parqueo entra a `total_general` por
  `orden_parqueo.monto`; lo calcula solo `_parqueo_calculo`; se congela al entregar; nunca en el
  navegador; las comisiones y el descuento no lo tocan.
- **`docs/mapa-de-secciones.md`:** sección "Parqueo".
- **`docs/portal-y-correos.md` y `docs/supabase.md`:** tablas nuevas, el cron y
  `cuenta.parqueo`.
- **Bitácora y tabla de Estado:** tu entrada.

## 8. Verificación (cada entrega, todo)

```bash
npm run lint && npx tsc -b && npm test && npm run build
npx supabase start && npx supabase migration up --local && npm run test:db
```

A mano, con la app local:

- **Fase A:**
  - abre una orden marcando "con seguro", aseguradora y reclamo;
  - edítalo desde el detalle;
  - como técnico, no puedes cambiarlo;
  - la ficha "Seguro" sale en el tablero.
- **Fases B y C:**
  - habilita el módulo con tarifas $40 (seguro) y $25 (sin seguro, gracia 2);
  - una orden con seguro muestra el parqueo desde su llegada (si la llegada es anterior a
    "vigente desde", prueba con "incluir previas");
  - marca lista una orden sin seguro: el portal dice desde cuándo se cobra;
  - apaga el cobro en una orden: su total baja;
  - entrega: el saldo incluye el parqueo y queda "Cerrado";
  - el PDF lleva la línea.

## 9. Publicación (NO la haces tú; déjala escrita en la bitácora)

- **Fase A:** `db push` de su migración → push a `main` enseguida.
- **Fases B y C:**
  1. `npm run test:db`;
  2. `db push` de la migración del módulo;
  3. `functions deploy process-outbox`;
  4. push a `main` enseguida;
  5. `npm run qa:security`.

  El módulo nace **apagado** en todas las sedes, así que publicar no cambia ningún total hasta
  que administración lo habilite en Configuración.

## 10. Fuera de alcance (el diseño lo deja listo para después)

- Tarifas por tipo de vehículo o por espacio interior/exterior: sería un tercer criterio para
  elegir perfil o tramos.
- Que el parqueo con seguro lo pague la aseguradora en una cuenta aparte.
- Un grupo "Listas sin recoger, acumulando parqueo" en "Requiere atención".
- Avisos recurrentes al cliente mientras acumula.
- Impuestos sobre el parqueo.
- Mostrar la aseguradora y el reclamo al cliente.
