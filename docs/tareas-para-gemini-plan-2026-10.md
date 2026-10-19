# Tareas para Gemini: plan del 17/10/2026 (Restorify al nivel de los programas de pago)

> **Decidido por la persona responsable el 17/10/2026:** solo para Restorify, no para vender, y
> sin SMS por ahora. El porqué de cada tarea está en [plan-saas-2026-10.md](plan-saas-2026-10.md).
>
> - **Arquitecto y verificación:** Claude Code. **Implementa:** Gemini 3.8 Flash High
>   (Antigravity), en una copia aislada y sin terminal.
> - **Si algo no se puede hacer como está escrito, detente y anótalo en la bitácora.** No
>   improvises otro diseño.

## 0. Reglas (obligatorias)

Son las mismas de la [sección 0 de las tareas de adopción](tareas-para-gemini-adopcion.md#0-reglas-obligatorias):
- no tienes terminal;
- las funciones SQL se reescriben enteras desde su versión vigente;
- no inventes nombres;
- todo texto en español **e** inglés;
- el portal no importa nada de la app;
- no sumes dinero en el navegador;
- no agregues dependencias;
- tu entrada en la bitácora dice que **no corriste pruebas**.

Además:
- TypeScript tiene `verbatimModuleSyntax`: los tipos se importan con `import type`.
- Las pruebas de componentes que usan `useLanguage` van con `renderWithProviders`
  (`src/test/renderWithProviders.tsx`) y con `// @vitest-environment jsdom` en la primera línea.

**Lecciones de las partes G a L** (cada una costó una corrección):
- **Llamadas de la app:**
  - `showToast(tipo, mensaje)`: el tipo va primero;
  - `getErrorMessage(err, language)`;
  - un componente que pueda montarse fuera de `AuthProvider` no llama `useAuth`: recibe por
    props lo que necesita.
- **Las pruebas de la app** buscan los textos **reales** de `translations.ts` y llenan los campos
  que el formulario valida.
- **Las pruebas pgTAP:**
  - una línea nace en `borrador` aunque el `INSERT` diga otra cosa: lo aprobado o rechazado
    pasa por `set_config('restorify.presupuesto', 'on', true)`;
  - los totales de `orden_montos` no se escriben a mano: salen de las líneas. El descuento va
    por `aplicar_descuento`;
  - una orden se entrega después de cargarle las líneas;
  - lo que comprueba RLS se consulta con `SET LOCAL ROLE authenticated` (después de
    `RESET ROLE`, se ve todo);
  - una orden nace con su enlace (`032`): no insertes otro;
  - una foto va en la carpeta `sede/orden/…` y lleva `mime`;
  - el vehículo y el cliente de una orden son de su misma sede;
  - un técnico no actualiza `orden_labor`: marca su tarea con `marcar_labor_completada`.
- **Las marcas de tiempo:** con `now()`, todo lo de una transacción tiene la misma hora. En una
  función, no mezcles `now()` y `clock_timestamp()`.

---

## Parte G: fase 0 en el código (lo que encontró la auditoría)

La migración `20261010000033_indices_y_rls_initplan.sql` (índices y políticas) ya la escribió
Claude: **no toques `supabase/`**. Esta parte es solo frontend.

### G1. Cargar diferido lo pesado de la página de órdenes

`src/pages/WorkOrders.tsx:21-29` importa directamente el detalle de la orden, el alta y el
tablero. El técnico los baja aunque solo mire su lista.

1. **Los tres pasan a `lazy()`:** `WorkOrderDetail` (lo pinta en `:566`), `WorkOrderCreateModal`
   (`:855`) y `KanbanBoard` (`:827`).
2. **Las cargas:**
   - el detalle y el tablero, dentro de `<Suspense>` con un *fallback* de carga que ya exista en
     el proyecto (busca el que usa `App.tsx` para las rutas; si no se puede importar, un
     `<div className="spinner" />`);
   - el alta, dentro de `LazyModal` (`src/components/LazyModal.tsx`), como `ImportStatementModal`
     en `src/pages/Finance.tsx`.
3. **No cambies lo que reciben** ni el `key={detail.order.id}` del detalle.

### G2. Las consultas del detalle no esperan a la orden

En `src/features/workOrders/useWorkOrderDetail.ts:231-258`, `commissionEstimate` y
`paidCommissions` solo necesitan el id de la orden, que ya se conoce antes de que llegue la
orden: es la variable de la orden abierta del hook (búscala).

- Su `queryKey`, su `queryFn` y su `enabled` usan ese id en vez de `order?.id`.
- Las condiciones de rol (`isAdmin`, `isAssignedToMe`) se quedan.
- Si `isAssignedToMe` necesita la orden, esa consulta sigue esperándola. Dilo en la bitácora.
- `operators` depende de `order.sede_id`: no la toques.

### G3. El cliente se pide una sola vez

`src/pages/Customers.tsx:70-93` llama a `getCustomerDetail` en un `useEffect` al abrir por
enlace (`?open=`) y después `profileQuery` vuelve a pedir lo mismo.

- Deja que solo `profileQuery` lo pida.
- El efecto se limita a fijar qué cliente está abierto.

### G4. Botones de solo ícono con nombre

Agrega `aria-label` con la misma clave de traducción de su `title` (o una nueva en es y en):
- `src/pages/WorkOrders.tsx`: los botones de borrar (`:590`, `:736`) y de abrir la orden
  (`:729`);
- `src/pages/Customers.tsx`: ver, editar y borrar (`:435`, `:438`, `:442`);
- `src/pages/Finance.tsx`: borrar un movimiento (`:546-553`);
- `src/components/layout/Sidebar.tsx`: el botón que pliega el menú (`:198`), con
  `nav.expandSidebar` / `nav.collapseSidebar` (créalas: «Expandir menú» / «Expand menu»,
  «Plegar menú» / «Collapse menu»);
- `src/components/layout/Header.tsx:137`: `aria-label="Abrir menú"` pasa a `t('nav.openMenu')`.
  Si la clave no existe, créala: «Abrir menú» / «Open menu».

### G5. El alta, más rápida en el teléfono

En `src/features/workOrders/WorkOrderCreateModal.tsx:213-245`, los campos del cliente nuevo:
- cada uno con `aria-label` (la misma clave de su *placeholder*);
- `autoComplete`: `name`, `email` y `street-address`. El teléfono ya es `PhoneInput`, que trae el
  suyo;
- el correo con `type="email"`, `inputMode="email"` y `spellCheck={false}`;
- **sin campos obligatorios nuevos.**

### G6. Formularios de Clientes y Finanzas

- `src/pages/Customers.tsx:471`, `:481`, `:513`, `:517`: cada `<label className="form-label">`
  con `htmlFor` igual al `id` de su campo. Si el campo no tiene `id`, dáselo.
- `src/pages/Finance.tsx:575-640`: lo mismo en el modal de movimientos.
- `src/pages/Finance.tsx:604`: el monto con `inputMode="decimal"`.

### G7. Pruebas y bitácora

- Las pruebas que montan `WorkOrders` y esperan el detalle o el alta al instante ahora tienen que
  esperarlo (`findBy…`). Ajústalas sin cambiar lo que prueban.
- Prueba nueva, `src/features/workOrders/useWorkOrderDetail.parallel.test.tsx` o en una
  existente: al abrir una orden, la estimación de comisión se pide con el id antes de que llegue
  la orden.
- **No cambies `docs/manual-usuario*`:** nada de esto cambia lo que hace el taller.
- Tu entrada en `docs/bitacora.md`.

---

## Parte H: trabajos agrupados y catálogo, la base (plan 1.1)

**Qué cambia para el taller.**
- Un **trabajo** («Frenos delanteros») junta su mano de obra y sus repuestos.
- El cliente lo autoriza completo, como en todos los programas de pago.
- Administración arma un **catálogo de trabajos frecuentes** con precio por sede y los agrega a
  una orden con un toque, también en el alta.
- **Las líneas sueltas siguen funcionando igual.** Una línea sin trabajo es su propio renglón,
  como hoy.

**Migración `20261010000034_trabajos_y_catalogo.sql`.** Sigue `.claude/commands/nueva-migracion.md`.
Encabezado en español con lo de arriba.

### H0. Tablas

1. **`catalogo_trabajos`:**
   - `id uuid PK DEFAULT gen_random_uuid()`;
   - `sede_id uuid NOT NULL REFERENCES sedes(id) ON DELETE CASCADE`;
   - `nombre text NOT NULL`, con un CHECK: no vacío al recortar y de 120 caracteres o menos;
   - `activo boolean NOT NULL DEFAULT true`;
   - `creado_por uuid REFERENCES perfiles(id) ON DELETE SET NULL`;
   - `creado_en` y `actualizado_en timestamptz NOT NULL DEFAULT now()`;
   - índice único sobre `(sede_id, lower(btrim(nombre)))`.
2. **`catalogo_trabajo_lineas`:**
   - `id`;
   - `catalogo_id uuid NOT NULL REFERENCES catalogo_trabajos(id) ON DELETE CASCADE`;
   - `tipo text NOT NULL CHECK (tipo IN ('mano_obra','repuesto'))`;
   - `descripcion text NOT NULL`, con un CHECK: no vacía y de 200 caracteres o menos;
   - `especialidad text CHECK (especialidad IN ('mecanica','pintura'))`;
   - `cantidad integer NOT NULL DEFAULT 1 CHECK (cantidad >= 1)`;
   - `precio numeric NOT NULL DEFAULT 0 CHECK (precio >= 0)`: en mano de obra es el costo; en
     repuesto, el precio de venta por unidad;
   - `costo_unitario numeric CHECK (costo_unitario >= 0)`: solo repuesto, y `NULL` = el precio;
   - `posicion integer NOT NULL DEFAULT 0`;
   - CHECK de forma: `(tipo='mano_obra' AND especialidad IS NOT NULL AND cantidad=1 AND
     costo_unitario IS NULL) OR (tipo='repuesto' AND especialidad IS NULL)`;
   - índice en `catalogo_id`.
3. **`orden_trabajos`:**
   - `id`;
   - `orden_id uuid NOT NULL REFERENCES ordenes_trabajo(id) ON DELETE CASCADE`;
   - `titulo text NOT NULL`, con un CHECK: no vacío y de 120 caracteres o menos;
   - `catalogo_id uuid REFERENCES catalogo_trabajos(id) ON DELETE SET NULL`;
   - `creado_por uuid REFERENCES perfiles(id) ON DELETE SET NULL`;
   - `creado_en timestamptz NOT NULL DEFAULT now()`;
   - `UNIQUE (id, orden_id)`, para la llave compuesta de abajo;
   - índices en `orden_id`, `catalogo_id` y `creado_por`.
4. **`orden_labor` y `orden_repuestos`** suman `trabajo_id uuid`, con su índice y la llave
   compuesta `FOREIGN KEY (trabajo_id, orden_id) REFERENCES orden_trabajos(id, orden_id) ON DELETE
   SET NULL (trabajo_id)`. Así una línea no puede quedar en el trabajo de otra orden, y borrar el
   trabajo la deja suelta.
5. **RLS** en las tres tablas nuevas:
   - `orden_trabajos`: SELECT con la misma condición que `orden_labor_select`
     (`(SELECT public.is_admin()) OR orden_id = ANY ((SELECT public.mis_ordenes_asignadas())::uuid[])`).
     INSERT, UPDATE y DELETE solo con `(SELECT public.is_admin())`;
   - el catálogo: todo solo con `(SELECT public.is_admin())`. Tiene precios, y el técnico no lo
     ve;
   - permisos de tabla como en `20261010000029`: `REVOKE ALL ... FROM PUBLIC, anon,
     authenticated` y `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`.
6. **Realtime:** `ALTER PUBLICATION supabase_realtime ADD TABLE public.orden_trabajos` (protegido
   con un `DO` que no falle si ya está).

### H1. Funciones nuevas

Todas son `SECURITY INVOKER` y `SET search_path = public`. Las de escritura empiezan con
`IF NOT public.is_admin() THEN RAISE EXCEPTION 'Solo administración …' USING ERRCODE = '42501'`.
Todas llevan `REVOKE ALL ... FROM PUBLIC, anon, authenticated` y `GRANT EXECUTE ... TO
authenticated`.

1. **`agregar_trabajo_del_catalogo(p_orden_id uuid, p_catalogo_id uuid, p_asignado_a uuid
   DEFAULT NULL) RETURNS uuid`.**
   - Bloquea la orden (`FOR UPDATE`).
   - El catálogo tiene que ser de la sede de la orden y estar activo. Si no: «Ese trabajo del
     catálogo no es de la sede de esta orden o está desactivado.» (42501).
   - Inserta el trabajo con el nombre del catálogo como título, y después sus líneas en el orden
     de `posicion`, con `trabajo_id` y `reparto_heredado = false`:
     - mano de obra: `costo = precio`, su `especialidad`, y `asignado_a = p_asignado_a` solo si el
       oficio de esa persona coincide con la especialidad (`mecanico` → `mecanica`, `pintor` →
       `pintura`); si no, `NULL`;
     - repuesto: `cantidad`, `precio_venta_unitario = precio`, `costo_unitario =
       COALESCE(costo_unitario, precio)`.
   - Devuelve el id del trabajo.
   - Los triggers de siempre (estado borrador, totales, entregada) actúan solos.
2. **`quitar_trabajo(p_trabajo_id uuid) RETURNS void`.** Bloquea la orden, borra las líneas del
   trabajo (mano de obra y repuestos) y luego el trabajo. Si una guardia lo impide (una comisión
   pagada, una orden entregada), su error sale tal cual y no se borra nada.
3. **`renombrar_trabajo(p_trabajo_id uuid, p_titulo text) RETURNS void`.** Con el mismo CHECK de
   largo.
4. **`trabajos_de_orden(p_orden_id uuid) RETURNS jsonb`.** Solo admin. Un arreglo de
   `{id, titulo, catalogo_id, total, total_aprobado, lineas}` ordenado por `creado_en`:
   - `total` suma las líneas del trabajo que no están rechazadas: mano de obra `costo`,
     repuestos `subtotal`;
   - `total_aprobado` suma solo las `aprobado`;
   - `lineas` es la cantidad de líneas.

   La app nunca suma estos montos.
5. **`catalogo_de_trabajos(p_sede_id uuid, p_incluir_inactivos boolean DEFAULT false) RETURNS
   jsonb`.** Solo admin. Un arreglo de `{id, nombre, activo, total, lineas: [...]}` ordenado por
   nombre:
   - `total` = mano de obra `precio` + repuestos `cantidad * precio`;
   - cada línea lleva todos sus campos, ordenadas por `posicion`.
6. **`guardar_trabajo_catalogo(p_id uuid, p_sede_id uuid, p_nombre text, p_activo boolean,
   p_lineas jsonb) RETURNS uuid`.**
   - Sin `p_id` crea; con `p_id` actualiza el encabezado (`actualizado_en = now()`) y **reemplaza**
     las líneas (borra e inserta), todo en la misma transacción.
   - Pide al menos una línea: «Un trabajo del catálogo necesita al menos una línea.».
   - Un nombre repetido en la sede da 23505; la app lo traduce.
7. **`borrar_trabajo_catalogo(p_id uuid) RETURNS void`.** Las órdenes que lo usaron se quedan
   con su trabajo (`catalogo_id` pasa a `NULL`).

### H2. Funciones que cambian (cada una se reescribe **entera** desde su versión vigente)

1. **`create_work_order`, desde `20261010000031_marcas_de_danos.sql:54`.** Lee
   `p_order->'trabajos'`, un arreglo de `{grupo, titulo, catalogo_id}`.
   - **Antes de insertar las líneas**, inserta cada trabajo y arma un `jsonb` de `grupo → id`.
   - El `catalogo_id` se guarda solo si existe en el catálogo de la sede de la orden; si no,
     `NULL`.
   - En los INSERT de mano de obra y de repuestos, `trabajo_id = (v_mapa ->> (item->>'grupo'))::uuid`
     (`NULL` si el ítem no trae `grupo`).
   - Nada más cambia.
2. **`_resolver_presupuesto`, desde `20261010000022_firma_idioma_y_rechazos.sql:600`.** Justo
   después de bloquear el presupuesto, **un trabajo se autoriza completo**:
   - `v_aprobadas` se amplía a todas las líneas `pendiente` de este presupuesto cuyo
     `trabajo_id` esté en algún trabajo de las líneas aprobadas (mano de obra y repuestos);
   - comentario: «si el cliente aprobó una línea de un trabajo, se aprueba el trabajo entero
     (20261010000034)».
   - Nada más cambia.
3. **`datos_portal`, desde `20261010000031_marcas_de_danos.sql:235`.** En el presupuesto (cerca
   de la línea 200 de esa función):
   - cada línea suma `'trabajo_id'` y `'trabajo'` (el título), con un `LEFT JOIN
     orden_trabajos`, en mano de obra y en repuestos;
   - el presupuesto suma `'trabajos'`: un arreglo de `{id, titulo, total}` de los trabajos que
     tienen líneas `pendiente` en ese presupuesto, con `total` = la suma de esas líneas,
     calculada en SQL. El portal no suma.

   Nada más cambia.
4. **`_textos_cliente`, desde `20261010000022_firma_idioma_y_rechazos.sql:91`.** Suma los
   `titulo` de `orden_trabajos` de la orden, para que la traducción automática los incluya.
   Nada más cambia.

### H3. pgTAP `supabase/tests/database/38_trabajos_y_catalogo.test.sql`

Estructura de la `37`. Para dejar datos a mano, `RESET ROLE` con el admin en el JWT, como hace la
`37`. Para un rechazo, la bandera `restorify.presupuesto`. Casos:

1. **RLS:**
   - un técnico asignado lee el `orden_trabajos` de su orden; uno no asignado, nada;
   - un técnico no lee el catálogo y no puede insertar un trabajo.
2. **`guardar_trabajo_catalogo`:**
   - crea, y al editar reemplaza las líneas;
   - sin líneas, error;
   - con un nombre repetido en la sede, 23505;
   - un técnico recibe 42501.
3. **`catalogo_de_trabajos`:** con 1 mano de obra de 120 y 2 repuestos de 40, el `total` es 200;
   el inactivo no sale salvo que se pida.
4. **`agregar_trabajo_del_catalogo`:**
   - crea el trabajo con su título y las líneas en borrador, con `trabajo_id`, los precios del
     catálogo y la especialidad;
   - `p_asignado_a` de un mecánico queda solo en la mano de obra de mecánica;
   - un catálogo de otra sede da 42501.
5. **Llave compuesta:** una línea con el `trabajo_id` de otra orden da error (23503).
6. **`_resolver_presupuesto`:** con un trabajo de 2 líneas y una línea suelta, aprobar **una**
   línea del trabajo aprueba las 2 y deja la suelta como se indicó.
7. **`quitar_trabajo`:** borra el trabajo y sus líneas. En una orden entregada, falla y no borra
   nada.
8. **`create_work_order`** con `trabajos: [{grupo:'g1', titulo:'Frenos'}]` y dos líneas con
   `grupo:'g1'`: las dos quedan en el mismo trabajo.
9. **`datos_portal`:** las líneas del presupuesto traen `trabajo`.
10. **`trabajos_de_orden`:** `total` y `total_aprobado` correctos.

### H4. Seguridad

En `scripts/qa/api-security.mjs`, casos nuevos con el patrón de los de la `029`:
- un técnico no lee `catalogo_trabajos`;
- un técnico no llama `agregar_trabajo_del_catalogo` ni `guardar_trabajo_catalogo`;
- anon no llama ninguna de las funciones nuevas.

---

## Parte I: trabajos agrupados y catálogo, las pantallas (plan 1.1)

Parte de la base de la parte H, ya verificada. **No toques `supabase/`.**

### I1. Tipos y servicios

1. **`src/types/domain/catalog.types.ts`** (exportado desde `src/types/database.ts`):
   - `CatalogJobLine`: `id?`, `tipo`, `descripcion`, `especialidad`, `cantidad`, `precio`,
     `costo_unitario`, `posicion`;
   - `CatalogJob`: `id`, `nombre`, `activo`, `total`, `lineas`;
   - `OrderJob`: `id`, `titulo`, `catalogo_id`, `total`, `total_aprobado`, `lineas`;
   - `LaborItem` y el tipo de repuesto suman `trabajo_id?: string | null`;
   - `WorkOrder` suma `trabajos?: { id: string; titulo: string; catalogo_id: string | null }[]`.
2. **`src/services/catalog.service.ts`** (con prueba, como `nextService.service.test.ts`):
   - `list(sedeId, incluirInactivos)` → `catalogo_de_trabajos`;
   - `save(input)` → `guardar_trabajo_catalogo`;
   - `remove(id)` → `borrar_trabajo_catalogo`.
3. **`src/services/workOrders.service.ts`:**
   - funciones `addJobFromCatalog(orderId, catalogId, asignadoA)`, `removeJob(id)`,
     `renameJob(id, titulo)` y `getOrderJobs(orderId)`;
   - `'orden_trabajos'` entra en `ORDER_TABLES` (`:43`);
   - la consulta del detalle (`:191`) suma `trabajos:orden_trabajos(id, titulo, catalogo_id)`;
   - `createWorkOrder` manda `trabajos` dentro de `p_order`, y `grupo` en cada ítem de mano de
     obra y de repuestos que lo traiga. Agrega el caso a `workOrders.service.test.ts`.
4. **`src/lib/queryClient.ts`:** claves `catalog(sedeId)` y `orderJobs(orderId)`.

### I2. El catálogo en Configuración (admin)

1. **`src/features/catalog/JobCatalogCard.tsx`,** después de `ParkingSettingsCard` en
   `src/pages/Settings.tsx:508`.
   - Elige la sede igual que `ParkingSettingsCard` (`selectedSedeId`).
   - Muestra la lista: nombre, total (con `money()`, el que viene de la base), si está activo,
     editar y borrar (`confirm`).
   - El botón «Nuevo trabajo» abre el editor.
   - Estado vacío: «Todavía no hay trabajos en el catálogo. Arma los que más haces (cambio de
     aceite, frenos…) para agregarlos con un toque.».
2. **`CatalogJobModal.tsx`** (`modal-overlay` + `modal`):
   - el nombre;
   - las líneas: «+ Mano de obra» (descripción, especialidad, precio) y «+ Repuesto»
     (descripción, cantidad, precio y costo opcional), cada una con su botón de quitar;
   - activo/inactivo;
   - guardar con `catalog.save`, con la `posicion` = el índice;
   - un 23505 se muestra como «Ya hay un trabajo con ese nombre en esta sede.».
3. **Montos:** no muestres un total calculado en el navegador. Al editar, el total se ve
   después de guardar, en la lista.

### I3. Agregar desde el catálogo en la orden (admin)

1. **En `LaborTable.tsx`,** junto al «Agregar trabajo» de `TaskEditor` (solo admin y si se
   pueden editar líneas), un botón secundario «Del catálogo» abre
   `src/features/catalog/CatalogPickerModal.tsx`.
2. **El selector:**
   - busca por nombre entre los trabajos activos **de la sede de la orden** (`orderSede`, no
     `currentSede`; regla 9 de `ai-context.md`);
   - cada uno con su total y cuántas líneas tiene;
   - al elegir uno, muestra sus líneas y un `TechnicianSelect` que viene elegido con
     `suggestedTechnicianFor` (la especialidad de la primera mano de obra);
   - «Agregar» llama a `addJobFromCatalog`, refresca el detalle e invalida `orderJobs`. Toast de
     éxito.
3. **Cómo se ve:** en `LaborTable`, `PartsTable` y `TechnicianTaskList`, una línea con
   `trabajo_id` muestra una ficha pequeña (`.job-chip`, solo tokens) con el título de su trabajo
   (de `order.trabajos`).
4. **Lista de trabajos:** en la sección `mano_obra`, arriba de la tabla y solo si la orden tiene
   trabajos y es admin, una lista compacta (`OrderJobsList.tsx`):
   - título, total (de `getOrderJobs`) y cantidad de líneas;
   - renombrar;
   - quitar, con `confirm` «Se quitará el trabajo y sus N líneas.».

### I4. El catálogo en el alta

1. En el paso «Trabajos» de `WorkOrderCreateModal.tsx` (junto al `TaskEditor` de `:596`), el
   mismo «Del catálogo» abre el selector **en modo borrador**: no llama a la base; devuelve el
   trabajo elegido.
2. **Al elegirlo:**
   - sus manos de obra entran a `form.labor` y sus repuestos a `form.parts`, todos con el mismo
     `grupo` (`crypto.randomUUID()`);
   - se agrega `{grupo, titulo, catalogo_id}` a un campo nuevo del formulario, `jobs`;
   - las líneas muestran la ficha con el título.
3. **El formulario:** `jobs` va en `workOrderForm.schema.ts`, en el paso `work` de `INTAKE_STEPS`
   (lo exige `workOrderForm.schema.test.ts`), y los ítems de mano de obra y de repuestos suman
   `grupo?: string`.
4. **Al guardar** (`src/pages/WorkOrders.tsx`, cerca de `:445`), se mandan solo los `jobs` que
   todavía tienen líneas, y cada ítem lleva su `grupo`.

### I5. Autorizar por trabajo

1. **Portal** (`QuoteSection`, `src/portal/CustomerPortal.tsx` cerca de `:814`):
   - las líneas con `trabajo_id` se agrupan en **una casilla por trabajo**, con el título y el
     `total` que manda `presupuesto.trabajos`;
   - las líneas del trabajo se listan debajo, sin casilla propia;
   - las sueltas, como hoy;
   - marcar un trabajo marca todos sus ids. `approvedIds` y `shownIds` siguen siendo ids de
     línea.
   - En `portal.types.ts`, `PortalQuoteLine` suma `trabajo_id?` y `trabajo?`, y `PortalQuote`
     suma `trabajos?`.
   - En `src/portal/translate.ts`, se traducen `trabajo` y los títulos de `trabajos` con el
     mismo diccionario.
   - En `strings.ts`, `quoteIncludes`: «Incluye» / «Includes».
2. **Administración:** en el modal de autorización de `QuoteCard.tsx` (`:230`) y en
   `AuthorizationPanel.tsx`, la misma agrupación de casillas.

### I6. Manual y pruebas

1. **Manual** (ES y EN, misma estructura):
   - el catálogo en Configuración;
   - «Del catálogo» en la orden y en el alta;
   - que el cliente autoriza el trabajo completo.
2. **Pruebas:**
   - `catalog.service`;
   - `JobCatalogCard`: crear con el servicio simulado y mostrar el 23505;
   - `CatalogPickerModal`: modo orden llama a `addJobFromCatalog`; modo borrador devuelve el
     trabajo;
   - el portal: marcar un trabajo manda todos sus ids;
   - la carga del alta lleva `trabajos` y `grupo`;
   - la prueba del esquema.
3. **Fuera de esta parte:** el PDF agrupado por trabajo.

---

## Parte J: inspección por puntos, la base (plan 1.4)

**Qué cambia para el taller.**
- **El técnico revisa el carro** con una lista de puntos (frenos, llantas, fluidos, luces…). Marca
  cada uno con un toque: **bien**, **atención** o **urgente**, y le toma foto.
- **Administración la revisa y la muestra al cliente** en su enlace. Lo que salió en atención o
  urgente se cotiza con lo de siempre (tarea o catálogo).
- **Lo que no se hizo queda como pendiente del vehículo** para la próxima visita.

Las 6 zonas de fotos de la recepción **no cambian**: son otra cosa (cómo llegó el carro).

**Migración `20261010000035_inspeccion_por_puntos.sql`.** Sigue `.claude/commands/nueva-migracion.md`.

### J0. Tablas

1. **Plantillas por sede** (solo admin, como el catálogo):
   - `inspeccion_plantillas`:
     - `id`;
     - `sede_id NOT NULL REFERENCES sedes ON DELETE CASCADE`;
     - `nombre text NOT NULL` (CHECK: no vacío, 120 caracteres o menos);
     - `activo boolean NOT NULL DEFAULT true`;
     - `predeterminada boolean NOT NULL DEFAULT false`;
     - `creado_en`, `actualizado_en`;
     - índice único parcial: una sola predeterminada por sede.
   - `inspeccion_plantilla_puntos`:
     - `id`;
     - `plantilla_id NOT NULL REFERENCES … ON DELETE CASCADE`;
     - `seccion text NOT NULL`;
     - `nombre text NOT NULL` (CHECK de largo como arriba);
     - `posicion integer NOT NULL DEFAULT 0`.
2. **La inspección de la orden:**
   - `orden_inspecciones`:
     - `id`;
     - `orden_id NOT NULL REFERENCES ordenes_trabajo ON DELETE CASCADE`;
     - `plantilla_id REFERENCES inspeccion_plantillas ON DELETE SET NULL`;
     - `nombre text NOT NULL`;
     - `creado_por`, `creado_en`;
     - `completada_en`, `completada_por`;
     - `publicada_en timestamptz`;
     - `UNIQUE (orden_id)`: una por orden.
   - `orden_inspeccion_puntos`:
     - `id`;
     - `inspeccion_id NOT NULL REFERENCES orden_inspecciones ON DELETE CASCADE`;
     - `orden_id uuid NOT NULL` (copiado de la inspección, para RLS y para la llave de abajo);
     - `seccion`, `nombre`, `posicion`;
     - `estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN
       ('pendiente','bien','atencion','urgente','no_aplica'))`;
     - `nota text` (CHECK de 500 caracteres o menos);
     - `actualizado_por`, `actualizado_en`;
     - `UNIQUE (id, orden_id)`;
     - índices en `inspeccion_id` y `orden_id`.
3. **RLS:**
   - plantillas: todo solo `(SELECT public.is_admin())`, con grants como el catálogo de la `034`;
   - inspección y puntos: SELECT con la condición de `orden_labor_select` (admin o asignado).
     **Sin INSERT, UPDATE ni DELETE desde la API:** `REVOKE ALL` y `GRANT SELECT` a
     `authenticated`. Se escribe solo por las RPC de J1.
4. **Fotos por punto, en `orden_media`:**
   - **la columna:** `inspeccion_punto_id uuid`, con su índice y la llave compuesta
     `FOREIGN KEY (inspeccion_punto_id, orden_id) REFERENCES orden_inspeccion_puntos(id, orden_id)
     ON DELETE CASCADE`;
   - **los CHECK:** suelta `orden_media_origen_check` y `orden_media_origen_coherente`, y créalos
     de nuevo:
     - `origen IN ('recepcion','avance','inspeccion')`;
     - `(origen = 'avance') = (avance_id IS NOT NULL) AND (origen = 'inspeccion') =
       (inspeccion_punto_id IS NOT NULL)`;
   - **la política de INSERT** (`orden_media_rows_insert`) no cambia: la llave compuesta ya
     impide colgar una foto en el punto de otra orden.
5. **Realtime:** `orden_inspecciones` y `orden_inspeccion_puntos` entran a `supabase_realtime`.
6. **La plantilla de siempre:**
   - `_sembrar_plantilla_inspeccion(p_sede_id uuid)`: una función interna `SECURITY DEFINER`,
     revocada de todos, que crea la plantilla «Inspección multipunto» predeterminada con estos
     puntos, en este orden:
     - **Frenos:** pastillas delanteras; pastillas traseras; discos; líquido de frenos.
     - **Llantas:** profundidad; presión; desgaste irregular / alineación.
     - **Fluidos:** aceite de motor; refrigerante; líquido de transmisión; líquido de
       dirección; líquido limpiaparabrisas.
     - **Suspensión y dirección:** amortiguadores; terminales y rótulas; fugas.
     - **Luces:** faros; luces de freno; direccionales.
     - **Batería y bandas:** batería; bandas.
     - **Filtros:** filtro de aire; filtro de cabina.
     - **Vidrios y carrocería:** plumas limpiaparabrisas; parabrisas; pintura y golpes.
   - Se llama para cada sede existente.
   - Un trigger `AFTER INSERT ON sedes` la llama para las sedes nuevas, dentro de un bloque que
     solo avisa con un WARNING si falla.

### J1. Funciones

**Quién puede llamarlas.** Las que puede llamar el técnico son `SECURITY DEFINER` con `SET
search_path = public` y comprueban por dentro «admin, o asignado a la orden
(`is_assigned_to_order`), y la orden no está entregada». Las demás son solo admin. Todas llevan
`REVOKE` y `GRANT EXECUTE ... TO authenticated`.

1. **`iniciar_inspeccion(p_orden_id uuid, p_plantilla_id uuid DEFAULT NULL) RETURNS uuid`**
   (técnico o admin).
   - Si la orden ya tiene inspección, devuelve esa.
   - Si no, copia los puntos de la plantilla indicada, o de la predeterminada **de la sede de la
     orden**. Una plantilla de otra sede da 42501.
2. **`marcar_punto_inspeccion(p_punto_id uuid, p_estado text, p_nota text DEFAULT NULL) RETURNS
   void`** (técnico o admin).
   - Guarda el estado y la nota (recortada; vacía = `NULL`), `actualizado_por = auth.uid()` y
     `actualizado_en = now()`.
   - El estado `pendiente` vale (para deshacer).
3. **`completar_inspeccion(p_inspeccion_id uuid) RETURNS void`** (técnico o admin).
   - Exige que ningún punto siga en `pendiente`: «Faltan N puntos por revisar.».
   - Marca `completada_en` y `completada_por`.
   - Avisa a los admins de la sede con `notificar`, tipo `inspeccion_completada`: «Inspección
     lista · ORD-…», con cuántos puntos quedaron en atención y en urgente.
4. **`publicar_inspeccion(p_inspeccion_id uuid, p_publicar boolean) RETURNS void`** (admin).
   Fija o borra `publicada_en`. Solo se publica una completada.
5. **Plantillas** (admin):
   - `plantillas_inspeccion(p_sede_id uuid) RETURNS jsonb`: cada plantilla con sus puntos
     ordenados;
   - `guardar_plantilla_inspeccion(p_id, p_sede_id, p_nombre, p_activo, p_predeterminada,
     p_puntos jsonb) RETURNS uuid`. Reemplaza los puntos, igual que `guardar_trabajo_catalogo`.
     Si se marca predeterminada, desmarca la anterior de esa sede en la misma transacción;
   - `borrar_plantilla_inspeccion(p_id)`.

### J2. Funciones que cambian (enteras, desde su versión vigente; búscala con `npm run db:donde`)

1. **`datos_portal`, desde la `034`.** Si la orden tiene una inspección **publicada**, suma
   `'inspeccion'`:
   - **sus campos:** `{ nombre, completada_en, resumen: {urgente, atencion, bien}, puntos: [...] }`;
   - **los puntos:** `{id, seccion, nombre, estado, nota}`, sin los `pendiente` ni los
     `no_aplica`, ordenados por urgente, atención, bien y luego `posicion`;
   - **campo por campo, nunca `to_jsonb(fila)`.**

   Las fotos de esos puntos entran a `multimedia` con su `inspeccion_punto_id` (mira cómo se arma
   hoy esa lista y respeta sus filtros). Nada más cambia.
2. **`_textos_cliente`, desde la `034`.** Suma los nombres y las notas de los puntos de una
   inspección publicada.
3. **`trabajos_pendientes_vehiculo`, desde `20261010000018_operacion_del_taller.sql:276`.**
   Suma filas `'inspeccion'` (`monto NULL`): los puntos en `atencion` o `urgente` de
   inspecciones completadas de **otras** órdenes del vehículo. Se respetan el mismo `LIMIT 20` y
   el mismo orden.

### J3. pgTAP `supabase/tests/database/39_inspeccion_por_puntos.test.sql`

Estructura de la `38`. Casos:
1. **La plantilla:** cada sede tiene una predeterminada con 24 puntos, y una sede nueva también.
2. **`iniciar_inspeccion`:**
   - la inicia el técnico asignado;
   - uno no asignado recibe 42501;
   - en una orden entregada, 42501;
   - la segunda llamada devuelve la misma inspección.
3. **RLS:**
   - el técnico asignado lee los puntos; uno no asignado, nada;
   - nadie inserta ni actualiza un punto por la API.
4. **`marcar_punto_inspeccion`:** cambia estado y nota, y deshacer a `pendiente` funciona.
5. **`completar_inspeccion`:** con puntos pendientes da error; con todo marcado completa y
   crea la notificación.
6. **`publicar_inspeccion`:**
   - un técnico recibe 42501;
   - no publica una sin completar;
   - publicada, `datos_portal` trae `inspeccion` sin los pendientes ni los no aplica, con el
     resumen correcto.
7. **`orden_media`:** una foto con `origen = 'inspeccion'` y el punto de otra orden falla; sin
   punto, falla el CHECK.
8. **`trabajos_pendientes_vehiculo`:** trae el punto urgente de la orden anterior del vehículo.
9. **Plantillas:** guardar y reemplazar puntos; marcar una predeterminada desmarca la anterior.

La `15_tiempo_real` suma las dos tablas nuevas a su lista.

### J4. Seguridad

En `scripts/qa/api-security.mjs`:
- un técnico no lee `inspeccion_plantillas`;
- un técnico no inserta en `orden_inspeccion_puntos` (`denied-or-empty`);
- un técnico no llama `publicar_inspeccion`;
- anon no llama ninguna.

---

## Parte K: inspección por puntos, las pantallas (plan 1.4)

Parte de la base de la parte J, ya verificada. **No toques `supabase/`.**

### K1. Servicio y tipos

1. **`src/services/inspection.service.ts`** (con prueba): `getForOrder(orderId)`, que lee
   `orden_inspecciones` con sus puntos por la API (es lectura con RLS); `start`, `markPoint`,
   `complete`, `publish`, y lo de las plantillas por RPC.
2. **`'orden_inspecciones'` y `'orden_inspeccion_puntos'`** entran a `ORDER_TABLES`.
3. **Tipos** en `src/types/domain/inspection.types.ts`; las claves `inspection(orderId)` y
   `inspectionTemplates(sedeId)` en `queryClient.ts`.
4. **Las fotos de un punto:** el destino de `enqueueMedia` (`useWorkOrderDetail.ts`, cerca de la
   786) acepta `{ origen: 'inspeccion', inspeccionPuntoId }`, y el servicio de medios manda
   `inspeccion_punto_id`. Las fotos de inspección no salen en la galería de avances ni en la de
   recepción (`src/lib/reportMedia.ts` y los filtros de la orden).

### K2. La inspección en la orden

**Va dentro de la sección `inspeccion` existente** (`TAB_SECTIONS`): no hay tarjeta nueva. Debajo
de las 6 zonas va el bloque «Inspección por puntos» (`src/features/inspection/PointInspection.tsx`).

1. **Sin inspección:** un botón «Iniciar inspección», para admin o técnico asignado.
2. **Con inspección:**
   - **El avance:** «18 de 24 revisados».
   - **Los puntos, por sección.** Cada punto, en un renglón:
     - su nombre;
     - **tres botones grandes** (44 px o más, en el teléfono de 390 px): «Bien» (verde),
       «Atención» (amarillo) y «Urgente» (rojo), cada uno con su token de color e ícono. El
       elegido, resaltado;
     - un «N/A» pequeño;
     - un botón de cámara que toma la foto del punto con lo de siempre (la cola de subidas);
     - las miniaturas;
     - la nota, que se abre al tocar.
   - **Un toque por punto:** marcar llama `markPoint` al instante, con estado optimista y
     reintento si falla.
   - **«Terminar inspección»** se activa cuando no queda ningún punto pendiente.
3. **Admin, con la inspección terminada:**
   - el interruptor «Mostrar al cliente», que llama `publish`;
   - en cada punto en atención o urgente, «Cotizar», que abre lo mismo que «Cotizar» de un
     hallazgo (el `TaskEditor` precargado con el nombre y la nota del punto, mira cómo lo hace
     `FindingsCard`) y, al lado, «Del catálogo» (el `CatalogPickerModal` de la parte I).
4. **Técnico:** en `buildTechActions` (`techNextStep.ts`), la acción rápida «Inspección» (no
   principal) lleva a `goTo('orden', 'inspeccion')`.

### K3. Plantillas en Configuración

`src/features/inspection/InspectionTemplatesCard.tsx` va después de `JobCatalogCard`, con el
mismo patrón:
- la lista de plantillas;
- el editor: nombre, predeterminada, y los puntos por sección (agregar, quitar, subir y bajar);
- guardar con la RPC.

### K4. El cliente

1. **Portal:** la sección «Inspección de su vehículo» (`PortalSection`).
   - Arranca abierta si hay algo en urgente o en atención.
   - Arriba, tres fichas de resumen: urgente, atención y bien.
   - Luego, lo urgente y lo de atención con su nota y sus fotos (las de `multimedia` con su
     `inspeccion_punto_id`).
   - Lo que está bien va en una lista plegada.
   - Los textos pasan por el diccionario de `translate.ts`.
   - En `strings.ts`, es y en.
2. **Pendientes:** `PendingWorkNotice` muestra las filas `inspeccion` («Inspección:
   pastillas delanteras, urgente — ORD-…»).

### K5. Manual y pruebas

1. **Manual** (ES y EN, misma estructura):
   - cómo el técnico hace la inspección;
   - cómo administración la revisa, la cotiza y la muestra;
   - las plantillas.
2. **Pruebas:**
   - el servicio;
   - `PointInspection`: marcar llama `markPoint`; «Terminar» está desactivado con pendientes;
     el técnico no ve «Mostrar al cliente»;
   - la plantilla en Configuración;
   - el portal: la sección y el resumen;
   - `PendingWorkNotice` con una fila de inspección.

---

## Parte L: horas, reloj por tarea e indicadores, la base (plan fase 3)

**Qué cambia para el taller.**
- Cada mano de obra puede llevar sus **horas facturadas**.
- El técnico **arranca y pausa el reloj** de su tarea con un toque.
- Administración ve los **números del dueño**: número de carros, ticket promedio (ARO), tarifa
  efectiva por hora, margen de mano de obra y de repuestos, horas por orden, eficiencia por
  técnico, aprobación de presupuestos y días en el taller.

**Fuera de esta parte:** la matriz de margen de repuestos y el tablero por etapas (van después).

**Migración `20261010000036_horas_reloj_e_indicadores.sql`.**

### L0. Columnas y tablas

1. **Columnas nuevas:**
   - `orden_labor.horas numeric(6,2) CHECK (horas >= 0)`, que puede ir vacía (= sin horas);
   - `catalogo_trabajo_lineas.horas`, igual; solo tiene sentido en mano de obra. Agrégalo al
     CHECK de forma: un repuesto lleva `horas IS NULL`;
   - `sedes.tarifa_hora numeric(10,2) CHECK (tarifa_hora >= 0)`, también puede ir vacía. Es una
     referencia para comparar la tarifa efectiva y no calcula precios.
2. **`orden_labor_tiempos`:**
   - `id`;
   - `labor_id uuid NOT NULL`;
   - `orden_id uuid NOT NULL`;
   - `usuario_id uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE`;
   - `inicio timestamptz NOT NULL DEFAULT now()`;
   - `fin timestamptz`, con `CHECK (fin IS NULL OR fin >= inicio)`;
   - la llave `FOREIGN KEY (labor_id) REFERENCES orden_labor(id) ON DELETE CASCADE`;
   - un índice único parcial `(usuario_id) WHERE fin IS NULL`: **un solo reloj corriendo por
     persona**;
   - índices en `labor_id`, `orden_id` y `usuario_id`.
3. **RLS de `orden_labor_tiempos`:**
   - SELECT: admin, o `usuario_id = (SELECT auth.uid())`, o la orden es suya (como
     `orden_labor_select`);
   - **sin escritura por la API:** `REVOKE ALL`, `GRANT SELECT`.
4. **Realtime:** la tabla entra a `supabase_realtime`. La `15_tiempo_real` la suma a su lista.

### L1. Funciones

1. **Reloj** (`SECURITY DEFINER`, `SET search_path = public`).
   - **`iniciar_reloj(p_labor_id uuid) RETURNS uuid`.**
     - Lo usa el técnico asignado a esa línea (`asignado_a = auth.uid()`) o un admin.
     - La línea tiene que estar `aprobado`, sin `completado_en`, y la orden no entregada.
     - Si la persona ya tiene un reloj corriendo (en esa u otra línea), lo cierra
       (`fin = now()`) y abre el nuevo.
     - Devuelve el id.
   - **`detener_reloj(p_labor_id uuid) RETURNS void`.** Cierra el reloj de esa persona en esa
     línea. Sin reloj corriendo no hace nada.
   - **Trigger auxiliar** en `orden_labor`, `AFTER UPDATE OF completado_en`: al marcar la tarea
     hecha, cierra los relojes que corren en esa línea. Va dentro de un bloque que solo avisa con
     un WARNING si falla.
   - **`corregir_tiempo(p_tiempo_id uuid, p_inicio timestamptz, p_fin timestamptz)`** y
     **`borrar_tiempo(p_tiempo_id uuid)`**: solo admin.
2. **`indicadores_taller(p_sede_id uuid, p_desde date, p_hasta date) RETURNS jsonb`**
   (`SECURITY INVOKER`, solo admin, 42501 si no lo es).
   - **El período:** las fechas se toman en la zona del taller (lo que hace `hoy_taller`). Una
     orden **cuenta como entregada** en el período si `estatus = 'entregado'` y su
     `fecha_finalizacion`, convertida a la fecha del taller, cae entre `p_desde` y `p_hasta`.
   - **Las cuentas: se cobra solo lo `aprobado`.**
     - `carros_recibidos`: órdenes con `fecha_ingreso` en el período;
     - `carros_entregados`;
     - `ventas_mano_obra`: la suma de `costo` de la mano de obra aprobada de las entregadas;
     - `ventas_repuestos`: `subtotal` de los repuestos aprobados;
     - `costo_repuestos`: `costo_unitario * cantidad` de los repuestos aprobados;
     - `descuentos`: `orden_montos.descuento`;
     - `ticket_promedio`: el promedio de `orden_montos.total_general` de las entregadas;
     - `comisiones`: la suma de `comisiones.monto` de esas órdenes, aceptadas o pagadas (mira
       las columnas reales de `comisiones`);
     - `margen_mano_obra`: `(ventas_mano_obra - comisiones) / ventas_mano_obra`;
     - `margen_repuestos`: `(ventas_repuestos - costo_repuestos) / ventas_repuestos`;
     - `horas_facturadas`: la suma de `horas` de la mano de obra aprobada; vacía = 0;
     - `tarifa_efectiva`: `ventas_mano_obra / horas_facturadas`;
     - `horas_por_orden`: `horas_facturadas / carros_entregados`;
     - `tarifa_hora_sede`;
     - `aprobacion_presupuestos`: `SUM(total_aprobado) / SUM(total_propuesto)` de los presupuestos
       respondidos en el período (por `respondido_en`);
     - `dias_promedio_en_taller`: de `fecha_ingreso` a `fecha_finalizacion`, en días con un
       decimal.
     - **Toda división entre cero da `NULL`.**
   - **`por_tecnico`:** un arreglo de `{usuario_id, nombre, horas_facturadas, horas_reloj,
     eficiencia, tareas_completadas}`, uno por mecánico o pintor de la sede:
     - `horas_facturadas`: sus líneas aprobadas, de las órdenes entregadas en el período;
     - `horas_reloj`: la suma de sus tiempos cerrados con `inicio` en el período;
     - `eficiencia`: facturadas entre reloj;
     - `tareas_completadas`: con `completado_en` en el período.
   - El encabezado de la función explica cada indicador en una línea, en español.

### L2. Funciones que cambian (enteras, desde su versión vigente)

1. **`create_work_order`, desde la `034`:** lee `item->>'horas'` (vacío = `NULL`).
2. **`agregar_trabajo_del_catalogo`, desde la `034`:** copia `horas`.
3. **`guardar_trabajo_catalogo` y `catalogo_de_trabajos`, desde la `034`:** guardan y devuelven
   `horas`.
4. **El historial** (el trigger `trg_historial` de `orden_labor`; la versión vigente de la
   función y del trigger se busca con `npm run db:donde`): `horas` entra a la lista de campos de
   la mano de obra y a su `UPDATE OF`. **Lo decide alguien, así que va al historial.**

### L3. pgTAP `supabase/tests/database/40_horas_reloj_indicadores.test.sql`

Estructura de la `38`. Casos:
1. **Reloj:**
   - el técnico asignado inicia;
   - iniciar otra línea cierra la primera;
   - otro técnico recibe 42501;
   - una línea sin aprobar o una orden entregada, 42501;
   - marcar la tarea hecha cierra su reloj;
   - nadie inserta tiempos por la API;
   - el técnico no ve los tiempos de una orden ajena.
2. **`indicadores_taller`**, con dos órdenes entregadas en el período y una fuera:
   - los dos carros entregados;
   - las ventas de mano de obra y de repuestos, y el costo de repuestos;
   - el ticket promedio;
   - las horas y la tarifa efectiva;
   - una división entre cero da `NULL`;
   - la eficiencia del técnico con su reloj;
   - un técnico recibe 42501.
3. **El catálogo y el alta** llevan las horas.
4. **El historial** registra un cambio de horas.

### L4. Seguridad

En `api-security.mjs`:
- un técnico no inserta en `orden_labor_tiempos`;
- un técnico no llama `indicadores_taller` ni `corregir_tiempo`;
- anon no llama ninguna.

---

## Parte M: horas, reloj e indicadores, las pantallas (plan fase 3)

Parte de la base de la parte L, ya verificada. **No toques `supabase/`.**

### M1. Horas

- **El campo «Horas»** (opcional, `inputMode="decimal"`) está en:
  - `TaskEditor`, solo admin;
  - el editor de una línea existente;
  - las líneas de mano de obra del editor del catálogo.
- **`LaborTable`** muestra las horas.
- **El alta** las manda en cada ítem (`horas`).
- **La tarjeta de la sede en Configuración** suma «Tarifa por hora (referencia)».

### M2. Reloj del técnico

1. **En `TechnicianTaskList`,** cada tarea aprobada y no hecha **del técnico** lleva un botón de
   44 px o más: «▶ Iniciar» o «⏸ Pausar», con el tiempo que lleva corriendo (se actualiza cada
   minuto).
2. **El servicio:** `workOrdersService.startClock` y `stopClock`; los tiempos se leen de
   `orden_labor_tiempos` por la API.
3. **Para administración:** en `LaborTable`, junto a cada línea, el tiempo total registrado
   (horas y minutos) y un enlace «Tiempos» que abre la lista para corregir o borrar.
4. **Las cuentas del reloj:**
   - **El tiempo no es dinero:** sumarlo en el navegador está permitido.
   - **Las horas facturadas y los indicadores** salen de la base.

### M3. Indicadores

1. **En Finanzas,** la pestaña nueva «Indicadores», en el `tablist` de `src/pages/Finance.tsx:308`.
   No hay página ni menú nuevo.
2. **Arriba:**
   - el selector de sede;
   - el período: «Este mes», «Mes pasado», «Últimos 30 días» o un rango (las fechas con
     `lib/dates.ts`).
3. **Las fichas de indicadores**, en una cuadrícula de 2 columnas en el teléfono y 4 en
   escritorio:
   - carros entregados, ticket promedio, tarifa efectiva (y la de referencia), horas por orden;
   - margen de mano de obra y de repuestos, aprobación de presupuestos, días en el taller;
   - el dinero con `money()`;
   - los porcentajes con `Intl.NumberFormat` `percent`;
   - `NULL` = «—».
4. **Debajo, la tabla por técnico:** horas facturadas, horas de reloj, eficiencia y tareas
   (`cards-on-mobile`).
5. **Cada indicador lleva una ayuda corta** (`title` y texto) con su definición, en es y en.
6. **Sigue la skill `dataviz`** (fichas de indicadores) si la tienes; si no, el estilo de las
   tarjetas del panel.

### M4. Manual y pruebas

1. **Manual** (ES y EN): horas, reloj e indicadores.
2. **Pruebas:**
   - el servicio de indicadores;
   - la pestaña con datos simulados: muestra «—» en `NULL`;
   - el botón del reloj inicia y pausa;
   - el campo de horas del `TaskEditor` se manda.

---

## Lo que hace Claude

- Correr todo y verificar.
- `npm audit fix`.
- Pasar todo al repositorio.

No se hace commit ni se publica sin que la persona responsable lo pida.
