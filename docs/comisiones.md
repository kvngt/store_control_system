# Gestión de planilla por comisiones

Reemplaza el modelo anterior de salario base + bonos + deducciones, que no
describía cómo se paga a nadie en el taller.

> **Hay decisiones abiertas con el taller** sobre cómo se paga a los empleados (qué pasa
> con lo ya ganado al cambiar un porcentaje o pasar a salario, períodos de pago, recibos,
> salarios en Finanzas). El análisis, la propuesta por fases y las preguntas enviadas el
> 29 de septiembre de 2026 están en [pagos-a-empleados.md](pagos-a-empleados.md). No
> cambies el cálculo sin leerlo.

## Cómo se calcula

Desde el 03/10/2026 (migración `20261010000006`, fase F3 del
[plan de mejoras](plan-mejoras-2026-10.md)) la comisión es **por tarea**: cada línea de mano
de obra tiene **su técnico** y su comisión es de esa persona. Se pidió porque "la pintora no
cobró una mano de obra extra": con el reparto por especialidad, quién cobraba una línea
dependía de quién estuviera asignado a la orden, y eso no lo veía nadie al agregarla.

Cada línea de mano de obra **autorizada** cae en uno de tres casos:

| La línea | Quién cobra | Cuánto |
|---|---|---|
| **Tarea con técnico** (`orden_labor.asignado_a`) | Su técnico, y solo él | costo de la línea × su porcentaje |
| **Tarea nueva sin técnico** (`reparto_heredado = false`) | **Nadie**, hasta que se le asigne uno | — |
| **Línea de antes de F3, sin técnico** (`reparto_heredado = true`) | El equipo de su especialidad, como antes (abajo) | su parte de la bolsa × su porcentaje |

```
su porcentaje = el suyo (Empleados) o, si no tiene, el de la sede; a salario, 0
tarea         = costo × su porcentaje / 100, redondeado al centavo
```

- **La app crea todas las líneas nuevas como tareas** (`reparto_heredado = false`), con o sin
  técnico. Una tarea sin técnico se marca **Sin técnico** en la fila, la orden lo avisa en
  Resumen (y con un punto en la pestaña Trabajos) y el diálogo de entrega lo repite: al
  entregar, su comisión no se devenga para nadie. Ese aviso lo da la base
  (`comisiones_estimadas → sin_asignar`), así que sale también al entregar desde el tablero.
- **Asignar el técnico es de administración**, en la misma fila (Tipo y Técnico) o al agregar
  el trabajo. Se puede cambiar en cualquier estado de la línea (borrador, esperando al
  cliente, autorizada o rechazada) sin tocar lo cotizado. El técnico tiene que ser mecánico o
  pintor **de la sede de la orden**. Si el tipo no es de su oficio (pintura a un mecánico) la
  pantalla pregunta antes, también al cambiar el tipo de una tarea que ya tiene técnico.
- **Quien recibe una tarea entra solo a la orden** (asignación con `origen = 'tarea'`), para
  verla. No entra al reparto de las líneas heredadas: cobra por sus tareas.
- **Quien está a salario** no cobra comisión por sus tareas ni por su parte de una bolsa: se
  queda en el taller.

### Las líneas de antes: el reparto por especialidad (`20261009000000`)

Las líneas que ya existían al aplicar F3, y las que todavía cree una versión anterior de la
app, conservan el reparto que se acordó en septiembre de 2026:

```
bolsa de cada especialidad = líneas heredadas autorizadas, sin técnico, de esa especialidad
parte de cada quien        = bolsa ÷ personas asignadas A MANO con esa tarea (origen 'manual')
comisión de cada quien     = su parte × (su porcentaje / 100)
```

- En una orden **combinado** la especialidad de cada línea la elige el administrador.
- **Quien está a salario** cuenta para el reparto, pero su parte se queda en el taller.
- **Una bolsa sin nadie asignado a mano** no la cobra nadie. La orden lo avisa en la tarjeta
  **Reparto de la comisión** (administración).
- **Quién reparte la bolsa lo decide administración** en la tarjeta de técnicos de la orden:
  "Sacar del reparto" deja a la persona en la orden pero fuera de la bolsa (así se saca a quien
  tiene tareas, que no se puede quitar de la orden); "Sumar al reparto", o agregarla a mano,
  mete a quien entró por una tarea. Si la bolsa de esa especialidad ya se pagó, no se cambia
  quién la reparte.
- **Darle técnico a una línea heredada la saca del reparto para siempre**: la app manda
  `reparto_heredado = false` junto con el técnico, así que si después se le quita el técnico
  queda **Sin técnico** (nadie cobra) en vez de volver en silencio a la bolsa. *Decisión
  pendiente de confirmar con el taller* ([pagos-a-empleados.md](pagos-a-empleados.md#5-preguntas-enviadas-al-taller)).

El ejemplo de la reunión: pintura **$1,000**, mecánica **$200**, al 35 %.

| | Antes (toda la mano de obra, partes iguales) | Por especialidad (sept.) | Por tarea (oct.) |
|---|---|---|---|
| Pintora | $210.00 | **$350.00** | **$350.00** si la pintura es su tarea |
| Mecánico | $210.00 | **$70.00** | **$70.00** si la mecánica es su tarea |

Con tareas el reparto ya no depende de quién esté asignado: una mano de obra extra de pintura
de $500 asignada a la pintora le suma $175, aunque otro pintor esté en la orden.

Varios en la misma bolsa heredada, al mismo porcentaje, siguen repartiéndose al centavo:

| Pintores asignados a mano a $1,000 de pintura heredada | Le toca a cada uno |
| --- | --- |
| 1 | $350.00 |
| 2 | $175.00 |
| 3 | $116.67 · $116.67 · $116.66 |

El reparto se hace en centavos exactos y el sobrante del redondeo va a las fracciones más
grandes (en empate, por identificador), así que sale igual cada vez que se recalcula y la
suma siempre cuadra con la bolsa.

La cuenta vive en una sola función, `_reparto_comisiones(orden)`: una fila por tarea
(`labor_id`) y una por persona y bolsa heredada (`labor_id` nulo). La usan el devengo al
entregar (`sync_order_commissions`) y la estimación que muestra la orden
(`comisiones_estimadas`). La llave de `comisiones` es (orden, usuario, especialidad,
`labor_id`), con `NULLS NOT DISTINCT`: **una persona puede tener varias filas en una orden**, y
la pantalla **Comisiones** dice qué trabajo paga cada una.

## Los repuestos ahora son de traspaso

La columna **"Costo unitario"** se quitó de la interfaz — tanto del formulario de
nueva orden como de la tabla de la orden. Solo se captura el **precio**.

En el taller un repuesto se factura a lo que costó, así que las dos columnas
siempre llevaban el mismo número y la primera casi nunca se llenaba. La base de
datos ahora copia el precio al campo de costo automáticamente
(`trg_part_cost_passthrough`), de modo que:

- Finanzas sigue registrando el egreso de repuestos al entregar la orden.
- La base de la comisión sigue restando el costo de los repuestos.
- Nadie tiene que escribir la misma cifra dos veces.

**Nota sobre el histórico:** las órdenes existentes conservan su
`costo_unitario` tal como estaba (casi siempre 0). Reescribirlas haría que
Finanzas generara asientos de corrección contra cada orden ya entregada, es
decir, reexpresaría meses ya cerrados. Si en algún momento se quiere ese
recálculo, hay que hacerlo a propósito y con respaldo previo.

## Cuándo se genera la comisión

Al marcar una orden como **entregada**. Es automático — nadie captura
comisiones a mano.

Entregar es **solo para administradores**. Entregar asienta el ingreso del
trabajo en Finanzas y devenga las comisiones, así que es una decisión de
administración y no un paso del taller: un técnico asignado podía mover su
propia orden a "entregado" y con eso acreditarse su comisión. Por el mismo
motivo, una orden ya entregada queda cerrada para el técnico — su labor, sus
repuestos y sus asignaciones solo los puede tocar un administrador, porque
mueven dinero ya asentado. Las dos reglas las impone la base de datos, no la
interfaz.

Se recalcula sola cuando (trigger `trg_labor_commissions` sobre las líneas, más los de
asignaciones, sede y empleado):

- Cambia una línea de mano de obra de una orden ya entregada: se autoriza o se rechaza, cambia
  su precio, su técnico, su especialidad o si va al reparto heredado, o se agrega o se borra.
  (Desde F3 la comisión sale solo de las líneas; el recálculo por los totales de la orden,
  `trg_order_montos_commissions`, se eliminó: recalculaba dos veces cada cambio de línea y no
  se enteraba de un cambio de técnico.)
- Se agrega o se quita un técnico, se cambia su tarea o si entra al reparto, en una orden ya
  entregada (solo mueve las líneas heredadas).
- Un administrador cambia el porcentaje de la sede.
- Un administrador cambia el esquema o el porcentaje de un empleado (en **Empleados**).
  Pasar a alguien a salario le quita las comisiones pendientes: la pantalla lo avisa con
  el monto antes de guardar.

En todos los casos **solo se recalcula lo que sigue pendiente de pago**. Lo ya
pagado es historia y no se toca: repartir de nuevo una comisión ya cobrada
significaría que al taller le cuadran los números pero a la persona no.

Por lo mismo, **lo pagado bloquea la línea** (`trg_labor_tecnico_guard`): a una tarea con su
comisión pagada no se le cambia el técnico ni la especialidad y no se borra; a una línea
heredada cuya bolsa ya se pagó tampoco (moverla a un técnico la pagaría dos veces), y ninguna
línea entra a una bolsa heredada ya pagada (su comisión no la cobraría nadie). La pantalla lo
muestra con un candado y Borrar deshabilitado; para cambiarla, primero se deshace el pago en
**Comisiones**. Una línea tampoco se puede mudar a otra orden. Dos huecos conocidos, a
propósito: cambiar el **precio** de una línea ya pagada se deja (lo pagado no cambia y nada
se paga dos veces), y una línea heredada que se autoriza **después** de pagar su bolsa no la
cobra nadie y queda bloqueada hasta deshacer ese pago (con la app nueva las líneas nacen como
tareas, así que deja de pasar).

Si una orden se saca de "entregada" (por ejemplo, se marcó por error), sus
comisiones pendientes se eliminan **y Finanzas revierte el cobro final y el
costo de repuestos**. Antes solo se borraban las comisiones: el ingreso se
quedaba asentado, así que el taller reportaba el cobro completo de un carro que
seguía en el taller y sin el pasivo de comisión que lo acompaña. Lo conciliado
contra un estado de cuenta no se toca: ese dinero sí pasó por el banco.

## Administración acepta cada comisión (`20261010000014`)

Al entregar, la base calcula la comisión como siempre, pero la deja **sugerida**
(`comisiones.estado`). Administración la revisa en la tarjeta **Reparto de la comisión** de la
orden y la **acepta** tal cual, o con otro porcentaje o monto (lápiz). Con solo el porcentaje,
el monto sale de la misma cuenta (base × % ÷ técnicos); un monto negativo o un porcentaje fuera
de 0–100 se rechazan, y lo ya pagado no se cambia (`aprobar_comision`, que bloquea la fila).

- **El técnico no ve el monto hasta que se acepta**, y no es solo la pantalla: la base se lo
  manda vacío en `comisiones_estimadas`, la política de `comisiones` no le deja leer sus filas
  sugeridas, y el aviso **Comisión aprobada** le llega al aceptarla, con el monto aceptado (al
  entregar ya no recibe un aviso con el monto sugerido). Lo ya pagado lo ve siempre.
- **El recálculo respeta lo aceptado**: si cambia la cuenta, una comisión aceptada conserva su
  monto. Pero se borra, como cualquier otra sin pagar, si la orden deja de estar entregada (al
  volver a entregarla, se acepta de nuevo) o si la tarea pasa a otro técnico (si no, se pagaría
  la misma tarea dos veces).
- **Esquema mixto** (`20261010000020`): salario informativo + comisión normal. Solo `salario`
  queda fuera del reparto (`esquema <> 'salario'` en `sync_order_commissions` y
  `comisiones_estimadas`).
- **Solo se paga lo aceptado** (desde `20261010000018`, decisión del taller del 05/10/2026):
  `pay_commissions` rechaza pagar lo que sigue sugerido ("Esas comisiones todavía no están
  aceptadas…"). Antes pagaba también lo sugerido, y aceptar orden por orden no cambiaba nada del
  pago.
- **Se revisa en bloque en Comisiones:** cada empleado muestra cuántas tiene "por revisar" y el
  botón **Aceptar todas** (`aprobar_comisiones`, un solo aviso por técnico y orden). Al abrir su
  fila, cada comisión se acepta o se edita (% o $) ahí mismo. **Pagar lo aceptado** paga solo
  esas.
- Una **retirada sin reparar** genera solo las comisiones de las tareas que se cobraron como
  hechas ("Se hicieron algunos trabajos"); cancelar todo o cobrar solo la revisión no le paga a
  nadie (la revisión no tiene técnico). Un **descuento** no las cambia (lo absorbe el taller; la
  comisión sale de la mano de obra).

Pruebas: `25_comisiones_aprobacion.test.sql` y `26_proceso_del_taller.test.sql`; la 01, 02,
07, 08, 12, 13 y 19 aceptan antes de pagar.

## Solo lo autorizado genera comisión

Desde la fase 5 los totales de una orden suman solo las líneas que el cliente
**autorizó** ([presupuestos.md](presupuestos.md)). Un trabajo sin autorizar o
rechazado no entra en la base de la comisión, y la tarjeta "Tu comisión estimada" del
técnico usa la misma mano de obra autorizada. Si el cliente autoriza algo después de
la entrega, la comisión pendiente se recalcula sola.

## Lo que ve el técnico

Desde la fase 1, mecánicos y pintores **no ven** totales, precios de repuestos ni
depósitos (tabla `orden_montos`, solo admin). Sí ven la mano de obra, porque es
la base de su pago:

- En el detalle de cada orden asignada, la tarjeta **Tu comisión estimada** muestra sus
  tareas autorizadas una por una (costo × su porcentaje), su parte de cada bolsa heredada en
  la que está (mano de obra × su porcentaje ÷ compañeros) y el total. **Desde
  `20261010000014`, los montos y porcentajes salen "Pendiente" hasta que administración acepta
  la comisión** (ver arriba). La calcula la base
  (`comisiones_estimadas`, la misma cuenta que al entregar). Solo ve lo suyo: ni las tareas
  ni el porcentaje de sus compañeros. A quien está a salario le dice que la orden no le
  genera comisión.
- En la lista de trabajos ve el tipo y el técnico de cada línea, y solo puede marcar como
  hechas **las suyas** y las que no tienen técnico.
- No ve el porcentaje ni el sueldo de sus compañeros (`perfiles_pago` es de
  administración; cada quien lee solo el suyo).
- Cuando administración acepta su comisión, recibe el aviso **Comisión aprobada** con el
  monto aceptado (`aprobar_comision`). Al entregar ya no le llega aviso: el monto todavía era el
  sugerido (`trg_commission_notify` solo avisa lo que nace aceptado, hoy nada).
- Al darle una tarea recibe **Nueva tarea**; si se la pasan a otra persona, **Tarea
  reasignada**. Cuando él marca una tarea como hecha, administración recibe **Tarea hecha**.
- La pantalla **Comisiones** es solo para administradores.

La comisión usa la mano de obra autorizada (de cada tarea, o de cada bolsa heredada); los
repuestos no entran (son de traspaso).

## Pagar un saldo

Pantalla **Comisiones → Saldos pendientes → Pagar saldo**.

- El **monto lo calcula el servidor** a partir de las comisiones pendientes
  seleccionadas, no lo envía el navegador. Una pantalla desactualizada no puede
  pagar de más ni de menos.
- Se puede registrar el **número de cheque** y adjuntar una **foto del cheque**.
  Para pagos con cheque se exige al menos uno de los dos: sin ninguno, el pago no
  se puede conciliar después contra el estado de cuenta.
- La foto va a un bucket **privado** (`comprobantes`) y se abre con un enlace
  firmado temporal, porque un cheque escaneado lleva número de cuenta.
- El pago se registra automáticamente en Finanzas, categoría "planilla", como **un
  egreso por cada orden** que cubre, vinculado a la orden y con el número de cheque
  (migración `20261010000000`). La suma de esos egresos es exactamente el pago: la base lo
  comprueba. Así el margen de cada orden (`balance_orden`) sale de Finanzas.
- **Un pago no se registra dos veces.** Si dos administradores (o dos pestañas) pagan las
  mismas comisiones a la vez, el segundo termina con "No hay comisiones pendientes para
  pagar en esta selección": la base bloquea las comisiones mientras registra el primero.
- **Deshacer un pago** devuelve las comisiones a pendientes y elimina sus egresos
  de Finanzas (todos los de ese pago). El movimiento guarda a qué pago pertenece (`comision_pago_id`),
  así que se borra por referencia. Antes se buscaba por sede, fecha, monto y
  descripción, y dos mecánicos cobrando $175 el mismo día — el reparto normal de
  una bolsa de $350 — se borraban los dos.
- **Una orden con comisiones pagadas no se puede borrar.** Borrarla se llevaba sus
  comisiones y dejaba el cheque y su egreso sin el detalle de qué pagaban. Para
  borrarla, primero se deshace el pago (las comisiones vuelven a pendientes).
- **Un empleado al que ya se le pagó no se puede eliminar**: sus pagos son el historial
  de lo que se le entregó. Si ya no trabaja en el taller, se deja en la lista.

## Configurar el porcentaje

El porcentaje **de la sede** es el de todos los que no tienen uno propio. Se edita en
**Configuración → Sedes / Talleres** o en **Comisiones**. Valor por defecto: **35%**.

El de **cada empleado** se edita en **Empleados → Ver**: comisión con su propio porcentaje
(vacío = el de la sede) o salario (monto y periodo). El salario es informativo por ahora:
no se asienta en Finanzas (ver [pagos-a-empleados.md](pagos-a-empleados.md)).
Cambiar el porcentaje recalcula las comisiones **pendientes** de esa persona; las pagadas
no cambian. Vive en la tabla `perfiles_pago` y no en `perfiles`, porque un
técnico lee los perfiles de sus compañeros de sede.

## Lo que se eliminó

La tabla `nomina_pagos` y toda la pantalla de planilla por salario, **incluidos
los registros históricos**, tal como se acordó. La migración
`20260912000000_commission_payroll.sql` hace el `DROP TABLE`.

> **Toma un respaldo de la base de datos antes de aplicar esa migración.** El
> borrado no se puede deshacer.
