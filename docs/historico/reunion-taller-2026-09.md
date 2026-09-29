# Los siete cambios de la reunión con el taller — septiembre 2026

En la reunión con el taller se acordaron siete cambios. Se hicieron en cinco fases, cada una
con su migración y sus pruebas.

> **29 de septiembre de 2026:** las cinco migraciones están aplicadas en el proyecto real y
> el `dist` publicado. Ese mismo día la base se limpió para la prueba del taller. Queda
> abierto lo de los puntos 2 a 4 de [Qué falta](#qué-falta).

Al cierre: 480 pruebas unitarias (67 archivos), 330 aserciones pgTAP (13 archivos), lint
sin avisos, build en verde. `qa:security` suma 19 casos nuevos (SEC-19, SEC-36, SEC-37 y
SEC-75 a SEC-90) que solo pasan con las migraciones aplicadas.

| # | Cambio | Fase | Migración |
|---|---|---|---|
| 1 | La firma de recepción, solo en su momento | 1 | `20261006000000_firma_solo_admin` |
| 2 | El video se ve negro antes de guardarlo | 1 | — (solo interfaz) |
| 3 | El mecánico ve solo lo suyo | 2 | `20261007000000_tecnico_solo_sus_ordenes` |
| 4 | Método de pago al entregar | 3 | `20261008000000_entrega_con_metodo_de_pago` |
| 5 | Comisión o salario por empleado, y sección Empleados | 4 | `20261009000000_comisiones_por_especialidad` |
| 6 | Mano de obra de mecánica y de pintura por separado | 4 | (la misma) |
| 7 | Egresos de comisión por orden y margen de cada trabajo | 5 | `20261010000000_egresos_de_comision_por_orden` |

---

## Fase 1

**La firma la toma administración.** El técnico podía capturar la firma del cliente en
cualquier estado, y la primera firma **aprueba lo cotizado**: una firma fuera de su momento
autorizaba dinero. `firma_ruta` y `firma_fecha` salen de lo que el técnico puede cambiar; el
técnico ve la tarjeta de la firma sin el lienzo. De paso, los mensajes que decían "Únete a
la orden primero" (unirse ya no existe) ahora dicen a quién pedírselo.

**El video en negro.** La miniatura salía de la **cámara en vivo** un instante antes de
detener, y en varios teléfonos dibujar la cámara en un canvas da un cuadro negro. Ese cuadro
negro pasaba a ser el póster del video en el borrador, en la galería y en el portal. Además,
el ícono de reproducir del borrador no reproducía nada. Ahora:

- La miniatura sale del **archivo grabado**, probando 0.5 s, 1.5 s y la mitad, y un cuadro
  casi negro se **descarta** (la cámara en vivo queda de respaldo). Sin cuadro útil, cada
  lugar muestra el ícono de video, no un negro ni un "cargando" que no termina.
- El video del **borrador se abre y se reproduce** al tocarlo.
- La revisión del grabador muestra el póster y ya no intenta reproducirse sola con sonido
  (el navegador lo bloquea y el iPhone dejaba el cuadro en negro).

Verificado en un Chromium de teléfono con cámara simulada. **Falta confirmarlo en el
teléfono donde se vio** (caso MED-18): la cámara simulada no produce el cuadro negro.

## Fase 2 — cada técnico ve su trabajo

Un técnico veía **todas** las órdenes de su sede, con cliente, teléfono y fotos, y creaba y
editaba clientes y vehículos. Ahora la base le entrega **solo las órdenes que tiene
asignadas** y lo que cuelga de ellas (mano de obra, avances, archivos también en Storage,
compañeros de equipo, cliente y vehículo). Clientes y Vehículos salen de su menú; crearlos y
editarlos es de administración. Su panel cuenta sus órdenes y ya no muestra la ocupación del
taller; el buscador solo busca sus órdenes; la lista de órdenes ya no tiene "Otras órdenes".
Si abre un aviso o un enlace de una orden que ya no es suya, la app se lo dice en vez de
volver a la lista sin explicar.

Una sola definición de "mis órdenes", `mis_ordenes_asignadas()`, que usan todas las
políticas.

## Fase 3 — entregar pide cómo pagó el cliente

El `confirm` de "el saldo se registrará como pagado" se reemplazó por el **diálogo de
entrega**: total autorizado, lo ya cobrado y **lo que falta cobrar**, o lo que hay que
**devolver** si el depósito fue mayor. Se elige efectivo, cheque o transferencia, el número
del cheque y, si se quiere, la foto del comprobante. El cobro queda en Finanzas **con su
método**, y la foto se abre desde ahí.

En la base, `entregar_orden` hace todo en una transacción: asienta el pago (o la
**devolución**, que antes no quedaba en ningún lado), marca la orden entregada, y no cobra dos
veces. Sacar una orden de Entregado ahora revierte también una devolución.

## Fase 4 — comisiones por especialidad y por empleado

El ejemplo de la reunión, pintura $1,000 y mecánica $200 al 35 %: antes cada uno cobraba
$210; ahora **la pintora $350 y el mecánico $70**.

- Cada línea de mano de obra dice a qué bolsa va (mecánica o pintura). En una orden
  "combinado" la elige el administrador por línea.
- Cada bolsa se reparte entre quienes tienen esa tarea, al **porcentaje de cada quien**.
- **Empleados** (menú lateral): el pago de cada persona — comisión con su porcentaje o el de
  la sede, o salario —, lo que se le debe, lo que se le ha pagado y su actividad reciente.
  El alta y la edición del personal se mudaron aquí desde Configuración.
- La orden muestra el **reparto de la comisión** a administración, con el aviso de una bolsa
  que nadie cobra; el técnico ve su parte con la cuenta a la vista. La cuenta la hace la
  base, igual que al entregar.

## Fase 5 — cuánto dejó cada trabajo

Un pago de comisiones asentaba **un** egreso sin orden. Ahora asienta **un egreso por cada
orden** que cubre, que suman exactamente el pago. Con eso:

- **Balance de la orden** (detalle de una orden entregada): cobrado, repuestos, comisiones y
  margen.
- **Margen por orden** en Finanzas: las órdenes entregadas del mes con su margen, paginadas,
  con los totales del mes.

Una compra del banco o un movimiento a mano vinculados a la orden se muestran aparte, sin
restarlos: el costo de las piezas ya viene de sus líneas.

---

## Decisiones tomadas por omisión

El plan dejó once preguntas para el taller (D1–D11) con lo que se haría por omisión. Se
hizo lo de omisión salvo una:

- **D7 — cambiar el porcentaje de un empleado.** El plan decía "solo las futuras". Al
  construirlo apareció que el porcentaje **de la sede** ya recalculaba las comisiones
  pendientes desde septiembre. Para que las dos reglas digan lo mismo, cambiar el porcentaje
  o el esquema de una persona **recalcula sus comisiones pendientes**; lo pagado nunca
  cambia. Pasar a alguien a salario le quita lo pendiente, y la pantalla lo avisa con el
  monto antes de guardar. Si el taller prefiere "solo las futuras", hay que guardar el
  porcentaje de cada comisión al generarla y dejar de recalcularlo, también en el de la sede.

Las demás, como estaban: la firma solo administración (D1), el técnico sigue viendo teléfono
y correo del cliente de sus órdenes (D3), tres métodos y comprobante opcional (D4), la parte
del asalariado se queda en el taller (D5), el salario es informativo (D6), una bolsa sin
nadie no la cobra nadie (D8), mecánica por omisión en "combinado" (D9), margen con
comisiones devengadas (D10) y con el costo automático de repuestos (D11).

## Qué falta

1. **Aplicar las cinco migraciones al proyecto real** (`npx supabase db push`) y **subir el
   `dist/` nuevo** en el mismo momento. Van juntos: con la base nueva y el sitio viejo, un
   técnico vería listas vacías y la entrega seguiría sin método; con el sitio nuevo y la base
   vieja, las pantallas nuevas fallan. El aviso de versión desactualizada de la app lo marca.
2. Correr `npm run qa:security` con las migraciones aplicadas.
3. Probar en el teléfono donde se vio el **video negro** (MED-18).
4. Los casos manuales nuevos del plan de pruebas: ORD-07, ORD-08, ORD-17 a ORD-20, COM-07 a
   COM-11, CFG-03, FIN-09, FIN-10.
