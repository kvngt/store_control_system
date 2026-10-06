# Reglas de negocio

Qué hace Restorify y por qué, en lenguaje de negocio. Es la referencia para
decidir si algo que pasó es un error o el comportamiento esperado, y para
escribir las pruebas ([plan-de-pruebas.md](plan-de-pruebas.md)).

Casi todas estas reglas las impone **la base de datos** (RLS y triggers), no la
interfaz: se cumplen aunque alguien use la API directamente. Donde una regla vive
solo en la interfaz, se dice.

---

## Índice

1. [Ciclo de vida de una orden](#1-ciclo-de-vida-de-una-orden)
2. [El dinero que se asienta solo](#2-el-dinero-que-se-asienta-solo)
3. [Qué puede hacer cada rol](#3-qué-puede-hacer-cada-rol)
4. [Comisiones](#4-comisiones)
5. [Multimedia de la orden](#5-multimedia-de-la-orden)
6. [Notificaciones](#6-notificaciones)
7. [Portal del cliente y correos](#7-portal-del-cliente-y-correos)
8. [Presupuestos y autorización](#8-presupuestos-y-autorización)
9. [Retención y limpieza](#9-retención-y-limpieza)
10. [Riesgos conocidos y decisiones abiertas](#10-riesgos-conocidos-y-decisiones-abiertas)

---

## 1. Ciclo de vida de una orden

```
Recepción ──► En proceso ◄──► Espera de autorización ──► Finalizado ──► Entregado
                                                                     └► Retirada sin reparar
     ▲___________________________________________________________________│
                    (se puede volver atrás; ver "Des-entregar")
```

| Estado | Significa | Efectos automáticos al entrar |
|---|---|---|
| **Recepción** | El vehículo ingresó; no se trabaja todavía | — |
| **En proceso** | Se está trabajando | — |
| **Espera de autorización** | Pausa: hay trabajo adicional que el cliente tiene que autorizar. El técnico la provoca **reportando un hallazgo** (`reportar_hallazgo`); no la elige en el selector | Aviso a administración. Sale sola a En proceso al responder el cliente, al descartar el hallazgo o al cancelar el presupuesto ([hallazgos.md](hallazgos.md)) |
| **Finalizado** | El técnico terminó el trabajo. **Todavía no es "listo para el cliente"**: administración lo revisa y lo marca "Listo para entregar" | Avance al 100 %, fecha de finalización, **aviso a admins: "Trabajo terminado"** (hay que revisarlo). **No se le avisa al cliente.** Su enlace dice "En revisión final" |
| ↳ **Listo para entregar** | Marca sobre Finalizado que pone **solo administración** (`marcar_lista_para_entregar`) | **Ahora sí** sale el correo "Su vehículo está listo" y el enlace dice "Listo para recoger". Queda quién y cuándo (historial). Se borra sola si la orden se reabre |
| **Entregado** | El cliente se llevó el vehículo y pagó | Avance 100 %, **cobro del saldo, costo de repuestos, comisiones** (sección 2 y 4) |
| **Retirada sin reparar** | El cliente se llevó el vehículo **sin que se hiciera (todo) el trabajo**: no autorizó, cambió de idea, o solo se hizo una parte | Ver [Retirada sin reparar](#retirada-sin-reparar) |

"Espera de repuestos" ya no es un estado (el 29/09/2026 se convirtió en la espera de
autorización). Desde el 05/10/2026 **cada repuesto** se marca **Pedido** y luego **Llegó**: la
orden aparece "Esperando repuestos" en la lista, en el tablero y en el enlace del cliente
(con el nombre de la pieza), y al llegar se avisa a los técnicos de la orden.

**No hay una máquina de estados rígida**: se puede pasar de cualquier estado a
cualquier otro, con estas restricciones:

- **Solo un admin puede marcar Entregado** y **Retirada sin reparar**. Entregar asienta el
  ingreso y devenga comisiones; un técnico asignado podía hacerlo y acreditarse su propia
  comisión.
- **El técnico elige solo** En proceso y Finalizado (y no saca la orden de la espera de
  autorización: eso pasa al resolver lo que la puso ahí). Devolver una orden a Recepción es
  de administración.
- **Una orden finalizada solo la reabre administración** (pedido del taller, 05/10/2026,
  `20261010000021`): el técnico no la devuelve a En proceso, ni desde la orden ni arrastrándola
  en el tablero, ni reportando trabajo adicional (que pausaría la orden). La base lo rechaza
  (`42501`); la pantalla bloquea el selector y las tarjetas.
- **Sacar una orden de Entregado** (una entrega marcada por error) revierte el
  dinero: ver [Des-entregar](#des-entregar).

### El avance

El porcentaje de avance **sale de las tareas** (desde el 05/10/2026, migración
`20261010000018`): al marcar o desmarcar una tarea, o cuando cambia lo autorizado, es lo hecho
sobre lo autorizado **pesado por el precio** de cada tarea (un cambio de amortiguadores de
$400 pesa más que un cambio de aceite de $50; si todas valen $0, cuentan igual). El técnico
lo puede corregir a mano si cree que no refleja el avance real; la próxima tarea que marque
lo vuelve a calcular. Finalizada o entregada, la orden está al 100 %. Al reabrir una orden
cerrada se borra su fecha de finalización y el avance se conserva.

### Alta de una orden

- **La abre solo un admin** (desde el 04/10/2026, `20261004000000`: `ordenes_trabajo_insert`
  es `is_admin()`). Antes un técnico podía registrar la recepción; ya no.
- Se hace en cuatro pasos: cliente, vehículo y recepción, depósito (con su método y
  comprobante) y trabajos (cada tarea con su técnico).
- Lo que un admin cotiza al crear la orden nace **sin autorizar** y se autoriza
  cuando el cliente **firma la recepción** por primera vez (sección 8).
- El número `ORD-AAAA-###` se genera de forma atómica: dos órdenes simultáneas
  nunca reciben el mismo.
- La orden y sus líneas se crean en **una sola transacción**: o entra todo, o nada.
- Las fotos de recepción **no** son parte de esa transacción: entran a la cola de
  subida y suben en segundo plano. Si una falla, la orden ya existe y la foto se
  reintenta sola; reintentar el formulario no duplica la orden.
- Las millas no pueden ser negativas (restricción en la base).
- Sin fecha estimada de entrega elegida, se propone hoy + 5 días (calendario local).

### Orden entregada

Una orden entregada queda **cerrada para los técnicos**: no pueden modificar su
mano de obra, repuestos ni asignaciones, ni subir archivos, ni cambiar su estado
(tampoco sacarla de Entregado, que revertiría el cobro y sus comisiones), ni
agregar o borrar avances.
Un admin sí puede corregirla; cada corrección de dinero se asienta como un ajuste
(sección 2), no reescribiendo lo anterior.

### Borrar una orden

Solo admin. Se borran sus líneas, asignaciones, avances, multimedia (filas y
archivos en Storage), comisiones y los movimientos **automáticos** de Finanzas, todo
en una sola operación: si algo falla, no se borra nada. Los movimientos importados
del banco se conservan: ese dinero sí pasó por la cuenta.

**No se borra una orden con comisiones ya pagadas.** El pago (el cheque y su egreso)
quedaría sin el detalle de qué pagó. Primero se deshace ese pago en Comisiones.

---

## 2. El dinero que se asienta solo

Nadie registra a mano el dinero de una orden. Estos movimientos los crea la base, y
**todos cuentan solo lo que el cliente autorizó** (sección 8):

| Cuándo | Movimiento en Finanzas | Categoría |
|---|---|---|
| Se fija un depósito al crear la orden | **Ingreso** "Depósito inicial", con su método | pago_cliente |
| Se registra un **anticipo** | **Ingreso** "Anticipo", con su método | pago_cliente |
| Un admin corrige el depósito antes de entregar | Ingreso o egreso "Ajuste de depósito" por la diferencia | pago_cliente |
| Se **entrega** la orden | **Ingreso** "Pago final" = total − lo ya cobrado, **con su método** (efectivo, tarjeta, Zelle, transferencia o cheque), número de cheque y comprobante | pago_cliente |
| Se **entrega** una orden cuyo depósito **supera** el total | **Egreso** "Devolución al cliente" por la diferencia, con su método | pago_cliente |
| Se **entrega** la orden | **Egreso** "Costo de repuestos" (el costo de cada pieza, no su precio) | compra_repuesto |
| Se **retira sin reparar** | "Devolución al cliente" (o "Pago final" por el diagnóstico), con su método; sin costo de repuestos ni comisiones | pago_cliente |
| Cambia el total de una orden **ya entregada** (también por un descuento) | Ingreso "Ajuste por cargo adicional" o egreso "Reembolso por ajuste" por la diferencia | pago_cliente |
| Cambian los repuestos de una orden ya entregada (o se corrige su costo) | Egreso o ingreso de ajuste por la diferencia de costo | compra_repuesto |
| Se **saca de Entregado** | Egreso "Reversión de entrega" (o ingreso "Reversión de devolución") e ingreso "Reversión de costo de repuestos" | pago_cliente / compra_repuesto |
| Un admin **paga comisiones** | Un **egreso** por orden, "Comisión nombre – ORD-…", vinculado a la orden | planilla |
| Se **deshace** un pago de comisiones | Se eliminan **los** egresos de ese pago (y solo esos) | — |

### Reglas que sostienen los números

- **Todo es con signo e idempotente.** Cada cálculo compara "lo que debería haber"
  contra "lo que ya está asentado" y registra solo la diferencia. Repetir un
  cambio no duplica dinero.
- **Lo cobrado se cuenta con signo** (ingresos menos egresos de `pago_cliente`).
  Así, entregar → des-entregar → volver a entregar deja lo cobrado en el total.
- **El depósito no se puede cambiar en una orden entregada**: esa orden ya cobró
  su total, y la reversión usa el depósito como el monto al que volver.
- **Los totales los calcula el sistema, con lo autorizado.** Mano de obra = suma de
  sus líneas **aprobadas**; repuestos = cantidad × precio de los **aprobados**;
  total = mano de obra + repuestos − **descuento**. El costo de repuestos al entregar
  también cuenta solo lo aprobado. Nadie puede escribir un total a mano, ni siquiera un
  admin por la API.
- **El costo de un repuesto** (lo que pagó el taller) es por defecto su precio, y
  administración lo cambia cuando lo sabe (decisión del taller, 05/10/2026). Mientras siga
  igual al precio, lo sigue si cambia el precio; uno escrito a mano se queda. Así el margen
  de la orden muestra la ganancia de las piezas. Solo administración lo ve.
- **El costo automático es solo el que asienta el sistema.** Una compra de repuestos
  registrada a mano y vinculada a la orden se ve en el balance de la orden, pero no achica
  ni se revierte con el costo automático.
- **Descuento** (`aplicar_descuento`, solo admin): lo **absorbe el taller**. Baja el total
  que paga el cliente; no toca la mano de obra, así que **las comisiones no cambian**. En
  dólares o en **porcentaje** de lo autorizado (la base hace la cuenta). Nunca más que lo
  autorizado. Se registra en el historial con su motivo.
- **Anticipos** (`registrar_anticipo`, solo admin, orden sin entregar): un pago del cliente
  antes de llevarse el vehículo, con su método y comprobante. Se asienta como "Anticipo" y
  suma a lo pagado por adelantado (`deposito_inicial`): la entrega cobra solo lo que falte, y
  sacar la orden de Entregado vuelve a ese monto.
- **Negativos no.** Mano de obra, precios y depósito no aceptan valores negativos, ni
  un repuesto cantidad cero (formulario y base).

### Entregar

Entregar es de administración y pasa por el diálogo de entrega (reunión con el taller,
septiembre de 2026; migración `20261008000000`). La base calcula el saldo (`saldo_orden`:
total autorizado − lo cobrado neto) y `entregar_orden` hace todo en una transacción:

- Si **falta cobrar**, asienta el "Pago final" por el saldo con el **método** que se eligió,
  el número de cheque y la foto del comprobante (bucket privado `comprobantes`, carpeta de
  la sede). Un cheque exige número o foto.
- Si el depósito **supera** el total, asienta la **devolución** al cliente como egreso, con
  su método.
- Si no hay nada pendiente, no asienta nada y no pide método.
- Marca la orden entregada. Si algo lo impide (un presupuesto esperando al cliente), el
  pago tampoco queda. Una segunda entrega se rechaza: nunca se cobra dos veces.

Una entrega por otra vía (un UPDATE directo, una pestaña con la versión anterior) sigue
asentando el pago final o la devolución, pero **sin método**.

### Retirada sin reparar

El cliente se lleva el vehículo sin que se haga todo el trabajo (decisión del taller,
05/10/2026; `retirar_sin_reparar`, solo admin). Administración elige qué pasó:

| Salida | Se cobra | Comisiones |
|---|---|---|
| **Se canceló todo** | Nada: se le devuelve lo que dejó | Ninguna |
| **Solo la revisión** | La revisión del vehículo (una línea de mano de obra sin técnico) | Ninguna |
| **Algunos trabajos** | Los trabajos y repuestos autorizados que sí se hicieron, y si se quiere la revisión | Las de esas tareas, a su técnico (sugeridas, como siempre) |

En una transacción:

- Se cancela el presupuesto que esperaba respuesta y se descartan los hallazgos pendientes.
- Lo autorizado que no se cobra pasa a **no autorizado** ("no realizado" en el enlace del
  cliente) y queda como **pendiente del vehículo** para la próxima visita. Lo que se cobra
  queda hecho; un repuesto cobrado asienta su costo.
- Solo se cobra lo autorizado de **esa** orden. El descuento se quita.
- La base calcula la diferencia con lo que dejó el cliente (`saldo_retiro`) y la **devuelve**
  o la **cobra** con su método, como una entrega.
- **No cuenta como orden terminada** en el panel.
- En la base es una entrega marcada (`retirada_sin_reparar`): hereda el archivo, el candado
  de lo entregado y la reversión. Solo esa función la enciende; sacar la orden de Entregado
  la apaga.

### Des-entregar

Sacar una orden de Entregado deja la contabilidad como si nunca se hubiera
entregado:

- Lo cobrado al cliente vuelve al depósito (se asienta la reversión del pago final, o la
  de la devolución si el depósito era mayor que el total).
- Se revierte el costo de repuestos.
- Se eliminan las comisiones **pendientes**. Las **ya pagadas** se conservan: ese
  cheque existe.
- Lo conciliado contra el banco (movimientos importados) no se revierte.

### Importar un estado de cuenta

**Es contabilidad aparte** (decisión del taller, 05/10/2026): sirve para ordenar meses
anteriores y mandárselos al contador, y **no se mezcla** con lo que registra la app.

- Lo importado vive en su propia vista de Finanzas ("Estados de cuenta"), con su resumen por
  estado de cuenta (`resumen_importaciones`) y su exportación.
- **No cuenta** en los ingresos y egresos del panel ni de Finanzas (`resumen_panel`), ni en
  lo cobrado de una orden (saldo, balance, ajuste al entregar, enlace del cliente).
- "Posible duplicado" compara solo contra otros estados de cuenta importados (el mismo
  movimiento importado dos veces), no contra los cobros que asentó la app.
- Todo o nada: el lote y sus movimientos se guardan juntos. Si algo falla, no queda un lote a
  medias y el mismo archivo se puede volver a importar.
- Las comisiones de Clover y del banco ("bankcard fee", "bankcard discount fee", "clover
  fee"…) tienen su categoría, **Comisiones de banco y tarjeta**; también para registrarlas a
  mano cada mes, que es como las cobra el banco.

### Fechas

Los movimientos automáticos llevan la **fecha del taller** (`hoy_taller(sede)`, con la zona
de la sede: `America/New_York` por defecto). Hasta el 05/10/2026 se fechaban con la fecha de
la base (UTC): un cobro después de las 8 p. m. de Maryland caía al día siguiente, y el
último día del mes, en el mes siguiente. Los movimientos a mano llevan la fecha que se
elige, y un movimiento del día 1 cuenta en ese mes.

---

## 3. Qué puede hacer cada rol

Tres roles: **admin**, **mecánico** y **pintor**. Mecánico y pintor tienen los
mismos permisos ("técnico"); cambia el tipo de tarea.

### Datos generales

| | Admin | Técnico |
|---|:---:|:---:|
| Ver clientes y vehículos | ✅ (todas las sedes) | Solo los de sus órdenes, dentro de la orden ² |
| Crear y editar clientes y vehículos | ✅ | ❌ ² |
| Abrir una orden o asignar a alguien | ✅ | ❌ |
| **Eliminar** clientes, vehículos u órdenes | ✅ | ❌ |
| Cambiar de sede activa | ✅ | ❌ |
| Finanzas, Comisiones y Empleados (esquema de pago de cada quien) | ✅ | ❌ (ve su propio esquema) |
| Configuración: perfil, idioma, tema, push | ✅ | ✅ |
| Configuración: sedes | ✅ | ❌ |
| Empleados: alta, edición y baja del personal, y cómo se le paga a cada quien | ✅ | ❌ |
| Cambiar el rol o la sede de una persona | ✅ (de cualquiera) | ❌ (ni el propio) |
| Editar correo y WhatsApp de contacto de la sede | ✅ | ❌ |

### En una orden

| | Admin | Técnico asignado | Técnico no asignado |
|---|:---:|:---:|:---:|
| Ver la orden | ✅ | ✅ | ❌ (no le aparece) ² |
| Ver **mano de obra** (montos) | ✅ | ✅ | ❌ |
| Ver **repuestos con precio**, totales y depósito | ✅ | ❌ | ❌ |
| Ver qué repuestos lleva (sin precio) | ✅ | ✅ | ❌ |
| Ver **su comisión estimada** | — | ✅ | ❌ |
| Agregar / editar mano de obra o repuestos | ✅ | ❌ | ❌ |
| Ver y escribir el **costo** de un repuesto | ✅ | ❌ | ❌ |
| Marcar un repuesto **pedido / llegó** | ✅ | ❌ (ve si se pidió y si llegó) | ❌ |
| **Aplicar un descuento** (en $ o en %) o **registrar un anticipo** | ✅ | ❌ | ❌ |
| Ver lo **pendiente de visitas anteriores** del vehículo | ✅ | ❌ | ❌ |
| **Asignar el técnico** de una tarea, o cambiar su tipo (en cualquier estado de la línea, salvo con la comisión pagada) | ✅ | ❌ | ❌ |
| Ver el tipo y el técnico de cada tarea | ✅ | ✅ | ❌ |
| **Marcar una tarea hecha** (solo autorizadas) | ✅ todas | ✅ las suyas y las que no tienen técnico | ❌ |
| Registrar depósito | ✅ | ❌ | ❌ |
| Cambiar estado (excepto a o desde Entregado) | ✅ | ✅ | ❌ |
| Marcar **Entregado** o **Retirada sin reparar** | ✅ | ❌ | ❌ |
| Mover el avance | ✅ | ✅ (orden no cerrada ¹) | ❌ |
| Capturar la firma del cliente ³ | ✅ | ❌ (la ve) | ❌ |
| Volver a firmar (la nueva firma **no** autoriza nada) | ✅ (en recepción) | ❌ | ❌ |
| Subir fotos, videos y notas de voz | ✅ | ✅ (orden no entregada) | ❌ |
| **Publicar** multimedia al cliente | ✅ | ❌ | ❌ |
| Borrar un archivo | ✅ cualquiera | ✅ los suyos, orden no entregada | ❌ |
| Agregar avances | ✅ | ✅ (orden no entregada) | ❌ |
| Borrar avances | ✅ cualquiera | ✅ los suyos, orden no entregada | ❌ |
| Asignar a otras personas (solo personal de la sede de la orden) | ✅ | ❌ | ❌ |
| Quitar de la orden a alguien **con tareas** en ella | ❌ (primero se reasignan sus tareas) | ❌ | ❌ |
| Meter o sacar a alguien del **reparto heredado** (origen de su asignación), salvo con esa bolsa pagada | ✅ | ❌ | ❌ |
| Editar una asignación (tipo de tarea, origen) | ✅ | ❌ | ❌ |
| **Enviar el reporte** al cliente (correo, WhatsApp, copiar enlace) | ✅ | ❌ | ❌ |
| Descargar el PDF de la orden (en español o en inglés) | ✅ | ❌ | ❌ |
| Ver, crear, cambiar o desactivar el **enlace del cliente** | ✅ | ❌ | ❌ |
| **Avisar novedades** al cliente por correo | ✅ | ❌ | ❌ |
| Ver el **estado de cada línea** (sin autorizar, esperando, autorizada, no realizar) | ✅ | ✅ | ❌ |
| **Enviar presupuesto**, **registrar autorización**, cancelar presupuesto | ✅ | ❌ | ❌ |
| Cambiar el estado de una línea con un UPDATE directo | ❌ | ❌ | ❌ |
| Mover su tarjeta en el Kanban | ✅ todas | ✅ (excepto a o desde Entregado) | ❌ |

**Toda esta tabla la impone la base de datos** (migración `20260922000000`), con
una sola diferencia: ¹ en una orden **Finalizada** la interfaz bloquea el avance
(queda en 100 %), pero la base lo permite mientras la orden no esté entregada.

² **Cada técnico ve solo su trabajo** (acordado con el taller en septiembre de 2026,
migración `20261007000000`): la base le entrega únicamente las órdenes donde está
asignado, y de ellas su mano de obra, avances, archivos, compañeros de equipo, cliente y
vehículo. Las de sus compañeros no le aparecen ni pidiéndolas por su id, y sus fotos
tampoco se pueden descargar por la ruta. Clientes y Vehículos salen de su menú; los ve
dentro de sus órdenes, sin poder crearlos ni editarlos.

³ **La firma de recepción la toma administración** (migración `20261006000000`): es el
respaldo de cómo se recibió el vehículo, y el técnico podía capturarla en cualquier estado.
Desde `20261010000022` la firma ya no aprueba lo cotizado.

De una orden, un técnico asignado solo puede cambiar **estado (con su motivo al pedir
autorización), fecha de finalización y avance**. Cliente, vehículo, millas, gasolina, notas de
recepción, fechas y creador solo los cambia un admin. La regla se comprueba
contra la fila completa, así que una columna nueva queda protegida sin tocar el
trigger (`trg_order_technician_guard`). Ni un avance, ni una asignación, ni una línea de
mano de obra pueden moverse a otra orden (ni la asignación a otra persona), ni siquiera por
un admin: se borran y se crean de nuevo.

Las filas de tareas, asignar técnico, marcar hecha y el reparto heredado las impone la
base desde la comisión por tarea (migración `20261010000006`): asignar es una política solo
admin y `trg_labor_tecnico_guard` exige que el técnico sea mecánico o pintor de la sede de la
orden; `marcar_labor_completada` rechaza la tarea de otro técnico; quitar de la orden a alguien
con tareas lo rechaza `trg_assignment_tasks_guard` (salvo al borrar la orden o al empleado).

> **Por qué el técnico ve la mano de obra y nada más:** su comisión es un
> porcentaje de la mano de obra. Ver ese número y la cuenta de su comisión le
> permite entender su pago sin exponer precios de repuestos, totales ni cobros.

---

## 4. Comisiones

Resumen; el detalle está en [comisiones.md](comisiones.md).

**Por tarea** desde el 03/10/2026 (fase F3, migración `20261010000006`): cada línea de mano
de obra tiene su técnico y su comisión es de él.

```
tarea con técnico      = costo de la línea × su porcentaje   (el suyo, o el de la sede: 35 % por defecto)
tarea sin técnico      = nadie la cobra (la orden lo avisa en Resumen y al entregar)
línea de antes de F3   = reparto por especialidad: bolsa ÷ asignados a mano con esa tarea × su porcentaje
```

- **Toda línea nueva es una tarea** (`reparto_heredado = false`), con o sin técnico. El
  técnico lo asigna administración, al agregarla o en su fila, en cualquier estado de la
  línea y sin tocar lo cotizado; tiene que ser mecánico o pintor de la sede de la orden. Un
  tipo que no es de su oficio pregunta antes.
- Quien recibe una tarea **entra solo a la orden** (`origen = 'tarea'`) y **no entra** al
  reparto de las líneas heredadas. Reasignarla no lo saca de la orden.
- **Líneas de antes** (`reparto_heredado = true`): el reparto por especialidad de septiembre
  (`20261009000000`), solo entre los asignados a mano (`origen = 'manual'`). Administración
  mete o saca a alguien de ese reparto desde la tarjeta de técnicos. Darle técnico a una de
  esas líneas la saca del reparto para siempre (decisión pendiente de confirmar,
  [pagos-a-empleados.md](pagos-a-empleados.md#5-preguntas-enviadas-al-taller)).
- **A salario** no se cobra comisión: ni por sus tareas ni por su parte de una bolsa.
  **Mixto** (desde `20261010000020`, pedido del taller del 05/10/2026): salario **y** comisión.
  La comisión de sus tareas se calcula, se acepta y se paga como la de quien va solo por
  comisión (con su porcentaje o el de la sede); el salario es **informativo**, como el de
  "Salario": no se paga ni se asienta desde la app.
- Se generan **al entregar**, **sugeridas**. Se recalculan si cambia una línea (autorización,
  precio, técnico, especialidad, reparto), el equipo asignado, el porcentaje de la sede o el
  esquema de un empleado — **solo lo sugerido**; lo aceptado conserva su monto y lo pagado no
  se toca. Pasar a alguien a salario le quita lo pendiente (la pantalla avisa con el monto).
  Una **retirada sin reparar** solo genera las de las tareas que se cobraron como hechas.
- **Administración las acepta** (tal cual, o con otro porcentaje o monto) y **solo se paga lo
  aceptado** (`pay_commissions`, desde el 05/10/2026). Se aceptan **en bloque** desde
  Comisiones ("Aceptar todas"), o una por una ahí o en la tarjeta de la orden. El técnico ve
  el monto cuando se acepta y recibe un aviso por orden.
- **El descuento no las toca**: sale de la mano de obra, y el descuento lo absorbe el taller.
- **Lo pagado bloquea la línea:** con la comisión pagada no se le cambia el técnico ni la
  especialidad ni se borra (tampoco a una línea heredada de una bolsa pagada), una línea no
  entra a una bolsa ya pagada y no se cambia quién reparte una bolsa pagada. Primero se
  deshace el pago en Comisiones.
- El reparto de una bolsa heredada se hace en centavos exactos: tres al mismo porcentaje
  sobre $1,000 al 35 % = $116.67 + $116.67 + $116.66.
- El esquema de pago (`perfiles_pago`) es de administración; cada técnico ve el suyo, y de
  la estimación de la orden solo lo suyo.
- Al pagar, el monto lo calcula el servidor. Un pago mezcla comisiones de una sola
  sede.
- Cheque: se pide número o foto del comprobante (en la interfaz).

---

## 5. Multimedia de la orden

| Tipo | Límite | Formato guardado |
|---|---|---|
| Foto | — | JPEG, 1920 px en el lado largo, sin datos de ubicación, con miniatura de 480 px |
| Video | **2 minutos** | MP4 H.264 720p ~1.5 Mbps (WebM en navegadores que no graban MP4) |
| Nota de voz | **2 minutos** | AAC/MP4 (u Opus/WebM) ~48 kbps |
| Cualquier archivo | 50 MB | — |

### Visibilidad para el cliente

- Las fotos y los videos de la **recepción** nacen **visibles** para el cliente: es
  lo que el cliente firma al dejar el vehículo.
- Una **nota de voz** de la recepción nace **interna** (migración `20261010000003`):
  es el taller hablando, y la publica un admin si quiere que el cliente la oiga.
- Lo de un **avance** sigue al avance: interno, salvo que el técnico muestre ese
  avance al cliente (`20260930000001`). Lo que pida quien sube el archivo se ignora.
- **Solo un admin** cambia la visibilidad de un archivo.
- El portal del cliente muestra **solo lo visible** (sección 7).

### Dónde se puede subir

- Solo a una orden en la que la persona está asignada (o si es admin).
- No a una orden entregada (salvo admin).
- La fila de un archivo solo puede apuntar a la carpeta de su propia orden.
- En una orden entregada, solo un admin borra archivos: ni la fila ni el archivo en
  Storage.

---

## 6. Notificaciones

### Quién recibe qué

| Evento | Recibe | Texto |
|---|---|---|
| Te asignan a una orden a mano (al crearla o después) | El técnico | "Nueva orden asignada · ORD-…". **No** cuando entra a la orden por una tarea: ya recibió "Nueva tarea" |
| Te dan una tarea (al agregarla o al cambiarle el técnico) | El técnico | "Nueva tarea · ORD-…" con la tarea y el vehículo |
| Te quitan una tarea (se la asignan a otra persona o queda sin técnico) | El técnico de antes | "Tarea reasignada · ORD-…: … ya no está a tu cargo" |
| Un **técnico** marca hecha una tarea (la primera vez) | Admins de la sede | "Tarea hecha · ORD-…" con quién y qué |
| Te quitan de una orden | El técnico | "Ya no estás asignado · ORD-…" |
| ~~Un **técnico** registra una recepción~~ | Admins de la sede | "Recepción registrada · ORD-… Falta cotizar." **Ya no ocurre:** abrir una orden es de administración (20261004000000), así que `trg_order_created_notify` quedó sin caso. El trigger se deja como red |
| Un **técnico** agrega un avance | Admins de la sede | "Nuevo avance · ORD-…" con su nota |
| Una orden pasa a **Finalizado** | Admins de la sede | "Trabajo terminado · ORD-…": revísala y márcala lista para entregar |
| Se genera tu comisión (al entregar) | El técnico | "Comisión generada · ORD-… $175.00": **uno** por orden y persona, con la suma de sus tareas y su parte de las bolsas |
| Se responde un presupuesto (cliente, admin o firma de recepción) | Técnicos asignados | "Trabajos autorizados · ORD-…" / "Presupuesto rechazado · ORD-…" con "Autorizado: … No realizar: …" |
| El **cliente** responde un presupuesto desde su enlace | Admins de la sede | "El cliente respondió el presupuesto · ORD-… Autorizó 2 de 3 ($450.00)" y su comentario |
| Un presupuesto lleva **más de 24 horas** sin respuesta | Admins de la sede | "Presupuesto sin respuesta · ORD-…" (una vez al día, 15:00 UTC) |

### Reglas

- **Nadie recibe aviso de lo que hizo él mismo.**
- **"Admins de la sede"** = los admins cuya sede es la de la orden; si esa sede no
  tiene ninguno, todos los admins. Cubre un encargado por taller o un dueño que
  administra los dos.
- Un avance genera **un** aviso, no uno por archivo.
- Cada aviso se ve en la **campana** (en tiempo real, con toast si la app está
  abierta) y, si la persona activó push en algún dispositivo, llega también como
  **notificación al teléfono** aunque la app esté cerrada.
- Cada quien ve solo sus avisos. De un aviso solo se puede cambiar si está leído.
- **Push es por dispositivo**, no por cuenta. En una tablet compartida, el
  dispositivo recibe los avisos de quien inició sesión por última vez; al cerrar
  sesión deja de recibir los de esa persona.
- En **iPhone**, push solo funciona con la app agregada a la pantalla de inicio.

---

## 7. Portal del cliente y correos

Detalle técnico: [portal-y-correos.md](portal-y-correos.md).

### El enlace

- Cada orden tiene **un enlace personal activo** (`restorifyauto.net/r/<token>`). El
  cliente no crea cuenta.
- **Nace al firmar la recepción.** Un admin también puede crearlo antes.
- Solo un **admin** lo ve, lo copia, lo manda por WhatsApp, lo cambia (el anterior
  deja de abrir) o lo desactiva.
- **Vence 90 días después de entregar** la orden. Mientras el vehículo está en el
  taller no vence. Sacar la orden de Entregado quita el vencimiento.
- Un enlace vencido o desactivado muestra el teléfono del taller.

### Qué ve el cliente

| Ve | No ve |
|---|---|
| Estado, avance y fecha estimada; "Retirado sin reparar" si se cerró así | Técnicos asignados, comisiones |
| Las piezas que se pidieron y no han llegado (solo el nombre) | Proveedor, costo |
| Vehículo (placa, color, últimos 6 del VIN) | VIN completo |
| Recepción: fecha, millaje, gasolina, observaciones, fotos visibles, firma | Archivos internos (no publicados) |
| Fotos, videos y notas de voz de avances **publicados** | El texto de los avances (notas del técnico) |
| Mano de obra y repuestos **autorizados** a precio de venta, subtotal y descuento, total, depósito, otros pagos (o lo devuelto), saldo (o saldo a su favor) | Costo de repuestos para el taller, motivo del descuento |
| El presupuesto que espera su respuesta, línea por línea | La evidencia completa (IP, navegador, nota del admin) |
| Lo que no autorizó (tachado, no se cobra) y su historial de respuestas | Borradores que el admin no ha enviado |
| Contacto del taller | Datos de otras órdenes o clientes |

Lo **pagado** es la suma con signo de los movimientos "pago de cliente" de la orden
(depósito, pago final, ajustes y reversiones), **sin lo importado del banco**; el **saldo**
es total − pagado, **con signo**: negativo es saldo a favor del cliente. El enlace ya no
pone el depósito también dentro de "Pagado" (se leía como si hubiera pagado dos veces): muestra
el depósito y, aparte, lo cobrado después (`otros_pagos`, o lo devuelto si es negativo).

### Correos automáticos

| Aviso | Cuándo | Espera |
|---|---|---|
| **Recepción** | La primera vez que se firma la recepción | Inmediato si la orden ya tiene una foto de recepción; si no, 30 segundos |
| **Cambio de estado** | Pasa a en proceso, finalizado ("listo para recoger") o entregado. Espera de autorización no se anuncia: el cliente se entera con el presupuesto | 3 minutos (una ráfaga de cambios es un solo correo, con la hora del primero) |
| **Novedades** | Un admin pulsa "Avisar novedades" (después de publicar fotos o videos) | 1 minuto |
| **Presupuesto** | Un admin pulsa "Enviar presupuesto" | 1 minuto (agrupa si se envía de nuevo) |
| **Constancia de respuesta** | Se responde un presupuesto desde el enlace o lo registra un admin | Inmediato |
| **Reporte** | Un admin pulsa "Enviar reporte → Enviar por correo" | 1 minuto (dos toques seguidos son un correo) |

- Solo si el cliente tiene un **correo válido** y **no se dio de baja**.
- Cambios de estado dentro de la espera se **agrupan** en un solo correo con el
  último estado. Un estado que el cliente ya recibió **no se repite**.
- Volver a firmar **no** reenvía el aviso de recepción.
- Si el cliente corrige su correo o se da de baja mientras un aviso espera, se
  respeta lo nuevo.
- Remitente: el nombre del taller. Si la sede tiene correo de contacto, las
  respuestas del cliente llegan ahí.

### Baja

- Desde su enlace, con un **botón**. El enlace "No quiero recibir estos correos"
  del pie abre la página y pide confirmar: nunca da de baja solo.
- La baja cancela los correos pendientes. El cliente puede volver a activarlos.
- En la ficha del cliente, el taller ve y puede cambiar "Recibe avisos por correo".

### El reporte

- **El reporte de la orden es el enlace del cliente.** Siempre muestra lo actual:
  estado, fotos y videos publicados, cuenta. No hay un PDF que quede desactualizado.
- Solo un **admin** lo envía: por correo desde el sistema, por WhatsApp o copiando el
  enlace. Un técnico no puede mandar nada al cliente.
- **Enviar por correo** necesita un correo válido y que el cliente no se haya dado de
  baja; si no, el taller usa WhatsApp.
- El **PDF** existe solo para descargar (imprimir, archivar) y muestra lo mismo que el
  enlace: fotos publicadas, líneas autorizadas, el enlace; sin notas internas ni
  técnicos. Sale **en español o en inglés**, como lo elija administración; en inglés, lo que
  escribió el taller sale con la traducción automática si ya la hay. El descuento, lo
  recibido y el saldo son los de la base (`saldo_orden`).
- Ya no se suben PDFs al almacenamiento.

---

## 8. Presupuestos y autorización

Detalle técnico: [presupuestos.md](presupuestos.md).

### La regla

**Lo que el cliente no autoriza no se hace ni se cobra.** Cada línea de mano de obra
o repuesto tiene un estado:

| Estado | Significa | Se cobra | Se edita |
|---|---|---|---|
| **Sin autorizar** (borrador) | Un admin la agregó | No | Sí |
| **Esperando al cliente** (pendiente) | Está en un presupuesto enviado | No | No |
| **Autorizada** | El cliente la autorizó | Sí | Sí (admin) |
| **No realizar** (rechazada) | El cliente no la autorizó | No | Sí: al corregirla vuelve a "sin autorizar" |

Las líneas anteriores a los presupuestos quedaron autorizadas.

### Cómo se autoriza

1. **Firma de recepción**: lo cotizado antes de la firma queda autorizado ("lo que
   firmó, lo aprobó"), salvo que ya hubiera un presupuesto enviado. **Solo la primera
   firma de la orden autoriza.** Si se limpia la firma y se vuelve a firmar (por
   ejemplo, porque salió mal), lo agregado después de la recepción sigue sin
   autorizar: se presenta con un presupuesto o se registra la autorización.
2. **Desde su enlace**: el admin pulsa **Enviar presupuesto**; el cliente marca línea
   por línea, escribe su nombre y confirma. Se guardan su nombre, su comentario, la
   IP y el navegador. Nada viene marcado.
3. **Registrada por el admin**: el cliente respondió **por teléfono, en persona o por
   WhatsApp**. El admin marca lo autorizado en "Trabajos autorizados por el cliente";
   se guarda quién autorizó, quién lo registró y una nota.

En los tres casos queda un registro en la tabla de presupuestos, y lo no marcado
queda **rechazado**.

### Reglas del presupuesto

- **Uno abierto por orden.** Enviar de nuevo con líneas nuevas las suma al abierto;
  el cliente recibe un solo correo.
- **Si el presupuesto cambió** mientras el cliente lo revisaba, su respuesta no se
  guarda y se le pide revisarlo de nuevo: nunca se rechaza algo que no vio.
- **Un presupuesto se responde una vez.** Para cambiar de opinión, el admin corrige
  la línea (vuelve a "sin autorizar") y la presenta de nuevo.
- **Cancelar** devuelve lo pendiente a "sin autorizar".
- **No se entrega** una orden con un presupuesto esperando respuesta.
- Autorizar algo **después de entregar** asienta el ajuste en Finanzas y recalcula
  las comisiones pendientes, como cualquier corrección.

---

## 9. Retención y limpieza

Tareas automáticas diarias (09:00 UTC):

| Qué | Se borra |
|---|---|
| Avisos leídos | a los 60 días |
| Cualquier aviso | a los 180 días |
| Envíos terminados (push y correos enviados u omitidos) | a los 90 días |
| Enlaces del cliente | con su orden |
| Archivos de Storage de órdenes que ya no existen | a partir de 7 días |
| Archivos sin fila en `orden_media` (subidas a medias) | a partir de 7 días, excepto firmas |

Las firmas anteriores de una orden se conservan como historial aunque se vuelva a
firmar.

---

## 10. Riesgos conocidos y decisiones abiertas

Cosas que hoy funcionan así a propósito o por falta de decisión. Conviene
resolverlas con el cliente.

1. **Un admin puede borrar movimientos automáticos de Finanzas.** Borrar un "Pago
   final" o un "Costo de repuestos" deja la orden descuadrada para cálculos
   posteriores (re-entrega, reversión, ajustes). *Propuesta:* permitir borrar solo
   movimientos manuales o importados, y corregir los automáticos con ajustes.
2. **No hay orden obligatorio entre estados.** Se puede saltar de Recepción a
   Finalizado. Solo Entregado está restringido.
3. **Recalcular comisiones con una parte ya pagada puede pagar de más.** Si se
   agrega un técnico a una orden entregada después de pagarle a uno, los
   pendientes se recalculan sobre la bolsa completa. Es el efecto de "lo pagado es
   historia"; la suma pagada puede superar la bolsa. *Propuesta:* ajustes que se
   liquidan en el siguiente pago ([pagos-a-empleados.md](pagos-a-empleados.md)).
4. **Videos WebM** (grabados en Chrome antiguo o Firefox) pueden no reproducirse en
   un iPhone antiguo.
5. **La hora de las notificaciones push depende de la entrega del navegador**
   (Apple/Google). Normalmente segundos; no está garantizada.
6. **Un enlace reenviado lo abre cualquiera.** Quien tenga el enlace ve la cuenta y
   las fotos de esa orden. El taller puede cambiarlo y el anterior deja de abrir.
   Es el estándar para este flujo.
7. **Los correos salen solo en español.** El portal tiene inglés; los correos no.
8. **Límite diario de Resend (plan gratuito): 100 correos.** Con el volumen actual
   (~30 al día) sobra; si se supera, los envíos se reintentan y los que no alcancen
   quedan en error en el historial de la orden.
9. **La firma de recepción autoriza lo cotizado sin mostrarlo en la tableta.** La
   pantalla de firma no lista las líneas: se confía en que el admin las repasó con el
   cliente. *Propuesta:* mostrar el resumen de trabajos junto a la firma.
10. **La autorización desde el enlace es nombre escrito + IP + navegador**, no una
    firma. Es el estándar para este flujo; si el taller necesita más, se puede pedir
    firma también ahí. La IP guardada es la primera de la cabecera `X-Forwarded-For`,
    que quien envía la petición puede escribir: sirve de apoyo, no de prueba.
11. **Resuelto (29/09/2026): PDFs viejos en el almacenamiento.** Los buckets se
    vaciaron con la limpieza del proyecto.
12. **Resuelto (reunión con el taller): depósito mayor que lo autorizado.** Al entregar
    se registra la devolución al cliente con su método (`entregar_orden`).
13. **Resuelto: órdenes sin paginar.** La lista excluye las entregadas de más de 90 días
    y las archivadas; el archivo se pide paginado.
14. **El pago a empleados tiene ambigüedades** (lo ganado se recalcula al cambiar un
    porcentaje, pasar a salario borra lo pendiente, sin períodos ni recibos). Propuesta y
    preguntas al taller en [pagos-a-empleados.md](pagos-a-empleados.md).
15. **El correo de "Entregado" espera 3 minutos** como cualquier cambio de estado, para
    agrupar ráfagas. *Decisión pendiente:* si la entrega debe avisar al instante.
