# Q2, tanda 3 — Se toca bien y se lee bien: informe del jefe de obra (24/11/2026)

Programó Gemini 4 Hydrogen (una sola vuelta, 15 minutos, sin cuelgues); el jefe de obra trajo la entrega al
árbol principal, la verificó y corrigió lo chico. Diseño: [q2-prioridades.md](q2-prioridades.md), sección
«Tanda 3», más las cuatro sobras de la bitácora. Sin migraciones, sin tocar `supabase/`, sin commits, nada contra
el proyecto real: todo build y preview se compiló con `VITE_SUPABASE_URL=http://127.0.0.1:44321` y la clave local
(el bundle trae `127.0.0.1:44321` y ninguna URL `https://<proyecto>.supabase.co`). Hydrogen no tocó el árbol
principal (`git status` idéntico antes y después de su corrida). La tanda 2, sin commit, se llevó a su copia
(paso 1) y sigue intacta.

## Qué quedó hecho

| Punto | Resultado |
|---|---|
| B-05 | Deslizador de avance (`.progress-slider`): en pantalla táctil o de hasta 768 px, 44 px de alto de área (carril y pulgar siguen delgados). 189 x 16 → 366 x 44 a 390 px |
| B-06 | Clase `.checkbox-touch`: renglón de 44 px y casilla visible de 22 px. En «Agregar avance» (visible para el cliente), descartar hallazgo, autorización, retirada sin reparar, seguro, alta (aceptó trabajos y seguro), «Sin placa» y «Recibe avisos» de Clientes. `ProgressLog` y `ReportFindingModal` no tienen casillas |
| A-10 | En el teléfono: `.btn`, `.btn-sm`, `.btn-icon`, `.tab`, `.view-switch-option`, los enlaces `ORD-…` de las alertas (`.attention-order`), `.table .link-button` y `.intake-step-button` llegan a 44 px de alto. En escritorio con ratón solo cambia la X de los diálogos (28 x 31 → 36 x 36) |
| B-10 | El selector de estado de la cabecera (`.order-status-select`) muestra «Espera Autorización» completo (caja de 167 a 364 px a 390 px; 210 a 290 px a 1366) |
| A-16 | El selector «Técnico» del editor de tareas ocupa toda la fila (`.task-editor-technician`, 218 → 996 px a 1366; a 390 px 304 px para una opción de 221 px). `.labor-tech-select` de la tabla sin tope de 240 px |
| A-12 | En el teléfono los avisos salen abajo, sobre la barra de navegación y el teclado (`--toast-vv-bottom` en `ToastContext`); el contenedor ya no bloquea toques. «Cliente guardado» y «Vehículo guardado» ya no salen al avanzar de paso (los de error se quedan) |
| B-08 | «Agregar avance» (`TaskProgressModal` y `ProgressLog`), «Reportar trabajo adicional», «Descartar» un hallazgo con casilla, «+ Agregar» un repuesto y «Aplicar» un descuento ya no se apagan: sin lo necesario dicen qué falta (en el diálogo), marcan `aria-invalid` y enfocan el campo. Los demás diálogos del flujo ya validaban en línea |
| B-11 | En inglés: «Jobs authorized» (aviso), «My tasks», «Task», «Reopen task», «New task», «Task done»… Pendiente de base: el cuerpo de `presupuesto_respondido` lo arma la función SQL en español (sin migración no se toca) |
| A-15 | `settings.emailOutbox.hint` sin «Resend» ni `RESEND_API_KEY` (es y en). Quedan, a propósito, dos textos para quien da soporte: `schema.databaseBehindBody` (`supabase db push`) y la nota «en el servidor» de pagos |
| A-13 | `intake.restoreBody`: «Quedó un borrador guardado (24 nov, 4:43 p.m.). ¿Lo continúas…?» (fecha entre paréntesis, nunca doble punto) |
| B-16 y «(s)» | Portal: foto/fotos, autorizado/autorizados, no autorizado/no autorizados (variantes `One`/`Many`; cero «(s)» en `portal/strings.ts`). Panel de autorización: `notSentOne/Many` y `waitingHintOne/Many`. Quedan 22 claves con «(s)» en `translations.ts` fuera de ese panel (lista en el informe de Hydrogen), fuera de alcance |
| Finanzas | `lib/financeCategories.ts` (`financeCategoryLabel`): con el módulo de comisiones apagado, «planilla» se ve «Pagos al personal» / «Staff payments» (tabla, selector, CSV e importación); encendido, «Comisiones» |
| Buscador del alta | En el teléfono, `.intake-picker-row .combo-menu` fluye en el documento: «Nuevo Cliente» baja y queda a la vista (también «Nuevo vehículo» en el paso 2). `Vehicles.tsx` no cambia |
| `EmailPreference` | Usa `ConfirmDialog` del portal (títulos y botones en `portal/strings.ts`, es y en); reactivar no pregunta; sin importar nada de la app |
| Ayuda | `manual-usuario.md` y `.en.md` al día, misma estructura |

## Archivos tocados

Nuevos: `lib/financeCategories.ts`, `styles/touchTargets.test.ts`, `features/workOrders/OrderTotalsCard.test.tsx`,
`docs/ordenes/q2-tanda3-hydrogen.md` (informe de Hydrogen, insumo de este).

Editados (`src/`): `context/ToastContext.tsx`; `features/vehicles/VehicleFields.tsx`; `features/workOrders/`
(`AuthorizationPanel`, `FindingsCard`, `OrderInsuranceModal`, `OrderTotalsCard`, `PartsTable`, `ProgressLog`,
`QuoteCard`, `ReportFindingModal`, `TechnicianTaskList`, `WithdrawalModal`, `detail/OrderHeader`,
`intake/steps/WorkStep`, `intake/useIntakeRecords`); `i18n/translations.ts`; `pages/Customers.tsx`,
`pages/Finance.tsx`, `pages/finance/ImportStatementModal.tsx`; `portal/` (`strings.ts`, `components/AccountSection`,
`EmailPreference`, `Report`); `styles/components.css`. Pruebas: `AuthorizationPanel`, `PartsTable`, `ProgressLog`,
`ReportFindingModal`, `TaskProgressModal.back`, `TechnicianTaskList`, `WorkOrderCreateModal`, `Finance`,
`ImportStatementModal`, `CustomerPortal`, `translations`, `ToastContext`, `renderNotification`,
`WorkOrders.intake`, `WorkOrders.tasks`. Docs: los dos manuales.

## Lo que corrigió el jefe de obra (Hydrogen no pudo ejecutar nada)

- **`AuthorizationPanel.test.tsx`:** Hydrogen la reescribió entera y perdió las 6 pruebas originales (envío, respuesta,
  presupuesto en espera, cliente sin correo…). Se restauraron y se les sumaron los casos de plural. Además sus pruebas de
  plural eran inválidas (con un presupuesto abierto la fila de «sin enviar» no se pinta): se reescribieron (1 y 3 en es,
  1, 3, 0 y 1 en en).
- **`.modal-close`:** su regla base de 36 px (añadida por Hydrogen, después en el archivo) le ganaba a la de 44 px del
  teléfono: la X pasó de 44 a 36 px a 390 px. Se agregó la regla táctil después de la base y una guarda en
  `touchTargets.test.ts` (la regla de teléfono tiene que ir después de la base).
- **`PartsTable`:** el `aria-label` «Descripción» del campo nuevo chocaba con el del editor de fila (dos `textbox`
  con el mismo nombre); ahora es «Nuevo repuesto» (`parts.formTitle`).
- **Pruebas que fijaban el comportamiento viejo:** `ToastContext` (el desplazamiento ya viaja como variable CSS, con
  `height` en el mock de `visualViewport`), `renderNotification` (New task / Task reassigned / Task done),
  `WorkOrders.tasks` (Descartar y Reportar ahora no se apagan: avisan y no guardan), `WorkOrders.intake` (ya no sale
  «Cliente guardado»), `ImportStatementModal` (comparaba por subcadena y «Comisiones de banco y tarjeta» seguía ahí).

## Verificación (árbol principal, base local)

| Comando | Resultado |
|---|---|
| `npm run lint` (oxlint) | sin avisos |
| `npx tsc -b` | sin errores |
| `npm test` (Vitest) | 199 archivos, **1.385 pruebas**, todas pasan (la primera corrida: 11 fallas, las de arriba; corregidas) |
| `npm run build` | compila, con las variables locales en el entorno |
| `npm run test:e2e:local` | **86 de 86** (3,2 min) |
| Recorrido en el navegador | ver abajo: 20 mediciones a 390 px y 19 a 1366 px, 4 de textos y 6 del portal, sin errores de consola; sin desbordamiento horizontal a 390 px en 8 pantallas de administración y 6 de mecánico |

No se corrió `test:functions`, `test:db` ni `qa:security:local`: no hay cambios en `supabase/`.

## Medidas (`getBoundingClientRect`, antes = build de la tanda 2, después = esta entrega)

| Control | Pantalla | Antes | Después |
|---|---|---|---|
| Deslizador de avance (B-05) | 390 px, mecánico | 189 x 16 | **366 x 44** |
| Renglón «Visible para el cliente» (B-06) | 390 px, diálogo de avance | 356 x 22 | **356 x 44** |
| Casilla dibujada (B-06) | 390 px | 13 x 13 | **22 x 22** |
| Enlace `ORD-…` de «Requiere atención» (A-10) | 390 px, Panel | 82 x 19 | **82 x 44** |
| Fichas de pasos del alta (A-10) | 390 px | 79 x 41 | **79 x 44** |
| Foto / Video / Nota de voz / Galería (A-10) | 390 px, avance | no medido (28 de alto a 1366 px) | **74 / 81 / 113 / 90 x 44** |
| Pestañas Lista / Tablero, botones de fila, «Revisar» (A-10) | 390 px | ya 44 | 44 (sin cambio) |
| X de cerrar un diálogo (A-10) | 390 px | 44 x 44 | **44 x 44** (la versión de Hydrogen bajaba a 36 x 36; corregido) |
| X de cerrar un diálogo | 1366 px | 28 x 31 | **36 x 36** |
| Selector de estado, «Espera Autorización» (B-10) | 390 px | caja 167, necesita 190 (recortaba) | caja **364** |
| Selector de estado | 1366 px | caja 210 | caja **290** |
| Selector «Técnico» (A-16) | 1366 px | caja 218, necesita 241 (recortaba) | caja **996** |
| Aviso «Tarea hecha» (A-12) | 390 px | arriba, sobre el encabezado | y 717-772, barra de navegación en y 780, pantalla de 844 |
| «Nuevo Cliente» con el buscador abierto | 390 px | y 283, bajo la lista (y 279 a 539) | **y 546-590**, debajo de la lista, sin tocarla |

A 1366 px los botones de fila (34), pestañas (27), «Revisar» (28), Foto/Video/Nota (28) y el deslizador (16) siguen igual: el
diseño pide 44 px «en pantallas táctiles», no en escritorio con ratón (la regla es `pointer: coarse` o hasta 768 px).

Otras comprobaciones en el navegador (todas pasan): «Agregar avance» y «Reportar trabajo adicional» vacíos quedan
encendidos, dicen «Escribe qué se hizo o agrega una foto o video.» y marcan `aria-invalid`; «+ Agregar» un repuesto vacío
dice «Describe el repuesto.»; Finanzas con módulo apagado ofrece «Pagos al personal» y no «Comisiones»; el aviso del borrador
sale «…(24 nov, 4:43 p.m.). ¿Lo continúas…?»; el panel y las acciones del técnico en inglés dicen «My tasks»; el enlace del cliente
(es y en, 390 px) abre el diálogo propio al dejar de recibir correos (botones de 44 px, cero cajas nativas) y «Volver» no da de baja;
ninguna pantalla del portal muestra «(s)».

Capturas en `qa.local/shots/t3-*.png` (`-m` teléfono, `-d` escritorio; las de `t3-antes-*` son del build anterior):
`avance-dialogo`, `avance-falta`, `reportar-falta`, `tec-espera`, `toast-tarea-hecha`, `a16-tecnico`, `panel`, `ordenes`,
`alta-paso1`, `alta-buscador-abierto`, `finanzas`, `b08-repuesto`, `a13-borrador`, `b11-tecnico-en`, `portal-baja-es/en`.
Scripts: `qa.local/t3-setup.mjs`, `t3-medidas.mjs`, `t3-textos.mjs`, `t3-portal.mjs`, `t3-overflow.mjs`.

## Dudas y lo que no se cumplió

1. **Toast encima de un diálogo en el teléfono.** Los avisos van sobre la barra de navegación (z 500 contra 400 de los
   diálogos): con un diálogo a pantalla completa abierto, un aviso puede cubrir un momento el pie del diálogo (los botones
   siguen recibiendo toques fuera de la tarjeta del aviso). No se vio un caso real; si molesta, el aviso del diálogo debería
   salir dentro de él.
2. **Cuerpo de la notificación «Trabajos autorizados» en español dentro del inglés** (B-11a): lo arma la función SQL; necesita
   una migración (fuera de esta tanda).
3. **Escritorio:** botones de fila, pestañas, «Revisar» y Foto/Video/Nota siguen de 27 a 34 px con ratón, a propósito.
4. **22 claves con «(s)»** en `translations.ts` (comisiones, tareas, cotizaciones, notificaciones, Nómina, correos…): solo se
   pidió el panel de autorización y el portal.
5. No se midió «Foto/Video/Nota de voz» en el paso 3 del alta (se midieron los mismos botones en el diálogo de avance,
   que usa el mismo componente) ni se hizo la captura «antes» de cada pantalla (existe para las del recorrido móvil).
6. `.btn { min-height: 44px }` ahora vale para todo el teléfono: se revisaron panel, Órdenes, detalle, Clientes, Vehículos,
   Finanzas y Configuración sin desbordamiento, pero conviene que la persona responsable pase por Parqueo, Catálogo y Nómina.
