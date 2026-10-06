# Plan de implementación — Pedidos del taller del 05/10/2026

> **Estado (06/10/2026): implementado en local, sin publicar.** Los bloques A–E están hechos y
> probados (migraciones `20261010000020` y `21`, pgTAP 27 y 28, Vitest). Un primer modelo hizo A–D
> y un segundo los revisó y terminó E; en la revisión se corrigió la migración 020 (soltaba
> también el CHECK del porcentaje), los avisos flotantes (el contenedor vacío tenía
> `role="status"` y chocaba con otras pantallas) y los estilos de Empleados en el teléfono. Qué
> queda: publicar (`db push` 020 → 021, push a `main`, `qa:security`). Ver la bitácora en
> [plan-mejoras-2026-10.md](plan-mejoras-2026-10.md).

## Contexto
El taller probó la app y pidió cinco cambios. Este plan es para que otro modelo los implemente sin tener que volver a investigar: cada bloque dice qué hay hoy (con archivo y línea), qué cambiar, cómo probarlo y qué documentar.

1. **Pago "Mixto" a empleados:** salario + comisiones, además de "Comisión" y "Salario".
2. **Empleados en el teléfono:** la sección "Pago de cada empleado" sale toda desplegada; debe ser una pestaña plegable que muestre solo los nombres, y al tocar un nombre, su información.
3. **Renombrar** "Servicio y reparación del vehículo" → "Información del vehículo".
4. **Avisos flotantes en el teléfono:** al agregar una tarea o un repuesto no se ve el aviso.
5. **Finalizar y "listo para entregar":** el mecánico no puede regresar una orden finalizada a En proceso (solo administración). Que el mecánico finalice no avisa al cliente: el administrador marca "Listo para entregar" y recién entonces se le avisa al cliente.

Decisiones ya tomadas con el usuario (no volver a preguntar):
- "Listo para entregar" es una marca sobre el estado Finalizado (no un estado nuevo): la orden sigue en la columna Finalizado y el admin presiona "Marcar listo para entregar".
- Mientras el mecánico finalizó y el admin no confirmó, el cliente ve "En revisión final" en su enlace (no "Listo para recoger") y no recibe correo.
- En "Mixto" el salario es informativo (como hoy el de "Salario"); las comisiones se calculan, aceptan y pagan igual que a quien va por comisión.

Reglas del proyecto que aplican (leer AGENTS.md y docs/ai-context.md antes de empezar):
- Todo cambio de esquema o permisos es una migración nueva. La última aplicada es 20261010000019; las nuevas son 20261010000020 y 20261010000021.
- Una función SQL se reescribe entera partiendo de su versión vigente (`npm run db:donde -- <nombre>`). Toda función nueva lleva `REVOKE ALL ... FROM PUBLIC, anon, authenticated` y solo el `GRANT` necesario.
- Todo texto visible va en `src/i18n/translations.ts` (es y en; `translations.test.ts` lo exige). El dinero con `lib/money.ts`. CSS plano con tokens, nunca colores literales.
- Commits solo cuando se pidan. Orden de publicación: `db push` → push a `main` → `npm run qa:security`. No desplegar ni publicar sin permiso del usuario.

## Bloque A — Pago "Mixto" (salario + comisiones)
**Hoy**
- Tabla `perfiles_pago` (supabase/migrations/20261009000000_comisiones_por_especialidad.sql:154-166): esquema `TEXT NOT NULL DEFAULT 'comision' CHECK (esquema IN ('comision','salario'))` (CHECK sin nombre explícito: su nombre real, probablemente `perfiles_pago_esquema_check`, hay que buscarlo en pg_constraint), `comision_porcentaje`, `salario_monto`, `salario_periodo`.
- `trg_perfiles_pago_sello` (20261009000000:197-222): si salario borra el porcentaje; si no, borra salario y periodo → con "mixto" borraría el salario.
- `_reparto_comisiones` (20261010000006:491-608): da tasa 0 solo a 'salario' (líneas 543-545 y 578-580) → "mixto" ya cobraría su porcentaje. No hace falta tocarla.
- `sync_order_commissions` (vigente en 20261010000017:1377-1429): borra e inserta solo `r.esquema = 'comision'` (líneas 1412 y 1419) → "mixto" no generaría comisión.
- `comisiones_estimadas` (20261010000014:205-344): el mi_total del admin filtra `v.esquema = 'comision'` (línea 299).

**Migración 20261010000020_pago_mixto.sql**
- Cambiar el CHECK: con un DO $$ que busque en pg_constraint el CHECK de perfiles_pago cuya definición mencione esquema, hacer DROP CONSTRAINT de ese nombre y ADD CONSTRAINT perfiles_pago_esquema_check CHECK (esquema IN ('comision','salario','mixto')).
- Reescribir trg_perfiles_pago_sello (desde 20261009000000): salario → porcentaje NULL; comision → salario y periodo NULL; mixto → conserva los tres. Si es mixto sin salario_monto, rechazar con 22023 ("Escribe el salario del pago mixto.").
- Reescribir sync_order_commissions desde la versión vigente de la 017, cambiando solo los dos filtros r.esquema = 'comision' por r.esquema <> 'salario'.
- Reescribir comisiones_estimadas desde la 014, cambiando solo el filtro de la línea 299 a v.esquema <> 'salario'. Ojo: es DROP/CREATE si cambia la forma; aquí no cambia, basta CREATE OR REPLACE con su REVOKE/GRANT tal cual estaban.
- No hace falta red de seguridad de montos: hoy nadie tiene mixto, así que ningún monto cambia al aplicarla.

**Pantalla**
- `src/types/domain/payroll.types.ts`:8: `PayKind = 'comision' | 'salario' | 'mixto'`.
- `src/features/employees/EmployeeDetailModal.tsx`:
  - Radios (155-169): agregar 'mixto'.
  - Campos (171-220): con mixto mostrar los dos bloques (porcentaje y salario + periodo).
  - Validación (61-71): porcentaje si comision|mixto; monto si salario|mixto.
  - Guardado (84-90): comision_porcentaje si comision|mixto; salario y periodo si salario|mixto.
  - Confirmación (74-79): sigue pidiendo confirmación solo al pasar a salario (mixto conserva las comisiones).
  - Texto de ayuda (221): para mixto, uno nuevo (`employees.mixedHint`).
- `src/pages/Employees.tsx`:47-60 (`payLabel`): para mixto → "Mixto · $900.00 quincenal + 35 %" (porcentaje propio o el de la sede). Usar `money()`.
- `src/features/workOrders/CommissionEstimateCard.tsx` ya compara solo contra 'salario': no cambia.
- `i18n` (es/en, bloque employees, ~399-448 / ~1716-1764): `kind.mixto` ("Mixto" / "Mixed"), `payLabel.mixed` ("Mixto · {monto} {periodo} + {rate}%"), `mixedHint` ("Cobra su salario (informativo) y además la comisión de sus tareas.").

**Pruebas**
- `pgTAP` nuevo `supabase/tests/database/27_pago_mixto.test.sql` (copiar la preparación de 12_comisiones_especialidad.test.sql): un técnico mixto con 40 % y salario 900 → al entregar nace su comisión sugerida; el sello conserva salario y porcentaje; mixto sin salario → 22023; un salario sigue sin comisión; comisiones_estimadas lo cuenta en mi_total.
- `src/pages/Employees.pay.test.tsx`: agregar casos — elegir "Mixto" muestra los dos campos y savePayScheme recibe los tres valores; la etiqueta de la lista dice "Mixto · …".

## Bloque B — Empleados en el teléfono
**Hoy**
- `src/pages/Employees.tsx`:78-118: tarjeta con `<h3>` employees.payTitle ("Pago de cada empleado"), tabla cards-on-mobile (Nombre / Rol / Sede / Pago + botón "Ver" que abre EmployeeDetailModal). En el teléfono el CSS (components.css:2017-2086) apila cada fila como tarjeta: por eso sale todo desplegado.
- Reutilizable: `src/components/CollapsibleSection.tsx` (props title, icon, summary, open/onToggle o defaultOpen; el cuerpo se esconde con hidden, no se desmonta; dentro oculta .card-title). Patrón "un nombre abierto a la vez": `src/pages/Payroll.tsx`:88,326-354 (expanded, botón orders-section-toggle con ChevronDown/Right y aria-expanded).
- `useIsMobile()` en `src/lib/useMediaQuery.ts`:40-42; en pruebas, `setViewportMatches(true)` de `src/test/viewport.ts`.

**Cambio**
Solo en el teléfono (`useIsMobile()`), para no romper las pruebas de escritorio que buscan filas con `closest('tr')`:
- Envolver la sección en `<CollapsibleSection title={t('employees.payTitle')} icon={<UserCog/>} summary={employees.length}>`, cerrada al entrar.
- Dentro, en lugar de la tabla, una lista de botones con el nombre de cada empleado (orders-section-toggle, chevron, aria-expanded); uno abierto a la vez (estado expandedId). Al abrir: rol, sede, la etiqueta de pago (payLabel) y un botón "Editar pago" que abre el mismo EmployeeDetailModal.
- En escritorio queda como está.
- CSS mínimo para la lista (`.employee-mobile-list`, filas de ≥ 48 px de alto para el dedo).

**Pruebas**
- En `Employees.pay.test.tsx` (o un archivo nuevo `Employees.mobile.test.tsx`), con `setViewportMatches(true)`: la sección arranca cerrada; al abrirla se ven solo nombres; al tocar un nombre aparece su pago y "Editar pago" abre el modal.

## Bloque C — "Información del vehículo"
- `src/i18n/translations.ts`: reemplazar la clave `workOrders.vehicleServiceRepair` (es 198: "Servicio y Reparación del Vehículo"; en 1517: "Vehicle Service & Repair") por `workOrders.vehicleInfo`: "Información del Vehículo" / "Vehicle Information" (mismo estilo que customerInfo, en la línea anterior).
- Usos: solo `src/features/workOrders/WorkOrderDetail.tsx`:220 (título de la sección) y :224 (`<h3>` interno).
- Pruebas: `src/pages/WorkOrders.smoke.test.tsx` líneas 1161, 1189 y 1193 buscan /Servicio y Reparación del Vehículo/ → cambiar a /Información del Vehículo/.
- El PDF no usa esta clave.

## Bloque D — Avisos flotantes en el teléfono
**Hoy (causa probable, confirmada en el código)**
- `src/context/ToastContext.tsx`: duración 4,5 s (éxito) / 8 s (error); el contenedor .toast-stack no tiene role/aria-live; el "Cerrar" está fijo en español.
- `src/styles/components.css`:1731-1816: en max-width: 480px el aviso se pega abajo (bottom: 16px), justo donde están la barra inferior (64 px + área segura) y el teclado: tras agregar una tarea, TaskEditor.tsx vuelve a enfocar la descripción (líneas 87-92 y 130), el teclado sigue abierto y tapa el aviso. Además el aviso sale después de await refresh() (useWorkOrderDetail.ts addLabor 503-521, addPart 594-606), tarde en una red lenta.
- addPart muestra sus errores con fail(err) (recuadro arriba de la página, fuera de vista en el teléfono), no con un aviso.

**Cambio**
- CSS: en `max-width: 768px` poner el .toast-stack arriba, debajo del encabezado (`top: calc(var(--header-height, 64px) + env(safe-area-inset-top, 0px) + var(--space-2))`; revisar el nombre real de la altura del encabezado en index.css), ancho completo con márgenes de 16 px. Arriba no lo tapan ni el teclado ni la barra inferior.
- ToastContext.tsx: role="status" + aria-live="polite" en el contenedor (un error con role="alert"), y el "Cerrar" traducido (common.close).
- useWorkOrderDetail.ts: en addLabor y addPart, mostrar el aviso en cuanto la base respondió y después llamar refresh() (sin esperar para avisar). En addPart, los errores también con showToast('error', t('workOrders.partAddError'), getErrorMessage(...)) (clave nueva) además de fail(err).
- Nota: el técnico no agrega tareas ni repuestos (no tiene editor); el alta (WorkOrderCreateModal) no muestra avisos por diseño. No hay que tocar esos caminos.

**Pruebas**
- `src/styles/toastMobile.test.ts` (mismo patrón que src/styles/cardHover.test.ts / laborMobile.test.ts, que leen components.css): dentro de @media (max-width: 768px) el .toast-stack usa top y no bottom.
- Prueba de ToastContext: el contenedor tiene aria-live.
- En WorkOrders.smoke.test.tsx ya existe "Mano de obra agregada" (1310-1323); agregar el de "Repuesto agregado".

## Bloque E — Finalizar y "Listo para entregar"
**Hoy**
- Guardia del técnico `trg_guard_order_technician` (vigente en 20261006000000_firma_solo_admin.sql:30-121, trigger trg_order_technician_guard): el técnico se mueve libre entre en_proceso, espera_autorizacion y finalizado, incluido finalizado → en_proceso. Compara la fila completa contra la lista v_permitidas, así que una columna nueva queda protegida sola.
- Puerta trasera: `reportar_hallazgo` (vigente en 20261010000011:95-162) acepta cualquier orden no entregada y la pasa a espera_autorizacion; luego _salir_de_espera la vuelve a en_proceso → reabre una finalizada.
- Al pasar a finalizado:
  - `trg_notify_order_finished` (20260920000000:446-478) avisa a los admins "Lista para entregar · ORD" (tipo orden_finalizada).
  - `trg_portal_on_order_change` (vigente en 20261010000011:446-513, trigger trg_order_portal) encola el correo estatus a 3 min para en_proceso, finalizado y entregado.
- El correo se decide al enviarlo: `process-outbox/index.ts`:180-187 usa ctx.orden.estatus de `datos_correo` (vigente en 20260924000000:1046-1133) y marca lo enviado con `marcar_estatus_enviado(p_estatus := ctx.orden.estatus)` (index.ts:258-260). Plantilla finalizado en `_shared/email/templates.ts`:164-172 ("Su vehículo está listo").
- El portal recibe el estatus crudo de datos_portal (vigente en 20261010000018) y muestra "Listo para recoger" (src/portal/strings.ts 23/30 y 160/167; pasos en CustomerPortal.tsx:434-462).
- Pantalla: el selector de estado (WorkOrderDetail.tsx:832-856), changeStatus (useWorkOrderDetail.ts:325-369) y el tablero (KanbanBoard.tsx canMove 158-160, moveOrder 194-228, selector del teléfono 383-393) no tienen regla para salir de finalizado.

**Idea central**
Una marca `ordenes_trabajo.lista_para_entregar_en` (+ `_por`). Estado que ve el cliente: finalizado sin marca → para el correo cuenta como en_proceso (no se anuncia nada nuevo) y el portal lo muestra como "En revisión final"; con marca → "Listo para recoger" y su correo. Así el process-outbox no cambia: todo lo decide la base.

**Migración 20261010000021_listo_para_entregar.sql**
- `ALTER TABLE ordenes_trabajo ADD COLUMN IF NOT EXISTS lista_para_entregar_en TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS lista_para_entregar_por UUID REFERENCES perfiles(id) ON DELETE SET NULL;`
- Trigger nuevo `trg_guard_lista_para_entregar` (BEFORE INSERT OR UPDATE en ordenes_trabajo, función SECURITY DEFINER, con REVOKE):
  - Si NEW.estatus NOT IN ('finalizado','entregado') → poner las dos columnas en NULL (reabrir borra la marca).
  - Si cambian y no está encendida la configuración restorify.lista → 42501 ("Se marca con 'Marcar listo para entregar'."). Mismo patrón que trg_guard_retirada en la 017.
- Reescribir trg_guard_order_technician desde la 20261006000000, agregando después de los chequeos de entregado/asignación: `IF OLD.estatus = 'finalizado' AND NEW.estatus IS DISTINCT FROM OLD.estatus THEN RAISE EXCEPTION 'La orden ya está finalizada. Solo un administrador puede reabrirla.' USING ERRCODE = '42501';`
- Reescribir reportar_hallazgo desde la 011: si quien llama no es admin y la orden está finalizado → mismo 42501.
- RPC nueva `marcar_lista_para_entregar(p_orden_id UUID) RETURNS JSONB` (SECURITY DEFINER, SET search_path = public, solo admin, REVOKE + GRANT EXECUTE TO authenticated): bloquear la orden FOR UPDATE; exigir estatus = 'finalizado' (si no, 22023 "Solo una orden finalizada se marca lista para entregar."); si ya está marcada, devolver sin repetir; con set_config('restorify.lista','on',true) poner lista_para_entregar_en = NOW(), _por = auth.uid(); apagar la configuración; encolar el correo con `encolar_correo_cliente(p_orden_id, 'estatus', jsonb_build_object('estatus','finalizado'), 'estatus:' || p_orden_id, INTERVAL '0')` (vigente en 20260928000001:35-82; con 0 envía al momento). Devolver `{lista_para_entregar_en}`.
- Reescribir trg_portal_on_order_change desde la 011: quitar 'finalizado' de los estados que encolan correo al cambiar (queda en_proceso y entregado); el de "listo" lo encola la RPC. Mantener intacto lo demás (enlace, vencimiento, firma).
- Reescribir datos_correo desde la 20260924000000: el estatus que devuelve pasa a ser el "estatus del cliente": `CASE WHEN v_orden.estatus = 'finalizado' AND v_orden.lista_para_entregar_en IS NULL THEN 'en_proceso' ELSE v_orden.estatus END`. Con eso, un correo de "en proceso" pendiente no anuncia "listo" por accidente, y marcar_estatus_enviado registra lo que de verdad se anunció. (Opcional y limpio: una función interna `_estatus_cliente(orden)` usada aquí y en datos_portal.)
- Reescribir datos_portal desde la 018: agregar en orden el campo 'lista_para_entregar', `v_orden.lista_para_entregar_en IS NOT NULL` (el estatus sigue crudo; el portal decide el texto).
- Reescribir trg_notify_order_finished desde la 20260920000000: título "Trabajo terminado · ORD", cuerpo "{vehículo} — revísala y márcala lista para entregar". Mismo tipo orden_finalizada.
- Reescribir requiere_atencion desde la 20261010000012: grupo nuevo por_revisar (órdenes abiertas finalizado con lista_para_entregar_en IS NULL), con el mismo formato {total, ordenes} de los demás.
- Agregar lista_para_entregar_en a la lista de columnas de trg_historial (vigente en 20261010000018:569-701, campos de ordenes_trabajo y el UPDATE OF del trigger) para que quede en el historial quién y cuándo. Reescribir la función entera desde la 018.
- Agregar los casos nuevos a `scripts/qa/api-security.mjs` (técnico no llama marcar_lista_para_entregar; sin sesión tampoco).

**Pantalla (admin y técnico)**
- Tipo WorkOrder (`src/types/domain/workOrder.types.ts`): `lista_para_entregar_en?`, `lista_para_entregar_por?`.
- Servicio `workOrders.service.ts`: `markReadyForPickup(orderId)` → RPC `marcar_lista_para_entregar`.
- `useWorkOrderDetail.ts`:
  - `canReopen = isAdmin;` en changeStatus, si !isAdmin && order.estatus === 'finalizado' → aviso "Solo administración puede reabrir una orden finalizada" y no llamar a la base.
  - `markReadyForPickup()` con aviso de éxito ("Se avisó al cliente que su vehículo está listo") y refresh().
  - `canMarkReady = isAdmin && order.estatus === 'finalizado' && !order.lista_para_entregar_en`.
- `WorkOrderDetail.tsx`:
  - Selector de estado (832-856): deshabilitado para el técnico si la orden está finalizada, con title explicando.
  - Encabezado: botón verde (.btn-success) "Marcar listo para entregar" cuando canMarkReady; si ya está marcada, insignia "Listo para entregar" junto al estado.
- `TechnicianTaskList.tsx`:88: ocultar "Reportar trabajo adicional" si la orden está finalizada.
- `KanbanBoard.tsx`: canMove falso para el técnico en una orden finalizada; moveOrder con el mismo bloqueo; en las tarjetas de Finalizado, insignia "Listo para entregar" o "Por revisar". Lista (`WorkOrders.tsx`): la misma insignia.
- `features/dashboard/AttentionCard.tsx`: fila nueva para por_revisar ("Terminadas por revisar"); tipo en src/types/domain/dashboard.types.ts.
- Portal (`src/portal/`):
  - `portal.types.ts`: `orden.lista_para_entregar?: boolean`.
  - `CustomerPortal.tsx`: si estatus === 'finalizado' && !lista_para_entregar → insignia "En revisión final", texto de ayuda "Terminamos el trabajo y lo estamos revisando. Le avisaremos cuando pueda pasar a recogerlo.", y el paso marcado sigue en "En proceso" (índice 1 de STEP_ORDER). Con la marca, lo de hoy ("Listo para recoger"). Si el campo no viene (base vieja), comportarse como hoy.
  - `strings.ts` (es/en): finalReview, finalReviewHint.
- `i18n` app (es/en): workOrders.markReady, workOrders.readyForPickup, workOrders.pendingReview, workOrders.markReadyDone, workOrders.onlyAdminReopens, attention.por_revisar, y cambiar notifications.types.orden_finalizada a "Trabajo terminado · {numero_orden}" / "Work finished · {numero_orden}" (cuerpo: "{vehiculo} — revísala y márcala lista para entregar").

**Pruebas de base (pgTAP)**
- `03_permisos_tecnico.test.sql`:167-171 ("Y volver a ponerla en proceso"): pasa a throws_ok 42501. Revisar que el resto del archivo no dependa de esa reapertura (si la necesita, que la haga el admin).
- `14_avance_orden_cerrada.test.sql`:113-124: la reapertura la hace un admin, y después la mecánica baja el avance.
- `04_portal_y_correos.test.sql`:139-154: pasar a finalizado ya no encola correo; el correo pendiente es el de en_proceso.
- `02_multimedia_y_avisos.test.sql`:111-125: el título del aviso es "Trabajo terminado · …".
- `23_requiere_atencion.test.sql`:178-181: la forma del JSON suma el grupo por_revisar.
- Nuevo `28_listo_para_entregar.test.sql`:
  - técnico finaliza → no hay correo encolado; datos_correo da en_proceso; datos_portal da lista_para_entregar = false;
  - técnico no puede volver a en_proceso (42501) ni reportar un hallazgo en una finalizada;
  - técnico no llama marcar_lista_para_entregar (42501); escribir la marca directo → 42501;
  - admin marca → correo estatus pendiente con estatus = finalizado; datos_correo da finalizado; marcar dos veces no duplica el correo;
  - admin reabre a en_proceso → la marca se borra; volver a finalizar exige marcar de nuevo;
  - requiere_atencion cuenta la orden en por_revisar hasta que se marca;
  - permisos de la función nueva (has_function_privilege).

**Pruebas de pantalla (Vitest)**
- `KanbanBoard.test.tsx`: un técnico no puede mover una tarjeta finalizada.
- `WorkOrders.smoke.test.tsx`: el admin ve "Marcar listo para entregar" en una finalizada y al presionarlo se llama markReadyForPickup; el técnico ve el selector deshabilitado.
- `CustomerPortal.test.tsx`: finalizado sin marca → "En revisión final"; con marca → "Listo para recoger".
- `src/lib/emailTemplates.test.ts`: sin cambios (la plantilla de finalizado sigue igual).

## Documentación a actualizar (en el mismo cambio)
- `docs/reglas-de-negocio.md`: §1 (tabla de estados: "Finalizado" lo pone el técnico, "Listo para entregar" lo marca el admin y avisa al cliente; solo admin reabre), §3 (tabla de roles), §4 (esquema mixto), §7 (qué correo recibe el cliente y cuándo).
- `docs/manual-usuario.md`: estados de la orden, "Marcar listo para entregar", Empleados (Mixto y la vista del teléfono).
- `docs/portal-y-correos.md` (líneas ~150 y ~319): el correo de "listo" sale al marcarla.
- `docs/comisiones.md` y `docs/pagos-a-empleados.md`: el esquema mixto (salario informativo).
- `docs/plan-de-pruebas.md`: NOT-05 y POR-08, más casos nuevos de "listo para entregar" y Mixto.
- `docs/planos.md`: diagrama 3 (ciclo de la orden) con el paso "Listo para entregar" y la flecha "solo admin reabre"; diagrama 9 (correos).
- `docs/ai-context.md`: la marca lista_para_entregar_en (solo por la RPC; el correo de "listo" sale de ahí; datos_correo traduce el estatus del cliente) y el esquema mixto.
- `docs/pruebas.md`: conteos nuevos.
- Bitácora en `docs/plan-mejoras-2026-10.md`.

## Verificación
- `npm run lint && npx tsc -b && npm test && npm run build`.
- `npx supabase db reset --local && npm run test:db` (desde base vacía, como el CI): todas las pruebas pgTAP en verde, incluidas la 27 y la 28.
- Revisión a mano contra Supabase local (`npx vite --port 5199` con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY del `npx supabase status -o env`), en escritorio y con viewport de teléfono (390×844).
- Con permiso del usuario: `npx supabase db push` (020 → 021), push a main, `npm run qa:security` contra producción, y probar en un teléfono real.
