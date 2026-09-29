# Gestión de planilla por comisiones

Reemplaza el modelo anterior de salario base + bonos + deducciones, que no
describía cómo se paga a nadie en el taller.

## Cómo se calcula

Desde la reunión con el taller de septiembre de 2026 (migración `20261009000000`) la
comisión es **por especialidad** y **por empleado**:

```
bolsa de cada especialidad = mano de obra autorizada de esa especialidad (mecánica o pintura)
parte de cada quien        = bolsa ÷ personas asignadas con esa tarea
comisión de cada quien     = su parte × (su porcentaje / 100)
su porcentaje              = el suyo (Empleados) o, si no tiene, el de la sede
```

- **Cada línea de mano de obra tiene especialidad.** En una orden de mecánica o de pintura
  es la del tipo de orden; en una orden **combinado** la elige el administrador por línea
  (mecánica por omisión), al crear la orden o en la tabla de mano de obra.
- **Cada bolsa se reparte entre quienes tienen esa tarea** en la orden
  (`orden_asignaciones.tipo_tarea`). Quien trabaja las dos cobra de las dos.
- **Quien está a salario** cuenta para el reparto, pero no cobra comisión: **su parte se
  queda en el taller** (no se reparte entre los demás).
- **Una bolsa sin nadie asignado** no la cobra nadie. La orden lo avisa en la tarjeta
  **Reparto de la comisión** (administración).

El ejemplo de la reunión: pintura **$1,000**, mecánica **$200**, al 35 %.

| | Antes (toda la mano de obra, partes iguales) | Ahora (por especialidad) |
|---|---|---|
| Pintora | $210.00 | **$350.00** (35 % de $1,000) |
| Mecánico | $210.00 | **$70.00** (35 % de $200) |

Varios en la misma bolsa, al mismo porcentaje, siguen repartiéndose al centavo:

| Pintores asignados a $1,000 de pintura | Le toca a cada uno |
| --- | --- |
| 1 | $350.00 |
| 2 | $175.00 |
| 3 | $116.67 · $116.67 · $116.66 |

El reparto se hace en centavos exactos y el sobrante del redondeo va a las fracciones más
grandes (en empate, por identificador), así que sale igual cada vez que se recalcula y la
suma siempre cuadra con la bolsa. Con porcentajes distintos cada quien cobra su
porcentaje sobre su parte.

La cuenta vive en una sola función, `_reparto_comisiones(orden)`: la usan el devengo al
entregar (`sync_order_commissions`) y la estimación que muestra la orden
(`comisiones_estimadas`).

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

Se recalcula sola cuando:

- Cambian los totales de una orden ya entregada.
- Se agrega o se quita un técnico, o se cambia su tarea, en una orden ya entregada.
- Cambia la especialidad de una línea de mano de obra.
- Un administrador cambia el porcentaje de la sede.
- Un administrador cambia el esquema o el porcentaje de un empleado (en **Empleados**).
  Pasar a alguien a salario le quita las comisiones pendientes: la pantalla lo avisa con
  el monto antes de guardar.

En todos los casos **solo se recalcula lo que sigue pendiente de pago**. Lo ya
pagado es historia y no se toca: repartir de nuevo una comisión ya cobrada
significaría que al taller le cuadran los números pero a la persona no.

Si una orden se saca de "entregada" (por ejemplo, se marcó por error), sus
comisiones pendientes se eliminan **y Finanzas revierte el cobro final y el
costo de repuestos**. Antes solo se borraban las comisiones: el ingreso se
quedaba asentado, así que el taller reportaba el cobro completo de un carro que
seguía en el taller y sin el pasivo de comisión que lo acompaña. Lo conciliado
contra un estado de cuenta no se toca: ese dinero sí pasó por el banco.

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

- En el detalle de cada orden asignada, la tarjeta **Tu comisión estimada**
  muestra la cuenta de cada bolsa suya: mano de obra de la especialidad × su porcentaje
  ÷ compañeros de esa tarea, y el total. La calcula la base (`comisiones_estimadas`,
  la misma cuenta que al entregar). A quien está a salario le dice que la orden no le
  genera comisión.
- No ve el porcentaje ni el sueldo de sus compañeros (`perfiles_pago` es de
  administración; cada quien lee solo el suyo).
- Al entregarse la orden, cada técnico recibe el aviso **Comisión generada** con
  su monto (trigger `trg_commission_notify`).
- La pantalla **Comisiones** es solo para administradores.

La comisión usa la mano de obra autorizada de cada especialidad; los repuestos no
entran (son de traspaso).

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
no se asienta en Finanzas. Vive en la tabla `perfiles_pago` y no en `perfiles`, porque un
técnico lee los perfiles de sus compañeros de sede.

## Lo que se eliminó

La tabla `nomina_pagos` y toda la pantalla de planilla por salario, **incluidos
los registros históricos**, tal como se acordó. La migración
`20260912000000_commission_payroll.sql` hace el `DROP TABLE`.

> **Toma un respaldo de la base de datos antes de aplicar esa migración.** El
> borrado no se puede deshacer.
