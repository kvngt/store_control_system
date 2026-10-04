# Trabajo adicional reportado (hallazgos) — F6

> Fase 6 del [plan de mejoras](plan-mejoras-2026-10.md#f6--hallazgos-y-nueva-espera-de-autorización).
> Migraciones `20261010000010` y `20261010000011`. Estado y siguiente paso: la fila F6 de la
> [tabla de estado](plan-mejoras-2026-10.md#estado) y la [bitácora](plan-mejoras-2026-10.md#bitácora-de-traspaso-entre-agentes).

## 1. Qué cambia para el taller

Antes, el mecánico que encontraba algo más que hacer movía la orden a "espera de
autorización" y escribía un motivo. Ahora **la pausa la pone y la quita administración**; el
técnico **reporta trabajo adicional** y eso pausa la orden.

| Quién | Qué ve y qué hace |
|---|---|
| Técnico | En la pestaña Tareas: **Reportar trabajo adicional** (texto + fotos/video/voz). Ve sus reportes con estado (Por revisar / Cotizado al cliente / No se hará por ahora). El selector de estado y el tablero ya no le ofrecen la pausa, y con la orden en pausa no puede moverla. El avance donde caen sus fotos dice "Trabajo adicional (interno)" y no tiene el ojo de publicar. |
| Admin | Un aviso `hallazgo_reportado`. En la orden, la tarjeta **"El taller reportó trabajo adicional"** arriba de Resumen y de Trabajos (punto de atención en la pestaña Resumen). **Cotizar al cliente** abre Trabajos con la tarea precargada; se pone precio y técnico y se envía el presupuesto. **Descartar…** permite editar el texto y elegir si va al reporte del cliente. En la lista de órdenes y el panel, el aviso **"Trabajo adicional por revisar"** con **Revisar**. |
| Cliente | Si el admin lo mandó al reporte: sección **"Observaciones del taller"** en el portal y en el PDF, con el texto del admin. Nunca ve lo que escribió el técnico ni su nombre. |

## 2. Modelo de datos

Tabla `orden_hallazgos` (solo lectura por la API; se escribe solo por RPC):

| Columna | Para qué |
|---|---|
| `orden_id`, `sede_id`, `reportado_por`, `creado_en` | De quién y dónde |
| `descripcion` | Lo que escribió el técnico. **Interno**, 1–1000 caracteres |
| `estado` | `pendiente` → `cotizado` o `descartado` |
| `presupuesto_id` | El presupuesto con el que salió (lo pone `enviar_presupuesto`) |
| `en_reporte`, `texto_cliente` | Si el cliente lo ve y con qué texto (CHECK: `en_reporte` exige texto) |
| `resuelto_por`, `resuelto_en` | Quién lo cotizó o descartó |
| `avance_id` | El avance interno donde caen las fotos |

- Lectura: admin, o técnico asignado a la orden (`mis_ordenes_asignadas()`, como las demás
  hijas de la orden).
- Está en la publicación de Realtime y en `ORDER_TABLES` (`workOrders.service.ts`); la prueba
  `15_tiempo_real.test.sql` lo fija.

## 3. RPC y triggers

| Función | Quién | Qué hace |
|---|---|---|
| `reportar_hallazgo(orden, descripcion) → {hallazgo_id, avance_id}` | Técnico asignado | Bloquea la orden; rechaza entregada o texto vacío (42501 con frase para el taller); crea el avance interno y el hallazgo; pone la orden en `espera_autorizacion` con el texto como `motivo_autorizacion` (si ya esperaba, no toca el motivo); avisa a los admins **una vez** (`hallazgo_reportado`). Con la bandera `restorify.hallazgo` callan `trg_notify_progress` y `trg_notify_auth_request`. |
| `cotizar_hallazgo(id) → {descripcion…}` | Admin | `pendiente` → `cotizado`. La orden sigue en pausa. |
| `descartar_hallazgo(id, en_reporte, texto)` | Admin | Desde `pendiente`, o `cotizado` aún sin presupuesto. Guarda el texto y llama `_salir_de_espera`. |
| `_salir_de_espera(orden)` | Interna (sin GRANT) | Vuelve a `en_proceso` solo si la orden espera, no hay hallazgo `pendiente` y no hay presupuesto `enviado`. La llaman `descartar_hallazgo`, `cancelar_presupuesto` y `_resolver_presupuesto` (también si el cliente rechazó todo). |
| `enviar_presupuesto` | Admin | Vincula los cotizados sin presupuesto. Un cotizado **no** cuenta como borrador (antes creaba presupuestos vacíos): hace falta la tarea. Pausa la orden solo si estaba `en_proceso`. |
| `trg_avance_hallazgo_interno` | Trigger | Un no-admin no publica (`visible_cliente`) el avance de un hallazgo. |
| `trg_portal_on_order_change` | Trigger | De espera a `en_proceso` no vuelve a mandar el correo "en proceso" si el cliente ya lo recibió. |
| `datos_portal` | Edge `portal` | Clave `observaciones`: `{id, fecha, texto}` de los descartados con `en_reporte`. |

## 4. Frontend

| Archivo | Rol |
|---|---|
| `features/workOrders/ReportFindingModal.tsx` | Diálogo del técnico (texto + `MediaCaptureBar`) |
| `features/workOrders/TechnicianTaskList.tsx` | Botón de reportar y "Trabajo adicional que reportaste" |
| `features/workOrders/FindingsCard.tsx` | Tarjeta del admin y `DiscardFindingModal` |
| `features/workOrders/findings.ts` | `findingsToReview`: pendientes + cotizados sin presupuesto |
| `features/workOrders/FindingsAlert.tsx` | Aviso en `pages/WorkOrders.tsx` y `pages/Dashboard.tsx` → `/work-orders?open=<id>&tab=resumen` |
| `useWorkOrderDetail.ts` | `reportFinding` (sube las fotos al `avance_id` que devuelve la RPC), `quoteFinding`, `discardFinding`; `changeStatus` no deja al técnico poner ni quitar la pausa |
| `WorkOrderDetail.tsx` | Coloca la tarjeta; Cotizar → `prefill` de `LaborTable`/`TaskEditor` (`{text, nonce}`) y pestaña Trabajos; `findingEntryIds` a `ProgressLog` |
| `pages/KanbanBoard.tsx` | Mismas reglas de la pausa para el técnico |
| `lib/reportMedia.ts` (`customerObservations`), `lib/workOrderPdf.ts` | Observaciones en el PDF |
| `portal/CustomerPortal.tsx`, `portal.types.ts`, `strings.ts` | Sección del portal |
| `i18n/translations.ts` | Espacio `findings.*`; `notifications.types.hallazgo_reportado` |

El servicio acepta la forma vieja de las RPC (antes de la `011`): `reportFinding` sin
`avance_id` crea un avance propio para las fotos, y `quoteFinding` sin respuesta usa el texto
que ya tiene la pantalla. Así la app publicada no se rompe si llega antes que el `db push`.

## 5. Pruebas

- pgTAP `22_hallazgos.test.sql` (44 aserciones): permisos, pausa, aviso único, avance interno,
  presupuesto, descarte, cancelación, correo, portal, entregada, grants. La `03` prueba el
  reporte del técnico y que el UPDATE directo sin motivo sigue rechazado.
- Vitest: `WorkOrders.smoke.test.tsx` (describe "trabajo adicional reportado (F6)"),
  `KanbanBoard.test.tsx`, `CustomerPortal.test.tsx`, `reportMedia.test.ts`.
- `qa:security`: SEC-106 a SEC-112 (ninguno escribe).
- A mano: HAL-01 a HAL-07 en [plan-de-pruebas.md](plan-de-pruebas.md).

## 6. Lo que falta (en orden)

1. ~~`db push` de `20261010000008` a `20261010000011`~~ hecho por el usuario el 04/10/2026,
   antes del push a `main`. Conviene confirmarlo con `npm run db:check`.
2. `npm run qa:security` con `TOKEN_ADMIN`/`TOKEN_TECH`.
3. **Migración que contrae**, con la app nueva ya publicada: reescribir entero
   `trg_guard_order_technician` (versión vigente: `npm run db:donde -- trg_guard_order_technician`)
   para que un técnico (a) ponga `espera_autorizacion` solo si existe un hallazgo `pendiente`
   de esa orden, y (b) no la saque de espera mientras haya hallazgo pendiente o presupuesto
   enviado. Ajustar la `03` (líneas del bloque "Pedir autorización") y la `05` (línea ~181).
   Después, `motivo_autorizacion` deja de escribirse y se retira en otra migración.
4. Casos HAL en un teléfono real.
5. Ideas no hechas: hallazgos en `trg_historial`; mostrar las fotos del hallazgo dentro de la
   tarjeta del admin (hoy dice "n archivo(s) en Fotos").

## 7. Cómo probarlo en local

```bash
npx supabase start          # si ghcr.io está bloqueado: SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io
npm run test:db
```

Para ver la pantalla: crear usuarios con la API de Auth local (`/auth/v1/admin/users` con la
llave de servicio local), sembrar sede/perfiles/cliente/vehículo/orden con SQL, y correr
`VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<anon local> npx vite`. Usa
ids distintos de los de las pruebas pgTAP (o `npx supabase db reset --local` antes de
`test:db`): los mismos ids hacen fallar las pruebas.
