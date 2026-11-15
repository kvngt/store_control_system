### Veredicto ejecutivo: ¿Es una app hecha con "vibecoding"?

**No en su núcleo de datos y seguridad, pero sí presenta deuda clara de crecimiento incremental ("vibecoding por capas") en la UI React y en las Edge Functions.**

- **Dónde NO lo es:** El modelo de seguridad en PostgreSQL (_esquema-vigente.sql), la cobertura pgTAP (**1.093 pruebas en 45 archivos** según docs/pruebas.md), el harness de API (scripts/qa/api-security.mjs, **202 casos**), utilidades como `fetchAll` / `assertDeleted` en support.ts, el parseo de fechas sin desfase horario en dates.ts y la cola offline de medios (uploadQueue.ts) muestran ingeniería disciplinada.
- **Dónde SÍ lo parece (y qué arreglar primero):** Siete archivos concentran entre **934 y 1.408 líneas** mezclando consultas, estado y vista; **~20 archivos** aún importan la fachada heredada supabaseService.ts; se copió el mismo diccionario de estados en **6 pantallas**; hay estilos `style={{…}}` repetidos ignorando clases ya escritas en components.css (**7.070 líneas**); y las Edge Functions carecen de pruebas automatizadas y de validación uniforme de entrada. **Prioridad #1:** blindar los bordes propensos a fallo silencioso (validación JSON y refresco de sesión en medios, `ErrorBoundary` por ruta y pruebas de Edge Functions) antes de partir los monolitos de UI.

---

### Hallazgos (ordenados de mayor a menor severidad)

*(Nota: no se reportan hallazgos `CRÍTICO` de fuga o salto de permisos porque el aislamiento de dinero y autorización reside en RLS/RPC de PostgreSQL y no se observó vulnerabilidad directa de ese nivel en el frontend ni en las Edge Functions analizadas.)*

### [ALTO] Crash HTTP 500 en Edge Functions ante cuerpo JSON `null`
- Dónde: supabase/functions/portal/index.ts:170-177 y supabase/functions/traducir-texto/index.ts:14-15 (frente a supabase/functions/_shared/caller.ts:121-128)
- Evidencia:
```ts
try {
  body = await req.json();
} catch {
  return respond({ error: 'Solicitud inválida.' }, 400);
}
const token = typeof body.token === 'string' ? body.token : '';
```
- Escenario: Un cliente o integración envía un `POST` con JSON válido `null` (o un arreglo) al endpoint público del portal (`handlePost`) o a `traducir-texto`. `req.json()` resuelve `null` sin entrar en `catch` y `body.token` (o `body.texto` en `traducir-texto`) lanza `TypeError` no capturado en el `Deno.serve` del portal (líneas `233-244`) o atrapado como fallo general en `traducir-texto` (`85-87`), devolviendo `500` en vez de `400` pese a existir `readJsonBody` en `_shared/caller.ts`.
- Arreglo propuesto: Reemplazar el `req.json()` manual en `portal/index.ts` y `traducir-texto/index.ts` por `readJsonBody` de `_shared/caller.ts`, verificando que el resultado sea un objeto no nulo antes de leer propiedades.
- Confianza: alta

### [ALTO] Subida de medios falla con `session_expired` sin intentar refrescar el JWT
- Dónde: src/services/media.service.ts:13-25 frente a src/services/users.service.ts:40-52
- Evidencia:
```ts
// En src/services/media.service.ts:16-17 solo llama supabase.auth.getSession()
// y si no hay access_token lanza 'session_expired'.
// En src/services/users.service.ts:46-52 llama refreshSession() cuando
// getSession() devuelve token nulo (comentando el patrón de media.service.ts en :40-44).
```
- Escenario: Un técnico o pintor adjunta videos o varias fotos de inspección cuando su token de acceso está recién expirado. A diferencia de la pantalla de usuarios, `media.service.ts` no intenta `supabase.auth.refreshSession()` y aborta de inmediato con `session_expired`, bloqueando el registro de evidencias en el taller.
- Arreglo propuesto: Extraer un único helper de obtención de token (`getSession()` + fallback `refreshSession()`) en src/services/support.ts y consumirlo desde ambos servicios.
- Confianza: alta

### [ALTO] Cero pruebas automatizadas para Edge Functions y suite E2E bloqueada por falta de cuentas/staging
- Dónde: vitest.config.ts:12, scripts/qa/api-security.mjs:500-512, playwright.config.ts:15-20, e2e/customer-crud.spec.ts:10 y docs/pruebas.md:527-559
- Evidencia:
```ts
// vitest.config.ts:12
include: ['src/**/*.test.{ts,tsx}'],
// api-security.mjs:500-512 solo prueba OPTIONS != 404 y 3 GET anónimos al portal.
// docs/pruebas.md:527-529,549,557-559: cuentas de prueba borradas (29/09/2026),
// E2E con credenciales se salta y entrega/comisiones/medios no tienen E2E.
```
- Escenario: Un cambio en `process-outbox` (idempotencia en Resend, traducción Gemini, reintentos/backoff), `create/update/delete-employee`, `cleanup-storage` o `POST /portal` pasa `npm test` y `qa:security` en verde aun rompiendo envíos de recibos o permisos, y ningún E2E autenticado valida el flujo completo en navegador porque la suite apunta al Supabase real sin cuentas de prueba.
- Arreglo propuesto: Añadir tests unitarios con `deno test` para las Edge Functions (inyectando `fetch`/cliente Supabase simulado) y habilitar un entorno Supabase local o de staging para ejecutar los E2E críticos con credenciales de prueba.
- Confianza: alta

### [ALTO] Un único `ErrorBoundary` global tumba toda la app ante cualquier fallo de una pantalla o pestaña
- Dónde: src/App.tsx:208, src/components/layout/AppLayout.tsx:79 y src/pages/WorkOrders.tsx:704,960
- Evidencia:
```tsx
// src/App.tsx:208 monta el único <ErrorBoundary> en la raíz.
// src/components/layout/AppLayout.tsx:79 renderiza <Outlet /> dentro de
// <main className="page-content"> sin <ErrorBoundary> por ruta.
// src/pages/WorkOrders.tsx:704,960 envuelven <WorkOrderDetail> y <KanbanBoard>
// solo en <Suspense>, sin ErrorBoundary (a diferencia de <LazyModal> en :990).
```
- Escenario: Si una orden con datos atípicos o un fallo de carga de chunk lanza una excepción de renderizado dentro de `WorkOrderDetail` o `KanbanBoard`, el error sube hasta la raíz en `App.tsx`, desmontando el marco completo de la aplicación (barra lateral, cabecera y la bandeja de subidas activas `UploadTray`) en lugar de aislar únicamente la pantalla fallida.
- Arreglo propuesto: Envolver `<Outlet />` en `AppLayout.tsx` con un `<ErrorBoundary>` por ruta con opción de reintentar/regresar y colocar otro alrededor de los subárboles lazy en `WorkOrders.tsx`.
- Confianza: alta

### [MEDIO] Tipos de dominio desalineados con `_esquema-vigente.sql` y ocultos con `as any` en tests
- Dónde: src/types/domain/workOrder.types.ts:20,54,180,215, src/types/domain/auth.types.ts:12-42, src/types/domain/customer.types.ts:8, _esquema-vigente.sql:55,446,618,625,677,683,880-881 y src/features/workOrders/WorkOrderCreateModal.test.tsx:22-86
- Evidencia:
```ts
// workOrder.types.ts:180,215 declaran grupo?: string | null en LaborItem y WorkOrderPart,
// columna inexistente en orden_labor y orden_repuestos (_esquema-vigente.sql:439-472,614-645),
// y omiten decidido_en (:446,625) y numero_parte (:618).
// auth.types.ts:12-35 omiten Sede.zona_horaria (NOT NULL en SQL:880).
// WorkOrderCreateModal.test.tsx:22-67 usan creado_el y nombre (en SQL creado_en y
// nombre_completo) y los pasan con [CUSTOMER] as any y [OPERATOR] as any (:65-86).
```
- Escenario: La UI asume como no nulos `UserProfile.telefono`, `Customer.notas_crm`, `WorkOrder.inspeccion_360_notas` o `WorkOrder.creado_por` cuando en PostgreSQL son anulables (`_esquema-vigente.sql:55,677,683,780`), mientras `WorkOrderCreateModal.test.tsx` pasa compilación usando propiedades obsoletas mediante `as any`.
- Arreglo propuesto: Generar tipos base desde el esquema vigente (`supabase gen types` o script de contraste) para `src/types/domain/` y tipar estrictamente los fixtures de `WorkOrderCreateModal.test.tsx` eliminando `as any`.
- Confianza: alta

### [MEDIO] Siete archivos monolíticos (934–1.408 líneas) mezclan consultas, estado y presentación
- Dónde: CustomerPortal.tsx (1.408 L), WorkOrderDetail.tsx:168-188 (1.404 L), useWorkOrderDetail.ts:48-79,1100-1170 (1.173 L), WorkOrders.tsx (1.076 L), workOrders.service.ts (1.002 L), WorkOrderCreateModal.tsx (982 L), Settings.tsx (934 L)
- Evidencia:
```ts
const parkingConfigQuery = useQuery({
  queryKey: queryKeys.parkingConfig(order?.sede_id ?? ''),
  queryFn: () => parkingService.getConfig(order?.sede_id ?? ''),
  enabled: isAdmin && !!order?.sede_id,
});
const nextServiceQuery = useQuery({
  queryKey: queryKeys.nextService(order?.id ?? ''),
  queryFn: () => nextServiceService.getNextService(order?.id ?? ''),
  enabled: !!order?.id,
});
```
- Escenario: `useWorkOrderDetail.ts` mantiene más de 12 estados de modales y retorna ~60+ campos en `WorkOrderDetailApi` (`1100-1170`), pero `WorkOrderDetail.tsx` además define `useQuery` propios (`168-188`), 16 constructores de sección y 8 modales (`1329-1400`). Cualquier cambio menor en un modal o pestaña obliga a tocar archivos con decenas de efectos cruzados.
- Arreglo propuesto: Partir por responsabilidades sin cambiar el DOM ni la API pública inicial: mover secciones de `CustomerPortal.tsx` a `src/portal/components/`, encapsular `parkingConfig`/`nextService` dentro de sus propias tarjetas, dividir `useWorkOrderDetail` en 3 subhooks (estado/transiciones, finanzas/entrega, seguimiento/parqueo) y segmentar `workOrders.service.ts` por subdominio.
- Confianza: alta

### [MEDIO] Fachada heredada `supabaseService.ts` sigue acoplando ~20 archivos de UI
- Dónde: src/services/supabaseService.ts:10-11,40-51 y 20 archivos consumidores (Dashboard.tsx:6, KanbanBoard.tsx:6, WorkOrders.tsx:7-12, Employees.tsx:6-7, Finance.tsx:7, Payroll.tsx:18, Customers.tsx:6, Vehicles.tsx:6, Settings.tsx:7, entre otros)
- Evidencia:
```ts
// Prefer importing the specific domain service in new code: it keeps a screen's
// dependencies honest and makes the module graph say who talks to what.
```
- Escenario: Pantallas como `Employees.tsx:6-7` importan simultáneamente la fachada heredada y `employeesService`. Esta doble capa oculta qué pantalla depende de qué tabla/RPC y duplica los módulos que deben simularse en Vitest.
- Arreglo propuesto: Reemplazar las importaciones de `supabaseService` en los ~20 archivos por sus servicios de dominio y borrar `src/services/supabaseService.ts`.
- Confianza: alta

### [MEDIO] Lógica de validación de cheque, subida de comprobante y rollback duplicada en 3 modales
- Dónde: DeliveryModal.tsx:82-104, AdvancePaymentModal.tsx:49-70 y WithdrawalModal.tsx:112-137
- Evidencia:
```ts
if (metodo === 'cheque' && !numeroCheque.trim() && !file) {
  setError(t('delivery.checkRequired'));
  return;
}
...
if (uploaded) void workOrdersService.removeDeliveryReceipt(uploaded).catch(() => {});
```
- Escenario: Si cambia la regla para aceptar cheques (p. ej. exigir foto y número) o el manejo de errores al borrar archivos huérfanos tras fallar la RPC, es fácil corregir uno o dos modales y dejar el tercero permitiendo registros incompletos o dejando basura en Storage.
- Arreglo propuesto: Extraer un helper/hook compartido (`useReceiptSubmission`) para validar método `cheque`, subir el archivo antes de la RPC y revertir el objeto subido ante cualquier error.
- Confianza: alta

### [MEDIO] Diccionario `statusLabels` copiado en 6 archivos, `typeLabels` duplicado y `EMAIL_RE` divergente
- Dónde: Dashboard.tsx:87-93, KanbanBoard.tsx:128-134, WorkOrders.tsx:218-230, Customers.tsx:177-183, Vehicles.tsx:26-32, EmployeeDetailModal.tsx:105-111, UsersCard.tsx:14 frente a email.ts:6-8 y workType.ts:5-14
- Evidencia:
```ts
const statusLabels: Record<string, string> = {
  recepcion: t('workOrders.intake'),
  en_proceso: t('workOrders.inProgress'),
  espera_autorizacion: t('workOrders.waitingAuthorization'),
  finalizado: t('workOrders.completed'),
  entregado: t('workOrders.delivered'),
};
```
- Escenario: Además de las 6 copias de `statusLabels`, `WorkOrders.tsx:218-222` duplica `typeLabels` pese a existir `workTypeKey` en `src/lib/workType.ts`, y `UsersCard.tsx:14` define `const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;` mientras `src/lib/email.ts:7` usa `/^[^@\s]+@[^@\s]+\.[^@\s]+$/`, validando correos con distinto criterio según el formulario.
- Arreglo propuesto: Crear `orderStatusKey()` junto a `src/lib/workType.ts` para eliminar las 6 copias locales y usar `isValidEmail` de `src/lib/email.ts` dentro de `UsersCard.tsx`.
- Confianza: alta

### [MEDIO] Código repetido dentro de `process-outbox` (Resend) y con `traducir-texto` (Gemini)
- Dónde: process-outbox/index.ts:189-195,287-332,339-343,368-398,435-447 y traducir-texto/index.ts:27,44-59
- Evidencia:
```ts
// En process-outbox/index.ts, sendEmail (:287-332) y sendEmployeeEmail (:368-398)
// duplican la comprobación de RESEND_API_KEY/EMAIL_FROM_ADDRESS (:189-195 vs :339-343),
// fetchConTope a api.resend.com/emails, Idempotency-Key: job.id,
// setTimeout(EMAIL_SPACING_MS) y la clasificación de errores 401 y 429/5xx.
// traducir-texto (:27,44-59) repite la llamada Gemini 'gemini-3.8-flash' con AbortController propio.
```
- Escenario: Un ajuste en el espaciado anti-rate-limit de Resend, en el manejo de respuestas `429` o en el nombre del modelo por defecto de Gemini puede aplicarse a `sendEmail` o a `process-outbox` y olvidarse en `sendEmployeeEmail` o `traducir-texto`.
- Arreglo propuesto: Unificar `sendEmail` y `sendEmployeeEmail` sobre un único helper de envío Resend, y mover el cliente Gemini (usando `fetchConTope`) a `supabase/functions/_shared/`.
- Confianza: alta

### [MEDIO] Suite `WorkOrders.smoke.test.tsx` hipertrofiada (2.019 líneas) y sostenida por 28 mocks
- Dónde: src/pages/WorkOrders.smoke.test.tsx:24-135
- Evidencia:
```ts
// WorkOrders.smoke.test.tsx (2.019 líneas totales): líneas 24-135 configuran
// 28 mocks hoisted (auth.context, vin, media/image, react-signature-canvas,
// SignatureCard, supabaseService, workOrders.service, parking.service, etc.).
```
- Escenario: Como `WorkOrders.tsx` concentra demasiada lógica, montar la vista exige falsear 28 módulos; si cambia la firma o el comportamiento real entre `WorkOrders` y uno de sus servicios (por ejemplo `parking.service`), las pruebas siguen pasando sin detectar el desfase.
- Arreglo propuesto: Desagregar la suite en pruebas unitarias/componente acotadas conforme se extraigan módulos de `WorkOrders.tsx`, manteniendo en el smoke test de página solo stubs mínimos de red/sesión.
- Confianza: alta

### [BAJO] Estilos `style={{…}}` repetidos ignorando `components.css` e inconsistencias en modales
- Dónde: components.css:2569-2584 frente a Customers.tsx:385-394, WorkOrders.tsx:938-950, Vehicles.tsx:294-297, ArchivedOrders.tsx:70-77, UsersCard.tsx:222-238, Finance.tsx:457, Payroll.tsx:317; modales OrderInsuranceModal.tsx:46-58, DeliveryModal.tsx:121-130, Customers.tsx:492-501 y Settings.tsx:894-898
- Evidencia:
```tsx
<div style={{ marginBottom: 'var(--space-4)', position: 'relative', maxWidth: 400 }}>
  <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
  <input ... style={{ paddingLeft: 36 }} id="customer-search" />
```
- Escenario: Pese a existir `.combo-search` y `.combo-search-icon` en `components.css:2569-2584`, cinco listados recrean el icono posicionado y el padding con `style={{…}}`; además, cuatro pantallas sobreescriben `.tab` con el mismo objeto inline (`borderBottom: 'none'`, `borderRadius: 'var(--radius-md)'`), y varios modales (`Customers.tsx`, `Settings.tsx`) omiten `role="dialog"` / `aria-modal` o `.modal-close` presentes en `OrderInsuranceModal.tsx`.
- Arreglo propuesto: Reemplazar los buscadores inline por `.combo-search`, definir `.tab-pill` en `components.css` y extraer un envoltorio `<ModalShell>` homogéneo con accesibilidad completa.
- Confianza: alta

### [BAJO] Alias duplicado en `customerPortal.service.ts` y formateadores repetidos en `CustomerPortal.tsx`
- Dónde: src/services/customerPortal.service.ts:16-17 y src/portal/CustomerPortal.tsx:50-67 (frente a src/lib/dates.ts:60-64)
- Evidencia:
```ts
portalUrl: (token: string) => `${getPublicSiteUrl()}${CUSTOMER_PORTAL_PREFIX}${token}`,
buildPortalUrl: (token: string) => `${getPublicSiteUrl()}${CUSTOMER_PORTAL_PREFIX}${token}`,
```
- Escenario: Existen dos métodos idénticos en la misma interfaz de servicio y, dentro del portal de clientes, `toDate()` y `useFormatters()` reimplementan localmente el parseo de fechas `DATE` y los formateadores `Intl` que ya proveen `src/lib/dates.ts` y `src/lib/money.ts`.
- Arreglo propuesto: Conservar un único método de URL en `customerPortal.service.ts` y reutilizar las utilidades compartidas de fecha/moneda manteniendo el árbol de importaciones ligero para el bundle del portal.
- Confianza: alta

### [BAJO] `vite.config.ts` sin `manualChunks` explícitos para vendors pesados
- Dónde: vite.config.ts:87-103 y src/lib/queryClient.ts:96-113
- Evidencia:
```ts
// vite.config.ts:87-103 no define build.rollupOptions.output.manualChunks;
// depende solo de lazy() por ruta (App.tsx:24-33), ImportStatementModal y LazyModal.
// queryClient.ts:96-113 fija staleTime: 30_000 y retry: 1 sin cola offline de mutaciones.
```
- Escenario: Aunque las entradas pública/portal/app y las rutas principales están bien separadas con `lazy()`, el código compartido de librerías de terceros puede reempaquetarse de forma distinta en cada deploy, invalidando caché del navegador móvil del taller innecesariamente; asimismo conviene dejar explícito que la resiliencia offline cubre la cola de medios (`UploadTray`), no formularios sin red.
- Arreglo propuesto: Definir `manualChunks` estables en `vite.config.ts` (p. ej. núcleo React/Router, Supabase y utilidades PDF/gráficas) tras inspeccionar el reporte de bundle.
- Confianza: alta

---

### Lo que revisé y está bien

- **Aislamiento de bundles por entrada** (`app`, `portal`, `landing`) y carga diferida de rutas en App.tsx y modales pesados en LazyModal.tsx.
- **Paginación y borrados seguros en servicios:** uso consistente de `fetchAll` y comprobación de filas borradas (`assertDeleted`) en support.ts, más normalización de errores Postgres/Auth en errors.ts.
- **Manejo de fechas y zona horaria:** parser seguro para columnas `DATE` en dates.ts evitando desplazamientos por UTC.
- **Resiliencia en subida de archivos:** cola persistente en IndexedDB con reintentos en uploadQueue.ts y UploadTray.tsx.
- **Seguridad en base de datos y pruebas de contorno:** 1.093 tests pgTAP (docs/pruebas.md), 202 chequeos de contrato HTTP/RLS en api-security.mjs, verificación de drift de esquema (SchemaDriftBanner.tsx) y verificación de orden de migraciones (check-migrations.mjs).
- **Traducción i18n controlada:** existencia de pruebas de paridad de claves en translations.test.ts y reglas específicas de UI móvil en `src/styles/*.test.ts`.

---

### Plan de saneamiento en 3 etapas (sin cambiar comportamiento)

#### Etapa 1 — Estabilidad en bordes, validación y tipado real (primero)
- **Qué:** (1) Usar `readJsonBody` en `portal/index.ts` y `traducir-texto/index.ts`; (2) unificar `getSession()` + `refreshSession()` para `media.service.ts` y `users.service.ts`; (3) añadir `<ErrorBoundary>` por ruta en `AppLayout.tsx` y en vistas lazy de `WorkOrders.tsx`; (4) alinear `src/types/domain/*` con `_esquema-vigente.sql` y quitar `as any` de los tests.
- **Por qué primero:** Elimina caídas reales (500 en portal, fallos de subida por JWT y pantallas blancas globales) y convierte al compilador TypeScript en una red de seguridad real antes de mover archivos grandes en las etapas 2 y 3.
- **Verificación independiente:** `npm run lint && npx tsc -b && npm test && npm run build`, más pruebas `deno test` sobre el manejo de JSON `null`/inválido y test de unidad del helper de sesión expirada.

#### Etapa 2 — Unificación transversal y retirada de deuda repetida
- **Qué:** (1) Extraer helpers compartidos (`orderStatusKey`, `EMAIL_RE` único, `useReceiptSubmission` para los 3 modales de cobro/retiro, helper Resend/Gemini en Edge Functions y eliminación de `portalUrl`/`buildPortalUrl` duplicado); (2) completar la migración de los ~20 importadores de `supabaseService.ts` y borrar la fachada; (3) reemplazar buscadores/pestañas inline por `.combo-search`/`.tab-pill` y un `<ModalShell>` accesible.
- **Por qué segundo:** Reduce el tamaño de los monolitos y limpia el grafo de dependencias antes de reestructurarlos, reduciendo además el número de mocks necesarios por pantalla.
- **Verificación independiente:** `npm run lint && npx tsc -b && npm test && npm run build` tras cada micro-migración (un commit lógico por grupo: diccionario/validadores, fachada de servicios, modales de cobro y CSS).

#### Etapa 3 — Despiece de monolitos, chunks y cobertura automatizada de Edge/E2E
- **Qué:** (1) Partir `CustomerPortal.tsx`, `WorkOrderDetail.tsx`, `useWorkOrderDetail.ts`, `WorkOrders.tsx`, `workOrders.service.ts`, `WorkOrderCreateModal.tsx` y `Settings.tsx` por subdominio/pestaña; (2) acompañar cada corte partiendo `WorkOrders.smoke.test.tsx` en tests enfocados con menos mocks; (3) añadir `deno test` para `process-outbox`/`portal`/`*-employee` y un flujo E2E autenticado contra Supabase local/staging, más ajuste de `manualChunks` en `vite.config.ts`.
- **Por qué al final:** Cortar componentes de >1.000 líneas es mucho más seguro y mecánico una vez que los tipos reflejan la base real (Etapa 1) y que los servicios directos y helpers compartidos ya están en su sitio (Etapa 2).
- **Verificación independiente:** Mantener el set completo `npm run lint && npx tsc -b && npm test && npm run build` verde al partir cada archivo, revisar tamaños de bundle tras `build` y validar la suite `deno test` / E2E local sin tocar producción.
