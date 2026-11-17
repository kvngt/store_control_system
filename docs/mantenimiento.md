# Mantenimiento: revisión de la estructura antes de producción

Revisión del 29 de septiembre de 2026, con la plataforma recién limpiada y antes de atender
clientes reales. Pregunta de partida: **cuando haya que cambiar una parte en producción,
¿se sabe a dónde ir, y se puede cambiar la base sin comprometer toda la operación?**

Dónde está cada parte: [mapa-de-secciones.md](mapa-de-secciones.md). Reglas que no se rompen:
[ai-context.md](ai-context.md).

> **Actualización al 16/11/2026:** la revisión del 1 de octubre de 2026 está en
> [evaluacion-2026-10.md](historico/evaluacion-2026-10.md) (`P0-2` plan Pro ya hecho; staging
> remoto sigue pendiente, aunque las E2E locales corren con `npm run test:e2e:local`; en Sentry,
> `VITE_SENTRY_DSN` ya está en Hostinger y solo falta `SENTRY_AUTH_TOKEN`).
> Los puntos `P1-1`, `P1-2`, `P1-3`, `P2-3`, `P2-4` y `P2-7` de este documento ya se completaron
> entre el 19/10 y el 16/11/2026. Las secciones 4 y 5 (salvo lo marcado como resuelto) siguen vigentes.

---

## Índice

1. [Veredicto](#1-veredicto)
2. [Base de datos](#2-base-de-datos)
3. [Código](#3-código)
4. [Cambiar la base sin comprometer la operación](#4-cambiar-la-base-sin-comprometer-la-operación)
5. [Plan priorizado](#5-plan-priorizado)
6. [Cómo se revisó](#6-cómo-se-revisó)

---

## 1. Veredicto

| Área | Estado | Lo que preocupa |
|---|---|---|
| **Seguridad y rendimiento de la base** | Bien | Nada urgente |
| **Saber dónde vive cada regla de la base** | Riesgo medio | La versión vigente de una función está en la última de hasta 5 migraciones que la reescriben; `ordenes_trabajo` dispara 20 triggers |
| **Cambiar la base sin romper la operación** | **Riesgo alto** | No hay staging ni respaldos: cada migración se prueba en local y va directo al único proyecto |
| **Modularidad del código** | Bien, con puntos a partir | Capas claras y bien probadas; unos pocos archivos concentran demasiado |

Lo más importante no es de código: **un proyecto de staging y respaldos** (sección 5, P0).
Con eso, un error en una migración se descubre antes de llegar al taller o se deshace.

---

## 2. Base de datos

### Lo que está bien

Comprobado contra el proyecto real, con consultas de solo lectura al catálogo:

| Verificación | Resultado |
|---|---|
| Tablas con llave primaria y RLS | **23 de 23** |
| Políticas permisivas duplicadas en la misma tabla y acción (cada una se evalúa en cada fila) | **0** |
| Políticas que llaman `auth.uid()`, `is_admin()` o `current_user_sede_id()` sin envolverlas en `(SELECT …)` (se recalcularían por fila) | **0** |
| Funciones `SECURITY DEFINER` sin `search_path` fijo | **0** |
| Funciones que puede ejecutar `anon` | 3: `is_admin`, `current_user_role`, `current_user_sede_id`. Las usan las políticas y sin sesión devuelven vacío |
| Llaves foráneas sin índice | 1: `perfiles_pago.actualizado_por`, en una tabla de decenas de filas. No lo amerita |
| Índices duplicados en `public` | 0 |
| Tamaño | 19 MB, 111 funciones, 4 tareas programadas |

El diseño de fondo también está bien. Todo el dinero lo calcula la base, con triggers
idempotentes y con signo. Los montos viven en tablas que un técnico no puede leer. Cada regla
de permisos está en RLS o en un trigger, no en la pantalla. Y las pruebas pgTAP aplican todas
las migraciones desde cero en cada cambio (CI).

### Riesgos para el mantenimiento

**R-B1. La versión vigente de una función está repartida en migraciones.** Hay 99 migraciones en el repositorio (al 16/11/2026, hasta `20261010000045`; 99 aplicadas en producción; 161 funciones contadas al 11/10/2026 en la migración `028`, más las de `029` a `045`). Cuando una cambia, la migración nueva
la reescribe entera. `handle_order_delivery_payment` va por su quinta versión;
`sync_order_commissions`, `pay_commissions`, `create_work_order`, `recalculate_order_totals` y
`trg_guard_order_technician`, por la cuarta o posterior. El riesgo concreto: quien la cambie parte de una
versión vieja y **deshace sin darse cuenta** un arreglo posterior. No da error: la migración
se aplica y el arreglo desaparece.
*Mitigación ya hecha:* `npm run db:donde -- <nombre>` dice en qué migración está la vigente, `npm run db:types` regenera `src/types/supabase.gen.ts` validado contra `schema.contract.ts`, y `npm run db:schema` genera `supabase/schema/actual.sql` desde la base local (comprobado en CI).

**R-B2. `ordenes_trabajo` tiene 20 triggers.** Entregar una orden dispara, en la misma
transacción, el cobro, el costo de repuestos, las comisiones, el portal, los avisos y los
guardias. Postgres ejecuta los triggers de un mismo momento **en orden alfabético de su
nombre**: renombrar uno puede cambiar el orden sin que nada lo avise. Hoy ninguno depende de
que otro corra antes, y las pruebas `01`, `11`, `12` y `13` cubren el flujo completo.
*Propuesta:* no renombrar triggers de `ordenes_trabajo`; si uno nuevo depende de otro, un
prefijo que fije el orden (`trg_10_…`, `trg_20_…`) en esa misma migración.

**R-B3. No hay staging remoto.** `qa:security` y las migraciones publicadas siguen yendo al proyecto real tras probarse en local (aunque las pruebas E2E de Playwright ya corren contra el Supabase local con `npm run test:e2e:local`, sin tocar producción). Toda migración va de la base local al taller.

**R-B4. No hay respaldos.** *(Resuelto el 30/09/2026: el proyecto pasó a Pro, con respaldo diario.)* El plan Free no los hace. Un error en una migración de datos o un
borrado en cascada no tiene vuelta atrás.

**R-B5. Un admin puede borrar movimientos automáticos de Finanzas.** *(Resuelto el 19/10/2026 en `20261010000038`: la columna `finanzas_movimientos.origen` distingue `manual` de `sistema` y las políticas RLS de UPDATE y DELETE bloquean editar o borrar movimientos del sistema por la API.)* Borrar un "Pago final"
descuadra los cálculos posteriores de esa orden. Conocido desde la auditoría; sigue abierto
([reglas-de-negocio.md §10](reglas-de-negocio.md)).

---

## 3. Código

### Lo que está bien

- **Capas claras.** Toda consulta a Supabase está en `src/services/` (módulos por
  dominio; `workOrders.service.ts` compuesto desde `services/workOrders/`). Solo
  `context/AuthContext.tsx` y `lib/schemaVersion.ts` llaman a Supabase fuera de ahí, y son
  infraestructura. La lógica sin React vive en `lib/` y se prueba sin navegador.
- **Las partes grandes ya están en módulos** (`features/workOrders/detail/`,
  `features/workOrders/intake/`, `features/settings/`, `portal/components/`, `media`,
  `notifications`, `employees`, `finance`).
- **Red de pruebas amplia (al 16/11/2026):** 1.274 pruebas Vitest (175 archivos), 1.193 pruebas
  pgTAP (49 archivos), 102 pruebas Deno 2 (`npm run test:functions`), 85 e2e contra la base
  local (`npm run test:e2e:local`; 84 en verde, `MED-01` en arreglo) y `qa:security:local`
  (209 PASS, 0 FAIL, 0 SKIP; más `qa:security` contra producción). TypeScript estricto, lint sin avisos, CI en
  cada cambio (cifras vigentes en [radiografia.md §1](radiografia.md#1-cifras-actuales-del-proyecto)).
- **Portal del cliente aislado**: no importa nada de la app.

### Riesgos

Archivos que concentran varias responsabilidades. Un cambio pequeño obliga a leer mucho, y dos
personas que tocan partes distintas chocan en el mismo archivo:

| Archivo | Líneas | Qué mezcla |
|---|---:|---|
| `i18n/translations.ts` | 1 837 (al 29/09) | Todos los textos de la app, los dos idiomas |
| `styles/components.css` | 4 560 (al 29/09) | Todos los estilos de componentes |
| ~~`portal/CustomerPortal.tsx`~~ | 1 469 → 125 | *(Dividido el 15/11/2026)* Carga el token y elige; secciones en `portal/components/` |
| ~~`pages/Settings.tsx`~~ | 962 → 66 | *(Dividido el 15/11/2026)* Decide qué tarjetas ve cada rol; tarjetas en `features/settings/` |
| ~~`features/workOrders/useWorkOrderDetail.ts`~~ | 1 184 → 204 | *(Dividido el 15/11/2026)* Mantiene su API compuesta con los 6 subhooks de `detail/` |
| ~~`pages/WorkOrders.tsx`~~ | 1 080 → 326 | *(Dividido el 15/11/2026)* Lista en `list/OrderList.tsx` y tablero; alta en `intake/` (`WorkOrderCreateModal.tsx`: 977 → 198) |
| `pages/Finance.tsx` | 586 (al 29/09) | Tarjetas, movimientos, alta manual e importación |
| `pages/Payroll.tsx` | 558 (al 29/09) | Saldos, historial, pagos y porcentaje de la sede |

*(También se dividieron el 14–15/11/2026 `features/workOrders/WorkOrderDetail.tsx` de 1 393 a 383 líneas y `services/workOrders.service.ts` de 1 002 a 21 líneas compuesto desde `services/workOrders/`.)*

Una inconsistencia menor de estructura:

- **Unas secciones viven en `features/` y otras enteras en `pages/`.** Órdenes, empleados y
  multimedia están en módulos; clientes, vehículos, finanzas y comisiones están completas en
  su página. No es un error, pero para cambiar Finanzas hay que saber que está en `pages/`.
  El mapa lo dice ([mapa-de-secciones.md](mapa-de-secciones.md)). (La fachada heredada
  `services/supabaseService.ts` ya se retiró el 14/11/2026: cada archivo y cada prueba
  importan o simulan directo el servicio del dominio.)

---

## 4. Cambiar la base sin comprometer la operación

### Qué hace riesgosa una migración

| Tipo de cambio | Riesgo | Cómo hacerlo |
|---|---|---|
| Tabla, columna con valor por omisión, índice o función **nuevos** | Bajo: nada existente lo usa | Directo |
| **Reescribir una función** (triggers de dinero, RPC) | Medio: puede deshacer un arreglo anterior (R-B1) | `npm run db:donde`, partir de la vigente, pgTAP del flujo |
| **Cambiar una política RLS** | Alto: afecta a todos los usuarios al instante | pgTAP por rol, `qa:security` en staging |
| **Borrar o renombrar** una columna o función que usa la app | Alto: el `dist` publicado se rompe hasta que se suba el nuevo | En dos pasos (abajo) |
| **Rellenar datos** (`UPDATE` masivo) | Alto: dispara triggers de dinero y de avisos | Deshabilitar los triggers solo durante el relleno, como `20261009000000` |
| `ALTER TABLE` que reescribe una tabla grande | Bloquea la tabla mientras dura | Hoy las tablas son chicas; en un año, fuera del horario del taller |

### Borrar o renombrar sin cortar el servicio: en dos pasos

1. **Expandir.** Migración que agrega lo nuevo sin quitar lo viejo (columna nueva, función con
   otro nombre). Se publica con el `dist` que usa lo nuevo. El sitio viejo sigue funcionando
   mientras alguien lo tenga abierto.
2. **Contraer.** Días después, cuando nadie usa el sitio viejo, otra migración quita lo viejo.

`SchemaDriftBanner` avisa en pantalla cuando la base y el `dist` no coinciden, y
`npm run db:check` lo dice antes de publicar.

### Antes de cada `db push`

1. **Respaldo** mientras el plan sea Free, fuera del repositorio (lleva datos de clientes):
   roles, esquema y datos, con los tres `db dump` de
   [deployment.md §5](deployment.md#5-publicar-una-versión). El de datos es
   `npx supabase db dump --linked --data-only --use-copy -f <carpeta fuera del repo>/datos-AAAAMMDD.sql`;
   sin `--data-only`, `db dump` guarda solo el esquema.
2. **Staging** (cuando exista): aplicar ahí, correr `npm run qa:security`.
3. En local (Docker): `npx supabase db reset && npm run test:db`, `npm run test:functions`, `npm run test:e2e:local`, `npm run qa:security:local`, y `npm run db:types` / `npm run db:schema` si cambió el esquema. CI lo repite en cada cambio.
4. `npm run db:check`: qué se va a aplicar.
5. **Publicar en este orden:** `db push` → funciones que cambiaron →
   push a `main` (hoy Hostinger publica `main`) → `npm run qa:security`
   → prueba de humo ([deployment.md](deployment.md)). El push a `produccion` nunca va antes
   del `db push`: publica solo.
6. Fuera del horario del taller si la migración toca políticas o dinero.

### Si algo sale mal

- **Nunca editar una migración aplicada.** Se corrige con una migración nueva que devuelve lo
  anterior. Para funciones, `npm run db:donde` dice cuál era la versión previa.
- **Restaurar un respaldo es el último recurso**: devuelve el proyecto entero a esa hora y
  pierde lo que el taller hizo después.
- Si el `dist` nuevo falla, se vuelve a subir el anterior. Por eso conviene guardar cada
  `dist` publicado con su fecha.

---

## 5. Plan priorizado

### P0 — antes de atender clientes reales (fuera del código)

| # | Qué | Por qué | Esfuerzo |
|---|---|---|---|
| P0-1 | **Proyecto de staging** en Supabase con las mismas migraciones, secretos propios y las cuentas de prueba | Probar migraciones, `qa:security` y e2e sin tocar el taller (R-B3) | 1–2 h |
| P0-2 | **Plan Pro** (respaldos diarios) o, mientras tanto, respaldo manual antes de cada `db push` | R-B4 | 5 min |
| P0-3 | **Sentry (`SENTRY_AUTH_TOKEN`)** | `VITE_SENTRY_DSN` ya está en Hostinger (15/11/2026); falta crear el token en Sentry (`Settings → Auth Tokens`, permiso de subir source maps), agregar `SENTRY_AUTH_TOKEN` en Hostinger, volver a desplegar y comprobar con «Reportar un problema» (Configuración). Sin él, los errores llegan minificados | 15 min |

### P1 — bajo riesgo, alto valor (1 a 2 días; no tocan la base de producción)

| # | Qué | Resuelve |
|---|---|---|
| P1-1 | ~~**Esquema actual en un solo archivo** (`supabase/schema/actual.sql`, generado con `npm run db:schema` desde la base local) y comprobación en CI de que está al día~~ *(hecho 16/11/2026)* | R-B1: leer el estado vigente sin reconstruirlo de 99 migraciones. Se conservan las migraciones: sus comentarios son la historia de cada decisión |
| P1-2 | ~~**Partir `useWorkOrderDetail`** en hooks por tarjeta~~ *(hecho 15/11/2026: subhooks, `permissions.ts` y `sections/` en `features/workOrders/detail/`)* | El archivo que más se toca deja de mezclar responsabilidades |
| P1-3 | ~~**Retirar la fachada `supabaseService`**: cada archivo importa su servicio~~ *(hecho 14/11/2026)* | Una sola forma de importar y de simular en pruebas |
| P1-4 | **Fase 1 de pagos a empleados** ([pagos-a-empleados.md](pagos-a-empleados.md)) | La ambigüedad de dinero más riesgosa. Esta sí toca la base |

### P2 — cuando toque trabajar en esa parte

| # | Qué |
|---|---|
| P2-1 | Textos por dominio: `i18n/<dominio>.ts` con los dos idiomas, y `translations.ts` que los une. El test de paridad sigue igual |
| P2-2 | Estilos por dominio: `styles/<dominio>.css` importados desde `index.css` |
| P2-3 | ~~Sacar de `Settings.tsx` la administración de sedes a `features/settings/SedesCard.tsx`~~ *(hecho 15/11/2026: tarjetas en `features/settings/`)* |
| P2-4 | ~~Partir `portal/CustomerPortal.tsx` en una sección por archivo dentro de `portal/`~~ *(hecho 15/11/2026: `portal/components/`)* |
| P2-5 | Llevar a `features/<dominio>/` Finanzas, Comisiones, Clientes y Vehículos cuando crezcan |
| P2-6 | Convención de orden para triggers nuevos de `ordenes_trabajo` (R-B2) |
| P2-7 | ~~Decidir si un admin puede borrar movimientos automáticos (R-B5)~~ *(Resuelto en `20261010000038`)* |

**Nada de P1-2 a P2-5 cambia lo que ve el usuario ni toca la base.** Son movimientos de
código cubiertos por las pruebas unitarias y de componentes (1.274 en Vitest al 16/11/2026);
se pueden hacer uno por uno y publicar cada uno por separado.

---

## 6. Cómo se revisó

- **Base:** consultas de solo lectura al catálogo del proyecto real (`pg_constraint`,
  `pg_index`, `pg_policies`, `pg_proc`, `pg_trigger`) el 29 de septiembre de 2026, con las 54
  migraciones aplicadas. Las funciones reescritas se contaron en `supabase/migrations/`.
- **Código:** conteo de líneas por archivo, importaciones de servicios y llamadas a Supabase
  fuera de `services/`.
- **Plataformas de referencia:** ver [pagos-a-empleados.md](pagos-a-empleados.md#fuentes).
