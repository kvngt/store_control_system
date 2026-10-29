# Mapa de secciones: qué tocar para cambiar cada parte

Para cuando hay que cambiar **una parte concreta** de Restorify y no se sabe por dónde
entrar. Cada sección de la app con sus archivos, sus datos, sus pruebas y su documento.

Antes de tocar nada: [ai-context.md](ai-context.md) (reglas que no se rompen). Para cambiar
la base sin comprometer la operación: [mantenimiento.md §4](mantenimiento.md#4-cambiar-la-base-sin-comprometer-la-operación).

> **Cómo leer las rutas.** `pages/X.tsx` y `features/x/…` son relativos a `src/`. Una
> función SQL se busca con `npm run db:donde -- <nombre>`: dice en qué migración está su
> versión vigente (algunas van por la quinta). Las pruebas `NN_…` son pgTAP en
> `supabase/tests/database/`.

---

## Cómo se reparte el código

| Capa | Dónde | Qué va ahí |
|---|---|---|
| Pantalla | `pages/` | Una ruta por archivo. Arma la pantalla con piezas de `features/` |
| Módulo | `features/<dominio>/` | Componentes, hooks y lógica de una parte de la app |
| Datos | `services/<dominio>.service.ts` | **Todas** las consultas a Supabase. Ninguna pantalla llama a `supabase` directo |
| Lógica sin React | `lib/` | Fechas, dinero, teléfono, PDF, multimedia, errores. Probada sin navegador |
| Tipos | `types/domain/*.types.ts` | Un archivo por dominio; `types/database.ts` los reexporta |
| Textos | `i18n/translations.ts` | Español e inglés, por espacio de nombres (`workOrders.*`, `delivery.*`…) |
| Estilos | `styles/components.css` | Por bloques con un comentario de título (`/* ----- Empleados ----- */`) |
| Reglas y dinero | `supabase/migrations/` | RLS, triggers y RPC. La lógica que **tiene** que cumplirse |
| Servidor | `supabase/functions/` | Edge functions (Deno): portal, correos y push, empleados |

---

## Órdenes de trabajo

**Lista, tablero, detalle y alta** — ruta `/work-orders` (`?open=<id>` abre una;
`?vista=tablero` abre el tablero, y `/kanban` redirige ahí).

| | |
|---|---|
| Pantalla | `pages/WorkOrders.tsx` (lista y archivo; para un técnico, solo "Mis órdenes"). Desde F7, dos vistas con la misma búsqueda (`features/workOrders/orderSearch.ts`): **Lista** y **Tablero** (`KanbanBoard` con `embedded`). La vista va en la URL y se recuerda en el navegador (`restorify_orders_view`) |
| Detalle | `features/workOrders/WorkOrderDetail.tsx` (dibuja) y `useWorkOrderDetail.ts` (estado, permisos derivados como `canEdit`, `canSign`, `canDeliver`, y todas las acciones). En escritorio, pestañas (`components/Tabs.tsx`) bajo un encabezado fijo: admin Resumen/Trabajos/Fotos y avances/Cobro y cliente/Historial; técnico Tareas/Orden/Avances. Cada pestaña se monta al abrirla y después solo se esconde. Cada tarjeta es una sección plegable (`components/CollapsibleSection.tsx`), **cerrada al entrar**, en escritorio y en el teléfono (ahí apiladas, en el orden de las pestañas). Qué sección va en cada pestaña: `TAB_SECTIONS`; la que abre un enlace: `LINKED_SECTION`. Enlace directo a una pestaña: `/work-orders?open=<id>&tab=<id de la pestaña>`. Inspección 360° incluye el diagrama de daños (`DamageDiagramEditor`, `VehicleDiagram`, `lib/vehicleDiagram.ts`) |
| Historial de la orden | Tabla `historial_orden` (trigger `trg_historial`, `20261010000004`, `20261010000031` para `marcas_danos`); `workOrdersService.getHistory`; `features/workOrders/OrderHistory.tsx` y `historyFormat.ts` (convierte cada fila en una frase); pruebas `17_historial_orden.test.sql` y `historyFormat.test.ts` |
| Alta | `features/workOrders/WorkOrderCreateModal.tsx`, `useWorkOrderForm.ts`, `workOrderForm.schema.ts`, `features/workOrders/intakeDraft.ts` (borrador automático en `localStorage`, por persona), `components/ChoiceDialog.tsx` y `lib/backButtonTrap.ts` (`useBackButtonTrap`, protección del botón «atrás» del teléfono). Cuatro pasos (F4): Cliente, Vehículo y recepción (con `DamageDiagramEditor`), Trabajos (con casilla de autorización en recepción `autorizado_en_recepcion`, migración `20261010000030_autorizar_en_recepcion.sql`, y selector de catálogo `CatalogPickerModal`), Depósito. Qué campo va en qué paso: `INTAKE_STEPS` (un error al crear abre su paso, `firstStepWithErrors`). Las tareas con `TaskEditor`; el depósito con `PaymentFields`. Lo envía `submitOrder` en `pages/WorkOrders.tsx` |
| Tarjetas del detalle | `LaborTable` (con `TaskEditor`, `TechnicianSelect`, `TradeMismatchDialog` y las reglas de `tasks.ts`), `PartsTable`, `PartsSummaryCard`, `SignatureCard`, `ProgressLog`, `QuoteCard`, `CustomerLinkCard`, `CommissionEstimateCard`, `DeliveryModal`, `ShareReportModal`, `ReadyNotifyModal` (aviso SMS/WhatsApp sin correo al marcar listo), `DamageDiagramEditor`, `ArchivedOrders`; del técnico, `TechnicianTaskList` (Mis tareas, F5; acción rápida principal con `techNextStep.ts`) y `ReportFindingModal`; de administración, `FindingsCard` (con `DiscardFindingModal`; reglas en `findings.ts`) |
| Servicio | `services/workOrders.service.ts` |
| Tablas | `ordenes_trabajo` (con `marcas_danos`, `trg_marcas_danos_firmadas` y `trg_order_link_on_create`; 24 triggers al 11/10/2026 más los 2 de `031` y `032`), `orden_montos`, `orden_labor`, `orden_repuestos`, `orden_asignaciones`, `orden_avances`, `orden_hallazgos` (F6), `orden_trabajos` (`034`), `orden_labor_tiempos` (`036`) |
| RPC | `create_work_order`, `repuestos_de_orden`, `marcar_labor_completada`, `mis_ordenes_asignadas`; hallazgos: `reportar_hallazgo`, `cotizar_hallazgo`, `descartar_hallazgo` (y `_salir_de_espera`, interna) |
| Pruebas | `pages/WorkOrders.smoke.test.tsx`, `features/workOrders/*.test.tsx`, `features/workOrders/intakeDraft.test.ts`, `lib/backButtonTrap.test.tsx`, `techNextStep.test.ts`, `VehicleDiagram.test.tsx`, `vehicleDiagram.test.ts`, `ReadyNotifyModal.test.tsx`; pgTAP `01`, `03`, `07`, `09`, `10`, `21`, `22` (hallazgos), `35_autorizar_en_recepcion.test.sql`, `36_marcas_de_danos.test.sql`, `37_enlace_autorizacion_y_tareas.test.sql`, `41_arreglos_del_qa.test.sql` |
| Documento | [reglas-de-negocio.md §1 y §3](reglas-de-negocio.md) |

- **Qué puede tocar un técnico** de una orden: trigger `trg_guard_order_technician` (columnas
  y estados permitidos) y las políticas de `20261007000000` (qué órdenes ve).
- **Trabajo adicional (hallazgos, F6):** el técnico lo reporta desde Tareas
  (`reportar_hallazgo`: hallazgo + avance interno para las fotos + pausa + un aviso
  `hallazgo_reportado`); administración lo ve en Resumen y Trabajos (`FindingsCard`) y en las
  listas (`FindingsAlert`), lo cotiza (precarga la tarea; `enviar_presupuesto` lo vincula) o lo
  descarta (y decide si sale como "Observación del taller" en el portal y el PDF:
  `datos_portal.observaciones`, `customerObservations` en `lib/reportMedia.ts`). Migraciones
  `20261010000010` y `20261010000011`. Detalle: [hallazgos.md](hallazgos.md).
- **Un estado nuevo** de la orden toca muchos lugares: [plan-de-mejora.md, al final](historico/plan-de-mejora.md#si-el-taller-echa-de-menos-espera-de-repuestos).

## Tablero (Kanban)

Desde F7 es la vista **Tablero** de Órdenes, no una ruta aparte (`/kanban` redirige a
`/work-orders?vista=tablero`).

| | |
|---|---|
| Pantalla | `pages/KanbanBoard.tsx` (arrastrar en computadora, "Mover a" en el teléfono, archivar). Con `embedded` no dibuja título; `search` filtra las tarjetas (la ocupación sigue contando todo); `onOpen` hace del número de la tarjeta el enlace a la orden |
| Servicio | `workOrders.service.ts` (`getWorkOrders`, `updateWorkOrderStatus`, `setArchived`, `deliver`) |
| Pruebas | `pages/KanbanBoard.test.tsx` |

## Entrega y cobro

| | |
|---|---|
| Frontend | `features/workOrders/DeliveryModal.tsx` (lo abren el detalle y el Kanban) |
| Servicio | `workOrders.service.ts`: `getBalance`, `deliver`, `uploadDeliveryReceipt` |
| Base | RPC `saldo_orden`, `entregar_orden`; red `handle_order_delivery_payment`; reversión `reverse_order_delivery_finance` (migración `20261008000000`) |
| Pruebas | `DeliveryModal.test.tsx`; pgTAP `11_entrega` |
| Documento | [reglas-de-negocio.md, "Entregar"](reglas-de-negocio.md) |

## Presupuestos y autorización

| | |
|---|---|
| Frontend | `features/workOrders/QuoteCard.tsx`, `LineStateBadge.tsx`, `lineState.ts`; en el portal, `QuoteSection` dentro de `portal/CustomerPortal.tsx` |
| Servicio | `services/quotes.service.ts` |
| Base | tabla `presupuestos`; RPC `enviar_presupuesto`, `registrar_autorizacion`, `cancelar_presupuesto`; internas `_resolver_presupuesto`, `responder_presupuesto_portal`; guardia `trg_guard_linea_presupuesto` |
| Pruebas | `QuoteCard.test.tsx`, `LaborTable.test.tsx`; pgTAP `05` |
| Documento | [presupuestos.md](presupuestos.md) |

## Comisiones y Empleados

| | |
|---|---|
| Pantallas | `pages/Payroll.tsx` (`/payroll`: saldos, historial, pagos) y `pages/Employees.tsx` (`/employees`: pago de cada quien y alta del personal) |
| Frontend | `features/employees/EmployeeDetailModal.tsx`, `features/settings/UsersCard.tsx`, `features/workOrders/CommissionEstimateCard.tsx` |
| Servicios | `commissions.service.ts`, `employees.service.ts`, `users.service.ts` (edge functions de empleados) |
| Base | tablas `comisiones`, `comision_pagos`, `perfiles_pago`; `_reparto_comisiones` (**la única cuenta**), `sync_order_commissions`, `comisiones_estimadas`, `pay_commissions`, `resumen_empleado` |
| Edge functions | `create-employee`, `update-employee`, `delete-employee` |
| Pruebas | `Employees.pay.test.tsx`, `Employees.users.test.tsx`, `CommissionEstimateCard.test.tsx`, `TaskEditor.test.tsx`, `LaborTable.test.tsx`, `DeliveryModal.test.tsx`, `workOrders.service.test.ts` (lo que manda la pantalla), `styles/laborMobile.test.ts`; pgTAP `01`, `12`, `13`, `19` (comisión por tarea) |
| Documento | [comisiones.md](comisiones.md) (cómo funciona) y [pagos-a-empleados.md](pagos-a-empleados.md) (propuesta pendiente) |

## Proceso del taller (05/10/2026, `20261010000016`–`18`)

Decisiones en [analisis-del-proceso-2026-10.md](historico/analisis-del-proceso-2026-10.md).

| Qué | Dónde |
|---|---|
| Retirada sin reparar (cancelar todo / solo revisión / algunos trabajos) | `WithdrawalModal.tsx` → `workOrdersService.withdrawWithoutRepair` → RPC `retirar_sin_reparar`, `saldo_retiro`; marca `ordenes_trabajo.retirada_sin_reparar` |
| Anticipos | `AdvancePaymentModal.tsx` → RPC `registrar_anticipo` (suma a `orden_montos.deposito_inicial`) |
| Descuento ($ o %) y totales con cifras de la base | `OrderTotalsCard.tsx` → RPC `aplicar_descuento`; `recalculate_order_totals` |
| Pendiente de visitas anteriores | `PendingWorkNotice.tsx` → RPC `trabajos_pendientes_vehiculo` |
| Costo del repuesto y pedido/llegó | `PartsTable.tsx`; `orden_repuestos.costo_unitario`, `estado_pedido`; `ordenes_esperando_repuestos()` |
| Aceptar comisiones en bloque y pagar lo aceptado | `pages/Payroll.tsx`, `CommissionApproval.tsx` → RPC `aprobar_comisiones`, `pay_commissions` |
| Avance por tareas | trigger `trg_labor_avance`, `_avance_por_tareas` |
| Fecha del taller | `hoy_taller(sede)`, `sedes.zona_horaria` |
| PDF en español / inglés | `lib/workOrderPdf.ts` (textos propios), `getOrderTranslations` |
| CSV para el contador | `lib/csv.ts`, `pages/Finance.tsx` |

## Finanzas

| | |
|---|---|
| Pantalla | `pages/Finance.tsx`; `pages/finance/ImportStatementModal.tsx` |
| Frontend | `features/finance/OrderMarginCard.tsx`, `OrderBalanceCard.tsx` (esta va en el detalle de la orden), `features/finance/WorkshopMetricsTab.tsx` (pestaña Indicadores del taller, `036`) |
| Servicio | `finance.service.ts`, `dashboard.service.ts` (`resumen_panel`) |
| Lógica sin React | `lib/bankStatementParser.ts`, `lib/categorizationRules.ts` |
| Base | `finanzas_movimientos` (con columna `origen = 'manual' \| 'sistema'`, trigger `trg_finanzas_origen` y políticas `finanzas_movimientos_update` / `finanzas_movimientos_delete` que bloquean editar o borrar movimientos del sistema, `20261010000038`), `finanzas_importaciones`, `finanzas_reglas_categorizacion`; `resumen_panel`, `importar_estado_cuenta`, `deshacer_importacion_estado_cuenta`, `balance_orden`, `margen_ordenes`, `indicadores_taller` |
| Pruebas | `Finance.*.test.tsx`, `ImportStatementModal.test.tsx`, `features/finance/OrderMargin.test.tsx`, `features/finance/WorkshopMetricsTab.test.tsx`; pgTAP `08`, `13`, `40_horas_reloj_indicadores.test.sql`, `42_arreglos_segunda_ronda.test.sql` |
| Documento | [reglas-de-negocio.md §2](reglas-de-negocio.md) |

**El dinero automático** (depósito, pago final, costo de repuestos, ajustes, reversiones,
egresos de comisión) lo escriben triggers y RPC, nunca la pantalla. Lista en
[radiografia.md §5](arquitectura.md#5-dónde-vive-la-lógica-de-negocio).

## Panel

| | |
|---|---|
| Pantalla | `pages/Dashboard.tsx` |
| Servicio | `dashboard.service.ts` → RPC `resumen_panel` (SECURITY INVOKER: un técnico recibe solo lo suyo) |
| Requiere atención (admin, F7) | `features/dashboard/AttentionCard.tsx` → `dashboardService.getAttention` → RPC `requiere_atencion` (`20261010000012`): hallazgos sin decidir, presupuestos sin respuesta, tareas sin técnico, órdenes vencidas y correos con error, contados en la base, con las primeras órdenes de cada grupo |
| Mis tareas (técnico, F7) | `features/dashboard/MyTasksCard.tsx` → `workOrdersService.getMyTasks` (sus líneas de `orden_labor` en órdenes sin entregar) |
| Pruebas | `services/dashboard.service.test.ts`, `features/dashboard/*.test.tsx`; pgTAP `08`, `10`, `23` |

## Clientes y vehículos

| | |
|---|---|
| Pantallas | `pages/Customers.tsx`, `pages/Vehicles.tsx` (solo administración) |
| Frontend | `features/vehicles/VehicleFields.tsx`, `VinScannerModal.tsx`, `vehicleForm.ts`; `components/CustomerPicker.tsx`, `components/PhoneInput.tsx` |
| Servicios | `customers.service.ts`, `vehicles.service.ts`, `search.service.ts` (buscador del encabezado) |
| Lógica sin React | `lib/vin.ts` (decodifica con NHTSA), `lib/vinScan.ts` (limpieza y validación de código de barras del VIN), `lib/barcodeDetector.ts` (BarcodeDetector nativo o ponyfill dinámico zxing-wasm), `lib/vehicleColor.ts` (traducción bidireccional es/en de colores), `lib/phone.ts` |
| Base | `clientes`, `vehiculos` (sede derivada por `trg_vehiculo_sede`; unicidad de VIN `uq_vehiculos_vin` y de placa por estado `uq_vehiculos_placa` en `20261010000039_vehiculos_vin_y_placa_unicos.sql`) |
| Pruebas | `Vehicles.*.test.tsx`, `VinScannerModal.test.tsx`, `vinScan.test.ts`, `barcodeDetector.test.ts`, `vehicleColor.test.ts`, `customers.service.test.ts`, `search.service.test.ts`, `PhoneInput.test.tsx`; pgTAP `10`, `43_vehiculos_unicos.test.sql` |

## Multimedia (fotos, videos, notas de voz)

| | |
|---|---|
| Frontend | `features/media/` (captura, grabadores, galería, visor, bandeja de subidas) |
| Lógica sin React | `lib/media/` (compresión, conversión, miniatura y cuadro negro, cola TUS en IndexedDB) |
| Servicio | `media.service.ts` |
| Base | tabla `orden_media`, bucket `orden_media` y sus políticas de Storage |
| Edge function | `cleanup-storage` (huérfanos, cada noche) |
| Pruebas | `features/media/*.test.tsx`, `lib/media/*.test.ts`; pgTAP `02` |
| Documento | [multimedia-y-notificaciones.md](multimedia-y-notificaciones.md) |

## Avisos (campana y push)

| | |
|---|---|
| Frontend | `features/notifications/` (campana, tarjeta de push), `lib/push.ts`, `public/sw.js` |
| Servicio | `notifications.service.ts` |
| Base | `notificaciones`, `push_suscripciones`, `cola_envios`; `notificar()` y los triggers `trg_*_notify` |
| Edge function | `process-outbox` |
| Pruebas | `NotificationBell.test.tsx`; pgTAP `02` |
| Documento | [multimedia-y-notificaciones.md](multimedia-y-notificaciones.md) |

## Portal del cliente y correos

| | |
|---|---|
| Portal | `portal/` (`CustomerPortal.tsx`, `ServicePage.tsx`; paquete aparte: no importa nada de la app, usa `lib/vehicleColor.ts` para traducir color al idioma del cliente) |
| Tarjeta del admin | `features/workOrders/CustomerLinkCard.tsx`, `ShareReportModal.tsx` |
| Servicio | `customerPortal.service.ts`, `reports.service.ts` |
| Base | `orden_enlaces`, `cola_envios`; `datos_portal` (**todo dato nuevo que ve el cliente se agrega a mano aquí**), `encolar_correo_cliente`, `trg_portal_on_order_change` |
| Edge functions | `portal`, `process-outbox`; plantillas en `supabase/functions/_shared/email/templates.ts` |
| Pruebas | `portal/CustomerPortal.test.tsx`, `CustomerLinkCard.test.tsx`; pgTAP `04`, `06` |
| Documento | [portal-y-correos.md](portal-y-correos.md) |

## Página de inicio (restorifyauto.net)

La ven los clientes en la raíz (sin sesión del personal) y en `/home`. Paquete aparte, como el portal.

| | |
|---|---|
| Entrada | `main.tsx` (objeto `starters`) y `landing/entry.ts` (`chooseEntry`: qué paquete arranca en cada dirección); `App.tsx` (`UnknownRoute`: una dirección que no existe lleva a un visitante a la página) |
| Página | `landing/start.tsx`, `Landing.tsx` (encabezado, pie, barra del teléfono), `sections/` (`Hero`, `Work`, `Services`, `Insurance`, `ColorStudio`, `PortalDemo`, `Reviews`, `Visit`), `landing.css` (con las tres letras de la tarjeta del taller); `heroImage.ts` (la foto y las letras de la portada, que `main.tsx` precarga); el estudio de color en 3D, `studio/colorStudio.ts` (three.js, diferido) y `studio/palette.ts` (colores y acabados); textos en `landing/strings.ts` (en/es, misma llave de idioma que el portal); `hours.ts` (abierto o cerrado, con la hora de Maryland) |
| Datos del taller | `landing/business.ts` y el JSON-LD de `index.html` (título, descripción y vista previa también ahí); `public/og-image.jpg`, `robots.txt`, `sitemap.xml` |
| Recursos | `public/videos/` (el video de la portada: `rfiintro.mp4` es el original del taller y la página carga `rfiintro-720.mp4` y `rfiintro-480.mp4`, sin audio; su primer cuadro es `landing/assets/rfiintro-poster.webp`); `landing/assets/`: `work/` (fotos de trabajos reales del taller, de su sitio anterior restorifyauto.shop, recortadas y en WebP), `fonts/` (Archivo Expanded, Montserrat y Open Sans recortadas: `scripts/landing/recortar-fuentes.py`), `shop-map.svg` (`scripts/landing/mapa-del-taller.mjs`, datos de OpenStreetMap), `qr-sitio.svg` (QR real a restorifyauto.net para el sticker de ejemplo), `restorify-logo-light.webp`, `restorify-car.glb` (modelo «Car Concept», CC BY 4.0, sin logos: `scripts/landing/preparar-carro.mjs`) y `studio-poster.webp` (su imagen fija: `scripts/landing/foto-del-estudio.mjs`) |
| Pruebas | `landing/Landing.test.tsx`, `entry.test.ts`, `business.test.ts`, `strings.test.ts`, `hours.test.ts`, `boundary.test.ts` (la página no llega a Supabase ni a la app) |

## PDF de la orden

| | |
|---|---|
| Código | `lib/workOrderPdf.ts` (qué se dibuja; traduce color con `lib/vehicleColor.ts` según idioma del PDF), `lib/reportMedia.ts` (qué fotos van), `lib/brandColor.ts` (color de la sede legible) |
| Pruebas | `lib/workOrderPdf.test.ts`, `lib/vehicleColor.test.ts` |

## Cobro por parqueo

| | |
|---|---|
| Módulo | `features/parking/ParkingSettingsCard.tsx` (configuración por sede), `features/parking/ParkingCard.tsx` (tarjeta en detalle de orden, pestaña Cobro) |
| Servicio | `services/parking.service.ts` |
| Tipos | `types/domain/parking.types.ts` |
| Portal y PDF | `portal/CustomerPortal.tsx` (desglose y avisos), `lib/workOrderPdf.ts` (línea en resumen de totales) |
| Base | Tablas `parqueo_config`, `parqueo_perfiles`, `parqueo_tramos`, `orden_parqueo`; cálculo puro `_parqueo_calculo`; RPCs `parqueo_config_sede`, `guardar_config_parqueo`, `vista_previa_parqueo`, `parqueo_de_orden`, `ajustar_parqueo_orden`; cron horario `recalcular_parqueo_pendiente` |
| Pruebas | `services/parking.service.test.ts`, `features/parking/ParkingSettingsCard.test.tsx`, `features/parking/ParkingCard.test.tsx`; pgTAP `33_parqueo.test.sql`; `scripts/qa/api-security.mjs` (SEC-142..160) |
| Documento | [parqueo.md](parqueo.md) |

## Próximo servicio y sticker

| | |
|---|---|
| Módulo | `features/workOrders/ServiceStickerModal.tsx` (diálogo para programar, prellenar e imprimir sticker), `features/workOrders/NextServiceCard.tsx` (tarjeta en detalle de la orden), `features/dashboard/AttentionCard.tsx` (aviso en Requiere atención del panel) |
| Lógica pura | `features/workOrders/nextService.ts` (cálculo de fechas y kilometrajes sugeridos a 3/6/12 meses y +3k/+5k/+10k mi), `features/workOrders/stickerNote.ts` (resolución de nota traducida en su idioma), `lib/pdfText.ts` |
| Servicio y tipos | `services/nextService.service.ts`, `services/translation.service.ts` (llama a la edge function `traducir-texto`), `types/domain/nextService.types.ts` |
| Generador de sticker | `lib/serviceStickerPdf.ts` (PDF 62 × 50 mm para impresora térmica de etiquetas con QR vectorizado) |
| Portal y página pública | `portal/ServicePage.tsx` (página pública `/s/<token>` con semáforo y agendamiento por WhatsApp, sin PII), `portal/serviceStatus.ts`, tarjeta en `portal/CustomerPortal.tsx` |
| Base | Tabla `orden_proximo_servicio` (con columna `idioma` en `038`); RPCs `programar_proximo_servicio`, `quitar_proximo_servicio`, `sugerir_proximo_servicio`, `descartar_sugerencia_proximo_servicio`, `datos_servicio`; trigger `trg_orden_proximo_servicio_traducir` (`037`); edge function `supabase/functions/traducir-texto/index.ts`; migraciones `20261010000029_proximo_servicio.sql`, `032`, `037`, `038` |
| Pruebas | `services/nextService.service.test.ts`, `services/translation.service.test.ts`, `features/workOrders/nextService.test.ts`, `features/workOrders/stickerNote.test.ts`, `features/workOrders/NextService.smoke.test.tsx`, `lib/serviceStickerPdf.test.ts`, `lib/pdfText.test.ts`, `portal/serviceStatus.test.ts`, `portal/ServicePage.test.tsx`, `portal/CustomerPortal.test.tsx`; pgTAP `34_proximo_servicio.test.sql`, `41_arreglos_del_qa.test.sql`, `42_arreglos_segunda_ronda.test.sql`; API Security SEC-162..171 en `scripts/qa/api-security.mjs` |

## Catálogo y trabajos agrupados (`20261010000034`, `037`)

| | |
|---|---|
| Módulo | `features/catalog/JobCatalogCard.tsx` (tarjeta en Configuración), `features/catalog/CatalogJobModal.tsx` (crear/editar plantilla), `features/catalog/CatalogPickerModal.tsx` (selector en el alta y en Trabajos), `features/workOrders/OrderJobsList.tsx` (trabajos agrupados en el detalle de la orden) |
| Servicio y tipos | `services/catalog.service.ts`, `types/domain/catalog.types.ts` |
| Portal y PDF | `portal/CustomerPortal.tsx` (autorización por trabajo completo con precio cerrado), `lib/workOrderPdf.ts` |
| Base | Tablas `catalogo_trabajos`, `catalogo_trabajo_lineas`, `orden_trabajos` (y `trabajo_id` opcional en `orden_labor` y `orden_repuestos`); RPCs `catalogo_de_trabajos`, `guardar_trabajo_catalogo`, `borrar_trabajo_catalogo`, `agregar_trabajo_del_catalogo`, `quitar_trabajo`, `renombrar_trabajo`, `trabajos_de_orden` |
| Pruebas | `services/catalog.service.test.ts`, `features/catalog/CatalogPickerModal.test.tsx`, `features/catalog/JobCatalogCard.test.tsx`; pgTAP `38_trabajos_y_catalogo.test.sql`, `41_arreglos_del_qa.test.sql` |

## Inspección por puntos (`20261010000035`, `037`)

| | |
|---|---|
| Módulo | `features/inspection/PointInspection.tsx` (lista multipunto en el detalle de la orden), `features/inspection/InspectionTemplatesCard.tsx` y `features/inspection/InspectionTemplateModal.tsx` (plantillas por sede en Configuración) |
| Servicio y tipos | `services/inspection.service.ts`, `types/domain/inspection.types.ts` |
| Portal y PDF | `portal/CustomerPortal.tsx` (sección de inspección publicada con semáforo y fotos por punto), `lib/workOrderPdf.ts` |
| Base | Tablas `inspeccion_plantillas`, `inspeccion_plantilla_puntos`, `orden_inspecciones`, `orden_inspeccion_puntos` (y `orden_media.inspeccion_punto_id`); trigger `trg_sede_sembrar_inspeccion`; RPCs `iniciar_inspeccion`, `marcar_punto_inspeccion`, `completar_inspeccion`, `publicar_inspeccion`, `plantillas_inspeccion`, `guardar_plantilla_inspeccion`, `borrar_plantilla_inspeccion` |
| Pruebas | `services/inspection.service.test.ts`, `features/inspection/PointInspection.test.tsx`, `features/inspection/InspectionTemplatesCard.test.tsx`; pgTAP `39_inspeccion_por_puntos.test.sql`, `41_arreglos_del_qa.test.sql` |

## Reloj, horas e indicadores del taller (`20261010000036`, `037`)

| | |
|---|---|
| Módulo | `features/workOrders/LaborTimesModal.tsx` (historial y corrección de sesiones por tarea), `features/workOrders/TaskEditor.tsx`, `features/workOrders/LaborTable.tsx`, `features/workOrders/TechnicianTaskList.tsx` (botones Iniciar/Pausar reloj), `features/finance/WorkshopMetricsTab.tsx` (pestaña Indicadores del taller en Finanzas) |
| Lógica pura | `lib/laborHours.ts` (cálculo horas × tarifa = monto y formato de duración) |
| Servicio y tipos | `services/metrics.service.ts`, `types/domain/metrics.types.ts` |
| Base | Tabla `orden_labor_tiempos` y columnas `orden_labor.horas`, `catalogo_trabajo_lineas.horas`, `sedes.tarifa_hora`; trigger `trg_labor_cerrar_reloj`; RPCs `iniciar_reloj`, `detener_reloj`, `corregir_tiempo`, `borrar_tiempo`, `indicadores_taller` |
| Pruebas | `lib/laborHours.test.ts`, `services/metrics.service.test.ts`, `features/finance/WorkshopMetricsTab.test.tsx`, `features/workOrders/LaborTable.test.tsx`, `features/workOrders/TechnicianTaskList.test.tsx`, `features/workOrders/TaskEditor.test.tsx`; pgTAP `40_horas_reloj_indicadores.test.sql`, `41_arreglos_del_qa.test.sql` |


## Configuración y sedes

| | |
|---|---|
| Pantalla | `pages/Settings.tsx` (perfil, idioma, tema, push; sedes para administración). Los teléfonos de la sede, en `features/settings/SedePhonesEditor.tsx` (reglas en `sedePhones.ts`) |
| Colores | Paleta por defecto en `styles/index.css` (tema oscuro y claro, del logo: amarillo `#EBC334`, grises puros). El color propio de una sede la reemplaza en tiempo real con `lib/branding.ts`; el PDF usa `lib/brandColor.ts` y los correos su propio valor por defecto |
| Servicios | `sedes.service.ts`, `users.service.ts` |
| Base | `sedes`, `perfiles` (guardia `trg_perfil_privilegios`), buckets `sede_logos` y `avatares` |

## Ayuda (manual de usuario)

| | |
|---|---|
| Pantalla | `pages/Help.tsx` (ruta `/ayuda`; `/help` redirige), en el menú bajo «Sistema». Pinta el manual con `features/help/ManualContent.tsx` (elementos de React, sin HTML crudo) y lo prepara con `features/help/helpDoc.ts`: quita la nota del editor y el índice, deja las secciones del rol y arma el índice y la búsqueda |
| Texto | [manual-usuario.md](manual-usuario.md) y [manual-usuario.en.md](manual-usuario.en.md): la app los importa como texto (`?raw`), así que se editan ahí. Una marca `<!-- rol: admin -->` o `<!-- rol: tecnico -->` debajo de un título esconde esa sección al otro rol. Si cambias una pantalla, pon al día los dos idiomas |
| Capturas | `public/ayuda/es/` y `public/ayuda/en/` (WebP, datos inventados de una copia local, nunca de producción) |
| Pruebas | `features/help/helpDoc.test.ts`: filtro por rol, búsqueda, que cada imagen exista y que los dos manuales tengan la misma estructura (títulos, marcas e imágenes en el mismo orden) |
| Base | Ninguna: esconder una sección del manual no es un permiso |

## Acceso y sesión

| | |
|---|---|
| Frontend | `pages/Login.tsx`, `pages/ResetPassword.tsx`, `context/AuthContext.tsx`, `App.tsx` (rutas y `adminOnly`). El logo es `assets/restorify-logo.webp` (recortado del logo del taller, fondo transparente) |
| Documento | [password-reset.md](password-reset.md), [supabase.md §8](supabase.md#8-auth) |

## Menú y navegación

`components/layout/` — `Sidebar.tsx` (menú lateral, grupos Taller / Finanzas / Sistema),
`BottomNav.tsx` (barra del teléfono: Panel y Órdenes, y Clientes y Vehículos para un admin),
`Header.tsx` (buscador, campana, sede activa). El tablero no tiene entrada propia desde F7: es
una vista de Órdenes. Las rutas y quién entra a cada una, en
`App.tsx`. **Esconder una entrada del menú no es un permiso**: la regla va en la base.
