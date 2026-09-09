# Gestión de planilla por comisiones

Reemplaza el modelo anterior de salario base + bonos + deducciones, que no
describía cómo se paga a nadie en el taller.

## Cómo se calcula

```
base de ganancia = total de la orden − total de repuestos
bolsa            = base × (porcentaje de comisión de la sede / 100)
por mecánico     = bolsa / número de mecánicos asignados
```

Con el ejemplo del taller: un cliente gasta **$1,200**, de los cuales **$200**
son repuestos. La ganancia del taller sobre ese trabajo es **$1,000**; al 35% la
bolsa de comisión es **$350**.

| Mecánicos asignados | Le toca a cada uno |
| --- | --- |
| 1 | $350.00 |
| 2 | $175.00 |
| 3 | $116.67 · $116.67 · $116.66 |

El reparto se hace en centavos y el residuo se le da a los primeros, ordenados
por identificador para que salga igual cada vez que se recalcula. Antes se
redondeaba la misma cifra para todos, así que tres mecánicos cobraban $116.67
cada uno: **$350.01**, un centavo que no cuadraba contra el egreso.

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
- Se agrega o se quita un mecánico de una orden ya entregada (cambia el reparto
  de todos).
- Un administrador cambia el porcentaje de la sede.

En los tres casos **solo se recalcula lo que sigue pendiente de pago**. Lo ya
pagado es historia y no se toca: repartir de nuevo una comisión ya cobrada
significaría que al taller le cuadran los números pero a la persona no.

Si una orden se saca de "entregada" (por ejemplo, se marcó por error), sus
comisiones pendientes se eliminan **y Finanzas revierte el cobro final y el
costo de repuestos**. Antes solo se borraban las comisiones: el ingreso se
quedaba asentado, así que el taller reportaba el cobro completo de un carro que
seguía en el taller y sin el pasivo de comisión que lo acompaña. Lo conciliado
contra un estado de cuenta no se toca: ese dinero sí pasó por el banco.

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
- El pago se registra automáticamente como **egreso** en Finanzas, categoría
  "planilla".
- **Deshacer un pago** devuelve las comisiones a pendientes y elimina el egreso
  de Finanzas. El movimiento guarda a qué pago pertenece (`comision_pago_id`),
  así que se borra por referencia. Antes se buscaba por sede, fecha, monto y
  descripción, y dos mecánicos cobrando $175 el mismo día — el reparto normal de
  una bolsa de $350 — se borraban los dos.

## Configurar el porcentaje

Es **por sede**, no global — el reparto es un acuerdo con la gente de un taller
concreto, y el negocio espera abrir más locales.

Se edita en dos lugares, ambos solo para administradores:

- **Configuración → Sedes / Talleres**, junto a la capacidad.
- **Comisiones**, en la tarjeta de arriba a la derecha.

Valor por defecto: **35%**.

## Lo que se eliminó

La tabla `nomina_pagos` y toda la pantalla de planilla por salario, **incluidos
los registros históricos**, tal como se acordó. La migración
`20260912000000_commission_payroll.sql` hace el `DROP TABLE`.

> **Toma un respaldo de la base de datos antes de aplicar esa migración.** El
> borrado no se puede deshacer.
