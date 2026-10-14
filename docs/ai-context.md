# Contexto para agentes de IA

Léelo antes de modificar Restorify. Es corto a propósito: dice qué no romper y
dónde está el detalle. Para todo lo demás, [radiografia.md](radiografia.md) y
[reglas-de-negocio.md](reglas-de-negocio.md). Para ubicar los archivos, tablas y pruebas
de una sección, [mapa-de-secciones.md](mapa-de-secciones.md); antes de cambiar la base de
un proyecto con datos reales, [mantenimiento.md §4](mantenimiento.md#4-cambiar-la-base-sin-comprometer-la-operación).
El estado al día (qué está hecho, qué falta publicar, quién hizo qué) y la bitácora de traspaso:
[bitacora.md](bitacora.md). El plan de la reunión del 03/10/2026, con las decisiones del taller:
[plan-mejoras-2026-10.md](historico/plan-mejoras-2026-10.md); léelo antes de tocar tareas,
comisiones, el alta de la orden o la "espera de autorización".

Cada viñeta es una regla; el porqué, las fechas y los incidentes están en el enlace.

---

## 1. Lo que tienes que saber antes de tocar nada

- **No hay backend propio.** El navegador habla directo con Supabase con la clave
  anónima. Cualquier usuario con sesión puede llamar a la API sin la interfaz.
  **La seguridad vive en RLS, triggers y RPCs** (`supabase/migrations/`). Ocultar
  un botón en React nunca es una regla de permisos. [arquitectura.md §2](arquitectura.md#2-la-decisión-que-explica-todo-lo-demás).
- **El dinero lo calcula la base.** Totales, depósitos, cobros al entregar, costo
  de repuestos, ajustes, reversiones y comisiones los asientan triggers
  idempotentes con signo. El frontend nunca calcula ni escribe un total. [reglas-de-negocio.md §2](reglas-de-negocio.md#2-el-dinero-que-se-asienta-solo).
- **Cobro por parqueo (`20261010000028`, [parqueo.md](parqueo.md)):** el parqueo entra a
  `total_general` por `orden_parqueo.monto`; lo calcula solo `_parqueo_calculo`; se congela al
  entregar (`fin_congelado`); nunca en el navegador; las comisiones (mano de obra) y el
  descuento (mano de obra + repuestos) no lo tocan. **Una orden entregada nunca se vuelve a
  contar sola** (las entregadas antes del módulo, sin `fin_congelado`, se quedan sin parqueo), y
  **`vigente_desde` no va hacia atrás**: si no, encender el cobro les cargaba días ya pasados a
  órdenes viejas y asentaba un "cargo adicional" que nadie pagó (10/10/2026).
- **Los montos están separados.** `orden_montos` (total, repuestos, depósito) y `orden_repuestos`
  son solo admin. `ordenes_trabajo.total_labor` y `orden_labor` los ve el técnico **asignado**
  (no toda la sede), porque su comisión sale de la mano de obra; los repuestos los lee por la
  RPC `repuestos_de_orden` (sin precios). [reglas-de-negocio.md §3](reglas-de-negocio.md#3-qué-puede-hacer-cada-rol).
- **Multi-sede.** Casi toda tabla tiene `sede_id`. Un admin ve todas las sedes. Helpers SQL:
  `is_admin()`, `current_user_sede_id()`, `is_assigned_to_order(orden_id)`, `mis_ordenes_asignadas()`.
- **Un técnico ve solo las órdenes que tiene asignadas** (`20261007000000`), no toda su sede:
  las políticas de `ordenes_trabajo`, de sus hijas y de Storage (`orden_media`) comparan con
  `(SELECT mis_ordenes_asignadas())::uuid[]` (así se calcula una vez por consulta). `clientes` y
  `vehiculos` los lee solo si cuelgan de una orden suya, y crearlos o editarlos es de admin.
  **Una tabla hija nueva de la orden lleva la misma política; una RPC `SECURITY DEFINER` que
  devuelva datos de una orden, la misma condición por dentro** (`repuestos_de_orden`). Para un
  técnico, una orden ajena **no existe** (PGRST116, cero filas en un UPDATE), no da 42501.
  [arquitectura.md §6](arquitectura.md#6-seguridad-y-permisos).
- **Un técnico modifica una orden solo si está asignado y no está entregada**, y solo estado
  (`en_proceso`, `espera_autorizacion`, `finalizado`) y avance (`trg_order_technician_guard`).
  La firma de recepción, devolver a recepción, reabrir una finalizada y entregar son de
  administración. **Si agregas una acción de técnico que cambie otra columna de
  `ordenes_trabajo`, añádela a la lista permitida de ese trigger en una migración nueva.**
- **Abrir una orden y asignar a alguien (alta, edición y baja) son solo de admin**
  (`ordenes_trabajo_insert`, `orden_asignaciones_*`). Asignar es dinero, no una etiqueta: reparte
  la comisión de las líneas heredadas. [arquitectura.md §6](arquitectura.md#6-seguridad-y-permisos).
- **La "espera de autorización" es una pausa, y el técnico la provoca reportando trabajo
  adicional** (`reportar_hallazgo`): crea el hallazgo y un avance interno para sus fotos.
  Administración lo cotiza o lo descarta, y la orden vuelve sola a `en_proceso` por
  `_salir_de_espera` si no queda un hallazgo pendiente ni un presupuesto enviado. Desde
  `20261010000024` el guardia del técnico no deja entrar en espera sin un hallazgo pendiente.
  [hallazgos.md](hallazgos.md#1-qué-cambia-para-el-taller).
- **El técnico puede tachar una mano de obra hecha**, pero `orden_labor` sigue siendo escritura
  solo de admin: lo hace la RPC `marcar_labor_completada` (solo `completado_en`/`completado_por`,
  solo sobre una línea `aprobado`). **Si un técnico necesita escribir algo más de una tabla de
  dinero, otra RPC estrecha, nunca una política más laxa.**
- **Comisiones.** La cuenta vive solo en `_reparto_comisiones(orden)` (la usan
  `sync_order_commissions` y `comisiones_estimadas`): **no la repitas en el navegador.** Una
  persona puede tener varias filas de `comisiones` en la misma orden (una por tarea y una por
  bolsa heredada): no supongas una por persona. El pago de cada quien va en `perfiles_pago`,
  nunca en `perfiles` (los técnicos leen los perfiles de sus compañeros). **El pago a empleados
  tiene decisiones abiertas con el taller** ([pagos-a-empleados.md](pagos-a-empleados.md)): no
  agregues salarios, períodos ni recálculos sin leerlo.
- **La comisión es por tarea** (`20261010000006`): cada línea de `orden_labor` tiene su técnico
  (`asignado_a`, solo lo escribe admin) y su comisión es de él (costo × su porcentaje); una línea
  sin técnico no le paga a nadie (`sin_asignar`). Las de antes (`reparto_heredado = true`) se
  reparten por especialidad entre los asignados `origen = 'manual'`. La app manda
  `reparto_heredado: false` en cada línea que crea y al asignarle técnico a una heredada (desde
  `20261010000008` también es el default). Lo pagado no se reasigna, no se borra ni cambia de
  especialidad (`trg_labor_tecnico_guard`). [comisiones.md](comisiones.md#cómo-se-calcula).
- **Cada comisión nace sugerida y administración la acepta** (`aprobar_comision`,
  `20261010000014`). El técnico no ve el monto hasta entonces, y eso lo impone la base. Una
  aceptada sin pagar se borra si la orden deja de estar entregada o si su tarea cambia de
  técnico: no la conserves "para respetar lo aceptado", se pagaría dos veces.
  [comisiones.md](comisiones.md#administración-acepta-cada-comisión-20261010000014).
- **Un trigger auxiliar nunca bloquea una escritura de la orden.** La traducción automática
  (`trg_encolar_traduccion`, `20261010000013`/`15`) encola en `cola_envios` dentro de un bloque
  que, si falla, solo avisa con un WARNING, como el historial. La primera versión leía una
  columna que no existía en esa tabla y tumbó en producción toda alta o edición de mano de obra
  y repuestos (04–05/10/2026). En PL/pgSQL, `OLD.columna` se resuelve en toda la expresión
  aunque otra condición la descarte: separa las ramas por tabla. Y todo `ON CONFLICT` necesita
  un índice único que coincida.
- **Un pago de comisiones asienta un egreso por orden** (`pay_commissions`, verificando que sumen
  el pago). El margen de una orden sale de `balance_orden`. **Si agregas un movimiento
  automático de una orden, decide si entra en esa cuenta.** [comisiones.md](comisiones.md#pagar-un-saldo).
- **"Listo para entregar" lo confirma administración** (`marcar_lista_para_entregar`, marca
  `lista_para_entregar_en`; `20261010000021`), y ahí sale el correo al cliente: que el técnico
  finalice no lo avisa. Un técnico no reabre una finalizada, ni reportando un hallazgo. **Si
  agregas una forma nueva de pausar o reabrir una orden, cúbrela igual.**
  [reglas-de-negocio.md §1](reglas-de-negocio.md#1-ciclo-de-vida-de-una-orden).
- **Pago "mixto"** (`perfiles_pago.esquema`, `20261010000020`): salario informativo + comisión.
  Todo filtro de comisiones es `esquema <> 'salario'`, nunca `= 'comision'`. Al soltar el CHECK
  del esquema, no uses `LIKE '%comision%'`: soltaba también el del porcentaje 0–100.
- **Proceso del taller** (`20261010000016`–`18`, [analisis-del-proceso-2026-10.md](historico/analisis-del-proceso-2026-10.md)):
  - **Lo importado del banco es contabilidad aparte.** Si sumas `finanzas_movimientos` para algo
    de la app, filtra `importacion_id IS NULL`. El costo automático de repuestos es solo el del
    sistema (`registrado_por IS NULL`). [reglas-de-negocio.md](reglas-de-negocio.md#importar-un-estado-de-cuenta).
  - **La fecha de un movimiento automático es `hoy_taller(sede)`**, nunca `CURRENT_DATE` (la
    base está en UTC: después de las 8 p. m. de Maryland ya es mañana).
  - **Métodos de pago:** efectivo, tarjeta, zelle, transferencia, cheque (`PAYMENT_METHODS` y el
    CHECK de `finanzas_movimientos`). Comisiones del banco y de Clover: categoría `comision_bancaria`.
  - **Costo de un repuesto:** por defecto el precio; uno escrito por administración se queda
    (`trg_part_cost_follows_price`). `updatePart` manda `costo_unitario` solo si se escribió.
  - **Descuento:** `orden_montos.descuento`, solo por `aplicar_descuento`.
    `total_general = mano de obra + repuestos − descuento + parqueo`; las comisiones no cambian.
  - **Retirada sin reparar** es `estatus = 'entregado'` + `retirada_sin_reparar = true`, solo por
    `retirar_sin_reparar`; cobra y comisiona solo `p_conservar`. **En pantalla es otro estado:
    mira la marca antes de pintar "Entregado".** [reglas-de-negocio.md](reglas-de-negocio.md#retirada-sin-reparar).
  - **Anticipos** (`registrar_anticipo`) suben `deposito_inicial` con su método. **No asientes un
    pago anticipado por otra vía.**
  - **Solo se paga lo aceptado** (`pay_commissions` filtra `estado = 'aceptada'`; en bloque,
    `aprobar_comisiones`). **Una prueba que paga comisiones tiene que aceptarlas antes.**
  - **El avance lo recalcula la base** al marcar una tarea (`trg_labor_avance`, pesado por el
    precio); el técnico lo puede corregir a mano.
  - **Repuesto pedido → llegó:** `orden_repuestos.estado_pedido`; la marca sale de
    `ordenes_esperando_repuestos()` y al llegar se avisa (`repuesto_recibido`).
  - **Pendientes del vehículo** (`trabajos_pendientes_vehiculo`): solo lectura.
  - El PDF tiene sus textos en `es` y `en` dentro de `lib/workOrderPdf.ts`; el CSV para el
    contador sale de `lib/csv.ts`.
- **El alta es `create_work_order` y lee claves con nombre exacto.** El depósito va dentro de
  `p_order` como `deposito_metodo`, `deposito_numero_cheque` y `deposito_comprobante_ruta`
  (`20261010000007`); una clave con otro nombre **se ignora sin error**. Pasó: del 04/10/2026
  hasta el arreglo, el alta mandaba `deposito_cheque`/`deposito_comprobante` y el número de
  cheque y el comprobante se perdían. Lo fija `workOrders.service.test.ts`. El alta va en
  cuatro pasos (`INTAKE_STEPS` en `workOrderForm.schema.ts`: cliente, vehículo, trabajos, depósito;
  el cliente y el vehículo nuevos se guardan al salir de su paso y al cancelar, `onLeaveStep`); un campo nuevo del formulario
  va en uno de ellos (lo exige `workOrderForm.schema.test.ts`).
- **Entregar es `entregar_orden`, no un UPDATE de estatus.** Bloquea la orden, asienta el pago
  final **con su método** (o la devolución) y la marca entregada en una transacción
  (`DeliveryModal`, `saldo_orden`). `handle_order_delivery_payment` queda como red para otra vía
  (asienta sin método) y `reverse_order_delivery_finance` revierte en los dos sentidos.
  [reglas-de-negocio.md](reglas-de-negocio.md#entregar).
- **La firma de recepción no autoriza lo cotizado** (`20261010000022`): firmar es estar de acuerdo
  con cómo se recibió el vehículo. Lo cotizado se autoriza solo con un presupuesto o con
  "Registrar autorización". En pgTAP, `pg_temp.autorizar_cotizado(orden)` hace lo que hacía la
  firma. [presupuestos.md §2](presupuestos.md#2-las-dos-formas-de-autorizar).
- **Solo lo autorizado se cobra.** Las líneas tienen `estado` (`borrador` | `pendiente` |
  `aprobado` | `rechazado`) y los totales suman solo `aprobado`. **Nunca cambies el estado con un
  UPDATE**: pasa por `enviar_presupuesto`, `registrar_autorizacion` o `cancelar_presupuesto`
  (bandera `restorify.presupuesto`). **Si agregas un cálculo de dinero sobre líneas, filtra por
  `aprobado`.** [presupuestos.md §1](presupuestos.md#1-el-estado-de-una-línea).
- **Idioma del cliente** (`clientes.idioma`, inglés por defecto): los correos salen en ese idioma
  y el cliente lo cambia desde su enlace. El portal traduce lo escrito a mano con
  `translateReport`. [portal-y-correos.md](portal-y-correos.md#idioma-20261010000022).
- **Lo que ve el cliente.** Un avance con `visible_cliente` (lo marca el técnico) sale con su
  texto y sus archivos; el archivo suelto lo publica solo un admin; la nota de voz de la
  recepción nace interna. **Al cliente nunca le llega el nombre de un técnico.** El reporte es el
  enlace del portal: no subas PDFs a Storage; el PDF solo se descarga y muestra lo mismo que ve
  el cliente (filtros en `src/lib/reportMedia.ts`). [portal-y-correos.md §10](portal-y-correos.md#10-el-reporte-web).
- **El portal del cliente (`src/portal/`) es un paquete aparte.** No importes ahí nada que
  arrastre `lib/supabase`, `services/`, contextos de la app ni `i18n/translations.ts`: habla con
  la edge function `portal` por `fetch`. Todo dato nuevo para el cliente se agrega a mano en
  `datos_portal` (**nunca `to_jsonb(fila)`**).
- **Próximo servicio y sticker** (`20261010000029`, [portal-y-correos.md](portal-y-correos.md)):
  lo programa solo administración (`programar_proximo_servicio`); el técnico asignado solo
  sugiere. La página del QR (`/s/<código>`) sale de `datos_servicio` (solo `service_role`, por la
  edge function `portal`) y **nunca lleva el nombre del cliente, la placa ni el VIN**: el sticker
  va en el parabrisas y lo lee cualquiera. El código no vence; `quitar_proximo_servicio` lo borra.
  La ventana de impresión se abre antes de cualquier `await` (`openStickerWindow`), o el iPhone
  la bloquea.
- **Avisos y correos al personal.** El técnico se entera de lo no autorizado (`TechOrderStatus`)
  y ve lo suyo aceptado en `/mis-comisiones` (`resumen_mis_comisiones`). `notificar` le encola un
  correo (plantilla `empleado`) **sin `orden_id`** en `cola_envios`, para que nunca tome el camino
  del correo al cliente; **si agregas otro aviso con correo, súmalo al `v_grupo` de `notificar`.**
  [multimedia-y-notificaciones.md](multimedia-y-notificaciones.md#parte-2--notificaciones).
- **Las órdenes se actualizan solas en pantalla** (`useOrderSync`, Realtime). El evento es una
  señal: nunca pintes su contenido. Una tabla hija nueva que otro deba ver al momento va en la
  publicación (migración) y en `ORDER_TABLES`; **toda tabla publicada lleva RLS**.
  [arquitectura.md](arquitectura.md#sincronización-en-tiempo-real-useordersync-20261010000002).
- **La lista de órdenes no trae el histórico** (`getWorkOrders` excluye las entregadas de más de
  90 días y las archivadas; el archivo es `getArchivedWorkOrders`, paginado). **No le quites el
  filtro para "ver todo".** [reglas-de-negocio.md](reglas-de-negocio.md#archivado-de-órdenes).
- **Órdenes y Kanban son una sola página** (`pages/WorkOrders.tsx`, `?vista=lista|tablero`).
  **Lo que espera a la oficina lo cuenta la base** (`requiere_atencion`): un pendiente nuevo se
  agrega a esa RPC y a `23_requiere_atencion`, no se cuenta con la lista del navegador. "Mis
  tareas" del técnico es `getMyTasks`. [mapa-de-secciones.md](mapa-de-secciones.md#panel).
- **El teléfono del cliente se guarda en formato internacional** (`+15551234567`) con
  `PhoneInput`; para mostrarlo, `formatPhone`, y para llamar o escribir, `telUrl` / `whatsAppUrl`
  (`lib/phone.ts`). [reglas-de-negocio.md](reglas-de-negocio.md#teléfono-del-cliente).
- **Roles:** `admin`, `mecanico`, `pintor`. Mecánico y pintor tienen los mismos permisos.

## 2. Reglas de oro

0. **Listas con `fetchAll`, totales con una RPC.** La API de Supabase devuelve como máximo
   1.000 filas por consulta y no avisa. Nunca leas una tabla que crece con un `select`
   sin `.range()` (usa `fetchAll` de `src/services/support.ts`, con un orden que termine
   en `id`) y nunca sumes dinero en el navegador: los KPIs salen de `resumen_panel`.
   Tampoco uses `.in('col', [muchos ids])`: la URL tiene un largo máximo; usa conteos
   embebidos (`select('*, hijos(count)')`) o una RPC.
1. **Todo cambio de esquema o permisos es una migración nueva** en
   `supabase/migrations/AAAAMMDDHHMMSS_descripcion.sql`. Nunca edites una migración
   ya aplicada ni cambies tablas desde el panel. **El nombre va después de la última
   migración, no de la fecha de hoy:** hay migraciones aplicadas con fecha futura (hoy la
   última es `20261010000029`), y una con fecha anterior a la última aplicada no entra con
   `db push` ([evaluacion-2026-10.md](historico/evaluacion-2026-10.md#4-base-de-datos), B-1).
2. **Una función nueva en `public` es una RPC pública.** Postgres da `EXECUTE` a
   `PUBLIC` y Supabase a `anon` y `authenticated` al crearla. Revócala siempre:
   `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;` y concede solo lo
   necesario. Las `SECURITY DEFINER` llevan `SET search_path = public` y verifican
   rol/sede por dentro. Una función que solo llaman triggers no necesita ningún
   `GRANT` (el trigger corre como su dueño). `npm run qa:security` detecta el olvido
   ([auditoria-2026-09.md](historico/auditoria-2026-09.md), AUD-01); si agregas una
   función interna, agrega su caso a `scripts/qa/api-security.mjs`.
3. **Prueba con pgTAP** (`supabase/tests/database/`) todo lo que toque dinero o
   permisos. Un cuerpo plpgsql roto se aplica sin error y falla en producción.
4. **Si una migración elimina o renombra columnas**, la base y el `dist` se
   despliegan juntos; mejor aún, en dos pasos (expandir y contraer, ver
   [mantenimiento.md §4](mantenimiento.md#4-cambiar-la-base-sin-comprometer-la-operación)).
   Nunca ejecutes `supabase db push` ni despliegues funciones sin que la persona
   responsable lo pida.
4b. **Una función SQL se reescribe entera** en cada migración que la cambia: la versión
   vigente es la de la migración más nueva. Antes de reemitirla, búscala con
   `npm run db:donde -- <nombre>` y parte de esa versión, no de la primera que encuentres.
   Copiar una versión vieja deshace en silencio lo que cambiaron las posteriores.
5. **Nunca pongas secretos en el repositorio ni en la documentación.** Viven en
   archivos `*.local` (ignorados por git), en `supabase secrets` y en Vault. Solo
   la llave **pública** VAPID va en el frontend.
6. **Sin framework de UI ni Tailwind.** CSS plano: variables en
   `src/styles/index.css`, componentes en `src/styles/components.css`. Nunca un
   color literal. **El color de marca son tres tokens, no uno:** un relleno con texto
   encima (botón, avatar, ficha elegida) va con `--gradient-primary` y `--color-text-inverse`;
   un borde o indicador, con `--color-primary`; un texto de acento, con
   `--color-primary-light`. El color de una sede los recalcula `brandPalette`
   (`lib/branding.ts`), que garantiza el contraste (`branding.test.ts`).
7. **Todo texto visible pasa por i18n** (`src/i18n/translations.ts`, español e
   inglés, `useLanguage().t(key)`). Si falta una clave, la pantalla muestra la clave;
   la red es `src/i18n/translations.test.ts` (mismas claves, mismos marcadores `{dato}`,
   ningún texto vacío). Los errores se guardan crudos y se traducen al pintar con
   `lib/errors.ts`; nunca muestres el mensaje del backend. Excepción: un
   `RAISE ... USING ERRCODE = '42501'` con una oración en español para el taller se
   muestra tal cual; escríbela pensando en quien la va a leer.
7b. **El dinero se escribe con `lib/money.ts`** (`money`, `moneySigned`), nunca con
   `toFixed(2)` ni `toLocaleString()` (sin opciones se come los centavos y cambia según el
   teléfono). El portal y los correos tienen su propio formateador.
8. **Fechas locales** con `lib/dates.ts` (`todayLocal`, `daysFromTodayLocal`, `isSameMonth`). Nunca
   `toISOString().split('T')[0]` ni `new Date('AAAA-MM-DD')` para comparar meses.
8b. **Lo que va junto se escribe junto.** Dos o más escrituras que no pueden quedar a
   medias van en una RPC o un trigger, no en varias llamadas desde el navegador
   (`importar_estado_cuenta`, `create_work_order`). Una operación de dinero que se puede
   disparar dos veces bloquea sus filas (`FOR UPDATE`, ver `pay_commissions`).
8c. **La caché de datos es de una persona.** `AuthContext` la vacía al cambiar de usuario;
   no guardes datos de la sesión en otro lado (localStorage, IndexedDB) sin borrarlos al
   cerrar sesión.
8d. **`supabase/config.toml` es la configuración local, no la real.** No uses
   `supabase config push` sin revisar el diff: `[auth.email] enable_signup = false` apaga el
   inicio de sesión con correo. La configuración real de Auth está en el panel.
9. **Una orden puede ser de otra sede que la elegida** (un admin abre órdenes desde avisos y
   enlaces). Lo que depende de la sede (logo, nombre, porcentaje, personal) sale de
   `order.sede_id` (`orderSede` en `useWorkOrderDetail`), no de `currentSede`.
10. **Una consulta que falla no es "no hay datos".** Distingue el error de red de la
   fila inexistente (`PGRST116`) antes de vaciar estado, cerrar sesión o borrar algo.
11. **Commits solo cuando se piden.**

## 3. Dónde está cada cosa

| Necesitas | Ve a |
|---|---|
| Consultas a Supabase | `src/services/<dominio>.service.ts`. Ningún componente llama `supabase.from` directo. `supabaseService.ts` es una fachada heredada; en código nuevo importa el servicio del dominio |
| Lecturas y caché | TanStack Query; claves en `src/lib/queryClient.ts`. Tras mutar, **invalida** (la base cambia cosas que el cliente no predice) |
| Formularios | react-hook-form + `zod/mini`; ejemplo en `src/features/workOrders/workOrderForm.schema.ts` |
| Qué archivos, tablas, RPC y pruebas tiene cada sección | [mapa-de-secciones.md](mapa-de-secciones.md) |
| La versión vigente de una función, trigger, política o tabla SQL | `npm run db:donde -- <nombre>` |
| Detalle de orden | `src/features/workOrders/useWorkOrderDetail.ts` (permisos derivados: `canEditLines`, `canSendReport`, `canDeliver`, `canSign`…) y `WorkOrderDetail.tsx` |
| Multimedia | `src/lib/media/` (compresión, grabación, conversión, cola TUS en IndexedDB) y `src/features/media/`. Detalle en [multimedia-y-notificaciones.md](multimedia-y-notificaciones.md) |
| Notificaciones | Triggers `trg_*_notify` → `notificar()` → `notificaciones` + `cola_envios`; edge function `process-outbox`; frontend en `src/features/notifications/`, `src/lib/push.ts`, `public/sw.js` |
| Presupuestos | `quotes.service.ts`, `features/workOrders/QuoteCard.tsx`, `LineStateBadge.tsx`, `lineState.ts`; sección `QuoteSection` del portal. Detalle en [presupuestos.md](presupuestos.md) |
| Portal y correos | `trg_order_portal` → `encolar_correo_cliente()`; `process-outbox` (`sendEmail`) + `_shared/email/templates.ts`; edge function `portal` → `datos_portal()`; `src/portal/`; tarjeta `CustomerLinkCard.tsx`. Detalle en [portal-y-correos.md](portal-y-correos.md) |
| Cobro por parqueo | `src/features/parking/`, `parking.service.ts`; RPC en [parqueo.md](parqueo.md) |
| Edge functions | `supabase/functions/` (Deno). Internas verifican `x-restorify-secret` con `_shared/internal.ts`. Si agregas una, súmala a la lista de SEC-17 en `scripts/qa/api-security.mjs` y despliégala (si no, responde 404). Llámalas con `invokeAdminFunction` (`users.service.ts`): `functions.invoke` pierde el motivo de un 4xx |
| Administración de datos del proyecto real | `scripts/admin/`: `limpiar-datos.sql` (termina en `ROLLBACK`) y `crear-primer-admin.sql`. Solo los corre quien administra, con su aprobación explícita |
| Qué hay en el proyecto de Supabase real (buckets, secretos por nombre, cron, Realtime, versiones de funciones, panel) | [supabase.md](supabase.md) |
| Contextos | `src/context/` (Auth, Language, Theme, Toast, UnsavedChanges) |
| Listas completas y totales | `fetchAll` en `src/services/support.ts`; `resumen_panel` (panel y Finanzas); `importar_estado_cuenta` (importación bancaria) |
| Largo mínimo de contraseña | `src/lib/password.ts` (8), igual en `create-employee`, `update-employee` y el panel de Auth |
| Traspaso, cuentas, operación y emergencias | [traspaso.md](traspaso.md); antes de publicar a clientes reales, [salida-a-produccion.md](historico/salida-a-produccion.md) |
| Formato del dinero | `src/lib/money.ts` (`money`, `moneySigned`); el portal y los correos tienen el suyo |
| Manual de usuario (Ayuda, `/ayuda`) | El texto es [manual-usuario.md](manual-usuario.md) y [manual-usuario.en.md](manual-usuario.en.md); la app lo importa tal cual. **Si cambias una pantalla, pon al día los dos idiomas** (misma estructura: lo fija `features/help/helpDoc.test.ts`). Detalle en [mapa-de-secciones.md](mapa-de-secciones.md#ayuda-manual-de-usuario) |
| Teléfonos y país | `src/lib/phone.ts` (`PHONE_COUNTRIES`, `parsePhone`, `toE164`, `formatPhone`, `telUrl`, `whatsAppUrl`) y `src/components/PhoneInput.tsx` |
| Color de la sede en el PDF | `src/lib/brandColor.ts`: el color tal cual para rayas y uno oscurecido para texto |
| Tipos de dominio | `src/types/domain/` |

## 4. Patrones de interfaz

- **Modales** controlados (`modal-overlay` + `modal`); los pesados con `LazyModal`. No uses
  `prompt` ni `alert`. `confirm` solo para confirmaciones destructivas.
- **Una capa de pantalla completa que no sea `modal-overlay` va en `<BodyPortal>`**
  (`src/components/BodyPortal.tsx`), como el grabador de video y el visor de la galería. Un
  `position: fixed` deja de medirse contra la pantalla si un ancestro tiene `transform`; por eso
  el levantón de `.card` vive dentro de `@media (hover: hover)` (lo fija `src/styles/cardHover.test.ts`).
- **Un error dentro de un diálogo se muestra dentro del diálogo** o con toast: el modal
  (z-index 400) tapa el recuadro de error de la página. Un `return` mudo parece un botón roto.
- **Feedback** de toda operación asíncrona con `showToast`; botones deshabilitados mientras corre.
- **Móvil primero.** Tablas con `cards-on-mobile` y `data-label`; inputs de 16 px;
  `useIsMobile()` para renderizar una sola versión; respeta `env(safe-area-inset-*)`.
- **Una pantalla larga en escritorio va en pestañas** (`src/components/Tabs.tsx`, con
  `role="tablist"` y flechas). El contenido de una pestaña se monta la primera vez que se abre y
  después se esconde con `hidden`. En el teléfono la pantalla apila sus secciones.
- **El botón verde es `.btn-success`** (tokens `--color-success-fill` y `--color-on-success`):
  para agregar y confirmar trabajo hecho. No uses `--color-success` como relleno con texto blanco.
- **Las tarjetas del detalle de la orden se pliegan con `<CollapsibleSection>`**, cerradas al
  entrar; el contenido se esconde con `hidden`, no se desmonta. **Una tarjeta nueva del detalle
  va en `TAB_SECTIONS` (`WorkOrderDetail.tsx`) con su id**; un enlace con `&tab=` abre la
  sección que fue a ver (`LINKED_SECTION`).
- **Un `<select>` controlado que se cancela con `confirm`** se remonta con una `key` (`statusEpoch`).
- **Un `DELETE` o un `UPDATE` rechazado por RLS devuelve éxito sin filas**: usa `.select('id')`
  y `assertDeleted` / `assertAffected` (`src/services/support.ts`). Excepción: marcar un aviso
  como leído, donde cero filas significa "ya estaba leído".

## 5. Verificar un cambio

```bash
npx tsc -b && npm run lint && npm test && npm run build
npm run test:db       # si tocaste SQL (requiere Docker + npx supabase start)
npm run qa:security   # después de aplicar una migración que toque permisos
```

Qué cubren las pruebas automatizadas: [pruebas.md](pruebas.md). Qué probar según lo
que cambiaste, con casos que un agente puede ejecutar: [plan-de-pruebas.md](plan-de-pruebas.md)
(§1.4 tiene las instrucciones para agentes; §8, qué módulos probar según el cambio).
Para comprobar el estado de una orden en la base: `scripts/qa/estado-orden.sql` (solo
lectura). Las pruebas e2e y `qa:security` corren contra el proyecto de `.env.local`: no
agregues pruebas que entreguen órdenes o paguen comisiones mientras no exista staging.

## 6. Observabilidad y despliegue

- Errores del frontend en Sentry, siempre a través de `src/lib/monitoring.ts`
  (`reportError`, `identifyUser`, `openProblemReport`); ningún otro archivo importa
  `@sentry/react`. Sin `VITE_SENTRY_DSN` todo es un no-op (al 3/10/2026 no estaba en Hostinger,
  [evaluacion-2026-10.md](historico/evaluacion-2026-10.md), O-2).
- **Historial de la orden** (`historial_orden`, `trg_historial`, `20261010000004`): quién cambió
  qué y el antes → después; solo un admin lo lee y nadie lo escribe por la API. **Si agregas una
  columna que alguien decide (no un total recalculado), súmala a la lista del trigger y a su
  `UPDATE OF` en una migración nueva.**
- Producción: dominio `restorifyauto.net`. Hostinger compila y publica en cada push, con las
  variables `VITE_*` de su panel. **Hoy publica `main`** (el diseño era `produccion`): un push a
  `main` es un despliegue, sale antes de que termine el CI, y nunca va sin que la persona
  responsable lo pida ni antes del `db push` que necesite. Pasos en [deployment.md](deployment.md).
- **Una publicación deja pestañas con archivos viejos.** `lib/staleChunk.ts` reconoce la
  descarga fallida de una página diferida y recarga una vez (con un candado de 10 s contra el
  ciclo); el `ErrorBoundary` hace lo mismo. No lo quites.
