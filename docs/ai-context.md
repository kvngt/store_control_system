# Contexto para agentes de IA

Léelo antes de modificar Restorify. Es corto a propósito: dice qué no romper y
dónde está el detalle. Para todo lo demás, [arquitectura.md](arquitectura.md) y
[reglas-de-negocio.md](reglas-de-negocio.md). Para ubicar los archivos, tablas y pruebas
de una sección, [mapa-de-secciones.md](mapa-de-secciones.md); antes de cambiar la base de
un proyecto con datos reales, [mantenimiento.md §4](mantenimiento.md#4-cambiar-la-base-sin-comprometer-la-operación).
Lo que viene (cambios pedidos por el taller el 03/10/2026, por fases y con decisiones ya
tomadas): [plan-mejoras-2026-10.md](plan-mejoras-2026-10.md). Léelo antes de tocar tareas,
comisiones, el alta de la orden o la "espera de autorización".

---

## 1. Lo que tienes que saber antes de tocar nada

- **No hay backend propio.** El navegador habla directo con Supabase con la clave
  anónima. Cualquier usuario con sesión puede llamar a la API sin la interfaz.
  **La seguridad vive en RLS, triggers y RPCs** (`supabase/migrations/`). Ocultar
  un botón en React nunca es una regla de permisos.
- **El dinero lo calcula la base.** Totales, depósitos, cobros al entregar, costo
  de repuestos, ajustes, reversiones y comisiones los asientan triggers
  idempotentes con signo. El frontend nunca calcula ni escribe un total.
- **Los montos están separados.** `orden_montos` (total, repuestos, depósito) y
  `orden_repuestos` son solo admin. `ordenes_trabajo.total_labor` y `orden_labor`
  los ve el técnico **asignado** (no toda la sede), porque su comisión sale de la mano de
  obra. Un
  técnico lee repuestos por la RPC `repuestos_de_orden` (sin precios).
- **Multi-sede.** Casi toda tabla tiene `sede_id`. Un admin ve todas las sedes. Helpers
  SQL: `is_admin()`, `current_user_sede_id()`, `is_assigned_to_order(orden_id)`,
  `mis_ordenes_asignadas()`.
- **Un técnico ve solo las órdenes que tiene asignadas** (`20261007000000`), no toda su
  sede: las políticas de SELECT de `ordenes_trabajo` y de sus hijas, y la de Storage de
  `orden_media`, comparan con `mis_ordenes_asignadas()` (un arreglo, envuelto en
  `(SELECT …)::uuid[]` para que se calcule una vez por consulta). `clientes` y `vehiculos`
  los lee solo si cuelgan de una orden suya, y **crearlos o editarlos es de admin**. Una
  tabla hija nueva de la orden lleva la misma política; una RPC `SECURITY DEFINER` que
  devuelva datos de una orden, la misma condición por dentro (`repuestos_de_orden`). Para
  un técnico, una orden ajena **no existe** (PGRST116, cero filas en un UPDATE), no da 42501.
- **Un técnico modifica una orden solo si está asignado y no está entregada**, y
  solo estado y avance (`trg_order_technician_guard`). **La firma de recepción es de
  administración** (`20261006000000`): la primera firma aprueba lo cotizado, y el técnico
  podía capturarla en cualquier estado. Si agregas una
  acción de técnico que cambie otra columna de `ordenes_trabajo`, añádela a la
  lista permitida de ese trigger en una migración nueva. **Tampoco elige cualquier estado**: solo
  `en_proceso`, `espera_autorizacion` y `finalizado`; devolver una orden a recepción y
  entregarla son de administración.
- **Abrir una orden y asignar a alguien son solo de admin** (`ordenes_trabajo_insert` y
  `orden_asignaciones_insert`, ambas `is_admin()`). Lo segundo es dinero, no una etiqueta:
  `trg_assignment_commissions` llama a `sync_order_commissions`, que reparte entre los
  asignados a mano (`origen = 'manual'`) la mano de obra **de las líneas heredadas** (ver
  abajo; la de una tarea es de su técnico), así que auto-asignarse era concederse una comisión
  y diluir la de quien sí trabajó la orden. `create_work_order` es `SECURITY INVOKER`, así que
  la política la cubre sin tocarla. `trg_guard_order_insert` (que bajaba a recepción la orden
  de un no-admin) se queda como red, pero su cuerpo ya no es alcanzable desde la API. Desde
  `20261010000006` **editar una asignación también es solo de admin**: el técnico podía cambiar
  el `tipo_tarea` de la suya y con eso mover su comisión (un UPDATE suyo da cero filas).
- **La "espera de autorización" es una pausa, y el técnico la provoca reportando trabajo
  adicional** (F6, `20261010000010`/`11`). La app ya no le ofrece el estado: llama
  `reportar_hallazgo`, que crea el hallazgo (`orden_hallazgos`, solo lectura por la API), un
  avance interno para sus fotos (el técnico no lo puede publicar) y pone la orden en espera
  con el texto como `motivo_autorizacion`. Administración lo cotiza (`cotizar_hallazgo`) o lo
  descarta (`descartar_hallazgo`, con el texto que verá el cliente si va al reporte). La orden
  vuelve sola a `en_proceso` por `_salir_de_espera` — al responder el cliente, al descartar o
  al cancelar el presupuesto — solo si no queda un hallazgo pendiente ni un presupuesto
  enviado. Mientras no se publique la migración que contrae, el guardia del técnico sigue
  aceptando el UPDATE directo con motivo (la app vieja). Al salir del estado el motivo se
  limpia. Todo el detalle y lo que falta: [hallazgos.md](hallazgos.md).
- **El técnico puede tachar una mano de obra hecha**, pero `orden_labor` sigue siendo
  escritura solo de admin: se hace por la RPC `marcar_labor_completada`, que solo toca
  `completado_en`/`completado_por` y solo sobre una línea `aprobado`. Si necesitas que un
  técnico escriba algo más de una tabla de dinero, otra RPC estrecha, nunca una política
  más laxa.
- **La comisión es por especialidad y por empleado** (`20261009000000`). Cada línea de
  `orden_labor` tiene `especialidad`; cada bolsa se reparte entre los asignados con esa
  `tipo_tarea`, al porcentaje de cada quien (`perfiles_pago`, o el de la sede). La cuenta
  vive solo en `_reparto_comisiones(orden)`: la usan `sync_order_commissions` y
  `comisiones_estimadas`. **No la repitas en el navegador.** La llave de `comisiones` es
  (orden, usuario, especialidad, `labor_id`) con `NULLS NOT DISTINCT`
  (`comisiones_orden_usuario_especialidad_tarea_key`, desde `20261010000006`): una fila por
  tarea y una por bolsa heredada, así que una persona puede tener varias filas en la misma
  orden; no supongas una por persona y especialidad. El pago de cada quien va en `perfiles_pago`, nunca en
  `perfiles` (los técnicos leen los perfiles de sus compañeros). **El pago a empleados
  tiene decisiones abiertas con el taller** ([pagos-a-empleados.md](pagos-a-empleados.md)):
  no agregues salarios, períodos ni recálculos sin leerlo.
- **Y desde `20261010000006`, por tarea.** Cada línea de `orden_labor` tiene su técnico
  (`asignado_a`, solo lo escribe admin) y su comisión es de él: costo × su porcentaje
  (`comisiones.labor_id`). Una línea nueva sin técnico no le paga a nadie (`sin_asignar` en
  `comisiones_estimadas`; la orden lo avisa en Resumen y el diálogo de entrega lo lee de esa
  misma RPC, así que avisa también desde el Kanban). Las líneas de antes
  (`reparto_heredado = true`, el default de la columna) siguen con el reparto por
  especialidad, solo entre los asignados `origen = 'manual'`. **La app manda
  `reparto_heredado: false` en cada línea que crea** —también en el alta, con su
  `especialidad`— y al asignarle técnico a una heredada también (`setLaborTechnician`,
  fijado en `workOrders.service.test.ts` y `WorkOrders.smoke.test.tsx`): queda fuera del
  reparto para siempre. Quien recibe una tarea entra solo a la orden (`origen = 'tarea'`);
  quitarlo de la orden con tareas se rechaza, pero administración lo saca del reparto (o mete
  a quien entró por una tarea) cambiando el `origen` de su asignación, salvo que esa bolsa ya
  se haya pagado (`trg_assignment_tasks_guard`). Lo pagado no se reasigna, no se borra, no
  cambia de especialidad y una línea no entra a una bolsa ya pagada (`trg_labor_tecnico_guard`;
  en pantalla, candado y Borrar deshabilitado). Una línea tampoco se muda de orden. El editor
  de tareas es `TaskEditor` (no conoce la orden: F4 lo usa en el alta).
- **Desde `20261010000014` cada comisión nace sugerida y administración la acepta**
  (`aprobar_comision`). El técnico no ve el monto hasta entonces, y eso lo impone la base: lo
  oculta `comisiones_estimadas`, la política de `comisiones` y el aviso (sale al aceptar). Una
  aceptada sin pagar se borra si la orden deja de estar entregada o si su tarea cambia de
  técnico: no la conserves "para respetar lo aceptado", se pagaría dos veces. Detalle en
  [comisiones.md](comisiones.md#administración-acepta-cada-comisión-20261010000014).
- **Un trigger auxiliar nunca bloquea una escritura de la orden.** La traducción automática
  (`trg_encolar_traduccion`, `20261010000013`/`15`) encola en `cola_envios` dentro de un bloque
  que, si falla, solo avisa con un WARNING, como el historial. La primera versión leía una
  columna que no existía en esa tabla y tumbó en producción toda alta o edición de mano de obra
  y repuestos (04–05/10/2026). En PL/pgSQL, `OLD.columna` se resuelve en toda la expresión
  aunque otra condición la descarte: separa las ramas por tabla. Y todo `ON CONFLICT` necesita
  un índice único que coincida.
- **Un pago de comisiones asienta un egreso por orden** (`20261010000000`), dentro de
  `pay_commissions` y verificando que sumen el pago. El margen de una orden sale de
  `balance_orden` (comisiones devengadas; repuestos = el costo automático de las líneas,
  lo demás vinculado aparte). Si agregas un movimiento automático de una orden, decide si
  entra en esa cuenta.
- **Proceso del taller (05/10/2026, `20261010000016`–`18`, [analisis-del-proceso-2026-10.md](analisis-del-proceso-2026-10.md)):**
  - **Lo importado del banco es contabilidad aparte.** Un movimiento con `importacion_id` no
    cuenta en `resumen_panel`, `_saldo_orden`, `_balance_orden`, el ajuste de una orden
    entregada ni `datos_portal`. Si sumas `finanzas_movimientos` para algo de la app, filtra
    `importacion_id IS NULL`. El costo automático de repuestos es solo el del sistema
    (`registrado_por IS NULL`): una compra a mano vinculada a la orden no lo toca.
  - **La fecha de un movimiento automático es `hoy_taller(sede)`**, nunca `CURRENT_DATE` (la
    base está en UTC: después de las 8 p. m. de Maryland ya es mañana).
  - **Métodos de pago:** efectivo, tarjeta, zelle, transferencia, cheque (`PAYMENT_METHODS` y el
    CHECK de `finanzas_movimientos`). Comisiones del banco y de Clover: categoría
    `comision_bancaria`.
  - **Costo de un repuesto:** por defecto el precio; uno escrito por administración se queda
    (`trg_part_cost_follows_price`). `updatePart` manda `costo_unitario` solo si se escribió:
    mandarlo igual al precio borraba el costo real. La columna ya no tiene DEFAULT.
  - **Descuento:** `orden_montos.descuento`, solo por `aplicar_descuento`, en $ o en % (el
    guardia de montos rechaza escribirlo directo). `total_general = mano de obra + repuestos − descuento`; las
    comisiones no cambian (salen de la mano de obra).
  - **Retirada sin reparar** es `estatus = 'entregado'` + `retirada_sin_reparar = true`, y solo
    la enciende `retirar_sin_reparar` (vía `entregar_orden` con `restorify.retirada`). Recibe
    `p_conservar` (las líneas autorizadas que sí se hicieron): esas se cobran y pagan su
    comisión; el resto pasa a `rechazado`. No cuenta en `ordenes_finalizadas_mes`. En pantalla
    es otro estado: mira la marca antes de pintar "Entregado".
  - **Anticipos** (`registrar_anticipo`) suben `deposito_inicial` con su método (la config
    `restorify.deposito` lleva `anticipo: true`): por eso la reversión de una entrega vuelve a
    lo pagado por adelantado. No asientes un pago anticipado por otra vía.
  - **Pendientes del vehículo** (`trabajos_pendientes_vehiculo`): las líneas rechazadas de sus
    otras órdenes, para ofrecerlas de nuevo. Es solo lectura.
  - **Solo se paga lo aceptado** (`pay_commissions` filtra `estado = 'aceptada'`); se acepta en
    bloque con `aprobar_comisiones`. Una prueba que paga comisiones tiene que aceptarlas antes.
  - **El avance lo recalcula la base** al marcar una tarea (`trg_labor_avance`, pesado por el
    precio); el técnico lo puede corregir a mano.
  - **Repuesto pedido → llegó:** `orden_repuestos.estado_pedido`; la marca de la lista sale de
    `ordenes_esperando_repuestos()`, y al llegar se avisa (`repuesto_recibido`).
  - El PDF tiene sus textos en `es` y `en` dentro de `lib/workOrderPdf.ts` (como el portal); el
    CSV para el contador sale de `lib/csv.ts`.
- **El alta es `create_work_order` y lee claves con nombre exacto.** El depósito va dentro de
  `p_order` como `deposito_metodo`, `deposito_numero_cheque` y `deposito_comprobante_ruta`
  (`20261010000007`); una clave con otro nombre **se ignora sin error**. Pasó: del 04/10/2026
  hasta el arreglo, el alta mandaba `deposito_cheque`/`deposito_comprobante` y el número de
  cheque y el comprobante se perdían. Lo fija `workOrders.service.test.ts`. El alta va en
  cuatro pasos (`INTAKE_STEPS` en `workOrderForm.schema.ts`); un campo nuevo del formulario
  va en uno de ellos (lo exige `workOrderForm.schema.test.ts`).
- **Entregar es `entregar_orden`, no un UPDATE de estatus.** La RPC bloquea la orden,
  asienta el pago final **con su método** (o la devolución si el depósito supera el
  total) y la marca entregada en una transacción (`20261008000000`). La pantalla abre
  `DeliveryModal` y el saldo lo da `saldo_orden`. `handle_order_delivery_payment` se queda
  como red para otra vía (asienta sin método), y `reverse_order_delivery_finance` revierte
  en los dos sentidos: al sacar de Entregado, lo cobrado vuelve al depósito.
- **Solo la primera firma de la orden autoriza lo cotizado** (`trg_quote_on_signature`).
  Volver a firmar no aprueba nada: lo agregado después pasa por presupuesto o por
  "Registrar autorización".
- **Roles:** `admin`, `mecanico`, `pintor`. Mecánico y pintor tienen los mismos
  permisos.
- **Las seis fases del cliente están hechas** (restricciones de técnicos, multimedia,
  notificaciones, portal del cliente y correos, presupuestos, reporte web). **El
  reporte es el enlace del portal:** no subas PDFs a Storage (el bucket `reportes`
  ya no acepta archivos); el PDF solo se descarga y muestra lo mismo que ve el
  cliente (fotos publicadas, líneas aprobadas, sin notas internas ni nombres de
  técnicos; filtros en `src/lib/reportMedia.ts`). Plan y estado en
  [README.md](README.md#estado-del-proyecto-septiembre-2026); historia y decisiones en
  [evolucion.md](evolucion.md).
- **Solo lo autorizado se cobra.** `orden_labor` y `orden_repuestos` tienen `estado`
  (`borrador` | `pendiente` | `aprobado` | `rechazado`) y los totales suman solo
  `aprobado`. Nunca cambies el estado con un UPDATE: pasa por `enviar_presupuesto`,
  `registrar_autorizacion`, `cancelar_presupuesto` o la firma de recepción (bandera
  `restorify.presupuesto`). Si agregas un cálculo de dinero sobre líneas, filtra por
  `aprobado`.
- **Un avance puede ser visible para el cliente.** `orden_avances.visible_cliente` lo
  marca el técnico, y con él salen su texto y sus archivos (`trg_publicar_archivos_avance`
  y la herencia en `trg_prepare_orden_media`). Ya no es cierto que todo lo del técnico sea
  interno hasta que un admin lo publique. Lo que **sigue** siendo cierto: al cliente no le
  llega el nombre de ningún técnico, y el archivo suelto lo publica solo un admin. Lo de la
  recepción nace visible **salvo la nota de voz**, que nace interna (`20261010000003`).
- **Las órdenes se actualizan solas en pantalla** (`20261010000002`): `useOrderSync` escucha
  por Realtime las tablas de la orden y vuelve a leer la que cambió. El evento es una señal,
  no los datos: nunca pintes su contenido. Una tabla hija nueva que otra persona necesite ver
  al momento va en la publicación (migración) y en `ORDER_TABLES` de `workOrders.service.ts`;
  **toda tabla publicada lleva RLS**, porque Realtime manda cada fila a quien su política deje
  leerla (`15_tiempo_real.test.sql`).
- **La lista de órdenes no trae el histórico.** `getWorkOrders` excluye las entregadas de
  más de 90 días **y las archivadas a mano** (`archivada_en`); el archivo se pide con
  `getArchivedWorkOrders`, paginado y buscando en el servidor. Los dos filtros son
  complementarios — toda entregada está en una sola de las dos listas — y lo fija
  `workOrders.archive.test.ts`. Solo lo entregado se archiva (CHECK) y sacar una orden de
  "Entregado" la desarchiva (trigger). No le quites el filtro para "ver todo": es lo que evita
  descargar miles de órdenes con sus relaciones embebidas.
- **Órdenes y Kanban son una sola página** (F7): `pages/WorkOrders.tsx` con dos vistas
  (`?vista=lista|tablero`, recordada en el navegador) y la misma búsqueda; `KanbanBoard` va
  embebido y `/kanban` redirige. **Lo que espera a la oficina lo cuenta la base**: la tarjeta
  "Requiere atención" del panel sale de `requiere_atencion` (`20261010000012`, solo admin).
  Un pendiente nuevo para la oficina se agrega a esa RPC (y a `23_requiere_atencion`), no se
  cuenta con la lista del navegador, que no trae el histórico. "Mis tareas" del técnico es
  `getMyTasks` (sus líneas en órdenes sin entregar).
- **El teléfono del cliente se guarda en formato internacional** (`+15551234567`) en
  `clientes.telefono`, con `components/PhoneInput` (país + número). Los guardados antes, sin
  "+", se leen como de EE. UU. y no se reescriben hasta que alguien los edita. Para mostrarlo,
  `formatPhone`; para llamar o escribir, `telUrl` / `whatsAppUrl` de `lib/phone.ts`, que
  respetan el "+" y no adivinan el país de un número que ya lo dice.
- **El portal del cliente (`src/portal/`) es un paquete aparte.** No importes ahí
  nada que arrastre `lib/supabase`, `services/`, contextos de la app ni
  `i18n/translations.ts`: habla con la edge function `portal` por `fetch` y tiene
  sus propios textos. Todo dato nuevo que deba ver el cliente se agrega a mano en
  `datos_portal` (nunca `to_jsonb(fila)`).

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
   migración, no de la fecha de hoy:** hay migraciones aplicadas fechadas hasta
   `20261010000000`, y una con fecha anterior a la última aplicada no entra con `db push`
   ([evaluacion-2026-10.md](evaluacion-2026-10.md#4-base-de-datos), B-1).
2. **Una función nueva en `public` es una RPC pública.** Postgres da `EXECUTE` a
   `PUBLIC` y Supabase a `anon` y `authenticated` al crearla. Revócala siempre:
   `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;` y concede solo lo
   necesario. Las `SECURITY DEFINER` llevan `SET search_path = public` y verifican
   rol/sede por dentro. Una función que solo llaman triggers no necesita ningún
   `GRANT` (el trigger corre como su dueño). Olvidarlo dejó
   `reverse_order_delivery_finance` abierta a cualquiera
   ([auditoria-2026-09.md](auditoria-2026-09.md), AUD-01); `npm run qa:security` lo
   detecta. Si agregas una función interna, agrega su caso a
   `scripts/qa/api-security.mjs`.
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
   `--color-primary-light`. En el tema claro no son el mismo color: el amarillo del logo
   (`#EBC334`) rellena bien pero como borde sobre blanco no se ve, así que la línea es un
   dorado más oscuro. El color de una sede los recalcula `brandPalette`
   (`lib/branding.ts`), que garantiza el contraste para cualquier color
   (`branding.test.ts`).
7. **Todo texto visible pasa por i18n** (`src/i18n/translations.ts`, español e
   inglés, `useLanguage().t(key)`). `Translations` es una firma de índice, así que
   TypeScript no compara los dos árboles y `getTranslation` devuelve **la clave** cuando
   falta: la pantalla mostraría `workOrders.archivedSearch`. `src/i18n/translations.test.ts`
   es la red — mismas claves, mismos marcadores `{dato}`, ningún texto vacío — con una lista
   corta de omisiones a propósito. Los errores se guardan crudos y se traducen al
   pintar con `lib/errors.ts`; nunca muestres el mensaje del backend. Excepción: un
   `RAISE ... USING ERRCODE = '42501'` con una oración en español para el taller
   ("La orden ya fue entregada…") se muestra tal cual en español; escribe esos
   mensajes pensando en quien los va a leer.
7b. **El dinero se escribe con `lib/money.ts`** (`money`, `moneySigned`), nunca con
   `toFixed(2)` ni `toLocaleString()`. El segundo no es otro estilo, está mal:
   `toLocaleString()` sin opciones se come los centavos ($1,650.50 → "$1,650.5") y cambia
   según el idioma del teléfono. El portal y los correos ya tenían su propio
   `Intl.NumberFormat`; son paquetes aparte y siguen con el suyo.
8. **Fechas locales** con `lib/dates.ts` (`todayLocal`, `daysFromTodayLocal`, `isSameMonth`). Nunca
   `toISOString().split('T')[0]` ni `new Date('AAAA-MM-DD')` para comparar meses.
8b. **Lo que va junto se escribe junto.** Dos o más escrituras que no pueden quedar a
   medias (un lote y sus movimientos, una orden y sus líneas) van en una RPC o un trigger,
   no en varias llamadas desde el navegador (`importar_estado_cuenta`,
   `deshacer_importacion_estado_cuenta`, `create_work_order`).
   Una operación de dinero que se puede disparar dos veces bloquea sus filas
   (`FOR UPDATE`, ver `pay_commissions`).
8c. **La caché de datos es de una persona.** `AuthContext` la vacía al cambiar de usuario;
   no guardes datos de la sesión en otro lado (localStorage, IndexedDB) sin borrarlos al
   cerrar sesión.
8d. **`supabase/config.toml` es la configuración local, no la real.** No uses
   `supabase config push` sin revisar el diff: `[auth.email] enable_signup = false` apaga el
   inicio de sesión con correo. La configuración real de Auth está en el panel.
9. **Una orden puede ser de otra sede que la elegida.** Un admin abre órdenes desde
   avisos y enlaces. Lo que depende de la sede (logo, nombre, porcentaje, personal)
   sale de `order.sede_id` (`orderSede` en `useWorkOrderDetail`), no de `currentSede`.
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
| Edge functions | `supabase/functions/` (Deno). Internas verifican `x-restorify-secret` con `_shared/internal.ts`. Si agregas una, súmala a la lista de SEC-17 en `scripts/qa/api-security.mjs` y despliégala: una función que la app usa y no está desplegada responde 404. Llámalas con `invokeAdminFunction` (`users.service.ts`): `functions.invoke` pierde el motivo de un 4xx y la pantalla mostraba "non-2xx status code" |
| Administración de datos del proyecto real | `scripts/admin/`: `limpiar-datos.sql` (termina en `ROLLBACK`) y `crear-primer-admin.sql`. Solo los corre quien administra, con su aprobación explícita |
| Qué hay en el proyecto de Supabase real (buckets, secretos por nombre, cron, Realtime, versiones de funciones, panel) | [supabase.md](supabase.md) |
| Contextos | `src/context/` (Auth, Language, Theme, Toast, UnsavedChanges) |
| Listas completas y totales | `fetchAll` en `src/services/support.ts`; `resumen_panel` (panel y Finanzas); `importar_estado_cuenta` (importación bancaria) |
| Largo mínimo de contraseña | `src/lib/password.ts` (8), igual en `create-employee`, `update-employee` y el panel de Auth |
| Traspaso, cuentas, operación y emergencias | [traspaso.md](traspaso.md); antes de publicar a clientes reales, [salida-a-produccion.md](salida-a-produccion.md) |
| Formato del dinero | `src/lib/money.ts` (`money`, `moneySigned`); el portal y los correos tienen el suyo |
| Teléfonos y país | `src/lib/phone.ts` (`PHONE_COUNTRIES`, `parsePhone`, `toE164`, `formatPhone`) y `src/components/PhoneInput.tsx` |
| Color de la sede en el PDF | `src/lib/brandColor.ts`: el color tal cual para rayas y uno oscurecido para texto, que un amarillo claro no se lee sobre blanco |
| Tipos de dominio | `src/types/domain/` |

## 4. Patrones de interfaz

- **Modales** controlados (`modal-overlay` + `modal`); los pesados con
  `LazyModal`. No uses `prompt` ni `alert`. `confirm` solo para confirmaciones
  destructivas, como hace el resto del código.
- **Una capa de pantalla completa que no sea `modal-overlay` va en `<BodyPortal>`**
  (`src/components/BodyPortal.tsx`), como el grabador de video y el visor de la galería. Un
  `position: fixed` solo se mide contra la pantalla si ningún ancestro tiene `transform`, y
  `.card` se levanta con uno al pasar el ratón. En el teléfono ese `:hover` se queda pegado
  después de tocar, así que el grabador quedaba encerrado en la tarjeta de Avances, bajo la
  barra inferior, con "Detener" y "Usar video" fuera de la pantalla. Por lo mismo, el
  levantón de `.card` vive dentro de `@media (hover: hover)`; `src/styles/cardHover.test.ts`
  lo fija. Pasó dos veces (diálogos en escritorio el 19/09, grabador en el teléfono el 28/09).
- **Un error dentro de un diálogo se muestra dentro del diálogo** o con toast: el
  modal (z-index 400) tapa el recuadro de error de la página. Un `return` mudo
  parece un botón roto.
- **Feedback** de toda operación asíncrona con `showToast`; botones deshabilitados
  mientras corre.
- **Móvil primero.** Tablas con `cards-on-mobile` y `data-label`; inputs de 16 px;
  `useIsMobile()` para renderizar una sola versión; respeta `env(safe-area-inset-*)`.
- **Una pantalla larga en escritorio va en pestañas** (`src/components/Tabs.tsx`, con
  `role="tablist"` y flechas), como el detalle de la orden (03/10/2026). El contenido de una
  pestaña se monta la primera vez que se abre y después se esconde con `hidden`, para no
  perder lo escrito ni pedir datos de pestañas que nadie abrió. En el teléfono la misma
  pantalla apila sus secciones, en el orden de las pestañas.
- **El botón verde es `.btn-success`** (tokens `--color-success-fill` y `--color-on-success`,
  contraste fijado en `successButton.test.ts`): para agregar y confirmar trabajo hecho. No
  uses `--color-success` como relleno con texto blanco: no llega al contraste mínimo.
- **Las tarjetas del detalle de la orden se pliegan con `<CollapsibleSection>`**
  (`src/components/CollapsibleSection.tsx`), en escritorio y en el teléfono, **cerradas al
  entrar** (pedido del taller, 04/10/2026): se ven los títulos con un dato corto y se abre lo
  que se necesita. Qué sección va en qué pestaña está en `TAB_SECTIONS`
  (`WorkOrderDetail.tsx`), con "Desplegar todo" por pestaña; un enlace con `&tab=` abre la
  sección que fue a ver (`LINKED_SECTION`), y "Cotizar" abre Mano de obra. Los avisos
  (hallazgos, tareas sin técnico) van arriba y no se pliegan. La sección envuelve la tarjeta
  entera: le quita marco y `.card-title` y pone el suyo. El contenido se esconde con
  `hidden`, no se desmonta, para no perder lo que se estaba escribiendo o firmando; si la
  tarjeta devuelve `null`, la sección desaparece por CSS. Una tarjeta nueva del detalle va en
  `TAB_SECTIONS` con su id.
- **Un `<select>` controlado que se cancela con `confirm`** se remonta con una `key`
  (`statusEpoch`).
- **Un `DELETE` o un `UPDATE` rechazado por RLS devuelve éxito sin filas**: usa
  `.select('id')` y `assertDeleted` / `assertAffected` (`src/services/support.ts`). Sin eso
  la pantalla dibuja el cambio sobre una fila que la base no tocó; en `uploadSignature`
  llegaba a decir "firmada" con la orden sin firma y el total en cero. Excepción: marcar un
  aviso como leído, donde cero filas significa "ya estaba leído".

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
  `@sentry/react`. Llegan los errores del `ErrorBoundary` y las consultas que fallan por algo
  inesperado (`QueryCache`; lo esperado lo filtra `isExpectedFailure`), con quién tenía la
  sesión; Configuración tiene "Reportar un problema". Sin `VITE_SENTRY_DSN` todo es un no-op, y
  **al 3/10/2026 no está en Hostinger** ([evaluacion-2026-10.md](evaluacion-2026-10.md), O-2).
- **Historial de la orden** (`historial_orden`, `20261010000004`): quién cambió qué, desde
  dónde y el antes → después. Lo escribe un solo trigger genérico (`trg_historial`) con una
  lista de columnas por tabla; solo un admin lo lee y nadie lo escribe por la API. Si agregas
  una columna que alguien decide (no un total recalculado), súmala a esa lista y al
  `UPDATE OF` del trigger en una migración nueva. Se ve en la tarjeta `OrderHistory`.
- Producción: dominio `restorifyauto.net` (antes `reinventa.shop`, dado de baja). Hostinger
  compila y publica en cada push, con las variables `VITE_*` de su panel (no las de
  `.env.local`); `public/.htaccess` reescribe a `index.html` (salvo `assets/`, que da 404 si
  falta) y manda `www` al dominio sin `www`. El diseño es que publique la rama `produccion`,
  pero **hoy publica `main`** (verificado el 30/09: el sitio cambió con tres pushes a `main`;
  `produccion` no se movió). Mientras no se cambie en el panel, **un push a `main` es un
  despliegue**, sale antes de que termine el CI, y nunca va sin que la persona responsable
  lo pida ni antes del `db push` que necesite. Supabase en plan **Pro** desde el 30/09
  (respaldos diarios; los buckets siguen con 50 MB por archivo). Pasos en
  [deployment.md](deployment.md).
- **Una publicación deja pestañas con archivos viejos.** `lib/staleChunk.ts` reconoce la
  descarga fallida de una página diferida y recarga una vez (con un candado de 10 s contra el
  ciclo); el `ErrorBoundary` hace lo mismo. No lo quites: sin él, quien tenía la app abierta
  veía "Algo salió mal" al entrar a una sección después de cada publicación.
