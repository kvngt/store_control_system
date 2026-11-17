# Informe Q3 — Módulos apagados para este taller

Implementación de la bandera de módulos por despliegue (`VITE_MODULOS_APAGADOS`) con
[`.env.production`](../../.env.production) apagando los seis módulos solicitados (`comisiones`,
`inspeccion`, `reloj`, `catalogo`, `estados_de_cuenta`, `indicadores`) y manteniendo todo
encendido en desarrollo local, Vitest y e2e (`.gitignore` ignora `*.local`, no `.env.production`).

> **Nota del programador (superada por §5):** En esta sesión no estuvo habilitada la ejecución de comandos
> de terminal, por lo que `lint`, `tsc -b`, `npm test`, `build`, `test:e2e:local` y la
> revisión visual de producción quedan pendientes para el verificador.

---

## 1. Inventario completo (módulo → dónde aparece → cómo se esconde)

| Módulo | Dónde aparece | Cómo se esconde cuando está apagado |
| :--- | :--- | :--- |
| **`comisiones`** | Barra lateral admin (`Comisiones` → `/payroll`) y técnico (`Mis comisiones` → `/mis-comisiones`) | `src/components/layout/Sidebar.tsx` condiciona ambos enlaces con `moduloActivo('comisiones')`. |
| **`comisiones`** | Barra inferior móvil del técnico (`Mis comisiones` → `/mis-comisiones`) | `src/components/layout/BottomNav.tsx` condiciona la entrada con `moduloActivo('comisiones')`. |
| **`comisiones`** | Rutas `/payroll` y `/mis-comisiones` | `src/App.tsx` pasa `modulo="comisiones"` a `ProtectedRoute`; si `!moduloActivo(modulo)`, redirige a `STAFF_HOME` (`/`). |
| **`comisiones`** | Tarjeta «Requiere atención» en Panel Principal (`sin_tecnico`) | `src/features/dashboard/AttentionCard.tsx` excluye la fila `sin_tecnico` cuando `!moduloActivo('comisiones')`. |
| **`comisiones`** | Campana de notificaciones (`comision_generada`) | `src/features/notifications/NotificationBell.tsx` filtra `comision_generada` en `notificationVisible` (lista, contador visible y toast). |
| **`comisiones`** | Detalle de orden: sección «Reparto de la comisión» y alerta de tareas sin técnico | `src/features/workOrders/detail/useOrderMoney.ts` deshabilita `estimateQuery` (`enabled: moduloActivo('comisiones') && ...`); `src/features/workOrders/WorkOrderDetail.tsx` pone `unassignedCount = 0` y no renderiza la sección `comision` (y `sectionsOf` oculta pestañas/secciones vacías). |
| **`comisiones`** | Detalle de orden: sección `Técnicos` (`Por tarea` / `En el reparto` y botones Sumar/Sacar del reparto) | `src/features/workOrders/detail/sections/TechniciansSection.tsx` condiciona `.assignment-origin` con `moduloActivo('comisiones')`, conservando la asignación del técnico a la orden y a las tareas. |
| **`comisiones`** | Detalle de orden: `LaborTable` y `TaskEditor` (avisos «Sin técnico», «Nadie cobrará la comisión…», «Reparto por especialidad») | `src/features/workOrders/LaborTable.tsx` y `src/features/workOrders/TaskEditor.tsx` condicionan `isUnassignedTask`/badge `labor-no-tech`, `inherited` (`Reparto por especialidad` pasa a `Sin asignar`) y `tasks.noTechnicianHint` con `moduloActivo('comisiones')`, manteniendo intacta la asignación de técnico. |
| **`comisiones`** | Diálogo de entrega (`DeliveryModal`): consulta de reparto estimado y aviso de tareas sin técnico | `src/features/workOrders/DeliveryModal.tsx` condiciona `estimateQuery` con `enabled: moduloActivo('comisiones') && ...` (no consulta ni muestra la advertencia de comisiones sin técnico). |
| **`comisiones`** | Página `Empleados`: tarjeta y consultas de esquema de pago (`employees.payTitle`) y apertura automática tras crear empleado | `src/pages/Employees.tsx` usa `comisionesOn = moduloActivo('comisiones')` en `enabled` de `schemesQuery`, en `handleCreated` y al mostrar el esquema/tarjeta de pago de cada empleado. |
| **`comisiones`** | Configuración por sede: «Porcentaje de comisión» | `src/features/settings/SedeItem.tsx` oculta el campo `comision_porcentaje` cuando `!moduloActivo('comisiones')`. |
| **`inspeccion`** | Detalle de orden: sección `Inspección` (`PointInspection` dentro de `InspectionSection`) | `src/features/workOrders/detail/sections/InspectionSection.tsx` envuelve `<PointInspection />` con `moduloActivo('inspeccion')`, conservando `Inspección 360°`, `DamageDiagramEditor` y multimedia de recepción. |
| **`inspeccion`** | Acciones rápidas del técnico (`Inspección` → `sec-inspeccion`) | `src/features/workOrders/techNextStep.ts` condiciona la acción rápida `inspection` con `moduloActivo('inspeccion')`. |
| **`inspeccion`** | Aviso de trabajos pendientes de visita anterior (`PendingWorkNotice`) | `src/features/workOrders/PendingWorkNotice.tsx` filtra los elementos con `item.tipo === 'inspeccion'` cuando `!moduloActivo('inspeccion')`. |
| **`inspeccion`** | Campana de notificaciones (`inspeccion_completada`) | `src/features/notifications/NotificationBell.tsx` filtra `inspeccion_completada` en `notificationVisible`. |
| **`inspeccion`** | Configuración: tarjeta «Plantillas de inspección multipunto» | `src/pages/Settings.tsx` condiciona `<InspectionTemplatesCard />` con `moduloActivo('inspeccion')`. |
| **`inspeccion`** | Portal del cliente (`/r/:token`): sección de inspección por puntos | `src/portal/modulos.ts` define `portalModuloActivo('inspeccion')` leyendo `import.meta.env.VITE_MODULOS_APAGADOS` sin importar código de la app; `src/portal/components/Report.tsx` condiciona `<InspectionSection />` con `portalModuloActivo('inspeccion') && report.inspeccion`. |
| **`reloj`** | Lista de tareas del técnico (`Iniciar` / `Pausar` reloj) | `src/features/workOrders/TechnicianTaskList.tsx` condiciona los botones de reloj en `TaskActions` con `moduloActivo('reloj')`. |
| **`reloj`** | Detalle de orden: carga de `laborTimes` (`getLaborTimes`) | `src/features/workOrders/detail/useOrderLines.ts` deshabilita `laborTimesQuery` (`enabled: moduloActivo('reloj') && !!openOrderId`). |
| **`reloj`** | Tabla de mano de obra (`LaborTable`): insignia de horas, duración registrada, botón «Tiempos», modal de tiempos y campo `Horas` en creación/edición | `src/features/workOrders/LaborTable.tsx` y `src/features/workOrders/TaskEditor.tsx` condicionan badge de horas, resumen de tiempo/`Tiempos`/`LaborTimesModal` y campo numérico `horas` con `moduloActivo('reloj')`. |
| **`reloj`** | Alta de orden (`WorkStep`): visualización de horas en tareas agregadas | `src/features/workOrders/intake/steps/WorkStep.tsx` condiciona `{task.horas} h` con `moduloActivo('reloj')`. |
| **`reloj`** (+ `indicadores`) | Configuración por sede: «Tarifa por hora (referencia)» | `src/features/settings/SedeItem.tsx` muestra el campo solo si `moduloActivo('reloj') \|\| moduloActivo('indicadores')`. |
| **`catalogo`** | Alta de orden (`WorkStep`): botón «Del catálogo» y `CatalogPickerModal` | `src/features/workOrders/intake/steps/WorkStep.tsx` condiciona ambos con `moduloActivo('catalogo')`. |
| **`catalogo`** | Detalle de orden (`LaborTable`): botón «Del catálogo» y `CatalogPickerModal` | `src/features/workOrders/LaborTable.tsx` condiciona `extraActions` y `<CatalogPickerModal />` con `moduloActivo('catalogo')`. |
| **`catalogo`** | Inspección por puntos (`PointInspection`): botón «Del catálogo» por punto y modal | `src/features/inspection/PointInspection.tsx` condiciona botón y `<CatalogPickerModal />` con `moduloActivo('catalogo')`. |
| **`catalogo`** | Configuración: tarjeta «Catálogo de trabajos frecuentes» | `src/pages/Settings.tsx` condiciona `<JobCatalogCard />` con `moduloActivo('catalogo')`. |
| **`estados_de_cuenta`** | Finanzas: vista «Estados de cuenta (contabilidad)», importación PDF y consultas de importaciones/resúmenes | `src/pages/Finance.tsx` condiciona `views` (`banco`), `importsQuery`/`summariesQuery` (`enabled: statementsOn`) y `ImportStatementModal` con `moduloActivo('estados_de_cuenta')`; si `views.length < 2` no pinta `<div role="tablist">`. |
| **`indicadores`** | Finanzas: vista «Indicadores» (`WorkshopMetricsTab`) | `src/pages/Finance.tsx` condiciona `views` (`indicadores`) y `<WorkshopMetricsTab />` con `moduloActivo('indicadores')`; si `views.length < 2` no pinta `<div role="tablist">`. |

---

## 2. Archivos tocados

### Configuración y helpers nuevos
- [`.env.production`](../../.env.production) — `VITE_MODULOS_APAGADOS=comisiones,inspeccion,reloj,catalogo,estados_de_cuenta,indicadores`
- [`src/config/modulos.ts`](../../src/config/modulos.ts) — tipo `Modulo`, `modulosApagados`, `moduloActivo`
- [`src/portal/modulos.ts`](../../src/portal/modulos.ts) — lectura independiente para el portal (`portalModuloActivo`)

### Pantallas y componentes editados
- [`src/App.tsx`](../../src/App.tsx)
- [`src/components/layout/BottomNav.tsx`](../../src/components/layout/BottomNav.tsx)
- [`src/components/layout/Sidebar.tsx`](../../src/components/layout/Sidebar.tsx)
- [`src/features/dashboard/AttentionCard.tsx`](../../src/features/dashboard/AttentionCard.tsx)
- [`src/features/inspection/PointInspection.tsx`](../../src/features/inspection/PointInspection.tsx)
- [`src/features/notifications/NotificationBell.tsx`](../../src/features/notifications/NotificationBell.tsx) *(completado: agregado filtro para `inspeccion_completada`)*
- [`src/features/settings/SedeItem.tsx`](../../src/features/settings/SedeItem.tsx)
- [`src/features/workOrders/DeliveryModal.tsx`](../../src/features/workOrders/DeliveryModal.tsx)
- [`src/features/workOrders/LaborTable.tsx`](../../src/features/workOrders/LaborTable.tsx) *(completado: condicionado `inherited` con `moduloActivo('comisiones')`)*
- [`src/features/workOrders/PendingWorkNotice.tsx`](../../src/features/workOrders/PendingWorkNotice.tsx)
- [`src/features/workOrders/TaskEditor.tsx`](../../src/features/workOrders/TaskEditor.tsx) *(completado: condicionado `tasks.noTechnicianHint` con `moduloActivo('comisiones')`)*
- [`src/features/workOrders/TechnicianTaskList.tsx`](../../src/features/workOrders/TechnicianTaskList.tsx)
- [`src/features/workOrders/WorkOrderDetail.tsx`](../../src/features/workOrders/WorkOrderDetail.tsx)
- [`src/features/workOrders/detail/sections/InspectionSection.tsx`](../../src/features/workOrders/detail/sections/InspectionSection.tsx)
- [`src/features/workOrders/detail/sections/TechniciansSection.tsx`](../../src/features/workOrders/detail/sections/TechniciansSection.tsx)
- [`src/features/workOrders/detail/useOrderLines.ts`](../../src/features/workOrders/detail/useOrderLines.ts)
- [`src/features/workOrders/detail/useOrderMoney.ts`](../../src/features/workOrders/detail/useOrderMoney.ts)
- [`src/features/workOrders/intake/steps/WorkStep.tsx`](../../src/features/workOrders/intake/steps/WorkStep.tsx)
- [`src/features/workOrders/techNextStep.ts`](../../src/features/workOrders/techNextStep.ts)
- [`src/pages/Employees.tsx`](../../src/pages/Employees.tsx)
- [`src/pages/Finance.tsx`](../../src/pages/Finance.tsx)
- [`src/pages/Settings.tsx`](../../src/pages/Settings.tsx)
- [`src/portal/components/Report.tsx`](../../src/portal/components/Report.tsx)

### Pruebas nuevas (sin modificar las existentes)
- [`src/config/modulos.test.ts`](../../src/config/modulos.test.ts) — `modulosApagados` (lista vacía, con espacios, nombres desconocidos) y `moduloActivo` con `vi.stubEnv`
- [`src/components/layout/Sidebar.modulos.test.tsx`](../../src/components/layout/Sidebar.modulos.test.tsx) — módulo `comisiones` (admin `Comisiones` y técnico `Mis comisiones`, encendido vs. apagado)
- [`src/features/workOrders/detail/sections/InspectionSection.modulos.test.tsx`](../../src/features/workOrders/detail/sections/InspectionSection.modulos.test.tsx) — módulo `inspeccion` (oculta `PointInspection` y conserva `Inspección 360°`)
- [`src/portal/components/Report.modulos.test.tsx`](../../src/portal/components/Report.modulos.test.tsx) — módulo `inspeccion` en el portal del cliente (`portalModuloActivo`)
- [`src/features/workOrders/TechnicianTaskList.modulos.test.tsx`](../../src/features/workOrders/TechnicianTaskList.modulos.test.tsx) — módulo `reloj` (`Iniciar` reloj encendido vs. apagado conservando `Realizado`)
- [`src/features/workOrders/LaborTable.modulos.test.tsx`](../../src/features/workOrders/LaborTable.modulos.test.tsx) — módulos `catalogo` (`Del catálogo`), `reloj` (insignia de horas y campo `Horas`) y `comisiones` (`Reparto por especialidad` vs. `Sin asignar`)
- [`src/pages/Finance.modulos.test.tsx`](../../src/pages/Finance.modulos.test.tsx) — módulos `estados_de_cuenta` e `indicadores` (pestañas individuales y desaparición del selector cuando solo queda `Movimientos del taller`)
- [`src/features/notifications/NotificationBell.modulos.test.tsx`](../../src/features/notifications/NotificationBell.modulos.test.tsx) — filtrado de `comision_generada` (`comisiones`) e `inspeccion_completada` (`inspeccion`) en la campana y el contador

---

## 3. Referencias a módulos apagados en el Manual de Usuario (sin editar)

De acuerdo con la orden, [`docs/manual-usuario.md`](../manual-usuario.md) y
[`docs/manual-usuario.en.md`](../manual-usuario.en.md) **no se modificaron**. Las secciones que
describen módulos apagados en producción son:

- **§4 («Las páginas de la app»):** entradas de `Comisiones` y `Mis comisiones`.
- **§5 («El Panel»):** fila de atención «Tareas sin técnico: nadie cobra su comisión».
- **§8 («Abrir y trabajar una orden»):**
  - «Del catálogo» y trabajos agrupados en el detalle y el alta.
  - «Horas y tiempos registrados» y «Reloj por tarea».
  - «Reparto de la comisión» / «Tu comisión estimada».
  - Acción rápida «Inspección» e «Inspección por puntos del vehículo» (incluyendo su publicación al enlace del cliente).
- **§11 («Avisos en pantalla y en tu teléfono»):** notificaciones `Inspección lista` y `Comisión aprobada`.
- **§12 («Finanzas»):** vistas «Estados de cuenta (contabilidad)» e «Indicadores del taller», importación PDF y columna `Comisiones` en «Margen por orden».
- **§13 («Comisiones y Empleados»):** sección completa de `Comisiones` y esquema de pago en `Empleados`.
- **§15 («Configuración»):** `Porcentaje de comisión`, `Tarifa por hora (referencia)`, `Catálogo de trabajos frecuentes` y `Plantillas de inspección por puntos`.
- **§19 («Problemas frecuentes»):** preguntas sobre acceso a `Comisiones`, tope de 12 h del reloj, «Terminar inspección» e importación de estados de cuenta.

---

## 4. Lo dudoso y decisiones tomadas

1. **Columna/fila «Comisiones» en `OrderMarginCard` y `OrderBalanceCard`:**
   - [`src/features/finance/OrderMarginCard.tsx`](../../src/features/finance/OrderMarginCard.tsx) (vista básica de Finanzas) y [`src/features/finance/OrderBalanceCard.tsx`](../../src/features/finance/OrderBalanceCard.tsx) (pestaña `Cobro` del detalle) muestran `Cobrado − Repuestos − Comisiones = Margen` calculado por las RPC `margen_ordenes` y `balance_orden`. Se dejaron intactos para no alterar la suma mostrada (`Margen` seguiría restando comisiones si existieran órdenes con devengo histórico) y no romper las aserciones de `OrderMargin.test.tsx`. Si el taller quiere ocultar esa columna aunque quede en `$0.00`, conviene decidir si la RPC básica debe excluir comisiones o si solo se oculta cuando el valor sea 0.
2. **Textos heredados que mencionan comisiones en diálogos y subtítulos:**
   - En [`src/features/workOrders/DeliveryModal.tsx`](../../src/features/workOrders/DeliveryModal.tsx) (`delivery.hint`: «Al entregar, el pago queda en Finanzas con su método y se generan las comisiones.»), [`src/features/workOrders/TradeMismatchDialog.tsx`](../../src/features/workOrders/TradeMismatchDialog.tsx) (`tasks.mismatchBody`), [`src/pages/Employees.tsx`](../../src/pages/Employees.tsx) (subtítulo «cómo se le paga») y [`src/features/settings/EmployeesLinkCard.tsx`](../../src/features/settings/EmployeesLinkCard.tsx) (`employees.movedHint`) siguen textos informativos que nombran comisiones o pago. Se dejaron tal cual porque la base sigue registrando lo técnico y para no introducir variantes ad hoc en las claves de traducción compartidas con las pruebas existentes; vale revisar en QA visual si conviene suavizar `delivery.hint` cuando `comisiones` está apagado.
3. **`OrderJobsList` en órdenes históricas con trabajos del catálogo:**
   - En [`src/features/workOrders/detail/sections/LaborSection.tsx`](../../src/features/workOrders/detail/sections/LaborSection.tsx), `OrderJobsList` solo se muestra si `(order.trabajos?.length ?? 0) > 0`. Con `catalogo` apagado no se pueden agregar trabajos nuevos de catálogo, pero si existe alguna orden previa creada con un trabajo de catálogo, sigue siendo visible y editable.
4. **Bloqueo de líneas con comisiones ya pagadas (`useOrderMoney.ts`):**
   - `paidQuery` (`getPaidCommissionKeys`) se dejó activo aunque `comisiones` esté apagado: si en producción hubiera alguna orden histórica con comisión pagada antes del apagado, el trigger de la base sigue rechazando cambiarle el técnico/tipo, y mantener `lockedIds` evita errores inesperados al editar esa orden.
5. **Revisión visual en `Settings` y `WorkStep`:**
   - Las pruebas nuevas cubren de forma unitaria/integrada los 6 módulos (`Sidebar`, `InspectionSection`, `Report`, `TechnicianTaskList`, `LaborTable`, `Finance`, `NotificationBell`) y las reglas puras (`modulos.test.ts`). Queda para la verificación en navegador comprobar `Settings.tsx` (`JobCatalogCard`, `InspectionTemplatesCard`, `SedeItem`), `Employees.tsx` (ausencia de la tarjeta de pago) y `WorkStep.tsx` (ausencia de «Del catálogo» y horas).

---

## 5. Verificación del jefe de obra (17/11/2026)

La entrega de Hydrogen se trajo al árbol principal con un parche que aplicó limpio (35 archivos, sin
tocar `supabase/`, `e2e/` ni la documentación fuera de este informe). `.env.production` no está
ignorado por git. Base local y Docker respondían.

### Comandos

| Comando | Resultado |
|---|---|
| `npm run lint` (oxlint) | sin avisos |
| `npx tsc -b` | verde (tras arreglar 2 errores de tipo, ver abajo) |
| `npm test` (Vitest) | 186 archivos y 1.300 pruebas, todo verde (la primera pasada: 3 fallos, ver abajo) |
| `npm run build` | verde |
| `E2E_SUPABASE_URL=http://127.0.0.1:44321 npm run test:e2e:local` | 86 de 86 (corrida con el servidor de desarrollo, todo encendido; se hizo antes de los arreglos de textos de abajo, que no cambian nada con todo encendido) |

### Lo que arregló el jefe de obra

1. `NotificationBell.modulos.test.tsx`: `cuerpo: null` no es un `string` (2 errores de `tsc`); ahora `''`. Además el
   título esperado era «Comisión generada», pero la pantalla pinta «Comisión aprobada · {numero_orden}» (viene
   de `notifications.types.comision_generada`); corregido.
2. `TechnicianTaskList.modulos.test.tsx`: el doble de `detail` tenía `canEdit: false` y entonces `TaskActions` no
   se pinta (ni «Iniciar» ni «Realizado»); ahora `canEdit: true`.
3. **Rastros que el programador dejó marcados como dudosos y que sí se veían con todo apagado** (solo
   condiciones y textos, sin lógica nueva):
   - `OrderMarginCard.tsx` (Finanzas, «Margen por orden»): sin la columna ni la suma «Comisiones» y con el
     texto `orderBalance.marginHintNoCommissions`.
   - `OrderBalanceCard.tsx` («Balance de la orden», pestaña Cobro): sin la fila «Comisiones».
   - Textos que nombraban comisiones, ahora con variante cuando `comisiones` está apagado (claves nuevas en
     español e inglés en `translations.ts`): `delivery.hintNoCommissions` (`DeliveryModal`),
     `discount.hintNoCommissions` (`OrderTotalsCard`), `withdrawal.explainNoCommissions` (`WithdrawalModal`),
     `tasks.mismatchBodyNoCommission` (`TradeMismatchDialog`), `workOrders.deliverAdminOnlyNoCommissions` y
     `workOrders.confirmUndeliverNoCommissions` (`KanbanBoard`, `useOrderTransitions`),
     `employees.subtitleNoPay` (`Employees`) y `employees.movedHintNoPay` (`EmployeesLinkCard`).
   - Los textos con todo encendido son idénticos a los de antes.

### Navegador (compilación de producción local, `qa.local/dist-local` en :4173, módulos apagados)

Arnés: `qa.local/q3-recorrido.mjs`, `q3-flujo.mjs`, `q3-config.mjs`. Capturas: `qa.local/shots/q3-*.png`
(prefijos `q3-prod…`, `q3-prodfinal…`, `q3-todo…`, `q3-flujo…`). Cero errores de consola en todos los recorridos.

| Qué se buscó | Dónde | Resultado | Captura |
|---|---|---|---|
| Menú: Panel, Clientes, Vehículos, Órdenes, Finanzas, Empleados, Configuración, Ayuda; sin «Comisiones» | Administración, 1366 y 390 px (menú lateral y barra de abajo) | Sin rastro | `q3-prodfinal-A-d-01-panel`, `q3-prodfinal-A-m-01-panel` |
| Menú del mecánico: Panel, Órdenes, Configuración, Ayuda; sin «Mis comisiones» | Mecánico, 1366 y 390 px | Sin rastro | `q3-prod-M-d-01-panel`, `q3-prod-M-m-01-panel` |
| `/payroll` y `/mis-comisiones` | Administración y mecánico, ambos anchos | Redirigen a `/panel` | (texto del recorrido) |
| Detalle de una orden entregada (051): las 5 pestañas con «Desplegar todo» y apilado en 390 px | Administración | Sin comisiones, reloj, horas, catálogo ni inspección por puntos; queda «Inspección 360°»; sin pestañas ni secciones vacías | `q3-prodfinal-A-d-07…11-orden-*` |
| Finanzas | Administración | Sin selector de vistas (solo «Movimientos del taller»), sin Estados de cuenta ni Indicadores, margen sin columna de comisiones | `q3-prodfinal-A-d-finanzas` |
| Configuración (sede expandida) | Administración, ambos anchos | Sin «Catálogo de trabajos frecuentes», sin «Plantillas de inspección multipunto», sin «Porcentaje de comisión» ni «Tarifa por hora» | `q3-prod-config-d`, `q3-prod-config-m` |
| Empleados | Administración, ambos anchos | Sin «Pago de cada empleado» ni porcentajes de comisión | `q3-prodfinal-A-d-04-empleados` |
| Alta de una orden (cliente y vehículo nuevos, un trabajo) | Administración, 1366 y 390 px | Paso 3 solo con «Agregar trabajo» y «Agregar repuesto» (sin «Del catálogo»), el diálogo de trabajo sin campo de horas; orden creada (078 en escritorio, 079/080 en móvil) | `q3-flujo-d-01…04`, `q3-flujo-m-…` |
| Autorizar, avance, finalizar, listo para entregar, entregar y cobrar | Administración, 1366 px (078) y 390 px (080; el avance en la 079) | Todo funciona; la orden quedó `entregado` con su cobro | `q3-flujo-*-paso` |
| Mecánico: «Mis tareas» y una orden suya | 1366 y 390 px | Botones «Realizado», «Agregar avance», «Foto»; sin «Iniciar»/reloj, comisiones ni inspección por puntos | `q3-prod2-M-m-*` |
| Pantalla en blanco, pestañas vacías, recuadros de error | Todos los recorridos | Ninguno | — |

### Con todo encendido (:4174, `VITE_MODULOS_APAGADOS=` vacío)

Administración a 1366 px: el menú vuelve a tener «Comisiones»; el Panel con «Tareas sin técnico: nadie cobra su
comisión»; Finanzas con «Movimientos del taller / Estados de cuenta (contabilidad) / Indicadores» y el margen con su
columna de comisiones; Configuración con el catálogo, las plantillas de inspección multipunto, el porcentaje de
comisión y la tarifa por hora; Empleados con «Pago de cada empleado»; la orden con «Reparto de la comisión»,
«Tiempos» e «Inspección por puntos»; `/payroll` y `/mis-comisiones` abren. Es lo que había antes de la orden.

### Lo que queda

- En Finanzas, la categoría de un movimiento de planilla se llama «Comisiones» (`finance.payroll`). Con
  `comisiones` apagado se sigue viendo en los 7 egresos de demostración que ya existían (pagos de comisión
  de prueba); en un taller que nunca pagó comisiones no aparece. No se cambió: es la etiqueta de una categoría de
  dinero, no del módulo.
- Las tareas «Pendientes del vehículo» (`PendingWorkNotice`), la campana y el portal del cliente están cubiertos
  por pruebas de Vitest pero no se recorrieron en el navegador (no había datos de esos casos).
- La Ayuda (`manual-usuario*.md`) sigue hablando de los módulos apagados (ver §3).
- No se recorrió en navegador el «terminar» del mecánico con su propia cuenta; lo cubre la e2e `TEC-02`.
- La «Verificación» se hizo contra la base local con datos de demostración; las órdenes de prueba son
  `ORD-2026-078`, `079` y `080` (clientes `PRUEBA Q3 …`).
