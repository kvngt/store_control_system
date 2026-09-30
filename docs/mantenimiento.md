# Mantenimiento: revisión de la estructura antes de producción

Revisión del 29 de septiembre de 2026, con la plataforma recién limpiada y antes de atender
clientes reales. Pregunta de partida: **cuando haya que cambiar una parte en producción,
¿se sabe a dónde ir, y se puede cambiar la base sin comprometer toda la operación?**

Dónde está cada parte: [mapa-de-secciones.md](mapa-de-secciones.md). Reglas que no se rompen:
[ai-context.md](ai-context.md).

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
de permisos está en RLS o en un trigger, no en la pantalla. Y 330 aserciones pgTAP aplican las
54 migraciones desde cero en cada cambio (CI).

### Riesgos para el mantenimiento

**R-B1. La versión vigente de una función está repartida en migraciones.** Hay 114 funciones
definidas a lo largo de 54 migraciones (11 500 líneas). Cuando una cambia, la migración nueva
la reescribe entera. `handle_order_delivery_payment` va por su quinta versión;
`sync_order_commissions`, `pay_commissions`, `create_work_order`, `recalculate_order_totals` y
`trg_guard_order_technician`, por la cuarta. El riesgo concreto: quien la cambie parte de una
versión vieja y **deshace sin darse cuenta** un arreglo posterior. No da error: la migración
se aplica y el arreglo desaparece.
*Mitigación ya hecha:* `npm run db:donde -- <nombre>` dice en qué migración está la vigente.
*Propuesta:* un archivo con el esquema actual completo, regenerado en cada migración (P1-1).

**R-B2. `ordenes_trabajo` tiene 20 triggers.** Entregar una orden dispara, en la misma
transacción, el cobro, el costo de repuestos, las comisiones, el portal, los avisos y los
guardias. Postgres ejecuta los triggers de un mismo momento **en orden alfabético de su
nombre**: renombrar uno puede cambiar el orden sin que nada lo avise. Hoy ninguno depende de
que otro corra antes, y las pruebas `01`, `11`, `12` y `13` cubren el flujo completo.
*Propuesta:* no renombrar triggers de `ordenes_trabajo`; si uno nuevo depende de otro, un
prefijo que fije el orden (`trg_10_…`, `trg_20_…`) en esa misma migración.

**R-B3. No hay staging.** `qa:security` y las pruebas e2e corren contra el proyecto real, y
desde la limpieza del 29 de septiembre las cuentas de prueba ya no existen, así que hoy no
corren. Toda migración va de la base local directo al taller.

**R-B4. No hay respaldos.** El plan Free no los hace. Un error en una migración de datos o un
borrado en cascada no tiene vuelta atrás.

**R-B5. Un admin puede borrar movimientos automáticos de Finanzas.** Borrar un "Pago final"
descuadra los cálculos posteriores de esa orden. Conocido desde la auditoría; sigue abierto
([reglas-de-negocio.md §10](reglas-de-negocio.md)).

---

## 3. Código

### Lo que está bien

- **Capas claras.** Toda consulta a Supabase está en `src/services/` (17 módulos por
  dominio). Solo `context/AuthContext.tsx` y `lib/schemaVersion.ts` llaman a Supabase fuera de
  ahí, y son infraestructura. La lógica sin React vive en `lib/` y se prueba sin navegador.
- **Las partes grandes ya están en módulos** (`features/workOrders`, `media`,
  `notifications`, `employees`, `finance`).
- **Red de pruebas amplia:** 480 unitarias, 330 pgTAP, 85 casos de seguridad de la API y
  76 e2e. TypeScript estricto, lint sin avisos, CI en cada cambio.
- **Portal del cliente aislado**: no importa nada de la app.

### Riesgos

Archivos que concentran varias responsabilidades. Un cambio pequeño obliga a leer mucho, y dos
personas que tocan partes distintas chocan en el mismo archivo:

| Archivo | Líneas | Qué mezcla |
|---|---:|---|
| `i18n/translations.ts` | 1 837 | Todos los textos de la app, los dos idiomas |
| `styles/components.css` | 4 560 | Todos los estilos de componentes |
| `portal/CustomerPortal.tsx` | 851 | El portal entero: estado, recepción, presupuesto, avances, galería, cuenta |
| `pages/Settings.tsx` | 834 | Perfil, idioma y tema, sedes (marca, capacidad, porcentaje, logo) y el borrado de una sede |
| `features/workOrders/useWorkOrderDetail.ts` | 712 | Estado, entrega, mano de obra, repuestos, asignaciones, multimedia, avances, firma, PDF, compartir y archivo |
| `pages/WorkOrders.tsx` | 637 | Lista, filtros y alta |
| `pages/Finance.tsx` | 586 | Tarjetas, movimientos, alta manual e importación |
| `pages/Payroll.tsx` | 558 | Saldos, historial, pagos y porcentaje de la sede |

Dos inconsistencias menores:

- **Unas secciones viven en `features/` y otras enteras en `pages/`.** Órdenes, empleados y
  multimedia están en módulos; clientes, vehículos, finanzas y comisiones están completas en
  su página. No es un error, pero para cambiar Finanzas hay que saber que está en `pages/`.
  El mapa lo dice ([mapa-de-secciones.md](mapa-de-secciones.md)).
- **La fachada `services/supabaseService.ts`** reexporta todos los servicios por
  compatibilidad y la siguen importando 18 archivos. Código nuevo usa el servicio del
  dominio. Mientras exista, los mocks de las pruebas tienen que simular las dos formas.

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
2. **Staging** (cuando exista): aplicar ahí, correr `npm run qa:security` y las e2e.
3. En local: `npx supabase db reset && npm run test:db`. CI lo repite en cada cambio.
4. `npm run db:check`: qué se va a aplicar.
5. **Publicar en este orden:** `db push` → funciones que cambiaron →
   `git push origin main:produccion` (Hostinger compila y publica) → `npm run qa:security`
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
| P0-3 | **Sentry** (`VITE_SENTRY_DSN`) | Hoy nadie se entera de un error en el teléfono de un técnico | 15 min |

### P1 — bajo riesgo, alto valor (1 a 2 días; no tocan la base de producción)

| # | Qué | Resuelve |
|---|---|---|
| P1-1 | **Esquema actual en un solo archivo** (`supabase/schema/actual.sql`, generado con `supabase db dump` de la base local), regenerado en cada migración, y una comprobación en CI de que está al día | R-B1: leer el estado vigente sin reconstruirlo de 54 migraciones. Se conservan las migraciones: sus comentarios son la historia de cada decisión |
| P1-2 | **Partir `useWorkOrderDetail`** en hooks por tarjeta (`useOrderStatus`, `useOrderLines`, `useOrderMedia`, `useOrderReport`…), con el mismo resultado para `WorkOrderDetail` | El archivo que más se toca deja de mezclar doce responsabilidades |
| P1-3 | **Retirar la fachada `supabaseService`**: cada archivo importa su servicio | Una sola forma de importar y de simular en pruebas |
| P1-4 | **Fase 1 de pagos a empleados** ([pagos-a-empleados.md](pagos-a-empleados.md)) | La ambigüedad de dinero más riesgosa. Esta sí toca la base: va por staging |

### P2 — cuando toque trabajar en esa parte

| # | Qué |
|---|---|
| P2-1 | Textos por dominio: `i18n/<dominio>.ts` con los dos idiomas, y `translations.ts` que los une. El test de paridad sigue igual |
| P2-2 | Estilos por dominio: `styles/<dominio>.css` importados desde `index.css` |
| P2-3 | Sacar de `Settings.tsx` la administración de sedes a `features/settings/SedesCard.tsx` |
| P2-4 | Partir `portal/CustomerPortal.tsx` en una sección por archivo dentro de `portal/` |
| P2-5 | Llevar a `features/<dominio>/` Finanzas, Comisiones, Clientes y Vehículos cuando crezcan |
| P2-6 | Convención de orden para triggers nuevos de `ordenes_trabajo` (R-B2) |
| P2-7 | Decidir si un admin puede borrar movimientos automáticos (R-B5) |

**Nada de P1-2 a P2-5 cambia lo que ve el usuario ni toca la base.** Son movimientos de
código cubiertos por las 480 pruebas unitarias; se pueden hacer uno por uno y publicar cada
uno por separado.

---

## 6. Cómo se revisó

- **Base:** consultas de solo lectura al catálogo del proyecto real (`pg_constraint`,
  `pg_index`, `pg_policies`, `pg_proc`, `pg_trigger`) el 29 de septiembre de 2026, con las 54
  migraciones aplicadas. Las funciones reescritas se contaron en `supabase/migrations/`.
- **Código:** conteo de líneas por archivo, importaciones de servicios y llamadas a Supabase
  fuera de `services/`.
- **Plataformas de referencia:** ver [pagos-a-empleados.md](pagos-a-empleados.md#fuentes).
