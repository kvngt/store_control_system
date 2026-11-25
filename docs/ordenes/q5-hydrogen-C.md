# Q5 Fase C — Informe de cierre (Manuales filtrados por módulo y plurales)

Este informe documenta el cierre de **C1** (marcado por módulo en ambos manuales y sus pruebas en `src/features/help/helpDoc.test.ts`) y la verificación de **C2** (`pluralKey` y claves `*One` / `*Many` sin `(s)` ni `(es)`).

> Nota: conforme a la restricción de entorno, no se ejecutaron comandos de terminal (`lint`, `tsc` ni `vitest`); el verificador correrá la batería de pruebas.

---

## 1. C1 — Bloques marcados por módulo en los manuales

Se marcaron `docs/manual-usuario.md` y `docs/manual-usuario.en.md` con bloques `<!-- modulo: <nombre> -->` ... `<!-- /modulo -->` en la **misma secuencia exacta** en ambos idiomas, siempre en líneas propias, sin alterar la regla de ubicación de `<!-- rol: admin|tecnico -->` debajo de cada título y sin renumerar secciones.

### `comisiones`

| Sección ES / EN | Qué cubre el bloque |
|---|---|
| §1 Qué es Restorify / What Restorify is | Referencia a comisiones y pagos de nómina en el resumen inicial |
| §2 Términos clave / Key terms | Mención en **Mano de obra**, definición de **Comisión** y nota en **Trabajo / Tarea** |
| §4 Cómo moverse / Getting around | Entradas del menú (**Comisiones** en Taller y en Finanzas), campana (**Comisión aprobada**) y barra móvil (**Mis comisiones**) |
| §5 Panel Principal / Dashboard | Fila «Tareas sin técnico: nadie cobra su comisión» en *Requiere atención* |
| §8 Órdenes de trabajo / Work orders | Nota de generación de comisiones en la tabla de estados; nota de reparto en «Solo administración crea órdenes»; aviso de tarea sin técnico en Resumen y Trabajo; «Tu comisión estimada» en panel del técnico; pago de comisiones bloquea edición en Mano de obra; cálculo de comisión en tareas del técnico; subsecciones **Tu comisión estimada / Your estimated commission** y reglas de **Técnicos asignados**; notas de comisiones en **Entrega**, **Retirada sin reparar**, **Descuento** y **Eliminar una orden** |
| §11 Notificaciones / Notifications | Fila de la tabla para «Comisión aprobada» |
| §12 Finanzas / Finance | Explicación de comisiones pagadas en movimientos automáticos, fila/nota de pagos de comisión generados al marcar como pagado, columna **Comisiones** en *Margen por orden*, categoría **Comisiones** y regla de no borrar pagos automáticos de comisión |
| §13 Comisiones / Commissions | Sección **13. Comisiones / Commissions** completa hasta **Para el técnico: Mis comisiones**; dentro de **### Empleados / Employees** (que permanece visible), los párrafos y líneas de esquema de pago y comisiones pendientes/pagadas |
| §14 Cobro por parqueo / Parking fees | Aclaración de que el parqueo no genera comisión |
| §15 Configuración / Settings | **Porcentaje de comisión / Commission rate** en Talleres, paso de pago al crear usuario en **Empleados** y bloqueo de baja por comisiones pagadas |
| §17 Qué puede hacer cada quién / Roles & permissions | Filas de comisión en tabla resumen (ver comisión propia, consultar Mis comisiones, apartado Comisiones y esquema de pago en Empleados) |
| §18 Cosas que el sistema hace solo / Things the system does automatically | Generación de comisiones sugeridas al entregar, recálculo al editar entregada, borrado de no pagadas al sacar de Entregado, parqueo y descuento respecto a comisiones, registro de egreso al pagar comisiones |
| §19 Problemas comunes / Common issues | Preguntas sobre **Mis comisiones**, descuento vs. comisión, borrar orden con comisiones pagadas, visibilidad de **Comisiones** en Finanzas, relación mano de obra/comisión del técnico y reparto al asignar tareas |

### `inspeccion`

| Sección ES / EN | Qué cubre el bloque |
|---|---|
| §8 Órdenes de trabajo / Work orders | Botón rápido **Inspección** del técnico; mención a inspección por puntos en vista de orden del técnico; nota sobre volver a la inspección desde vista de tarea; subsección completa **Inspección multipunto / Multi-point inspection** (incluyendo un bloque `catalogo` anidado para «Del catálogo») |
| §11 Notificaciones / Notifications | Fila «Inspección lista» en la tabla de notificaciones |
| §15 Configuración / Settings | Campo **Plantillas de inspección / Inspection templates** en Talleres |
| §17 Qué puede hacer cada quién / Roles & permissions | Las 5 filas de inspección multipunto en la tabla de permisos |
| §19 Problemas comunes / Common issues | Pregunta del técnico sobre **Terminar inspección / Complete inspection** y puntos bloqueados |

### `reloj`

| Sección ES / EN | Qué cubre el bloque |
|---|---|
| §8 Órdenes de trabajo / Work orders | Campo manual **Horas** al agregar trabajo; bloque **Horas y tiempos registrados / Tiempos** en Mano de obra; **Reloj por tarea** en vista del técnico; pausa automática del reloj al marcar **Hecha**; control del reloj en **Otras tareas de la orden** |
| §19 Problemas comunes / Common issues | Pregunta del técnico sobre reloj olvidado y tope de **12 horas** |

### `catalogo`

| Sección ES / EN | Qué cubre el bloque |
|---|---|
| §8 Órdenes de trabajo / Work orders | Opción **Del catálogo / From catalog** en el paso 3 del alta; **Del catálogo** + **Trabajos agrupados** + pastilla de grupo en Mano de obra; bloque anidado de creación de trabajos desde la inspección multipunto; nota de autorización completa por trabajo agrupado en **Presupuestos** |
| §15 Configuración / Settings | Subsección **Catálogo de trabajos frecuentes / Catalog of frequent jobs** en Talleres |

### `estados_de_cuenta`

| Sección ES / EN | Qué cubre el bloque |
|---|---|
| §8 Órdenes de trabajo / Work orders | Frase «Los movimientos importados del banco se conservan» en *Eliminar una orden* |
| §12 Finanzas / Finance | Viñeta de vista **Estados de cuenta**; aclaración sobre compras importadas del banco en *Margen por orden*; subsecciones **Importar un estado de cuenta PDF / Importing a PDF bank statement**, **Evitar duplicados / Avoiding duplicates** y **Revertir una importación / Reverting an import** |
| §18 Cosas que el sistema hace solo / Things the system does automatically | Conservación de movimientos importados del banco al eliminar una orden |
| §19 Problemas comunes / Common issues | Las 3 preguntas sobre importación de estados de cuenta PDF (**Importar Seleccionadas**, importación duplicada, PDF sin transacciones) |

### `indicadores`

| Sección ES / EN | Qué cubre el bloque |
|---|---|
| §12 Finanzas / Finance | Viñeta de vista **Indicadores del taller / Workshop indicators** y subsección completa de Indicadores del taller |
| §15 Configuración / Settings | Campo **Tarifa por hora (referencia) / Reference hourly rate** (usado por los indicadores del taller) |

*(Nota sobre el bloque de Finanzas §12: en la cabecera introductoria de vistas se pasó de mencionar exactamente tres vistas a una formulación neutra —ver §2— para que la lista funcione tanto con 1 vista activa como con las 3 encendidas).*

---

## 2. Frases reescritas o divididas

En párrafos y encabezados donde convivía un módulo apagable con funcionalidad siempre activa, se partió o reescribió el texto para mantener la lectura coherente sin ese módulo:

1. **§12 Finanzas (encabezado de vistas)**:
   - ES: `Tiene tres vistas:` → `Vistas disponibles:` (y las viñetas de `Estados de cuenta` e `Indicadores del taller` quedaron en sus bloques de módulo).
   - EN: `It has three views:` → `Available views:`.
2. **§12 Finanzas (categoría bancaria en tabla de categorías)**:
   - ES: `Las comisiones del banco y de Clover...` → `Los cargos del banco y de Clover...` (conservando el nombre literal de la categoría en la UI: `**Comisiones de banco y tarjeta**`).
3. **§12 Finanzas (resumen bancario en la comparativa)**:
   - EN: `using the statement amount.` → `using the monthly bank summary amount.` (evita el término `statement` del módulo de importación cuando solo se compara un cargo manual de comisión bancaria).
4. **§13 Empleados**:
   - Se dejó visible `### Empleados` / `### Employees` (con `<!-- rol: admin -->`) fuera de `comisiones`, moviendo únicamente las menciones de esquema de pago y comisiones a dos bloques `<!-- modulo: comisiones -->` propios para no ocultar la gestión de empleados cuando `comisiones` está apagado.
5. **§8 / §18 / §19 (frases mixtas separadas en líneas propias)**:
   - Se partieron en oraciones independientes: reparto/comisión en `Entrega`, `Retirada sin reparar`, `Descuento`, `Eliminar una orden`, ediciones/desentrega en §18 y las preguntas del §19 sobre Finanzas (`Entré pero no veo Finanzas`), precios del técnico y ayuda en una orden.

---

## 3. Menciones dejadas a propósito y por qué

Estas menciones permanecen visibles con los 6 módulos apagados y se documentan explícitamente en `src/features/help/helpDoc.test.ts`:

- **ES — `Comisiones de banco y tarjeta` (§12 Finanzas, 2 apariciones)**: nombre literal de la categoría contable en español (`finance.bankFees`) para registrar manualmente cargos bancarios o de Clover; no guarda relación con comisiones del personal.
- **EN — `360° Inspection` / `360° inspection` / `This inspection is shop evidence` (§8 Alta, §9 Galería)**: corresponde a las 6 fotografías de recepción del vehículo al ingreso, módulo siempre encendido e independiente de `inspeccion` (inspección multipunto).
- **EN — `General inspection` (§8 Calcomanía de próximo servicio)**: traducción en la interfaz de la opción rápida `Revisión general` de próximo servicio.
- **EN — `Final inspection` (§8 Tabla de estados)**: etiqueta del portal del cliente cuando la orden está en estado `Completed` (`En revisión final` en español).
- **EN — `Only the inspection is charged` / `vehicle diagnosis or inspection` / `inspection charge` / `inspection only` (§8 y §18 Retirada sin reparar)**: refiere al cobro diagnóstico de revisión cuando el cliente retira el vehículo sin reparar (`solo revisión` en español), no a las plantillas de inspección multipunto.
- **ES — verbo `inspeccionar` (§8 badge *Por revisar*)**: uso genérico de revisar el vehículo antes de entregar.

---

## 4. C2 — Verificación de claves de plural (`antes -> después`)

Se comprobó mediante revisión directa de `src/i18n/translations.ts`, `src/i18n/translations.test.ts` (`!/\(e?s\)/i`), `src/lib/plural.ts` (`pluralKey`), `src/lib/plural.test.ts` y todos los componentes y pruebas llamadores que ninguna referencia usa claves antiguas eliminadas con `(s)` / `(es)`:

| Antes | Después (`One` / `Many`) | Uso principal verificado |
|---|---|---|
| `workOrders.taskProgressCount` | `workOrders.taskProgressCountOne` / `workOrders.taskProgressCountMany` | `TechnicianTaskList.tsx` |
| `workOrders.finishUnmarkedTitle` | `workOrders.finishUnmarkedTitleOne` / `workOrders.finishUnmarkedTitleMany` | `OrderDialogs.tsx` |
| `orderBalance.monthTotal` | `orderBalance.monthTotalOne` / `orderBalance.monthTotal` | `OrderMarginCard.tsx` |
| `commission.detail` | `commission.detailOne` / `commission.detailMany` | `CommissionEstimateCard.tsx` |
| `commission.taskCount` | `commission.taskCountOne` / `commission.taskCountMany` | `CommissionEstimateCard.tsx` |
| `tasks.autoAssigned` | `tasks.autoAssignedOne` / `tasks.autoAssignedMany` | `useOrderLines.ts` |
| `tasks.unassignedNotice` | `tasks.unassignedNoticeOne` / `tasks.unassignedNoticeMany` | `WorkOrderDetail.tsx`, `OrderTabTop.tsx` |
| `authorization.notSent` | `authorization.notSentOne` / `authorization.notSentMany` | `AuthorizationPanel.tsx` |
| `authorization.waitingHint` | `authorization.waitingHintOne` / `authorization.waitingHintMany` | `AuthorizationPanel.tsx` |
| `techStatus.authorized` | `techStatus.authorizedOne` / `techStatus.authorizedMany` | `TechOrderStatus.tsx` |
| `techStatus.done` | `techStatus.doneOne` / `techStatus.doneMany` | `TechOrderStatus.tsx` |
| `findings.files` | `findings.filesOne` / `findings.filesMany` | `FindingsCard.tsx` |
| `delivery.unassignedWarning` | `delivery.unassignedWarningOne` / `delivery.unassignedWarningMany` | `DeliveryModal.tsx` |
| `notifications.types.orden_vencida.body` | `notifications.types.orden_vencida.bodyOne` / `bodyMany` | `renderNotification.ts` |
| `notifications.push.devicesTitle` | `notifications.push.devicesTitleOne` / `devicesTitleMany` | `UsersCard.tsx` |
| `quotes.draftsHint` | `quotes.draftsHintOne` / `quotes.draftsHintMany` | `QuoteCard.tsx` |
| `quotes.openHint` | `quotes.openHintOne` / `quotes.openHintMany` | `QuoteCard.tsx` |
| `quotes.openDraftsHint` | `quotes.openDraftsHintOne` / `quotes.openDraftsHintMany` | `QuoteCard.tsx` |
| `quotes.historyApproved` | `quotes.historyApprovedOne` / `quotes.historyApprovedMany` | `QuoteCard.tsx` |
| `quotes.historyRejected` | `quotes.historyRejectedOne` / `quotes.historyRejectedMany` | `QuoteCard.tsx` |
| `kanban.car*` / `kanban.space*` | `kanban.carOne` / `kanban.carMany`, `kanban.spaceOne` / `kanban.spaceMany` | `occupancy.ts` |
| `myTasks.doneCount` | `myTasks.doneCountOne` / `myTasks.doneCountMany` | `MyTasksCard.tsx` |
| `payroll.toReviewHint` | `payroll.toReviewHintOne` / `payroll.toReviewHintMany` | `Payroll.tsx` |
| `payroll.approved` | `payroll.approvedOne` / `payroll.approvedMany` | `Payroll.tsx` |
| `payroll.unreviewedNotPaid` | `payroll.unreviewedNotPaidOne` / `payroll.unreviewedNotPaidMany` | `Payroll.tsx` |
| `payroll.ordersCount` *(singular/plural)* | `payroll.ordersCountOne` / `payroll.ordersCount` | `Payroll.tsx` |
| `settings.emailOutbox.failedCount` | `settings.emailOutbox.failedCountOne` / `failedCountMany` | `EmailOutboxCard.tsx` |
| `settings.emailOutbox.retried` | `settings.emailOutbox.retriedOne` / `retriedMany` | `EmailOutboxCard.tsx` |
| `settings.deleteSedeStaff` | `settings.deleteSedeStaffOne` / `deleteSedeStaffMany` | `DeleteSedeModal.tsx` |
| `inspection.templates.pointsCount` | `inspection.templates.pointsCountOne` / `pointsCountMany` | `InspectionTemplatesCard.tsx` |
