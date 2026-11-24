# Informe de Tanda 3 de Q2 — «Se toca bien y se lee bien»

> Implementado sin ejecutar comandos ni tocar `supabase/` (queda pendiente que el verificador ejecute `npm run lint`, `npx tsc -b`, `npm test` y `npm run build`, así como `npm run test:e2e:local`).

---

## 1. B-05, B-06, A-10 — Área táctil de 44 px (táctil y teléfono) y `.modal-close` en escritorio

### B-05 (Deslizador de avance)
- **CSS (`src/styles/components.css`)**: clase `.progress-slider` (quitando `style={{ width: '100%' }}` en línea de `src/features/workOrders/detail/OrderHeader.tsx`). Dentro de `@media (pointer: coarse), (max-width: 768px)` recibe `height: 44px; min-height: 44px; padding: 12px 0; background: transparent;` con `accent-color: var(--color-primary)`, ampliando la caja táctil sin agrandar visualmente carril ni pulgar.

### B-06 (Casillas del flujo de la orden)
- **CSS (`src/styles/components.css`)**: clase reutilizable `.checkbox-touch` que en `@media (pointer: coarse), (max-width: 768px)` aplica `min-height: 44px;` al `<label>` clicable completo y `width: 22px; height: 22px; flex-shrink: 0; accent-color: var(--color-primary);` al `<input type="checkbox">`. No modifica desktop ni afecta Finanzas, Parqueo, Configuración, Catálogo, plantillas de inspección, `landing/` ni `portal/`.
- **Archivos donde se aplicó `.checkbox-touch`**:
  - `src/features/workOrders/TechnicianTaskList.tsx` (`TaskProgressModal`, casilla «Visible para el cliente»)
  - `src/features/workOrders/FindingsCard.tsx` (`DiscardFindingModal`, «Mostrarlo en el reporte del cliente»)
  - `src/features/workOrders/QuoteCard.tsx` (`AuthorizationModal`, casillas de trabajos agrupados y líneas individuales)
  - `src/features/workOrders/WithdrawalModal.tsx` (casillas de `.withdrawal-job`)
  - `src/features/workOrders/OrderInsuranceModal.tsx` (casilla «Trabajo con seguro»)
  - `src/features/workOrders/intake/steps/WorkStep.tsx` (casillas «El cliente aceptó estos trabajos y precios» y «Trabajo con seguro»)
  - `src/features/vehicles/VehicleFields.tsx` (casilla «Sin placa»)
  - `src/pages/Customers.tsx` (casilla «Recibe avisos por correo»)
- **Observación**: `src/features/workOrders/ProgressLog.tsx` (usa botón ojo) y `src/features/workOrders/ReportFindingModal.tsx` no contienen `<input type="checkbox">`. En el propio `TechnicianTaskList.tsx` solo `TaskProgressModal` tiene casilla.

### A-10 (Resto de controles)
- **Escritorio**: `.modal-close` pasa a `min-width: 36px; min-height: 36px;` con centrado flex en `src/styles/components.css`.
- **`@media (pointer: coarse), (max-width: 768px)` en `src/styles/components.css`**:
  - `.btn { min-height: 44px; }` (cubre foto/video/nota de voz/galería en `MediaCaptureBar`, acciones rápidas, botones del alta, `+n más` y «Revisar» en `FindingsAlert` / `AttentionCard`, fila de acciones de `OrderList` y botones del panel) junto con `.btn-sm { min-height: 44px; }` y `.btn-icon { min-width: 44px; min-height: 44px; }`.
  - `.tab, .view-switch-option { min-height: 44px; }` (ahora cubre tanto `pointer: coarse` como `max-width: 768px`, no solo `max-width: 768px`).
  - `.attention-order, .table td .link-button { min-height: 44px; display: inline-flex; align-items: center; }` para los enlaces `ORD-2026-0xx` en `AttentionCard` / `OrderList` / `Dashboard`.
  - `.intake-step-button { min-height: 44px; }` para las fichas de pasos en `IntakeStepper.tsx`.

---

## 2. B-10, A-16 — Selectores que recortaban su texto

- **B-10 (`src/features/workOrders/detail/OrderHeader.tsx` y `src/styles/components.css`)**:
  - Se reemplazó `style={{ flex: '1 1 160px' }}` por la clase `.order-status-select` (`flex: 1 1 220px; min-width: 220px; width: auto;` y `.order-detail-controls { max-width: 560px; }`) y en `@media (max-width: 768px)` ocupa `100%` del ancho de su fila (`min-width: 0; width: 100%;`).
- **A-16 (`src/styles/components.css`)**:
  - `.task-editor-fields` pasa a 3 columnas superiores (`minmax(110px, 140px) minmax(180px, 1fr) minmax(90px, 120px)`) con `.task-editor-technician { grid-column: 1 / -1; }` en escritorio, de modo que el selector de Técnico ocupa toda la fila del formulario y no recorta nombres largos. En `@media (max-width: 768px)` tanto `.task-editor-fields` como `.part-editor-fields` colapsan a `1fr`.
  - En `LaborTable` (`.labor-tech-select`), se quitó el límite `max-width: 240px` por `min-width: 190px;` en escritorio y `width: 100%; min-width: 0;` en teléfono.
  - Revisados los demás `<select>` del alta y cabecera (`#order-work-type`, `#intake-vehicle`, `#order-fuel`, `#vehicle-year`, `#vehicle-plate-state`, `#customer-language`): heredan `.form-input.form-select` (`width: 100%`).

---

## 3. A-12 — Avisos (toasts) en teléfono y pasos del alta

- **`src/styles/components.css` y `src/context/ToastContext.tsx`**:
  - En `@media (max-width: 768px)`, `.toast-stack` cambia de `top: ...` a `top: auto; bottom: max(calc(64px + env(safe-area-inset-bottom, 0px) + var(--space-2)), calc(var(--toast-vv-bottom, 0px) + var(--space-2))); transform: none;`, situándose siempre por encima de `.bottom-nav` (64 px + área segura) y del teclado en pantalla si está abierto, sin tapar encabezados de diálogo ni `IntakeStepper`. En escritorio conserva su posición arriba a la derecha con desplazamiento `--toast-vv-top`.
  - Se aplicó `pointer-events: none` a `.toast-stack` y `pointer-events: auto` a `.toast` para que el contenedor vacío o sus márgenes no bloqueen toques detrás.
  - **Nota/salvedad**: los modales de pantalla completa en móvil tienen `.modal-footer` al borde inferior; un toast activo con `--z-toast: 500` (`--z-modal: 400`) situado encima de `.bottom-nav` puede superponerse temporalmente a la zona baja mientras está visible (aunque no bloquea clics fuera de la tarjeta `.toast` ni queda debajo de ningún encabezado).
- **`src/features/workOrders/intake/useIntakeRecords.ts`**:
  - Se eliminaron las llamadas `showToast('success', t('intake.customerSaved'))` y `showToast('success', t('intake.vehicleSaved'))` al salir de los pasos 1 y 2. Los toasts de error y el aviso `draftSaved` en `useIntake.ts` se mantienen intactos.

---

## 4. B-08 — «Guardar» nunca apagado sin explicar

- **`src/features/workOrders/TechnicianTaskList.tsx` (`TaskProgressModal`)**: botón Guardar habilitado salvo mientras guarda (`disabled={saving}`); al tocar sin nota ni archivos (o mientras un video sigue convirtiéndose) muestra mensaje inline (`tasks.progressRequired` / `tasks.mediaProcessingWait`), marca `aria-invalid="true"`, enfoca el `<textarea>` y limpia el error al escribir o agregar multimedia.
- **`src/features/workOrders/ReportFindingModal.tsx`**: botón `Reportar y pausar la orden` habilitado salvo mientras guarda (`disabled={saving}`); al tocar vacío (o con video procesándose) muestra `findings.reportRequired` / `tasks.mediaProcessingWait`, marca `aria-invalid="true"` y enfoca `#finding-description`.
- **`src/features/workOrders/ProgressLog.tsx`**: botón `Agregar Avance` ya no se deshabilita por falta de texto/archivos; al pulsar vacío avisa inline, marca `aria-invalid="true"` y enfoca el `<textarea>`.
- **`src/features/workOrders/FindingsCard.tsx` (`DiscardFindingModal`)**: el botón `Descartar` deja de apagarse cuando falta texto para el cliente; al pulsarlo con la casilla marcada y sin texto muestra `findings.customerTextRequired`, marca `aria-invalid="true"` y enfoca `#finding-customer-text`.
- **`src/features/workOrders/PartsTable.tsx`**: el botón `+ Agregar` de la fila nueva deja de apagarse por descripción vacía; al pulsarlo avisa inline (`parts.descriptionRequired`), marca `aria-invalid="true"` y enfoca la descripción.
- **`src/features/workOrders/OrderTotalsCard.tsx`**: el botón `Aplicar` del editor de descuento deja de apagarse por valor inválido/vacío; al pulsarlo avisa (`discount.amountRequired`), marca `aria-invalid="true"` y enfoca `#discount-amount`.
- `AdvancePaymentModal`, `DeliveryModal`, `WithdrawalModal`, `ServiceStickerModal`, `TaskEditor` y `PartEditor` ya validaban en línea sin deshabilitar por campos vacíos. `AuthorizationModal` (`QuoteCard.tsx`) mantiene `disabled={busy || lines.length === 0}` únicamente cuando no hay líneas que autorizar.

---

## 5. B-11 — Textos mezclados

- **`src/i18n/translations.ts`**:
  - `en.notifications.types.presupuesto_respondido.title`: `'Estimate answered · {numero_orden}'` → `'Jobs authorized · {numero_orden}'`.
  - `en.quickActions.myTasks`: `'My jobs'` → `'My tasks'`.
  - `en.myTasks.title`: `'My jobs'` → `'My tasks'`, `empty`: `'You have no pending tasks.'`, `loadError`: `'Could not load your tasks.'`.
  - `en.tasks`: `noTasksAssigned` → `'You have no tasks assigned on this order.'`, `taskLabel` → `'Task'`, `reopen` → `'Reopen task'`, `otherTasks` → `'Other tasks on this order'`.
  - `en.notifications.types`: `tarea_asignada` → `'New task · {numero_orden}'`, `tarea_reasignada` → `'Task reassigned · {numero_orden}'`, `tarea_completada` → `'Task done · {numero_orden}'`.
  - No se tocaron referencias a trabajos agrupados (`catalog.*`, `workType`, `addWork`).
- **Pendiente de base (sin migración)**: el cuerpo (`cuerpo`) de la notificación `presupuesto_respondido` lo genera la base de datos en español; no se modificó en esta tanda al prohibirse cambios en `supabase/`.

---

## 6. A-15 — Palabras del sistema en Configuración

- **`settings.emailOutbox.hint`** (`es` y `en` en `src/i18n/translations.ts`): se quitaron `Resend` y `RESEND_API_KEY`:
  - ES: `'Un correo que falla no se vuelve a intentar solo. Si fallaron por un problema con el servicio de correo, avisa a quien da soporte al sistema y después reintenta.'`
  - EN: `'A failed email is not retried automatically. If emails failed because of the mail service, let your system support contact know and then retry.'`
- **Términos técnicos que permanecen (solo diagnóstico técnico / administrador del sistema)**:
  - `schema.databaseBehindBody` (`es` y `en`): menciona `(supabase db push)` en el banner de versión de base de datos atrasada.
  - `payroll.amountIsServerSide` (`en` menciona `server-side`; `es` dice `en el servidor`).

---

## 7. A-13 — Doble punto en `restoreBody`

- **`intake.restoreBody`** (`es` y `en` en `src/i18n/translations.ts`):
  - ES: `'Quedó un borrador guardado ({fecha}). ¿Lo continúas o empiezas una orden nueva?'`
  - EN: `'A draft was saved ({fecha}). Would you like to continue it or start a new order?'`
- Revisadas otras claves con `{fecha}`/`{date}`/`{time}` seguidas de punto (`customerLink.expires` solo formatea fecha sin hora con `formatDay`).

---

## 8. B-16 y `(s)` / `(es)` — Plurales reales

- **Portal (`src/portal/strings.ts`, `src/portal/components/Report.tsx`, `src/portal/components/AccountSection.tsx`)**:
  - `receptionPhotosCount` → `receptionPhotosCountOne` / `receptionPhotosCountMany` (`{count} foto` / `{count} fotos`, `{count} photo` / `{count} photos`).
  - `inspection.photosCount` → `photosCountOne` / `photosCountMany`.
  - `historyCounts` → `historyApprovedOne` / `Many`, `historyRejectedOne` / `Many` + plantilla compuesta `'{autorizados}, {rechazados} · {total}'`.
  - Cero `(s)` / `(es)` restantes en `src/portal/strings.ts`.
- **`src/features/workOrders/AuthorizationPanel.tsx` + `src/i18n/translations.ts`**:
  - `authorization.notSent` → `authorization.notSentOne` / `authorization.notSentMany` (con `{count}` y `{total}` idénticos en ES y EN).
  - `authorization.waitingHint` → `authorization.waitingHintOne` / `authorization.waitingHintMany`.
- **Conteo de `(s)` / `(es)` restantes en `src/i18n/translations.ts`** (22 claves en ambos idiomas, sin tocar en esta tanda):
  1. `workOrders.taskProgressCount`
  2. `commission.detail`
  3. `commission.taskCount`
  4. `tasks.autoAssigned`
  5. `tasks.unassignedNotice`
  6. `techStatus.authorized`
  7. `findings.files`
  8. `delivery.unassignedWarning`
  9. `notifications.types.orden_vencida.body`
  10. `notifications.push.devicesTitle`
  11. `quotes.draftsHint`
  12. `quotes.openHint`
  13. `quotes.openDraftsHint`
  14. `quotes.historyCounts`
  15. `myTasks.doneCount`
  16. `payroll.toReviewHint`
  17. `payroll.approvedMany`
  18. `payroll.unreviewedNotPaid`
  19. `settings.emailOutbox.failedCount`
  20. `settings.emailOutbox.retried`
  21. `settings.deleteSedeStaff`
  22. `inspection.templates.pointsCount`

### Claves de `translations.ts` agregadas / renombradas
- **Agregadas (`es` y `en`)**: `tasks.progressRequired`, `tasks.mediaProcessingWait`, `findings.reportRequired`, `discount.amountRequired`, `finance.staffPayments`, `authorization.notSentOne`, `authorization.notSentMany`, `authorization.waitingHintOne`, `authorization.waitingHintMany`.
- **Reemplazadas / eliminadas**: `authorization.notSent` y `authorization.waitingHint` reemplazadas por sus variantes `One` / `Many`.

---

## 9. Categoría `planilla` en Finanzas con comisiones apagadas

- **Nuevo helper**: `src/lib/financeCategories.ts` (`ALL_FINANCE_CATEGORIES` y `financeCategoryLabel(category, t)`), que devuelve `t('finance.staffPayments')` («Pagos al personal» / «Staff payments») cuando `category === 'planilla' && !moduloActivo('comisiones')`, y `t('finance.payroll')` cuando está activo.
- **Usado en**: `src/pages/Finance.tsx` (tabla, select de nueva transacción y exportación CSV) y `src/pages/finance/ImportStatementModal.tsx` (select masivo y selects por fila).

---

## 10. Buscador `CustomerPicker` en el móvil

- En `@media (max-width: 768px)` de `src/styles/components.css`, `.intake-picker-row .combo-menu` usa `position: static; margin-top: var(--space-2);` para empujar hacia abajo a `#intake-new-customer` (y `#intake-new-vehicle` en el paso 2) en lugar de taparlo por superposición absoluta. `Vehicles.tsx` no usa `.intake-picker-row`, por lo que conserva su comportamiento inline actual.

---

## 11. Regla visual y diseño móvil

- No se añadieron colores literales ni `!important` nuevos, ni se agrandó el dibujo de los iconos. Se agregaron reglas `grid-template-columns: 1fr` en móvil para `.task-editor-fields` y `.part-editor-fields` y `min-width: 0; width: 100%` en `.order-status-select` / `.labor-tech-select` para evitar desplazamiento horizontal en 390 px.

---

## 12. Portal: `EmailPreference` sin `confirm()` del navegador

- **`src/portal/components/EmailPreference.tsx`**: ahora usa `<ConfirmDialog>` de `src/portal/components/ConfirmDialog.tsx` al pulsar «Dejar de recibir correos» (mantiene el envío directo al reactivar cuando estaba desactivado y solo muestra confirmación al dar de baja). Respeta los límites de importación de `src/portal/`.
- **`src/portal/strings.ts`**: agregadas `emailsStopConfirmTitle` y `emailsStopConfirmButton` en ES y EN (reutilizando `s.confirmBack`).

---

## 13. Manuales de usuario

- Actualizados en paralelo `docs/manual-usuario.md` y `docs/manual-usuario.en.md` conservando estructura, encabezados, etiquetas `<!-- rol: ... -->` y rutas de imagen:
  - Mensajes de validación sin deshabilitar botón en «Reportar trabajo adicional» y «Agregar avance».
  - Categoría «Pagos al personal» / «Staff payments» en Finanzas cuando comisiones está apagado.
  - Unificación en inglés de **My tasks**, **Task**, **Reopen task**, **Other tasks on this order**, **New task**, **Task reassigned**, **Task done** y **Jobs authorized**.

---

## Pruebas añadidas y actualizadas

- `src/features/workOrders/TechnicianTaskList.test.tsx`: actualizado `/My jobs/i` → `/My tasks/i`.
- `src/features/workOrders/ProgressLog.test.tsx`: actualizado para verificar B-08 en `ProgressLog`.
- `src/features/workOrders/TaskProgressModal.back.test.tsx`: añadida prueba de B-08 (Guardar activo vacío, aviso, `aria-invalid`, foco) y clase `.checkbox-touch` (B-06).
- `src/features/workOrders/ReportFindingModal.test.tsx`: añadida prueba de B-08.
- `src/features/workOrders/PartsTable.test.tsx`: añadida prueba de B-08 en el alta de repuesto.
- `src/features/workOrders/AuthorizationPanel.test.tsx` *(nuevo)*: plurales B-16 (0, 1 y 3 en ES y EN).
- `src/features/workOrders/OrderTotalsCard.test.tsx` *(nuevo)*: validación B-08 en descuento.
- `src/pages/Finance.test.tsx` y `src/pages/finance/ImportStatementModal.test.tsx`: pruebas de `planilla` con `vi.stubEnv('VITE_MODULOS_APAGADOS', 'comisiones')` y sin él.
- `src/portal/CustomerPortal.test.tsx`: migradas pruebas de `EmailPreference` a `ConfirmDialog` (incluyendo cancelar con «Volver» y reactivar sin diálogo) y añadidas pruebas de plurales B-16 (`0/1/3 fotos` e historial).
- `src/i18n/translations.test.ts`: pruebas de `restoreBody` con fecha acabada en `p.m.`, claves B-11 y A-15.
- `src/features/workOrders/WorkOrderCreateModal.test.tsx`: prueba de que `#intake-new-customer` permanece fuera de `.combo-menu` dentro de `.intake-picker-row`.
- `src/styles/touchTargets.test.ts` *(nuevo)*: guardas CSS de 44 px, `.modal-close` 36 px en escritorio, selectores, toasts abajo y `.intake-picker-row .combo-menu` estático en móvil.
