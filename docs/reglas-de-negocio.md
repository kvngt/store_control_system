# Reglas de negocio

Qué hace Restorify y por qué, en lenguaje de negocio. Es la referencia para
decidir si algo que pasó es un error o el comportamiento esperado, y para
escribir las pruebas ([pruebas.md](pruebas.md)).

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
7. [Retención y limpieza](#7-retención-y-limpieza)
8. [Riesgos conocidos y decisiones abiertas](#8-riesgos-conocidos-y-decisiones-abiertas)

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
  después. Si el técnico enviara esos campos igual, la base los ignora.
- El número `ORD-AAAA-###` se genera de forma atómica: dos órdenes simultáneas
  nunca reciben el mismo.
- La orden y sus líneas se crean en **una sola transacción**: o entra todo, o nada.
- Las fotos de recepción **no** son parte de esa transacción: entran a la cola de
  subida y suben en segundo plano. Si una falla, la orden ya existe y la foto se
  reintenta sola; reintentar el formulario no duplica la orden.
- Las millas no pueden ser negativas (restricción en la base).

### Orden entregada

Una orden entregada queda **cerrada para los técnicos**: no pueden modificar su
mano de obra, repuestos ni asignaciones, ni subir archivos, ni cambiar su estado
(tampoco sacarla de Entregado, que revertiría el cobro y sus comisiones), ni
agregar o borrar avances.
Un admin sí puede corregirla; cada corrección de dinero se asienta como un ajuste
(sección 2), no reescribiendo lo anterior.

### Borrar una orden

Solo admin. Se borran sus líneas, asignaciones, avances, multimedia (filas y
archivos en Storage), comisiones y los movimientos **automáticos** de Finanzas.
Los movimientos importados del banco se conservan: ese dinero sí pasó por la
cuenta.

---

## 2. El dinero que se asienta solo

Nadie registra a mano el dinero de una orden. Estos movimientos los crea la base:

| Cuándo | Movimiento en Finanzas | Categoría |
|---|---|---|
| Se fija un depósito al crear la orden | **Ingreso** "Depósito inicial" | pago_cliente |
| Un admin corrige el depósito antes de entregar | Ingreso o egreso "Ajuste de depósito" por la diferencia | pago_cliente |
| Se **entrega** la orden | **Ingreso** "Pago final" = total − lo ya cobrado | pago_cliente |
| Se **entrega** la orden | **Egreso** "Costo de repuestos" | compra_repuesto |
| Cambia el total de una orden **ya entregada** | Ingreso "Ajuste por cargo adicional" o egreso "Reembolso por ajuste" por la diferencia | pago_cliente |
| Cambian los repuestos de una orden ya entregada | Egreso o ingreso de ajuste por la diferencia de costo | compra_repuesto |
| Se **saca de Entregado** | Egreso "Reversión de entrega" y ingreso "Reversión de costo de repuestos" | pago_cliente / compra_repuesto |
| Un admin **paga comisiones** | **Egreso** "Pago de comisiones – nombre" | planilla |
| Se **deshace** un pago de comisiones | Se elimina **ese** egreso (y solo ese) | — |

### Reglas que sostienen los números

- **Todo es con signo e idempotente.** Cada cálculo compara "lo que debería haber"
  contra "lo que ya está asentado" y registra solo la diferencia. Repetir un
  cambio no duplica dinero.
- **Lo cobrado se cuenta con signo** (ingresos menos egresos de `pago_cliente`).
  Así, entregar → des-entregar → volver a entregar deja lo cobrado en el total.
- **El depósito no se puede cambiar en una orden entregada**: esa orden ya cobró
  su total, y la reversión usa el depósito como el monto al que volver.
- **Los totales los calcula el sistema.** Mano de obra = suma de sus líneas;
  repuestos = cantidad × precio; total = mano de obra + repuestos. Nadie puede
  escribir un total a mano, ni siquiera un admin por la API.
- **Los repuestos son de traspaso**: el costo es igual al precio. El taller no gana
  en las piezas; su ganancia es la mano de obra.
- **Negativos no.** Mano de obra, precios y depósito no aceptan valores negativos
  (formulario y base).

### Des-entregar

Sacar una orden de Entregado deja la contabilidad como si nunca se hubiera
entregado:

- Lo cobrado al cliente vuelve al depósito (se asienta la reversión del pago final).
- Se revierte el costo de repuestos.
- Se eliminan las comisiones **pendientes**. Las **ya pagadas** se conservan: ese
  cheque existe.
- Lo conciliado contra el banco (movimientos importados) no se revierte.

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
| Ver clientes y vehículos de su sede | ✅ (todas las sedes) | ✅ |
| Crear y editar clientes y vehículos | ✅ | ✅ |
| **Eliminar** clientes, vehículos u órdenes | ✅ | ❌ |
| Cambiar de sede activa | ✅ | ❌ |
| Finanzas y Comisiones | ✅ | ❌ |
| Configuración: perfil, idioma, tema, push | ✅ | ✅ |
| Configuración: sedes y personal | ✅ | ❌ |
| Cambiar el rol o la sede de una persona | ✅ (de cualquiera) | ❌ (ni el propio) |

### En una orden

| | Admin | Técnico asignado | Técnico no asignado |
|---|:---:|:---:|:---:|
| Ver la orden | ✅ | ✅ | ✅ (solo lectura) |
| Ver **mano de obra** (montos) | ✅ | ✅ | ✅ |
| Ver **repuestos con precio**, totales y depósito | ✅ | ❌ | ❌ |
| Ver qué repuestos lleva (sin precio) | ✅ | ✅ | ✅ |
| Ver **su comisión estimada** | — | ✅ | ❌ |
| Agregar / editar mano de obra o repuestos | ✅ | ❌ | ❌ |
| Registrar depósito | ✅ | ❌ | ❌ |
| Cambiar estado (excepto a o desde Entregado) | ✅ | ✅ | ❌ |
| Marcar **Entregado** | ✅ | ❌ | ❌ |
| Mover el avance | ✅ | ✅ (orden no cerrada ¹) | ❌ |
| Capturar la firma del cliente | ✅ | ✅ (orden no entregada) | ❌ |
| Subir fotos, videos y notas de voz | ✅ | ✅ (orden no entregada) | ❌ |
| **Publicar** multimedia al cliente | ✅ | ❌ | ❌ |
| Borrar un archivo | ✅ cualquiera | ✅ los suyos, orden no entregada | ❌ |
| Agregar avances | ✅ | ✅ (orden no entregada) | ❌ |
| Borrar avances | ✅ cualquiera | ✅ los suyos, orden no entregada | ❌ |
| Asignar a otras personas | ✅ | ❌ | ❌ |
| Unirse a la orden | — | — | ✅ si no está entregada |
| Generar y compartir el reporte | ✅ | ❌ | ❌ |
| Mover su tarjeta en el Kanban | ✅ todas | ✅ (excepto a o desde Entregado) | ❌ |

**Toda esta tabla la impone la base de datos** (migración `20260922000000`), con
una sola diferencia: ¹ en una orden **Finalizada** la interfaz bloquea el avance
(queda en 100 %), pero la base lo permite mientras la orden no esté entregada.

De una orden, un técnico asignado solo puede cambiar **estado, fecha de
finalización, avance y firma**. Cliente, vehículo, millas, gasolina, notas de
recepción, fechas y creador solo los cambia un admin. La regla se comprueba
contra la fila completa, así que una columna nueva queda protegida sin tocar el
trigger (`trg_order_technician_guard`). Ni un avance ni una asignación pueden
moverse a otra orden o a otra persona, ni siquiera por un admin: se borran y se
crean de nuevo.

> **Por qué el técnico ve la mano de obra y nada más:** su comisión es un
> porcentaje de la mano de obra. Ver ese número y la cuenta de su comisión le
> permite entender su pago sin exponer precios de repuestos, totales ni cobros.

---

## 4. Comisiones

Resumen; el detalle está en [comisiones.md](comisiones.md).

```
base       = total general − total repuestos      (= mano de obra)
bolsa      = base × porcentaje de la sede          (35 % por defecto)
por técnico = bolsa ÷ técnicos asignados, en centavos, residuo a los primeros
```

- Se generan **al entregar**. Se recalculan si cambian los totales, el equipo
  asignado o el porcentaje de la sede — **solo lo pendiente**; lo pagado no se toca.
- El reparto suma la bolsa exacta: $350 entre 3 = $116.67 + $116.67 + $116.66.
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

- Lo de la **recepción** nace **visible** para el cliente: es lo que el cliente
  firma al dejar el vehículo.
- Lo de un **avance** nace **interno**, aunque quien lo sube pida lo contrario.
- **Solo un admin** cambia la visibilidad de un archivo.
- (Fase 4) El reporte web del cliente mostrará solo lo visible.

### Dónde se puede subir

- Solo a una orden en la que la persona está asignada (o si es admin).
- No a una orden entregada (salvo admin).
- La fila de un archivo solo puede apuntar a la carpeta de su propia orden.

---

## 6. Notificaciones

### Quién recibe qué

| Evento | Recibe | Texto |
|---|---|---|
| Te asignan a una orden (al crearla o después) | El técnico | "Nueva orden asignada · ORD-…" |
| Te quitan de una orden | El técnico | "Ya no estás asignado · ORD-…" |
| Un **técnico** registra una recepción | Admins de la sede | "Recepción registrada · ORD-… Falta cotizar." |
| Un **técnico** agrega un avance | Admins de la sede | "Nuevo avance · ORD-…" con su nota |
| Una orden pasa a **Finalizado** | Admins de la sede | "Lista para entregar · ORD-…" |
| Se genera tu comisión (al entregar) | El técnico | "Comisión generada · ORD-… $175.00" |
| (Fase 5) El cliente autoriza o rechaza un presupuesto | Técnicos / admins | pendiente |

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

## 7. Retención y limpieza

Tareas automáticas diarias (09:00 UTC):

| Qué | Se borra |
|---|---|
| Avisos leídos | a los 60 días |
| Cualquier aviso | a los 180 días |
| Envíos terminados (push enviados u omitidos) | a los 90 días |
| Archivos de Storage de órdenes que ya no existen | a partir de 7 días |
| Archivos sin fila en `orden_media` (subidas a medias) | a partir de 7 días, excepto firmas |

Las firmas anteriores de una orden se conservan como historial aunque se vuelva a
firmar.

---

## 8. Riesgos conocidos y decisiones abiertas

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
   historia"; la suma pagada puede superar la bolsa.
4. **Videos WebM** (grabados en Chrome antiguo o Firefox) pueden no reproducirse en
   un iPhone antiguo.
5. **La hora de las notificaciones push depende de la entrega del navegador**
   (Apple/Google). Normalmente segundos; no está garantizada.
6. **Fases 4–6 pendientes**: no hay todavía portal del cliente, correos
   automáticos, presupuestos con autorización ni reporte web.
