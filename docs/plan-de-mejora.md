# Plan de mejora — Restorify

Analisis completo del proyecto (septiembre 2026) con pruebas de desempeno, bugs
encontrados y plan de accion priorizado. Complementa la auditoria ya documentada en
[auditoria-2026-09.md](auditoria-2026-09.md).

> **Foto anterior a la revisión previa a producción.** Los números de pruebas de abajo son de
> ese momento; los actuales están en [pruebas.md](pruebas.md). Qué pasó con cada punto
> ([salida-a-produccion.md](salida-a-produccion.md)):
>
> | Punto | Estado |
> |---|---|
> | B-01 / M-05 panel sin paginar | **Resuelto**: `resumen_panel` suma en la base (PRD-10) |
> | B-02 / M-06 lista de órdenes | **Resuelto a medias**: se lee completa con `fetchAll` (PRD-11); paginar en pantalla sigue pendiente para miles de órdenes |
> | B-03 fecha en UTC | **No era error**: la columna es `timestamptz` |
> | B-04, B-05 / M-03 borrados silenciosos | **Resuelto** (PRD-24) |
> | B-06 `refreshUser` sin aviso | Abierto, menor |
> | B-07 / M-12 capacidad repetida | **Resuelto**: `DEFAULT_CAPACITY` |
> | B-08 / M-09 avance fuera de rango | **Resuelto**: restricción en la migración 36 (PRD-25) |
> | B-09 / M-11 PDFs viejos en `reportes` | Abierto (PRD-08) |
> | B-10 caché de `sw.js` | **No era error**: `.htaccess` ya lo sirve sin caché |
> | D-03 / M-07 staging | Abierto (deuda en salida-a-produccion.md) |

---

## Indice

1. [Estado actual del proyecto](#1-estado-actual-del-proyecto)
2. [Resultados de las pruebas automatizadas](#2-resultados-de-las-pruebas-automatizadas)
3. [Bugs y problemas encontrados](#3-bugs-y-problemas-encontrados)
4. [Analisis de desempeno](#4-analisis-de-desempeno)
5. [Deuda tecnica identificada](#5-deuda-tecnica-identificada)
6. [Plan de accion priorizado](#6-plan-de-accion-priorizado)
7. [Pruebas nuevas propuestas](#7-pruebas-nuevas-propuestas)
8. [Metricas de seguimiento](#8-metricas-de-seguimiento)

---

## 1. Estado actual del proyecto

### Resumen ejecutivo

| Area | Estado | Nota |
|---|---|---|
| **Build** | OK 0 errores | `npm run build` en verde |
| **TypeScript** | OK 0 errores | `tsc -b` limpio |
| **Linting** | OK 0 avisos | oxlint sin hallazgos |
| **Pruebas unitarias (Vitest)** | OK 274 pruebas | ~37 archivos, ~20 s |
| **Seguridad de la API** | OK 18 PASS / 0 FAIL / 33 SKIP | `npm run qa:security` |
| **Dependencias** | OK 0 vulnerabilidades | `npm audit --omit=dev` |
| **Pruebas de base (pgTAP)** | OK 158 aserciones | 7 archivos en verde con Docker (15 sep 2026) |
| **Pruebas e2e (Playwright)** | PARCIAL Sin TOKEN_TECH | 33 casos SKIP |

### Lo que funciona bien

- **Seguridad en base de datos**: RLS, triggers y RPCs protegen todos los flujos de
  dinero. La auditoria de septiembre 2026 cerro el unico hallazgo de severidad alta.
- **Arquitectura multi-sede**: aislamiento correcto por `sede_id` en todas las tablas.
- **Ciclo de autorizacion (presupuestos)**: solo lo aprobado por el cliente entra en
  totales y comisiones; implementado en la base con triggers y bandera de transaccion.
- **Portal del cliente**: paquete independiente, sin arrastre del bundle de la app.
- **Manejo de errores**: traduccion bilingue de errores de Postgres y Auth.
- **Fechas locales**: `lib/dates.ts` resuelve el problema clasico de UTC vs. local.
- **Cola de subida de multimedia**: TUS reanudable + IndexedDB.

---

## 2. Resultados de las pruebas automatizadas

### 2.1 Vitest — 274 pruebas en verde

| Modulo | Pruebas | Notas |
|---|---|---|
| `lib/dates` | 8 | Zona America/Chicago; regresiones UTC |
| `lib/errors` | 6 | Postgres, Auth, mensajes propios de la base |
| `lib/vin` | 12 | Decodificacion VIN, caracteres invalidos |
| `lib/bankStatementParser` | ~30 | PDF Wells Fargo, casos limite, categorizacion |
| `lib/media/uploadQueue` | ~25 | Cola TUS, concurrencia, sin conexion, reanudar |
| `lib/push` | 5 | Deteccion de iPhone sin instalar |
| `lib/reportMedia` | 4 | Solo fotos publicadas en el PDF |
| `lib/emailTemplates` | 10 | Plantillas de correo, HTML escapado, Reply-To |
| `lib/phone` | 5 | WhatsApp y tel: |
| `lib/queryClient` | 3 | Reintentos, claves de cache |
| `context/AuthContext` | 4 | Sesion con mala senal, TOKEN_REFRESHED |
| `pages/WorkOrders.smoke` | ~15 | Vista por rol, firma re-lee la orden |
| `pages/Vehicles.noplate` | 3 | Sin placa a null |
| `pages/Finance.*` | 8 | Importacion bancaria, vincular orden |
| `features/workOrders/*` | ~40 | Formulario, detalle, comision estimada |
| `features/media/*` | ~30 | Galeria, visibilidad, borrar |
| `features/notifications/*` | ~12 | Campana, push, traduccion |
| `portal/CustomerPortal` | ~15 | Portal, baja, presupuesto, ingles |

### 2.2 `npm run qa:security` — 18 PASS / 0 FAIL

**33 SKIP explicados:** faltan `TOKEN_TECH` y `ORDEN` en `.env.test.local`.
Para cubrir los 51 casos completos, configurar:

```
E2E_MECHANIC_EMAIL=mecanico-a@taller.com
E2E_MECHANIC_PASSWORD=tu-contrasena
```

Casos importantes que estan SKIP:
- `SEC-20` a `SEC-35`: tecnico no ve montos, precios, finanzas ni datos ajenos.
- `SEC-40` a `SEC-54`: tecnico no cotiza, no entrega, no cambia totales.
- `SEC-55`: una orden creada directamente por API nace en recepcion.

### 2.3 pgTAP — En verde

Primera corrida el 15 de septiembre de 2026 con Docker: **158 aserciones en verde** en 7 archivos, y las 35 migraciones
aplican desde cero. Hubo que corregir tres datos de prueba (no la base): en 04 un video sin duracion y sin avance,
y en 05 un aviso elegido por fecha cuando dos se crean en la misma transaccion. Para volver a correrlas:

```bash
npx supabase start
npm run test:db
npx supabase stop
```

---

## 3. Bugs y problemas encontrados

### B-01 · ALTO · Dashboard carga todas las transacciones y ordenes sin paginar

**Donde:** `src/services/dashboard.service.ts`, lineas 10-18.

`getDashboardStats` descarga **todas** las ordenes y **todos** los movimientos
financieros de la sede sin limite. Con ~120 ordenes/mes, a 12 meses son 1.440 ordenes;
con 6 meses de datos de finanzas, podrian ser miles de filas descargadas solo para
calcular KPI que Postgres podria calcular en microsegundos.

```typescript
// Hoy: descarga todas las filas al navegador
let ordersQuery = supabase.from('ordenes_trabajo').select('*');
let txnQuery    = supabase.from('finanzas_movimientos').select('*');
```

**Impacto:** tiempo de carga del panel crece linealmente con el historial.
A ~2.000 ordenes (AUD-22 lo preve), el panel tarda varios segundos.

**Solucion:** mover los calculos a una funcion SQL `get_dashboard_stats(p_sede_id)`.

---

### B-02 · ALTO · Lista de ordenes sin paginacion (AUD-22 abierto)

**Donde:** `src/services/workOrders.service.ts` / `getWorkOrders`.

`getWorkOrders` carga **todas** las ordenes de la sede con cliente, vehiculo y
asignaciones embebidos. Cada orden embebida puede ser 2-4 KB de JSON.
A 2.000 ordenes, son 4-8 MB de datos solo para ver la lista.

**Solucion:** paginar con cursor o filtrar ordenes entregadas con mas de 90 dias.

---

### B-03 · MEDIO · `updateWorkOrderStatus` escribe `fecha_finalizacion` en UTC

**Donde:** `src/services/workOrders.service.ts`, lineas 119-127.

```typescript
const updates = isClosed
  ? { estatus, fecha_finalizacion: new Date().toISOString(), porcentaje_avance: 100 }
  : { estatus, fecha_finalizacion: null };
```

El frontend usa `new Date().toISOString()` (UTC). La libreria `lib/dates.ts` existe
precisamente para evitar este problema. Una orden marcada como "Finalizado" a las 21:00
en Texas (UTC-5) aparecera con fecha del dia siguiente.

**Solucion:** verificar si el trigger `trg_progress_on_status` ya fija la fecha;
si lo hace, quitar `fecha_finalizacion` del UPDATE del frontend.

---

### B-04 · MEDIO · `removeLaborItem` y `removePart` no usan `assertDeleted`

**Donde:** `src/services/workOrders.service.ts`, lineas 194-244.

Borrar una linea de mano de obra o un repuesto rechazado por RLS informa exito silencioso
(PostgREST devuelve `[]` sin error). El usuario cree que borro la linea pero la fila sigue
en la base.

```typescript
// Sin assertDeleted — si RLS rechaza, no hay error visible
removeLaborItem: async (id) => {
  const { error } = await supabase.from('orden_labor').delete().eq('id', id);
  if (error) throw error;  // RLS silencioso: nunca lanza error
},
```

**Solucion:**
```typescript
removeLaborItem: async (id: string) => {
  const { data, error } = await supabase
    .from('orden_labor').delete().eq('id', id).select('id');
  if (error) throw error;
  assertDeleted(data, 'la linea de mano de obra');
},
```

---

### B-05 · MEDIO · `removeAssignment` no usa `assertDeleted`

**Donde:** `src/services/workOrders.service.ts`, lineas 254-257.

Mismo patron que B-04. Un intento de borrar una asignacion de otra persona seria
silencioso si RLS lo rechaza.

---

### B-06 · MEDIO · `refreshUser` no maneja errores de red de forma consistente

**Donde:** `src/context/AuthContext.tsx`, lineas 60-69.

`loadProfileAndSedes` conserva el estado si la red falla. `refreshUser` simplemente
no actualiza si falla, sin feedback al llamador. Patron inconsistente: si el admin
edita su nombre y la red falla al releer, el encabezado no muestra el nombre nuevo
y no hay mensaje de error.

**Solucion:** propagar el error o retornar un booleano de exito.

---

### B-07 · BAJO · `DEFAULT_CAPACITY = 10` duplicado entre servicio y pantalla

**Donde:** `src/services/dashboard.service.ts` linea 6 y `src/pages/Dashboard.tsx`
linea 159.

```typescript
// En dashboard.service.ts
const DEFAULT_CAPACITY = 10;

// En Dashboard.tsx — valor duplicado, no importado del servicio
{stats.ordenes_activas}/{currentSede?.capacidad ?? 10}
```

Si se cambia uno, el otro queda desincronizado.

**Solucion:** exportar `DEFAULT_CAPACITY` del servicio e importarlo en la pantalla.

---

### B-08 · BAJO · `updateWorkOrderProgress` acepta 101-infinito

**Donde:** `src/services/workOrders.service.ts`, lineas 129-132.

El servicio no valida el rango 0-100. Confirmar si existe `CHECK (porcentaje_avance
BETWEEN 0 AND 100)` en la migracion; si no existe, anadirlo.

---

### B-09 · BAJO · Bucket `reportes` tiene PDFs viejos acumulando cuota

Segun AUD-11 y el historial del proyecto: los reportes subidos antes de la Fase 6
siguen en Storage. Los enlaces vencieron pero los archivos ocupan cuota del plan Free
(500 MB total).

---

### B-10 · INFORMATIVO · sw.js debe servirse con Cache-Control: no-cache

**Donde:** `public/.htaccess`.

Verificar que `sw.js` no queda cacheado por Hostinger, o un despliegue nuevo no
llegara a dispositivos con la app instalada.

---

## 4. Analisis de desempeno

### 4.1 Tamano del bundle de produccion (ultimo build)

| Chunk | Tamano (gzip) | Evaluacion |
|---|---|---|
| `ImportStatementModal` | 133 KB | Carga diferida: OK |
| `workOrderPdf` | 132 KB | Carga diferida: OK |
| `galleryVideo` | 102 KB | Carga diferida: OK |
| `errors` (Sentry) | 60 KB | Solo si VITE_SENTRY_DSN definida |
| `index` (Supabase + TanStack) | 60 KB | Core, inevitable |
| `appStart` | 60 KB | App shell, inevitable |
| `index.es` (React) | 49 KB | Core, inevitable |

**Evaluacion general:** code-splitting bien implementado. Los tres chunks grandes
(PDF, video, importacion bancaria) cargan en diferido. Sin regresiones de bundle.

### 4.2 Cuellos de botella en base de datos

| Consulta | Problema | Impacto |
|---|---|---|
| `getDashboardStats` | 3 queries sin paginar | ALTO: crece con el historial |
| `getWorkOrders` | Sin limite, sin filtro de antiguedad | ALTO: 4-8 MB a 2.000 ordenes |
| `getWorkOrderDetail` | 3 queries + avances separados | Correcto y tolerante |
| `listOrderMedia` | Una query por orden abierta | Aceptable |

### 4.3 Comportamiento de cache — CORRECTO

La campana usa Realtime solo para notificaciones, sin polling periodico de ordenes.
Las ordenes se invalidan explicitamente despues de cada mutacion. OK.

---

## 5. Deuda tecnica identificada

### D-01 · `supabaseService.ts` — fachada heredada

Re-exporta todos los servicios de dominio. Se usa en `Dashboard.tsx` y `WorkOrders.tsx`.
El codigo nuevo debe importar directamente del servicio del dominio. La fachada complica
el rastreo de dependencias.

### D-02 · pgTAP nunca ejecutadas (AUD-24) — Resuelto

Resuelto el 15 de septiembre de 2026: 158 aserciones en verde con Docker. Queda la regla de correrlas antes de aplicar cualquier migracion:
una migracion con un error en plpgsql pasa el parser pero falla en produccion.

### D-03 · Tests e2e y qa:security corren contra produccion (AUD-25)

Sin staging, Playwright usa el proyecto real. Un fallo a medias puede dejar datos
`PWTEST` en produccion.

### D-04 · Setup de cuentas de prueba no documentado claramente

33 SKIP en `qa:security` por falta de TOKEN_TECH. El README no describe claramente
como configurar `.env.test.local` con las cuentas necesarias.

### D-05 · Sin monitoreo de latencia de base de datos

Sentry captura errores del frontend, pero no tiempos de respuesta de queries.
Un `getDashboardStats` que empieza a tardar 3 segundos no genera ninguna alerta.

### D-06 · Sin pruebas de integracion para edge functions

`process-outbox`, `portal` y las de empleados solo se prueban con `qa:security` y
de forma manual. Una regresion en `datos_portal` no se detecta automaticamente.

---

## 6. Plan de accion priorizado

### PRIORIDAD 1 — Inmediata (antes de atender clientes reales)

#### M-01 · Ejecutar pgTAP tras instalar Docker — Hecho

**Estimado:** 30 min de setup + 1 min de pruebas.

```bash
npx supabase start
npm run test:db   # 7 archivos, 158 aserciones
npx supabase stop
```

**Hecho (15 sep 2026):** 158 aserciones en verde. Si alguna falla en el futuro: revisar la migracion correspondiente y corregir.

---

#### M-02 · Completar setup de qa:security con TOKEN_TECH

**Estimado:** 15 min.

Crear las cuentas de prueba y completar `.env.test.local`:

```
E2E_MECHANIC_EMAIL=mecanico-prueba@taller.com
E2E_MECHANIC_PASSWORD=contrasena-segura
E2E_ADMIN_EMAIL=admin-prueba@taller.com
E2E_ADMIN_PASSWORD=contrasena-segura
```

```bash
npm run qa:security
# Debe pasar de 18 PASS / 33 SKIP a ~44 PASS / ~7 SKIP
```

---

#### M-03 · assertDeleted en borrados de lineas y asignaciones (B-04, B-05)

**Estimado:** 30 min. Sin migracion requerida.

En `src/services/workOrders.service.ts`:

```typescript
removeLaborItem: async (id: string) => {
  const { data, error } = await supabase
    .from('orden_labor').delete().eq('id', id).select('id');
  if (error) throw error;
  assertDeleted(data, 'la linea de mano de obra');
},

removePart: async (id: string) => {
  const { data, error } = await supabase
    .from('orden_repuestos').delete().eq('id', id).select('id');
  if (error) throw error;
  assertDeleted(data, 'el repuesto');
},

removeAssignment: async (id: string) => {
  const { data, error } = await supabase
    .from('orden_asignaciones').delete().eq('id', id).select('id');
  if (error) throw error;
  assertDeleted(data, 'la asignacion');
},
```

---

#### M-04 · Corregir fecha_finalizacion con zona local (B-03)

**Estimado:** 1 hora (incluyendo verificar el trigger).

1. Revisar en la base si `trg_progress_on_status` ya fija `fecha_finalizacion`.
2. Si lo hace: quitar `fecha_finalizacion` del UPDATE del frontend.
3. Si no: dejar que la base lo calcule con `NOW()` (recomendado).

---

### PRIORIDAD 2 — Antes del primer mes real de operacion

#### M-05 · Dashboard stats como RPC SQL (B-01)

**Estimado:** 2-3 horas (migracion + frontend).

Nueva migracion:

```sql
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_sede_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ordenes_activas',        COUNT(*) FILTER (WHERE estatus NOT IN ('finalizado','entregado')),
    'ordenes_finalizadas_mes', COUNT(*) FILTER (WHERE estatus IN ('finalizado','entregado')
                                 AND date_trunc('month', fecha_finalizacion) = date_trunc('month', CURRENT_DATE)),
    -- etc.
  )
  FROM ordenes_trabajo
  WHERE sede_id = p_sede_id;
$$;

REVOKE ALL ON FUNCTION get_dashboard_stats FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_dashboard_stats TO authenticated;
```

**Impacto esperado:** tiempo de carga del panel de 2-5 s a menos de 500 ms.

---

#### M-06 · Paginar la lista de ordenes (B-02)

**Estimado:** 3-4 horas.

```typescript
// Filtrar entregadas con mas de 90 dias por defecto
getWorkOrders: async (sedeId?: string, includeArchived = false) => {
  let query = supabase.from('ordenes_trabajo')
    .select(`...`)
    .order('creado_en', { ascending: false });
  if (!includeArchived) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    query = query.or(`estatus.neq.entregado,creado_en.gte.${cutoff.toISOString()}`);
  }
  ...
};
```

Criterio: implementar antes de 500 ordenes en la sede mas activa.

---

#### M-07 · Proyecto de staging en Supabase

**Estimado:** 1 hora de setup.

El plan Free permite 2 proyectos. Crear uno para staging y configurar:
```
.env.staging.local  ->  VITE_SUPABASE_URL del proyecto de staging
```

---

### PRIORIDAD 3 — Optimizacion y calidad a largo plazo

#### M-08 · Deprecar y eliminar supabaseService.ts

**Estimado:** 2 horas.

Migrar `Dashboard.tsx` y `WorkOrders.tsx` para importar directamente de los servicios
de dominio. Borrar `src/services/supabaseService.ts`.

---

#### M-09 · CHECK en porcentaje_avance (B-08)

**Estimado:** 30 min (migracion nueva).

```sql
ALTER TABLE ordenes_trabajo
  ADD CONSTRAINT chk_porcentaje_avance
  CHECK (porcentaje_avance BETWEEN 0 AND 100)
  NOT VALID;
VALIDATE CONSTRAINT chk_porcentaje_avance;
```

---

#### M-10 · Monitoreo de latencia con Sentry Performance

**Estimado:** 2 horas.

```typescript
import * as Sentry from '@sentry/react';

getDashboardStats: async (sedeId, capacity) => {
  return Sentry.startSpan({ name: 'getDashboardStats', op: 'db.query' }, async () => {
    // ... logica actual
  });
},
```

---

#### M-11 · Limpiar bucket reportes de PDFs viejos (B-09)

**Estimado:** 30 min (una vez).

Supabase Panel -> Storage -> `reportes` -> seleccionar todo -> borrar.

---

#### M-12 · Exportar DEFAULT_CAPACITY como constante compartida (B-07)

**Estimado:** 15 min.

```typescript
// src/lib/constants.ts (nuevo)
export const DEFAULT_SEDE_CAPACITY = 10;

// En dashboard.service.ts y Dashboard.tsx: importar desde constants.ts
```

---

## 7. Pruebas nuevas propuestas

### 7.1 Vitest — Nuevas pruebas unitarias

| ID | Archivo | Que prueba |
|---|---|---|
| VU-01 | `workOrders.service.test.ts` | `removeLaborItem` lanza error si RLS rechaza (B-04) |
| VU-02 | `workOrders.service.test.ts` | `removePart` lanza error si RLS rechaza (B-04) |
| VU-03 | `workOrders.service.test.ts` | `removeAssignment` lanza error si RLS rechaza (B-05) |
| VU-04 | `dashboard.service.test.ts` | `getDashboardStats` con 0 ordenes devuelve ceros |
| VU-05 | `dashboard.service.test.ts` | `ordenes_finalizadas_mes` no baja al entregar |
| VU-06 | `AuthContext.test.tsx` | `refreshUser` con fallo de red no actualiza sin aviso (B-06) |
| VU-07 | `workOrders.service.test.ts` | `updateWorkOrderStatus` no escribe fecha UTC (B-03) |

### 7.2 qa:security — Nuevos casos propuestos

| ID | Que verifica |
|---|---|
| SEC-63 | `get_dashboard_stats` no la puede llamar `anon` |
| SEC-64 | Un tecnico no puede ver stats de otra sede |
| SEC-65 | El bucket `reportes` rechaza INSERT de admin (confirmar SEC-61) |

### 7.3 Plan de pruebas manual — Nuevos casos

| ID | P | Ejecuta | Pasos -> Esperado |
|---|---|---|---|
| DIN-12 | P1 | IA | Con mas de 500 ordenes: panel carga en menos de 3 s (DevTools Network). |
| ORD-15 | P1 | IA | Borrar una linea `pendiente` -> error visible en el dialogo, la linea sigue. |
| ORD-16 | P2 | IA | API: `porcentaje_avance: 101` -> rechazado con 23514. |
| POR-18 | P1 | IA | JSON de `datos_portal` no contiene `comisiones` ni `costo_unitario`. |
| CFG-08 | P1 | IA | Admin edita su nombre -> encabezado actualizado sin recargar. |

### 7.4 Pruebas de desempeno propuestas

```bash
# PER-01: tiempo de carga del panel (sede con > 100 ordenes)
# Meta: < 2 s DOMContentLoaded
npx playwright test e2e/qa-workorders.spec.ts --project=chromium

# PER-02: medir getWorkOrders con performance.now()
# Meta: < 500 ms para < 500 ordenes
```

---

## 8. Metricas de seguimiento

| Metrica | Hoy | Meta |
|---|---|---|
| Pruebas Vitest en verde | 274 | >= 274 siempre |
| qa:security PASS | 18 | 44+ (con TOKEN_TECH) |
| qa:security FAIL | 0 | 0 siempre |
| pgTAP aserciones ejecutadas | 158 en verde | 158+ en verde siempre |
| Bundle total (gzip) | ~550 KB | < 600 KB |
| Tiempo de carga del panel | ND | < 2 s |
| Ordenes sin paginar | ~120 | Paginar antes de 500 |
| Vulnerabilidades npm | 0 | 0 siempre |
| Hallazgos P0 abiertos | 0 | 0 siempre |

---

## Resumen ejecutivo de acciones

| # | Accion | Prioridad | Estimado | Impacto |
|---|---|---|---|---|
| M-01 | Ejecutar pgTAP tras Docker | HECHO | — | 158 aserciones de BD en verde |
| M-02 | Setup qa:security TOKEN_TECH | INMEDIATA | 15 min | +26 verificaciones seguridad |
| M-03 | assertDeleted en borrados | INMEDIATA | 30 min | Errores silenciosos visibles |
| M-04 | fecha_finalizacion zona local | 1a semana | 1 h | Bug de fecha nocturna |
| M-05 | Dashboard stats como RPC SQL | 1a semana | 3 h | -80% tiempo de carga |
| M-06 | Paginar lista de ordenes | Antes 500 | 4 h | Escalabilidad |
| M-07 | Proyecto staging Supabase | Antes clientes | 1 h | Pruebas sin riesgo |
| M-08 | Deprecar supabaseService.ts | Limpieza | 2 h | Mantenibilidad |
| M-09 | CHECK porcentaje_avance | Limpieza | 30 min | Validacion en BD |
| M-10 | Latencia Sentry Performance | Largo plazo | 2 h | Observabilidad |
| M-11 | Limpiar bucket reportes | Una vez | 30 min | Liberar cuota |
| M-12 | Exportar DEFAULT_CAPACITY | Limpieza | 15 min | Consistencia |

---

*Generado: septiembre 2026 - Basado en analisis completo del codigo fuente,
documentacion en docs/, resultados de `npm run build`, `npm test` (274 pruebas),
`npm run qa:security` (18 PASS / 0 FAIL / 33 SKIP) y revision de la auditoria
de septiembre 2026.*
