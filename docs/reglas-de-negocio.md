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
Recepción ──► En proceso ──► Espera de repuestos ──► Finalizado ──► Entregado
     ▲______________________________________________________________│
                    (se puede volver atrás; ver "Des-entregar")
```

| Estado | Significa | Efectos automáticos al entrar |
|---|---|---|
| **Recepción** | El vehículo ingresó; no se trabaja todavía | — |
| **En proceso** | Se está trabajando | — |
| **Espera de repuestos** | Detenida esperando piezas | Aparece en alertas del panel |
| **Finalizado** | Trabajo terminado | Avance al 100 %, fecha de finalización, **aviso a admins: "Lista para entregar"** |
| **Entregado** | El cliente se llevó el vehículo y pagó | Avance 100 %, **cobro del saldo, costo de repuestos, comisiones** (sección 2 y 4) |

**No hay una máquina de estados rígida**: se puede pasar de cualquier estado a
cualquier otro, con dos restricciones:

- **Solo un admin puede marcar Entregado.** Entregar asienta el ingreso y devenga
  comisiones; un técnico asignado podía hacerlo y acreditarse su propia comisión.
- **Sacar una orden de Entregado** (una entrega marcada por error) revierte el
  dinero: ver [Des-entregar](#des-entregar).

Al reabrir una orden cerrada se borra su fecha de finalización; el porcentaje de
avance se conserva y el técnico puede corregirlo.

### Alta de una orden

- La crea cualquier persona de la sede. Si la crea un **técnico**, queda asignado a
  sí mismo y **no registra depósito, mano de obra ni repuestos**: registra la
  recepción (cliente, vehículo, fotos, notas, gasolina, millas) y un admin cotiza
  después. Si el técnico enviara esos campos igual, la base los ignora. Tampoco puede
  crear por la API una orden ya avanzada: la base la deja en recepción, con avance
  0, sin firma, con el número del sistema y con él como autor.
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
| Se fija un depósito al crear la orden | **Ingreso** "Depósito inicial" | pago_cliente |
| Un admin corrige el depósito antes de entregar | Ingreso o egreso "Ajuste de depósito" por la diferencia | pago_cliente |
| Se **entrega** la orden | **Ingreso** "Pago final" = total − lo ya cobrado, **con su método** (efectivo, cheque o transferencia), número de cheque y comprobante | pago_cliente |
| Se **entrega** una orden cuyo depósito **supera** el total | **Egreso** "Devolución al cliente" por la diferencia, con su método | pago_cliente |
| Se **entrega** la orden | **Egreso** "Costo de repuestos" | compra_repuesto |
| Cambia el total de una orden **ya entregada** | Ingreso "Ajuste por cargo adicional" o egreso "Reembolso por ajuste" por la diferencia | pago_cliente |
| Cambian los repuestos de una orden ya entregada | Egreso o ingreso de ajuste por la diferencia de costo | compra_repuesto |
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
  total = mano de obra + repuestos. El costo de repuestos al entregar también cuenta
  solo lo aprobado. Nadie puede
  escribir un total a mano, ni siquiera un admin por la API.
- **Los repuestos son de traspaso**: el costo es igual al precio. El taller no gana
  en las piezas; su ganancia es la mano de obra.
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

- Todo o nada: el lote y sus movimientos se guardan juntos. Si algo falla, no queda un lote a
  medias y el mismo archivo se puede volver a importar.
- Los totales del panel y de Finanzas los suma la base con **todos** los movimientos de la
  sede, sin importar cuántos haya.

### Fechas

Las fechas de los movimientos son la fecha **local** del taller. Un movimiento del
día 1 cuenta en ese mes, no en el anterior (antes pasaba en zonas al oeste de UTC).

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
| **Asignar el técnico** de una tarea, o cambiar su tipo (en cualquier estado de la línea, salvo con la comisión pagada) | ✅ | ❌ | ❌ |
| Ver el tipo y el técnico de cada tarea | ✅ | ✅ | ❌ |
| **Marcar una tarea hecha** (solo autorizadas) | ✅ todas | ✅ las suyas y las que no tienen técnico | ❌ |
| Registrar depósito | ✅ | ❌ | ❌ |
| Cambiar estado (excepto a o desde Entregado) | ✅ | ✅ | ❌ |
| Marcar **Entregado** | ✅ | ❌ | ❌ |
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
| Descargar el PDF de la orden | ✅ | ❌ | ❌ |
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

³ **La firma de recepción la toma administración** (migración `20261006000000`): la
primera firma aprueba lo cotizado, y el técnico podía capturarla en cualquier estado.

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
- Se generan **al entregar**. Se recalculan si cambia una línea (autorización, precio,
  técnico, especialidad, reparto), el equipo asignado, el porcentaje de la sede o el esquema
  de un empleado — **solo lo pendiente**; lo pagado no se toca. Pasar a alguien a salario le
  quita lo pendiente (la pantalla avisa con el monto).
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
| Una orden pasa a **Finalizado** | Admins de la sede | "Lista para entregar · ORD-…" |
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
| Estado, avance y fecha estimada | Técnicos asignados, comisiones |
| Vehículo (placa, color, últimos 6 del VIN) | VIN completo |
| Recepción: fecha, millaje, gasolina, observaciones, fotos visibles, firma | Archivos internos (no publicados) |
| Fotos, videos y notas de voz de avances **publicados** | El texto de los avances (notas del técnico) |
| Mano de obra y repuestos **autorizados** a precio de venta, total, depósito, pagado, saldo | Costo de repuestos para el taller |
| El presupuesto que espera su respuesta, línea por línea | La evidencia completa (IP, navegador, nota del admin) |
| Lo que no autorizó (tachado, no se cobra) y su historial de respuestas | Borradores que el admin no ha enviado |
| Contacto del taller | Datos de otras órdenes o clientes |

Lo **pagado** es la suma con signo de los movimientos "pago de cliente" de la orden
(depósito, pago final, ajustes y reversiones); el **saldo** es total − pagado.

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
  técnicos. Si la orden está entregada, el saldo es 0.
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
