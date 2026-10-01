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

**Lista, detalle y alta** — ruta `/work-orders` (`?open=<id>` abre una).

| | |
|---|---|
| Pantalla | `pages/WorkOrders.tsx` (lista y archivo; para un técnico, solo "Mis órdenes") |
| Detalle | `features/workOrders/WorkOrderDetail.tsx` (dibuja) y `useWorkOrderDetail.ts` (estado, permisos derivados como `canEdit`, `canSign`, `canDeliver`, y todas las acciones) |
| Alta | `features/workOrders/WorkOrderCreateModal.tsx`, `useWorkOrderForm.ts`, `workOrderForm.schema.ts` |
| Tarjetas del detalle | `LaborTable`, `PartsTable`, `PartsSummaryCard`, `SignatureCard`, `ProgressLog`, `QuoteCard`, `CustomerLinkCard`, `CommissionEstimateCard`, `DeliveryModal`, `AuthorizationReasonModal`, `ShareReportModal`, `ArchivedOrders` |
| Servicio | `services/workOrders.service.ts` |
| Tablas | `ordenes_trabajo` (20 triggers), `orden_montos`, `orden_labor`, `orden_repuestos`, `orden_asignaciones`, `orden_avances` |
| RPC | `create_work_order`, `repuestos_de_orden`, `marcar_labor_completada`, `mis_ordenes_asignadas` |
| Pruebas | `pages/WorkOrders.smoke.test.tsx`, `features/workOrders/*.test.tsx`; pgTAP `01`, `03`, `07`, `09`, `10` |
| Documento | [reglas-de-negocio.md §1 y §3](reglas-de-negocio.md) |

- **Qué puede tocar un técnico** de una orden: trigger `trg_guard_order_technician` (columnas
  y estados permitidos) y las políticas de `20261007000000` (qué órdenes ve).
- **Un estado nuevo** de la orden toca muchos lugares: [plan-de-mejora.md, al final](plan-de-mejora.md#si-el-taller-echa-de-menos-espera-de-repuestos).

## Tablero (Kanban)

| | |
|---|---|
| Pantalla | `pages/KanbanBoard.tsx` (arrastrar en computadora, "Mover a" en el teléfono, archivar) |
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
| Pruebas | `Employees.pay.test.tsx`, `Employees.users.test.tsx`, `CommissionEstimateCard.test.tsx`; pgTAP `01`, `12`, `13` |
| Documento | [comisiones.md](comisiones.md) (cómo funciona) y [pagos-a-empleados.md](pagos-a-empleados.md) (propuesta pendiente) |

## Finanzas

| | |
|---|---|
| Pantalla | `pages/Finance.tsx`; `pages/finance/ImportStatementModal.tsx` |
| Frontend | `features/finance/OrderMarginCard.tsx`, `OrderBalanceCard.tsx` (esta va en el detalle de la orden) |
| Servicio | `finance.service.ts`, `dashboard.service.ts` (`resumen_panel`) |
| Lógica sin React | `lib/bankStatementParser.ts`, `lib/categorizationRules.ts` |
| Base | `finanzas_movimientos`, `finanzas_importaciones`, `finanzas_reglas_categorizacion`; `resumen_panel`, `importar_estado_cuenta`, `deshacer_importacion_estado_cuenta`, `balance_orden`, `margen_ordenes` |
| Pruebas | `Finance.*.test.tsx`, `ImportStatementModal.test.tsx`, `features/finance/OrderMargin.test.tsx`; pgTAP `08`, `13` |
| Documento | [reglas-de-negocio.md §2](reglas-de-negocio.md) |

**El dinero automático** (depósito, pago final, costo de repuestos, ajustes, reversiones,
egresos de comisión) lo escriben triggers y RPC, nunca la pantalla. Lista en
[arquitectura.md §5](arquitectura.md#5-dónde-vive-la-lógica-de-negocio).

## Panel

| | |
|---|---|
| Pantalla | `pages/Dashboard.tsx` |
| Servicio | `dashboard.service.ts` → RPC `resumen_panel` (SECURITY INVOKER: un técnico recibe solo lo suyo) |
| Pruebas | `services/dashboard.service.test.ts`; pgTAP `08`, `10` |

## Clientes y vehículos

| | |
|---|---|
| Pantallas | `pages/Customers.tsx`, `pages/Vehicles.tsx` (solo administración) |
| Frontend | `features/vehicles/VehicleFields.tsx`, `vehicleForm.ts`; `components/CustomerPicker.tsx`, `components/PhoneInput.tsx` |
| Servicios | `customers.service.ts`, `vehicles.service.ts`, `search.service.ts` (buscador del encabezado) |
| Lógica sin React | `lib/vin.ts` (decodifica con NHTSA), `lib/phone.ts` |
| Base | `clientes`, `vehiculos` (sede derivada por `trg_vehiculo_sede`) |
| Pruebas | `Vehicles.*.test.tsx`, `customers.service.test.ts`, `search.service.test.ts`, `PhoneInput.test.tsx`; pgTAP `10` |

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
| Portal | `portal/` (paquete aparte: no importa nada de la app) |
| Tarjeta del admin | `features/workOrders/CustomerLinkCard.tsx`, `ShareReportModal.tsx` |
| Servicio | `customerPortal.service.ts`, `reports.service.ts` |
| Base | `orden_enlaces`, `cola_envios`; `datos_portal` (**todo dato nuevo que ve el cliente se agrega a mano aquí**), `encolar_correo_cliente`, `trg_portal_on_order_change` |
| Edge functions | `portal`, `process-outbox`; plantillas en `supabase/functions/_shared/email/templates.ts` |
| Pruebas | `portal/CustomerPortal.test.tsx`, `CustomerLinkCard.test.tsx`; pgTAP `04`, `06` |
| Documento | [portal-y-correos.md](portal-y-correos.md) |

## PDF de la orden

| | |
|---|---|
| Código | `lib/workOrderPdf.ts` (qué se dibuja), `lib/reportMedia.ts` (qué fotos van), `lib/brandColor.ts` (color de la sede legible) |
| Pruebas | `lib/workOrderPdf.test.ts` |

## Configuración y sedes

| | |
|---|---|
| Pantalla | `pages/Settings.tsx` (perfil, idioma, tema, push; sedes para administración) |
| Colores | Paleta por defecto en `styles/index.css` (tema oscuro y claro, del logo: amarillo `#EBC334`, grises puros). El color propio de una sede la reemplaza en tiempo real con `lib/branding.ts`; el PDF usa `lib/brandColor.ts` y los correos su propio valor por defecto |
| Servicios | `sedes.service.ts`, `users.service.ts` |
| Base | `sedes`, `perfiles` (guardia `trg_perfil_privilegios`), buckets `sede_logos` y `avatares` |

## Acceso y sesión

| | |
|---|---|
| Frontend | `pages/Login.tsx`, `pages/ResetPassword.tsx`, `context/AuthContext.tsx`, `App.tsx` (rutas y `adminOnly`). El logo es `assets/restorify-logo.webp` (recortado del logo del taller, fondo transparente) |
| Documento | [password-reset.md](password-reset.md), [supabase.md §8](supabase.md#8-auth) |

## Menú y navegación

`components/layout/` — `Sidebar.tsx` (menú lateral), `BottomNav.tsx` (barra del teléfono),
`Header.tsx` (buscador, campana, sede activa). Las rutas y quién entra a cada una, en
`App.tsx`. **Esconder una entrada del menú no es un permiso**: la regla va en la base.
