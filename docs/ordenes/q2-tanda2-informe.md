# Q2, tanda 2 — Un solo camino claro en la orden: informe del jefe de obra (24/11/2026)

Programó Gemini 4 Hydrogen (una sola vuelta); el jefe de obra trajo la entrega al árbol principal, la
verificó y corrigió lo chico. Diseño: [q2-prioridades.md](q2-prioridades.md), sección «Tanda 2». Sin
migraciones, sin tocar `supabase/`, sin commits, nada contra el proyecto real (el build y el preview se
compilaron con `VITE_SUPABASE_URL=http://127.0.0.1:44321`; el bundle no trae ninguna URL `*.supabase.co`).

## Qué quedó hecho

| Punto | Resultado |
|---|---|
| A-04 | `adminNextStep(order, opciones)` (`features/workOrders/adminNextStep.ts`, función pura con 10 pruebas de precedencia). Sin trabajos: «Agregar trabajo»; sin firma: «Tomar firma»; con líneas `borrador`/`pendiente`: «Registrar autorización»; terminada: «Marcar listo para entregar»; lista: «Entregar y cobrar». Solo ese botón es `primary` y va primero. «Enviar presupuesto» (`AuthorizationPanel`) y los botones de `QuoteCard`/`QuoteShareActions` pasaron a secundarios. Nueva acción rápida «Registrar autorización» (solo con algo por autorizar) |
| A-05 | «Agregar trabajo» lleva a Trabajos > Mano de obra, abre `TaskEditor` y enfoca `#labor-new-description`; «Registrar autorización» (acción rápida y botón del panel) lleva a Presupuesto y abre `AuthorizationModal`. Mecanismo: contadores `addLaborRequest` / `authorizeRequest`, que funcionan también si la pestaña aún no estaba montada |
| A-09 | En el teléfono las acciones rápidas van dentro de `OrderHeader`, justo bajo el título y antes del selector de estado y del avance; el subtítulo conserva solo el nombre del cliente (los datos del vehículo ya están en su sección, que no trae al cliente). En escritorio no cambia nada |
| A-14 | Finalizar con tareas autorizadas sin marcar abre `ChoiceDialog` («Queda 1 tarea sin marcar» / «Quedan N tareas sin marcar»: Revisar tareas / Terminar de todos modos). Todo cambio de estado guardado muestra el aviso «Estado: X». «Revisar tareas» repone el selector y lleva a la sección de tareas |
| B-03 | El técnico abre la orden con «Tareas» desplegada (escritorio y teléfono); las demás, cerradas |
| B-04/A-07 (orden) | Técnico: principal, «Registrar avance», «Reportar trabajo adicional», y el resto (`buildTechActions`) |
| B-09 | `mergeTaskOrder` / `orderTasksByIds` (`tasks.ts`) fijan el orden al cargar: la tarea hecha se queda en su lugar, tachada; aviso «Tarea hecha» solo al marcar |
| B-12 | Panel del técnico: se quita «Órdenes recientes»; queda `MyTasksCard`, el contador «Mis órdenes activas» y las alertas |
| A-11 | `getWorkOrders` trae `lineas_labor:orden_labor(estado)` y `lineas_repuestos:orden_repuestos(estado)` (solo el estado), calcula `por_autorizar` (nada `aprobado` y no entregada) y descarta los arreglos. Lista (tarjeta y tabla) y tablero muestran la etiqueta «Por autorizar» en vez de «$0.00», solo a administración. No se suma dinero |
| A-06 | `formatOverCapacity` (`occupancy.ts`): «33 carros · 10 lugares (sobrecupo)» / «33 cars · 10 spaces (over capacity)», singular y plural de verdad, en `--color-warning`, barra al 100 %, en el tablero y en el panel de administración |
| Ayuda | `manual-usuario.md` y `.en.md` al día (pasos principales, acciones que abren lo suyo, aviso de finalizar, «Por autorizar», sobrecupo, «Tareas» abierta, «Tarea hecha»), misma estructura |

## Archivos tocados

Nuevos: `adminNextStep.ts` y su prueba, `occupancy.ts` y su prueba, `lineState.test.ts`,
`list/OrderList.test.tsx`, `detail/useOrderTransitions.test.tsx`, `detail/useOrderLines.test.tsx`.

Editados (`src/`): `features/workOrders/` (`AuthorizationPanel`, `LaborTable`, `QuoteCard`,
`QuoteShareActions`, `TaskEditor`, `TechnicianTaskList`, `WorkOrderDetail`, `lineState`, `tasks`,
`techNextStep`, `useWorkOrderDetail`, `list/OrderList`, `detail/OrderDialogs`, `OrderHeader`,
`OrderQuickActions`, `OrderTabTop`, `useOrderLines`, `useOrderTransitions`, `sections/LaborSection`,
`sections/QuoteSection`), `pages/Dashboard.tsx`, `pages/KanbanBoard.tsx`, `services/workOrders/queries.ts`,
`i18n/translations.ts`, `styles/components.css`, `types/domain/workOrder.types.ts`,
`types/domain/schema.contract.ts`. Pruebas actualizadas: `techNextStep.test.ts`,
`WorkOrderDetail.quickActions.test.tsx`, `TechnicianTaskList.test.tsx`, `KanbanBoard.test.tsx`,
`Dashboard.alerts.test.tsx`. Docs: los dos manuales. e2e: `e2e/qa-tecnico.spec.ts`.

## Lo que corrigió el jefe de obra (Hydrogen no pudo ejecutar nada)

- `useOrderTransitions.ts`: `isApproved(item.estado)` → `isApproved(item)` (error de tipos).
- `schema.contract.ts`: `por_autorizar` entra en la lista de campos calculados de `WorkOrder`.
- Pruebas con mocks incompletos: `InspectionSection.test.tsx` (3 propiedades nuevas del detalle),
  `useOrderTransitions.test.tsx` (opciones del hook), `WorkOrderDetail.quickActions.test.tsx` (`millas_ingreso`,
  `canEditLines`, mock de `react-signature-canvas` para la orden sin firma), `TechnicianTaskList.test.tsx`
  (el texto de la tarea lleva el prefijo «Tarea: »), `occupancy.test.ts` (`getTranslation`, no la tabla plana).
- e2e `qa-tecnico.spec.ts` (TEC-01 y TEC-02): tocaban la flecha de «Tareas» para abrirla; con B-03 ya viene
  abierta y la tocaban para cerrarla. Ahora comprueban `aria-expanded="true"`.

## Verificación (árbol principal, base local)

| Comando | Resultado |
|---|---|
| `npm run lint` (oxlint) | sin avisos |
| `npx tsc -b` | sin errores |
| `npm test` (Vitest) | 197 archivos, **1.366 pruebas**, todas pasan (la primera corrida: 8 fallas, todas de mocks; corregidas) |
| `npm run build` | compila (con las variables locales en el entorno) |
| `npm run test:e2e:local` | **86 de 86** (la primera corrida: 85 y TEC-02 por B-03; corregida) |
| Recorrido en el navegador (`qa.local/t2-recorrido.mjs`) | **19/19 a 1366 px y 21/21 a 390 px**, sin errores de consola |

El recorrido (admin y mecánico, contra la base local) comprueba: un solo botón principal en recepción
(«Tomar firma») y en orden sin trabajos («Agregar trabajo»); «Registrar autorización» abre el diálogo;
«Agregar trabajo» abre el editor con el foco en la descripción; Finalizado con 3 tareas sin marcar pregunta, «Revisar tareas» deja
el estado, «Terminar de todos modos» cambia y avisa «Estado: Finalizado» y pasa a «Marcar listo para entregar»;
«Por autorizar» en la lista y el tablero (sin «$0.00»); sobrecupo en el tablero y el panel; a 390 px las acciones
rápidas quedan antes del selector de estado y el botón principal a 202 px de la parte de arriba (primera pantalla de 844 px);
panel del mecánico sin «Órdenes recientes»; «Tareas» abierta; orden de acciones del técnico y un solo principal
(«Mis tareas»); la tarea marcada se queda en su lugar y avisa «Tarea hecha».

Capturas en `qa.local/shots/t2-*.png` (sufijo `-d` escritorio, `-m` teléfono): `a04-recepcion`, `a05-autorizacion`,
`a05-agregar-trabajo`, `a09-recepcion-primera-pantalla-m`, `a14-confirmar-finalizado`, `a14-finalizado-aviso`,
`a11-lista`, `a11-tablero`, `a06-panel-admin`, `b03-tecnico-orden`, `b09-tarea-hecha`, `b12-panel-tecnico`.
No se tomaron capturas «antes»: el estado anterior es el de `ca31f3b` y está en los informes de Q1.

## Dudas y detalles para el arquitecto

1. **«Por autorizar» también sale en una orden sin ninguna línea** (por ejemplo, recién abierta sin trabajos). Es
   lo que dice el diseño literal («sin nada autorizado»), pero ahí sugiere una cotización pendiente que no existe. Si
   no gusta, se limita a órdenes con al menos una línea `borrador` o `pendiente`: un cambio de una condición en `queries.ts`.
2. **«Revisar tareas»** lleva a Trabajos > Mano de obra (administración) o a Tareas (técnico). En escritorio eso cambia
   de pestaña y las acciones rápidas, que solo viven en Resumen, dejan de verse hasta volver.
3. **El orden de precedencia de `adminNextStep` hace que «Tomar firma» gane a «Registrar autorización»** (como pide el
   diseño). Una orden ya firmada con todo autorizado, en proceso, queda sin botón principal; también es de diseño.
4. La lista pide ahora, por cada orden, el estado de sus líneas (dos embebidos livianos). Con el volumen de un taller
   no pesa; si crece mucho, conviene un campo calculado en la base (migración, fuera de esta tanda).
5. Las tarjetas de «Mis tareas» del técnico siguen teniendo botones principales (`Agregar avance`) dentro de la sección;
   la regla de un solo principal se aplicó a las acciones rápidas, como dice el diseño.
6. Quedan fuera de la tanda y siguen abiertos: «trabajo(s)» con «(s)» en el panel de autorización (tanda 3, B-11/A-13/B-16),
   y los 44 px de controles (tanda 3).
7. La base local tiene ahora órdenes `PRUEBA T2 …` (ORD-2026-199 en adelante, varias entregas del recorrido); se cuentan en
   la ocupación («145 carros · 10 lugares»). Son datos de demostración locales.
