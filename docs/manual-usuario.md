# Manual de usuario — Restorify

Sistema de administración para talleres mecánicos y de pintura.

> **Sobre este documento.** Es la base en texto del manual. Los marcadores
> `<!-- IMAGEN: ... -->` indican dónde va cada captura y qué debe mostrar.
> Sugerencia: guarda las imágenes en `docs/img/` y reemplaza el marcador por
> `![descripción](img/nombre-archivo.png)`.

---

## Índice

1. [Qué es Restorify](#1-qué-es-restorify)
2. [Vocabulario del sistema](#2-vocabulario-del-sistema)
3. [Entrar al sistema](#3-entrar-al-sistema)
4. [Cómo está organizada la pantalla](#4-cómo-está-organizada-la-pantalla)
5. [Panel principal](#5-panel-principal)
6. [Clientes](#6-clientes)
7. [Vehículos](#7-vehículos)
8. [Órdenes de trabajo](#8-órdenes-de-trabajo)
9. [Fotos, videos y notas de voz](#9-fotos-videos-y-notas-de-voz)
10. [Tablero Kanban](#10-tablero-kanban)
11. [Notificaciones](#11-notificaciones)
12. [Finanzas](#12-finanzas)
13. [Comisiones](#13-comisiones)
14. [Configuración](#14-configuración)
15. [Instalar la app en el teléfono](#15-instalar-la-app-en-el-teléfono)
16. [Qué puede hacer cada rol](#16-qué-puede-hacer-cada-rol)
17. [Cosas que el sistema hace solo](#17-cosas-que-el-sistema-hace-solo)
18. [Problemas comunes](#18-problemas-comunes)

---

## 1. Qué es Restorify

Restorify lleva el control completo de un taller: los clientes, sus vehículos, las
órdenes de trabajo desde que el auto entra hasta que se entrega, las fotos y
videos del trabajo, el dinero que entra y sale por cada orden y las comisiones
del personal.

Funciona en el navegador, sin instalar nada, aunque en el teléfono conviene
agregarlo a la pantalla de inicio (sección 15). Está pensado para usarse igual
desde una computadora en la oficina que desde el teléfono en el piso del taller.

Un mismo negocio puede tener **varias sedes** (talleres). Cada sede maneja sus
propios clientes, vehículos, órdenes y finanzas por separado.

<!-- IMAGEN: pantalla completa del Panel principal con datos reales, para dar
     una idea general del sistema antes de entrar en detalle -->

---

## 2. Vocabulario del sistema

**Sede.** Un taller físico. Todo lo que registras pertenece a una sede y no se
mezcla con las demás. Un administrador puede cambiar de sede; el resto del
personal solo ve la suya.

**Rol.** Define qué puede hacer cada persona. Hay tres: **administrador**,
**mecánico** y **pintor**. Mecánicos y pintores tienen exactamente los mismos
permisos; en este manual los llamamos **técnicos**.

**Cliente.** La persona dueña del vehículo. Un cliente puede tener varios
vehículos y varias órdenes.

**Vehículo.** El auto. Pertenece a un cliente y se identifica por su VIN
(el número de serie de 17 caracteres) y, cuando la tiene, su placa.

**Orden de trabajo.** El trabajo concreto que se le hará a un vehículo. Es el
centro del sistema: dentro de ella viven las fotos de ingreso, la mano de obra,
los repuestos, los técnicos asignados, el avance, los videos y notas de voz y la
firma del cliente. Cada orden recibe un número automático con el formato
`ORD-2026-001`.

**Mano de obra.** Lo que se cobra por el trabajo. Es la base de la comisión de
los técnicos, por eso es el único dinero de la orden que ellos ven.

**Comisión.** La parte de la mano de obra que le toca a un técnico cuando la orden se
entrega. Desde octubre de 2026 cada trabajo (tarea) tiene **su técnico**, y la comisión de
ese trabajo es suya.

**Tarea.** Una línea de mano de obra con su tipo (mecánica o pintura), su precio y su
técnico. Una tarea **sin técnico** no le paga comisión a nadie.

**Presupuesto.** Los trabajos que se le presentan al cliente para que los autorice.
**Lo que el cliente no autoriza no se hace ni se cobra.**

---

## 3. Entrar al sistema

Abre la dirección del sistema en el navegador (`restorifyauto.net`). Verás la
pantalla de acceso.

1. Escribe tu **correo electrónico**.
2. Escribe tu **contraseña**.
3. Presiona **Entrar**.

<!-- IMAGEN: pantalla de acceso completa -->

**No existe registro público.** Las cuentas las crea un administrador desde
Configuración. Si no tienes cuenta, pídesela a quien administre el sistema.

En la misma pantalla puedes cambiar el idioma entre **Español** e **English**.
La elección se recuerda para la próxima vez.

Si el correo o la contraseña no son correctos, aparece un aviso rojo sobre el
formulario y no se entra. Si el aviso dice **"Esta cuenta no tiene acceso al
taller"**, la cuenta existe pero nadie la dio de alta en el sistema: pídele a un
administrador que te dé de alta desde **Empleados**.

### Si olvidaste tu contraseña

1. Presiona **¿Olvidaste tu contraseña?** debajo del botón Entrar.
2. Escribe tu correo y presiona **Enviar enlace**.
3. Revisa tu bandeja de entrada —y la carpeta de correo no deseado— y abre el
   enlace que recibiste.
4. El enlace te lleva a una pantalla para escribir tu **contraseña nueva** dos
   veces. Al guardarla, **Entrar al sistema** te lleva al panel.

Cada enlace sirve **una sola vez** y vence al poco tiempo (una hora, con la configuración normal). Si lo abres de nuevo o tarde,
la pantalla dice "Este enlace ya no sirve": vuelve al inicio y pide otro.

<!-- IMAGEN: pantalla de "Recuperar contraseña" con el campo de correo -->

Por seguridad el mensaje de confirmación es el mismo exista o no una cuenta con
ese correo, para que nadie pueda averiguar qué correos están registrados. Si no
recibes nada, pídele a un administrador que te asigne una contraseña nueva desde
Configuración.

### Cerrar sesión en un teléfono compartido

Si varias personas usan la misma tablet o teléfono, **cierra sesión al terminar**.
Además de proteger tu cuenta, así ese dispositivo deja de recibir tus
notificaciones y empieza a recibir las de quien entre después. Al cerrar sesión la app
borra lo que tenía cargado en pantalla: quien entre después no ve tus órdenes ni tus
montos.

---

## 4. Cómo está organizada la pantalla

<!-- IMAGEN: vista general señalando con flechas o números: (1) barra lateral,
     (2) buscador, (3) selector de sede, (4) idioma, (5) campana, (6) avatar -->

### Barra lateral (izquierda)

El menú principal, en tres grupos: **Taller** (Panel principal, Clientes, Vehículos y
Órdenes de Trabajo), **Finanzas** (Finanzas, Comisiones y Empleados, solo administradores)
y **Sistema** (Configuración). Abajo está el botón de cerrar sesión. El tablero Kanban ya no
tiene entrada propia: está dentro de Órdenes de Trabajo (sección 10).

Se puede plegar con la flecha para ganar espacio en pantalla.

### Encabezado (arriba)

- **Buscador global.** Escribe al menos 2 caracteres y busca a la vez entre
  clientes, vehículos y órdenes. Los resultados aparecen agrupados por tipo; al
  tocar uno te lleva directo al registro.
- **Selector de sede** (solo administradores). Cambia el taller activo. Todo lo
  que veas a partir de ese momento será de la sede seleccionada.
- **Idioma.** Botones ES / EN.
- **Campana de notificaciones.** Tus avisos: órdenes que te asignaron, avances de
  los técnicos, órdenes listas para entregar, comisiones generadas. Ver sección 11.
- **Avatar.** Tu foto o tus iniciales. Lleva a Configuración.

### En el teléfono

- La barra lateral se convierte en un menú que se abre con el botón ☰ de arriba a
  la izquierda. Ahí están el selector de sede y **Cerrar sesión**.
- El buscador se abre con la **lupa** del encabezado y ocupa toda la pantalla.
- Aparece una **barra inferior** con los accesos más usados: Panel, Órdenes,
  Tablero y, para administración, Clientes y Vehículos.
- Las tablas se transforman en tarjetas, más fáciles de tocar con el dedo.
- Los formularios grandes (como Nueva Orden) se abren a pantalla completa.

<!-- IMAGEN: comparación lado a lado de la lista de órdenes en computadora
     (tabla) y en teléfono (tarjetas) -->

---

## 5. Panel principal

Es la pantalla de inicio. Resume cómo va el taller.

<!-- IMAGEN: panel principal de un administrador -->

### Lo que ve un administrador

- **Requiere atención**, arriba de todo: lo que espera una decisión de la oficina, con el
  número de cada cosa y las órdenes a las que lleva:
  - **Trabajo adicional por revisar**: lo que reportó un técnico y nadie ha cotizado ni
    descartado. Abre la orden en Resumen.
  - **Presupuestos sin respuesta del cliente.** Abre la orden en Trabajos.
  - **Tareas sin técnico**: nadie cobra su comisión hasta que se les asigne uno. Abre la
    orden en Trabajos.
  - **Órdenes con la entrega vencida** (las finalizadas no cuentan).
  - **Correos al cliente con error** en las últimas 72 horas: **Revisar** lleva a
    Configuración, donde se reintentan.

  Si no hay nada, dice «Todo al día». Se actualiza solo cuando alguien cambia una orden.
- **Órdenes activas** y cuántas se terminaron este mes.
- **Ingresos del mes.**
- **Tasa de ocupación**: cuántos espacios del taller están ocupados respecto a la
  capacidad configurada. Si supera el 80 % el indicador se pone rojo.
- **Clientes nuevos del mes.**
- **Gráfico de ingresos contra egresos** de los últimos meses.
- **Alertas**: órdenes esperando repuestos o con poco avance.
- **Órdenes recientes**, con su total.

### Lo que ve un técnico

La misma pantalla, sin nada de dinero: no aparecen ingresos, totales, clientes
nuevos ni el gráfico financiero. Las **alertas** y las **órdenes recientes**
muestran únicamente **sus propias órdenes**.

Arriba de todo está **Mis tareas**: los trabajos que tiene asignados en todas sus órdenes
sin entregar y que todavía no marca como hechos. Primero los que ya se pueden hacer (la
orden que vence antes, primero); al final, los que esperan la autorización del cliente. Al
tocar uno se abre su orden en la pestaña **Tareas**, donde se marca **Realizado** y se
agregan avances. Las tareas hechas no se listan, solo se cuentan.

<!-- IMAGEN: panel principal de un mecánico, para contrastar con el anterior -->

---

## 6. Clientes

*(Solo administradores. Un técnico ve el cliente dentro de sus órdenes.)*

Lista de todas las personas registradas en la sede, con su teléfono, correo,
cuántos vehículos tienen y cuántas órdenes han generado.

<!-- IMAGEN: lista de clientes -->

### Registrar un cliente

1. Presiona **Nuevo Cliente**.
2. Llena nombre y teléfono (obligatorios), y correo, dirección y notas si los tienes.
3. **Crear**.

**El teléfono lleva su país.** A la izquierda del número está el país, con
**Estados Unidos (+1)** elegido de entrada y **México (+52)** justo después; el resto
son los países más comunes de la clientela. Elige el del número del cliente y escribe
el número sin el prefijo. Es el número que usa el sistema para **llamar** y para
**WhatsApp**, así que un país equivocado marca a otro lado. Si a un número de EE. UU.
le falta o le sobra un dígito, el campo te avisa al salir de él.

> Los clientes que ya estaban registrados conservan su número como estaba y se leen
> como de EE. UU. Si uno es de otro país, ábrelo, elige el país correcto y guarda.

> Captura el **correo** siempre que el cliente lo tenga: ahí le llegan solos el
> aviso de ingreso y los cambios de estado de su vehículo, con el enlace a su
> reporte (sección 8, *Enlace del cliente*). Si lo escribes mal, el formulario te
> avisa antes de guardar.

Cuando el cliente tiene correo aparece la casilla **Recibe avisos por correo**.
Desmárcala si el cliente no quiere correos. El cliente también puede darse de baja
él mismo desde su enlace; en ese caso verás la casilla desmarcada.

### Ver el perfil de un cliente

El botón del ojo abre su ficha completa: sus datos, todos sus vehículos y el
historial de órdenes con el estado de cada una (el total solo lo ve un
administrador).

<!-- IMAGEN: perfil de un cliente con vehículos e historial -->

### Editar y eliminar

El lápiz edita los datos. **El botón de eliminar solo aparece para
administradores**: borrar un cliente arrastra consigo todos sus vehículos. Si el
cliente tiene órdenes de trabajo, el sistema impide borrarlo.

---

## 7. Vehículos

*(Solo administradores. Un técnico ve el vehículo dentro de sus órdenes.)*

Todos los autos registrados en la sede, con marca, modelo, año, VIN, placa,
color y dueño.

<!-- IMAGEN: lista de vehículos -->

### Registrar un vehículo

El formulario está pensado para llenarse casi solo a partir del VIN.

1. Presiona **Nuevo Vehículo**.
2. **Dueño**: elige un cliente de la lista, o créalo ahí mismo.
3. **VIN**: escribe los 17 caracteres. El sistema consulta la base de datos oficial
   de vehículos y rellena marca, modelo y año. Debajo aparecen datos adicionales
   (motor, carrocería, planta de ensamblaje). Un VIN nunca lleva las letras I, O
   ni Q; si las escribes, el sistema avisa.
4. Revisa **marca, modelo y año**. Lo que escribas a mano tiene prioridad.
5. **Color**: elige de la lista o escríbelo. El color no viene en el VIN.
6. **Placa**: elige el estado que la emitió y escribe el número. El sistema avisa
   si el formato no cuadra con ese estado, sin impedirte guardarla.
7. **Crear**.

<!-- IMAGEN: formulario de vehículo con el VIN ya decodificado -->

### Vehículos sin placa

Las unidades compradas en subasta llegan sin placa. Marca la casilla
**Sin placa** y los campos de placa y estado se desactivan. En las listas ese
vehículo aparecerá con la etiqueta «Sin placa».

No inventes un texto de relleno como «SIN PLACA» o «N/A» en el campo: aparecería
en las búsquedas y se imprimiría en la orden como si fuera una placa real.

### Editar y eliminar

El lápiz edita. **Eliminar es solo para administradores**, porque borra el
historial de servicio de ese vehículo.

---

## 8. Órdenes de trabajo

El módulo más grande. Aquí vive el trabajo del taller.

### Cómo se ve la lista

**Si eres administrador**, ves una sola lista con todas las órdenes de la sede y
su total.

**Si eres técnico**, ves **Mis Órdenes de Trabajo**: solo las que tienes
asignadas. Las de tus compañeros no aparecen, ni en la lista, ni en el tablero, ni en
el buscador. Si te toca trabajar una que no ves, pide a un administrador que te asigne.
Si abres un aviso o un enlace de una orden que ya no es tuya, la app te lo dice.

<!-- IMAGEN: vista de órdenes de un mecánico, con "Mis Órdenes de Trabajo" -->

Arriba hay un **buscador** (por número de orden o nombre de cliente) y **filtros
por estado**.

### Los estados de una orden

| Estado | Qué significa |
|---|---|
| **Recepción** | El vehículo acaba de ingresar. Aún no se trabaja en él. |
| **En Proceso** | Se está trabajando. |
| **Espera Autorización** | El técnico reportó trabajo adicional y la orden espera a que el cliente lo autorice. Cuando el cliente responde (o administración descarta el hallazgo), la orden vuelve sola a En Proceso. |
| **Finalizado** | El técnico terminó el trabajo. El avance pasa a 100 % y **se avisa a administración** para que lo revise. **Al cliente todavía no**: ve "En revisión final". El técnico **no puede regresarla** a En Proceso; solo administración la reabre. |
| **Entregado** | El cliente se llevó el vehículo. **Solo un administrador** la marca. Registra el cobro en Finanzas y genera las comisiones (sección 17). |
| **Retirada sin reparar** | El cliente se llevó el vehículo **sin que se hiciera el trabajo**. **Solo un administrador**, con el botón **Retirada sin reparar** de la orden (ver abajo). |

**Esperando repuestos** no es un estado: en los repuestos de la orden, cada pieza se marca
**Pedido** y después **Llegó**. Mientras falte una, la orden lleva la marca "Esperando
repuestos" en la lista y el tablero, y el cliente ve en su enlace qué pieza se espera. Al
marcarla **Llegó**, los técnicos de la orden reciben un aviso.

**El avance se mueve solo** con las tareas: cada tarea que se marca hecha suma según su
precio (una de $400 pesa más que una de $50). El técnico lo puede corregir a mano si no
refleja el avance real; la próxima tarea que marque lo vuelve a calcular.

### Crear una orden

Presiona **Nueva Orden**. El alta va en **cuatro pasos**, con los nombres arriba:
**Cliente**, **Vehículo y recepción**, **Depósito** y **Trabajos**. **Siguiente** revisa
el paso antes de pasar al otro y marca en el campo lo que falta; **Anterior** (o el nombre de
un paso ya visto) vuelve sin perder lo escrito. Enter en un campo también pasa al siguiente
paso: la orden solo se crea con el botón **Crear** del último.

**Paso 1 — Cliente.** Elige de la lista, o «+ Nuevo cliente» para capturarlo ahí mismo
(nombre y teléfono son obligatorios).

**Paso 2 — Vehículo y recepción.** El vehículo (o «+ Nuevo vehículo», con el mismo
formulario de VIN que la pantalla de Vehículos), y el estado en que llega:
- **Nivel de gasolina**: E (vacío), 1/4, 1/2, 3/4 o F (lleno).
- **Millas de ingreso**: la lectura del odómetro. Solo números enteros positivos.

**Inspección 360°.** Seis zonas fijas para fotografiar el estado del auto al
entrar: **Frontal, Trasera, Izquierda, Derecha, Interior y Tablero**. Toca cada
recuadro para tomar la foto o elegirla de la galería.

Debajo de las zonas están los mismos botones que en la orden ya creada: **Foto**,
**Video**, **Nota de voz** y **Galería**. Sirven para sumar fotos de daños previos o
documentos, un video recorriendo el auto o una nota de voz sobre cómo llegó. Cada
cosa aparece como miniatura (una foto o un video se abren al tocarlos) y la ✕ la
quita. Todo se sube junto con las fotos al crear la orden.

Las fotos se reducen en el teléfono antes de subirse y un video de la galería se
convierte a un tamaño liviano; mientras tanto el botón **Siguiente** dice
«Procesando…» y espera. Así suben rápido aunque la señal sea mala, y se les quita
la ubicación GPS que guarda la cámara.

> Esto es la evidencia del taller si el cliente reclama después un daño que ya
> venía. Tómalo siempre, aunque el auto se vea bien. Las fotos y los videos de la
> recepción son lo único que queda **visible para el cliente** desde el
> principio. Las **notas de voz quedan internas**: el cliente no las oye hasta que
> un administrador las publique desde la orden. Un administrador también puede
> ocultar cualquier archivo.

<!-- IMAGEN: cuadrícula de las seis zonas de inspección, algunas ya con foto -->

**Notas de la inspección.** Texto libre sobre el estado del vehículo.

**Paso 3 — Depósito.** El anticipo que deja el cliente (0 si no deja nada). Con monto, elige
**cómo pagó** (efectivo, transferencia o cheque); con cheque, su **número**; y si quieres, la
**foto del comprobante**. Queda en Finanzas con el movimiento «Depósito inicial».

**Paso 4 — Trabajos.**
- **Tipo de trabajo** de la orden (Mecánica, Pintura o Combinado) y **fecha estimada de
  entrega**.
- **Agregar trabajo** (botón verde): tipo, descripción, precio y **técnico** de cada tarea,
  igual que dentro de la orden. La comisión de cada tarea es de su técnico; una tarea **sin
  técnico** no le paga a nadie hasta que se le asigne. Si el tipo no es del oficio del técnico
  (pintura a un mecánico), pregunta antes. Cada tarea agregada aparece en la lista con su
  tipo, precio y técnico, y la papelera la quita.
- **Repuestos**: descripción, cantidad y precio. Se cobran a lo que costaron: el taller gana
  en la mano de obra.

Los técnicos de la orden salen de las tareas: quien recibe una, entra a la orden. **Solo
administración asigna**, porque asignar es dinero (decide quién ve la orden y quién cobra).

Si escribiste una tarea y no tocaste **Agregar**, **Crear** no sigue: te avisa para que la
agregues o la canceles, así no se pierde.

Lo que cotizas aquí queda **sin autorizar** hasta que el cliente **firme la
recepción**: con su firma queda autorizado y empieza a contar en el total.

<!-- IMAGEN: formulario de nueva orden con la nota "Se cobran cuando el cliente firma la recepción o autoriza el presupuesto" -->

Al guardar, el sistema genera el número de orden y abre su detalle. **No hace
falta esperar a que suban las fotos**: siguen subiendo en segundo plano y puedes
seguir usando la app (sección 9).

### Solo administración abre órdenes

Un mecánico o pintor no ve el botón **Nueva Orden**: abrir una orden es recibir
un vehículo y comprometer al taller, y asignar a alguien es decidir quién cobra
comisión por ella. Las dos cosas las hace un administrador.

### El detalle de una orden

Es la pantalla donde se sigue el trabajo día a día.

<!-- IMAGEN: detalle de una orden completo, vista de administrador -->

**Pestañas (en computadora).** Arriba quedan fijos el encabezado de la orden, su estado y
su avance; debajo, las pestañas. Así no hay que recorrer toda la orden para llegar a una
sección.

| Quién | Pestañas |
|---|---|
| Administrador | **Resumen** (vehículo, firma, técnicos) · **Trabajos** (mano de obra, repuestos, presupuesto, comisión) · **Fotos y avances** · **Cobro y cliente** (totales, saldo, enlace y correos) · **Historial** |
| Mecánico o pintor | **Tareas** (su trabajo y su comisión estimada) · **Orden** (vehículo, inspección, repuestos, firma, técnicos) · **Avances** |

Junto al nombre de una pestaña aparece cuántas líneas o archivos tiene. Un **punto
amarillo** en **Trabajos** avisa que hay mano de obra o repuestos **sin autorizar**: no se
cobran ni generan comisión hasta que el cliente los autorice.

**Secciones plegables.** Dentro de cada pestaña, cada parte de la orden (vehículo, firma,
técnicos, mano de obra, repuestos…) aparece **cerrada**: se ve su título y un dato corto a la
derecha (la placa, cuántas líneas, el total). La **flecha** la abre o la cierra, y **Desplegar
todo** abre todas las de la pestaña. Lo que abriste sigue abierto al cambiar de pestaña y
volver. Los avisos (trabajo adicional reportado, tareas sin técnico) no se pliegan: van
arriba. Si llegas desde un aviso o desde el panel (por ejemplo "Tareas sin técnico" o una
tarea de **Mis tareas**), la sección que fuiste a ver ya está abierta.

En el teléfono son las mismas secciones, todas en una columna y en el mismo orden que las
pestañas, con un solo **Desplegar todo** arriba.

**Historial** *(solo administradores)*. Quién cambió qué en la orden y cuándo: estados,
avance, firma, mano de obra, repuestos, técnicos, depósito, presupuestos, archivos y
avances, cada cambio con su antes y después. Sirve para responder cuando el cliente o el
taller preguntan "¿quién movió esto?". Nadie lo puede editar.

**Encabezado.** Número de orden, cliente, vehículo y, para administradores, los
botones **Descargar PDF** y **Enviar reporte**.

**Estado.** Un selector con los cinco estados.
- Al elegir **Entregado** se abre el **diálogo de entrega**, porque registra dinero:
  muestra el total autorizado, lo ya cobrado y **lo que falta cobrar** (o lo que hay que
  **devolver** si el depósito fue mayor). Elige **cómo pagó el cliente** — efectivo,
  cheque o transferencia —, el número del cheque si aplica y, si quieres, la **foto del
  comprobante**. El botón dice exactamente qué va a pasar: *Entregar y cobrar $400.00*,
  *Entregar y devolver $300.00* o *Entregar*. Si cancelas, el selector vuelve al estado
  real. El cobro queda en Finanzas con su método, y la foto se abre desde ahí.
- Al sacar una orden de **Entregado** también pide confirmación: se revierten el
  cobro y el costo de repuestos, y se borran las comisiones no pagadas.
- Los técnicos no ven la opción Entregado.

**Avance.** Una barra de 0 a 100 %. Se puede mover mientras la orden no esté
**Finalizada** ni **Entregada**.

**Datos del vehículo y del ingreso.** Millas, gasolina, fechas, notas y las fotos
de la inspección 360°.

**Mano de obra** (para el técnico, **Tareas**). Las líneas del trabajo cotizado. Cada una
es una **tarea**, con su tipo y su técnico: **la comisión de cada tarea es de su técnico**,
a su porcentaje. Un técnico las ve sin poder cambiarlas, con el tipo y el nombre de quien
la tiene, y solo puede marcar como hechas las suyas y las que no tienen técnico.

*Agregar un trabajo (administradores).* El botón verde **Agregar trabajo** abre una fila
con **Tipo**, **Descripción**, **Precio** y **Técnico**:

1. **Tipo** viene con el de la orden (en una orden **Combinado**, mecánica la primera vez
   y después el último que usaste).
2. **Técnico** viene con el de la primera tarea que ya tenga uno; la lista son los
   mecánicos y pintores **de la sede de la orden**. Puedes dejarlo en *Sin asignar*.
3. **Agregar** (o Enter) la guarda y deja la fila abierta para la siguiente, con el
   cursor en Descripción. Un aviso confirma cada trabajo; si la orden ya está firmada,
   recuerda que falta la autorización del cliente.

Si el tipo no es del oficio de la persona — pintura a un mecánico, o mecánica a un
pintor —, antes de guardar sale **"¿Asignar una tarea de pintura a un mecánico?"** con
tres salidas: **Asignar igual** (a veces es justo lo que quieres; la comisión será suya),
**Elegir otro** (vuelve al selector de técnico) o **Cancelar**. La misma pregunta sale si
cambias el **Tipo** de una tarea que ya tiene técnico ("¿Pasar a pintura una tarea de un
mecánico?", con **Cambiar igual**).

*En cada fila (administradores)* hay dos selectores, **Tipo** y **Técnico**, que se pueden
cambiar en cualquier momento — también con la línea esperando al cliente o rechazada — sin
tocar lo cotizado. Al darle una tarea a alguien, entra solo a la orden para verla y le
llega **Nueva tarea**; a quien se la quitan le llega **Tarea reasignada**. En el teléfono
los dos selectores van debajo de la descripción, a lo ancho.

*Una tarea sin técnico* lleva la insignia amarilla **Sin técnico**: **nadie cobrará su
comisión hasta que se la asignes**. La orden lo avisa arriba del **Resumen** ("1 tarea(s)
sin técnico…", con **Ver trabajos**), con un punto en la pestaña **Trabajos** y otra vez en
el diálogo de entrega (también si entregas desde el Kanban). Entregar se deja igual: si
la entregas así, esa comisión no se genera para nadie.

*Trabajos de antes de octubre de 2026* (sin técnico): su selector dice **Reparto por
especialidad**. Se siguen repartiendo como antes entre los técnicos asignados a mano con
esa especialidad. Si les asignas un técnico, pasan a ser una tarea suya **para siempre**:
si después le quitas el técnico, quedan *Sin técnico*, no vuelven al reparto.

*Lo ya pagado no se mueve.* Si la comisión de un trabajo ya se pagó, sus selectores salen
con un **candado** y **Eliminar** está apagado: para cambiarlo, primero deshaz ese pago en
**Comisiones**. Lo mismo con un trabajo de antes cuyo reparto ya se pagó, y un trabajo de
antes no se puede pasar a una especialidad cuyo reparto ya se pagó (la opción sale con
*reparto ya pagado*).

Cada línea puede llevar una insignia:

| Insignia | Qué significa | ¿Se cobra? | ¿Se hace? |
|---|---|---|---|
| *(sin insignia)* | Autorizada por el cliente | Sí | Sí |
| **Sin autorizar** | Se agregó y el cliente todavía no la ve | No | Todavía no |
| **Esperando al cliente** | Está en un presupuesto enviado; no se puede editar | No | Todavía no |
| **No realizar** (tachada) | El cliente no la autorizó | No | **No** |

El total de la tabla suma **solo lo autorizado**; lo que falta autorizar aparece
debajo, aparte.

**Repuestos.**
- *Administrador*: la tabla completa con cantidades y precios.
- *Técnico*: **Descripción de repuestos**, solo qué piezas y cuántas, sin precios.

**Totales y depósito.** Solo para administradores.

**Tu comisión estimada** *(técnicos asignados)*. Cuánto te tocaría si la orden se
entregara hoy, con la cuenta a la vista: cada **tarea tuya** autorizada (*precio × tu
porcentaje*) y, si la orden tiene trabajos de antes y estás en su reparto, tu parte (*mano
de obra de la especialidad × tu porcentaje ÷ compañeros*). Solo ves lo tuyo. Se confirma
al entregar y cambia si cambia la mano de obra, su técnico o el equipo. Si estás a salario,
la tarjeta lo dice: la orden no te genera comisión.

<!-- IMAGEN: detalle de la misma orden vista por un mecánico: sin totales, con
     repuestos sin precio y la tarjeta "Tu comisión estimada" -->

**Técnicos asignados.** Quién trabaja la orden. **Solo administración asigna:** si no
estás asignado verás el aviso de solo lectura y la nota de que un administrador tiene que
ponerte en la orden. No hay forma de unirte por tu cuenta, ni de quitarte. Un administrador
solo puede asignar personal **de la sede de la orden** (la lista sale de esa sede aunque
arriba tengas elegida otra).

- Quien entró a la orden **por una tarea** lleva la etiqueta **Por tarea**: cobra solo sus
  tareas.
- Si la orden tiene trabajos de antes de octubre de 2026, quien se asignó a mano lleva
  **En el reparto**: además de sus tareas, reparte la comisión de esos trabajos de su
  especialidad. Con **Sacar del reparto** / **Sumar al reparto** el administrador decide
  quién entra, sin quitar a nadie de la orden; agregar a mano a alguien que está *Por
  tarea* también lo suma. Si el reparto de esa especialidad ya se pagó, no se cambia.
- **No se puede quitar de la orden a quien tiene tareas en ella**: primero se le asignan
  esas tareas a otra persona (el sistema lo dice con su nombre y cuántas tiene).

**Fotos, videos y notas de voz.** La galería de la orden (sección 9).

**Avance del trabajo.** La bitácora: cada técnico documenta lo que hizo con una
nota y, si quiere, fotos, videos o una nota de voz. Un avance puede ser **solo
una nota de voz**, sin texto. Queda con fecha y autor. Puedes borrar tus propios
avances, pero no los de un compañero.

<!-- IMAGEN: sección de avances con una entrada con fotos y una nota de voz -->

**Firma del cliente** *(la toma un administrador)*. El cliente firma con el dedo sobre el recuadro. Queda
guardada con fecha y aparece en el reporte del cliente y en el PDF. **La firma dice que el
cliente está de acuerdo con cómo entregó el vehículo** (millas, gasolina y fotos); **no
autoriza el presupuesto**. Los trabajos cotizados siguen *Sin autorizar* hasta que le envíes
el presupuesto y lo responda, o registres su autorización si la da en el mostrador. Mientras
tanto la orden aparece en el panel, en *Requiere atención*. Se puede limpiar y volver a
firmar (si salió mal); las firmas anteriores quedan como historial. Los técnicos ven si la
orden ya está firmada, pero no toman ni cambian la firma: es un paso de la recepción, en el
mostrador.

**Enlace del cliente** *(solo administradores)*. Ver la sección siguiente.

**Enviar reporte** *(solo administradores)*. El reporte de la orden **es el enlace
del cliente**: siempre muestra lo último (estado, fotos y videos publicados, cuenta).
Al pulsarlo se abre una ventana con:

- **Enviar por correo**: el sistema le manda al cliente un correo con el botón para
  abrir su reporte. Queda en el historial de la tarjeta *Enlace del cliente*. No se
  puede usar si el cliente no tiene correo o pidió no recibir correos.
- **Enviar por WhatsApp**: abre WhatsApp con el teléfono del cliente y el mensaje con
  el enlace listos.
- **Copiar enlace** y **Abrir**: para mandarlo por otro medio o revisarlo antes.
- **Descargar PDF**.

El enlace deja de funcionar 90 días después de entregar la orden.

<!-- IMAGEN: ventana "Enviar reporte" con los botones de correo y WhatsApp -->

**Descargar PDF** *(solo administradores)*. Un PDF para imprimir o archivar, con lo
mismo que ve el cliente: datos de la orden, fotos **publicadas**, trabajos
**autorizados**, totales, firma y el enlace del reporte. No lleva las notas de los
avances ni los nombres de los técnicos. El PDF no se sube a ningún lado: se guarda
en tu equipo.

> Los técnicos no envían reportes al cliente: lo que sale del taller hacia el
> cliente lo decide administración.

### Enlace del cliente y avisos por correo

Cada orden tiene un **enlace personal** para el cliente, por ejemplo
`restorifyauto.net/r/3f9a…`. Al abrirlo, el cliente ve **sin crear una cuenta**:

- En qué va su vehículo (recibido, en proceso, listo, entregado), el avance y la
  fecha estimada.
- La recepción: millaje, gasolina, observaciones, las fotos de ingreso y su firma.
- Las fotos, videos y notas de voz de los avances que **tú publicaste**.
- Su cuenta: mano de obra, repuestos, total, depósito, pagado y saldo.
- Botones para llamar al taller y, si la sede lo tiene, escribir por WhatsApp.

**Nunca** ve los nombres de los técnicos, las comisiones, lo que escribieron en
los avances ni los archivos internos.

<!-- IMAGEN: el reporte del cliente abierto en un teléfono -->

**Cuándo se crea.** Solo, cuando el cliente **firma la recepción**. Si necesitas
compartirlo antes, usa **Crear enlace**.

**La tarjeta Enlace del cliente** (en el detalle de la orden):

<!-- IMAGEN: tarjeta "Enlace del cliente" con el enlace, los botones y el historial de correos -->

- **Copiar** y **Abrir** el enlace.
- **Enviar por WhatsApp**: abre WhatsApp al teléfono del cliente con el mensaje y
  el enlace listos. Úsalo con clientes que no tienen correo.
- **Cambiar enlace**: si el enlace llegó a quien no debía. El anterior deja de
  abrir.
- **Desactivar**: nadie puede abrirlo hasta que crees uno nuevo.
- Cuántas veces lo abrió el cliente y cuándo fue la última.
- Hasta cuándo está disponible: **90 días después de entregar**.

**Correos automáticos.** Si el cliente tiene correo, el sistema le escribe solo:

| Correo | Cuándo llega |
|---|---|
| "Recibimos su vehículo" | Al firmar la recepción, si la orden ya tiene una foto de recepción; si no, 30 segundos después |
| "Estamos trabajando en su vehículo" | ~3 minutos después de pasar a En Proceso |
| "Su vehículo está listo" | ~3 minutos después de pasar a Finalizado |
| "Gracias por su visita" | ~3 minutos después de entregar |

Si mueves la orden varias veces seguidas, el cliente recibe **un solo** correo con
el último estado, y nunca dos veces el mismo estado. Los correos salen con el
nombre del taller; si el cliente responde, la respuesta llega al correo de contacto
de la sede (sección 14).

**Avisar novedades.** Después de publicar fotos o videos de un avance (botón
**Mostrar en el reporte del cliente**), pulsa **Avisar novedades** en la tarjeta:
al minuto le llega un correo al cliente con el enlace.

**Historial.** Debajo, la tarjeta lista cada correo con su estado: **Programado**,
**Enviado**, **No enviado** (con el motivo, por ejemplo "ya recibió el aviso de
este estado") o **Error**.

### Presupuestos: lo que el cliente autoriza

Cuando agregas trabajos después de la recepción (el mecánico encontró algo más, el
cliente pidió otro servicio), quedan **sin autorizar**. La tarjeta **Presupuesto**
del detalle de la orden te ofrece dos caminos:

<!-- IMAGEN: tarjeta "Presupuesto" con "Trabajos sin autorizar" y los botones Enviar presupuesto / Registrar autorización -->

**A. Enviar presupuesto al cliente.** Le llega un correo con los trabajos y el total
y un botón a su enlace. Ahí marca **línea por línea** lo que autoriza, escribe su
nombre y confirma. Mientras tanto:

- Las líneas dicen **Esperando al cliente** y no se pueden editar (él está viendo esos
  montos). Si necesitas corregir algo, **Cancelar presupuesto**, corrige y vuelve a
  enviar.
- La orden muestra **Esperando autorización** en la lista y en el tablero.
- Si agregas otro trabajo, **Agregar al presupuesto y reenviar**: el cliente recibe un
  solo correo con todo. Si ya tenía la página abierta, se le pide revisarla de nuevo.
- Si el cliente no tiene correo, el sistema te lo dice: mándale el enlace con
  **Enviar por WhatsApp** (tarjeta *Enlace del cliente*).
- Si pasan 24 horas sin respuesta, los administradores reciben un aviso.

<!-- IMAGEN: el portal del cliente con la sección "Presupuesto por autorizar", casillas por línea y el campo "Su nombre" -->

**B. Registrar autorización.** El cliente te respondió **por teléfono, en persona o
por WhatsApp**. Pulsa **Registrar autorización**: aparecen los trabajos, todos
marcados; **desmarca lo que no autorizó**, elige cómo te respondió y quién autorizó,
agrega una nota si hace falta y **Registrar**. Al cliente le llega un correo con lo
que quedó registrado, para que pueda corregirte si algo no coincide.

<!-- IMAGEN: diálogo "Trabajos autorizados por el cliente" -->

**Cuando el cliente responde** (por cualquiera de los dos caminos):

- Lo marcado queda autorizado y **suma al total**; lo demás queda **No realizar**.
- Los técnicos asignados reciben el aviso "Trabajos autorizados · ORD-…" con qué hacer
  y qué no.
- Si respondió desde su enlace, tú recibes "El cliente respondió el presupuesto" con
  su comentario.
- La tarjeta **Presupuesto** guarda cada respuesta: cómo respondió, quién, cuándo y
  cuánto autorizó.

**Si el cliente cambia de opinión** sobre algo que rechazó, edita esa línea (aunque
sea el mismo precio): vuelve a **Sin autorizar** y puedes presentarla de nuevo.

> **No se puede entregar** una orden con un presupuesto esperando respuesta. Registra
> la autorización o cancela el presupuesto primero.

### Costo de un repuesto

Solo administración. Cada repuesto tiene **Precio** (lo que paga el cliente) y **Costo** (lo
que pagó el taller). El costo es opcional: vacío, se toma el precio. Escríbelo cuando lo sepas
y el margen de la orden y el egreso de repuestos en Finanzas dirán la ganancia real de las
piezas. Corregirlo en una orden ya entregada registra solo el ajuste.

### Descuento

Solo administración, en la pestaña **Cobro y cliente** → **Totales** → **Aplicar descuento**:
en dólares o en porcentaje, y un motivo (por ejemplo, "cliente frecuente"). **Lo absorbe el taller**: baja lo que
paga el cliente, **no** la comisión de los técnicos. No puede ser mayor que lo autorizado. Para
quitarlo, **Cambiar descuento** → **Quitar descuento**. Queda en el historial de la orden, y el
cliente ve el subtotal y el descuento en su enlace y en el PDF.

### Retirada sin reparar

Cuando el cliente se lleva el vehículo sin que se haga todo el trabajo (no autorizó, cambió de
idea, o solo se hizo una parte). Botón **Retirada sin reparar** arriba en la orden, y elige qué
pasó:

- **Se canceló todo**: no se cobra nada y se le devuelve lo que dejó.
- **Solo se cobra la revisión**: escribe cuánto cuesta la revisión del vehículo.
- **Se hicieron algunos trabajos**: marca los trabajos y repuestos que sí se hicieron (las
  tareas ya marcadas como hechas vienen marcadas) y, si quieres, la revisión.

El sistema muestra lo que el cliente ya dejó y **cuánto hay que devolverle** (o cobrarle). Elige
cómo y confirma. Lo que no se cobra queda como "no realizado" y aparece como pendiente la
próxima vez que venga ese vehículo. Los trabajos cobrados pagan la comisión de su técnico; la
revisión, no. La orden no cuenta como terminada en el panel. Si se cerró por error, cámbiala de
estado como cualquier entregada: el dinero se revierte.

### Anticipos

Si el cliente paga una parte antes de llevarse el vehículo (por ejemplo, la pieza), en
**Cobro y cliente** → **Totales** → **Registrar anticipo**: el monto, cómo pagó y, si quieres,
la foto del comprobante. Se suma a **Depósito y anticipos**, y al entregar se cobra solo lo
que falte.

### Pendiente de visitas anteriores

Lo que el cliente no autorizó, o no se hizo, en otras visitas de ese vehículo aparece arriba
del **Resumen** de la orden y en el paso de trabajos al crear una orden nueva: es el momento de
ofrecerlo otra vez. Solo lo ve administración.

### Descargar el PDF en inglés

Junto a **Descargar PDF** hay un selector **ES / EN**. En inglés salen todas las etiquetas, y
los textos del taller (trabajos, notas) salen traducidos si la traducción automática ya los
tradujo; los que no, como se escribieron.

### Orden entregada

Queda cerrada para los técnicos: no pueden cambiar su estado, mano de obra,
repuestos, asignaciones ni subir archivos. Un administrador sí puede corregirla;
cada corrección de dinero se registra como un ajuste en Finanzas.

### Archivar una orden

Una orden entregada se queda en la lista y en la columna **Entregado** del tablero
hasta 90 días. Para sacarla antes, un administrador la **archiva**:

- **En el teléfono**, en su tarjeta del tablero: **Mover a → Archivar**.
- **En la computadora**, con el botón **Archivar** de su tarjeta, o desde el
  detalle de la orden.

La orden pasa a la pestaña **Archivadas**. Sigue entregada: no cambia su cobro, sus
comisiones ni el enlace del cliente. Para traerla de vuelta, ábrela desde
Archivadas y presiona **Devolver al tablero**. Si alguien la saca de "Entregado",
vuelve sola al tablero.

Solo se archiva lo entregado, y solo lo hace un administrador.

### Eliminar una orden

Solo un administrador. Borra también sus fotos y videos, sus comisiones y los
movimientos financieros que la orden generó automáticamente. Los movimientos
importados del banco se conservan.

**Si ya se pagaron comisiones de esa orden, no se puede borrar**: el cheque quedaría
sin el detalle de qué pagó. Ve a **Comisiones → Pagos realizados**, deshaz ese pago
y luego borra la orden.

---

## 9. Fotos, videos y notas de voz

Cada orden tiene su galería. Se alimenta desde la **inspección 360°** al crear la
orden y desde **Avance del trabajo** después.

<!-- IMAGEN: barra de captura con los botones Foto, Video, Nota de voz y Galería -->

### Capturar

| Botón | Qué hace | Límite |
|---|---|---|
| **Foto** | Abre la cámara. La foto se reduce antes de subir | — |
| **Video** | Graba dentro de la app, en calidad adecuada para el teléfono. En los últimos 15 segundos el contador se pone rojo y **a los 2 minutos se detiene solo**. Puedes cambiar de cámara antes de grabar, revisar la toma (se reproduce al tocarla), repetir o usar el video. Antes de guardar el avance, **toca la miniatura del video para verlo** | 2 min |
| **Nota de voz** | Graba audio. Puedes escucharla antes de usarla | 2 min |
| **Galería** | Elige una foto o un video ya grabado. Los videos se convierten a un tamaño manejable («Convirtiendo video N %») | 2 min, 50 MB |

> **Graba con el botón Video de la app**, no con la cámara del teléfono. Un minuto
> de video del iPhone pesa cientos de megas; grabado desde la app pesa unos 11 y
> sube en segundos.

La primera vez el navegador pide permiso para la cámara y el micrófono. Si lo
niegas, la app te explica cómo activarlo en los ajustes.

### La bandeja de subidas

Mientras hay archivos subiendo aparece una bandeja flotante: «3 de 5 archivos
subidos». Tócala para ver cada archivo y su progreso.

<!-- IMAGEN: bandeja de subidas expandida con un archivo subiendo, uno listo y
     uno con error -->

- **Puedes seguir usando la app** mientras suben.
- **Si se va la señal**, la bandeja dice «Sin conexión» y las subidas siguen solas
  cuando vuelve.
- **Si cierras o recargas la app**, los archivos pendientes siguen al volver a
  entrar con la misma cuenta. Los videos largos continúan donde se quedaron.
- **Si un archivo falla**, se queda en la bandeja con el motivo y dos botones:
  **Reintentar** o **Descartar**. Un archivo no se pierde hasta que tú lo descartas.

### Visibilidad para el cliente

Cada archivo muestra una etiqueta:

- **Visible al cliente** — las fotos de la recepción nacen así.
- **Interno** — todo lo que se sube en un avance nace así.

Solo un **administrador** cambia la visibilidad, con el botón **Mostrar en el
reporte del cliente** / **Ocultar del reporte del cliente**. Así el técnico
puede documentar todo con libertad y administración decide qué ve el cliente en
su enlace (sección 8, *Enlace del cliente*).

### Ver y borrar

- Toca una miniatura para abrirla en grande. Los videos y audios se reproducen
  ahí; las flechas pasan al siguiente archivo.
- Un técnico puede borrar **sus propios** archivos mientras la orden no esté
  entregada. Un administrador puede borrar cualquiera.

---

## 10. Tablero Kanban

La misma información que la lista de órdenes, vista como un tablero con una
columna por estado. Está dentro de **Órdenes de Trabajo**: arriba a la derecha, el
selector **Lista | Tablero** cambia de vista. La app recuerda la última que usaste, así que
quien trabaja con el tablero lo encuentra al volver. El buscador de órdenes filtra también
las tarjetas, y el **número de la orden** en cada tarjeta la abre.

<!-- IMAGEN: tablero Kanban con tarjetas repartidas en las columnas -->

Arriba se muestra la **ocupación del taller**: cuántas órdenes activas hay contra
la capacidad de la sede.

Hay dos formas de cambiar una orden de estado:

- **En computadora**, arrastra su tarjeta a otra columna.
- **En teléfono**, cada tarjeta tiene abajo un selector **Mover a**. Las columnas
  se recorren deslizando de lado, una por pantalla.

<!-- IMAGEN: tarjeta del Kanban en teléfono, mostrando el selector "Mover a" -->

Un administrador puede mover cualquier orden. Un técnico solo las que tiene
asignadas, y nunca a **Entregado**. En las tarjetas que no puedes mover, el
selector no aparece.

Mover una orden a Entregado abre el mismo diálogo de entrega que en el detalle.

---

## 11. Notificaciones

### La campana

El número rojo sobre la campana son tus avisos sin leer. Llegan **al instante**
mientras la app está abierta, con un mensaje breve en pantalla.

<!-- IMAGEN: campana abierta con tres avisos, uno sin leer -->

- Toca un aviso para abrir su orden; queda marcado como leído.
- **Marcar todo leído** limpia el contador.
- La **X** a la derecha de un aviso lo borra sin abrirlo.
- **Borrar todas** vacía la campana, incluidos los avisos viejos que no alcanzan a
  verse en la lista. Pide confirmación y no se puede deshacer.
- Nunca recibes aviso de algo que hiciste tú.
- Los avisos se borran solos a los 60 días.

### Qué avisos llegan

| Aviso | Lo recibe |
|---|---|
| **Nueva orden asignada** | El técnico al que asignan a mano (no cuando entra por una tarea) |
| **Nueva tarea** | El técnico al que le dan una tarea, con la tarea y el vehículo |
| **Tarea reasignada** | El técnico al que le quitan una tarea |
| **Tarea hecha** | Administradores, cuando un técnico marca una tarea como hecha |
| **Ya no estás asignado** | El técnico al que quitan |
| **Recepción registrada · Falta cotizar** | Administradores, cuando un técnico crea una orden. **Ya no se emite:** abrir una orden es de administración desde 20261004000000. Los avisos de este tipo que ya existían se siguen leyendo |
| **Nuevo avance** | Administradores, cuando un técnico agrega un avance |
| **Trabajo terminado** | Administradores, cuando un técnico finaliza una orden: hay que revisarla y marcarla "Listo para entregar" |
| **Comisión generada** | Cada técnico, cuando se entrega su orden: **uno** por orden, con la suma de lo suyo |
| **Pasó la fecha de entrega** | Administradores y técnicos asignados, una vez al día por cada orden atrasada. **Reemplaza al del día anterior**: hay uno solo por orden, con los días de retraso al día |

### Notificaciones en el teléfono (push)

Con push activado, los avisos llegan al teléfono **aunque la app esté cerrada**,
como los de cualquier otra aplicación.

1. Ve a **Configuración → Notificaciones en este dispositivo**.
2. Presiona **Activar en este dispositivo** y acepta el permiso.
3. Presiona **Enviar prueba**: debe llegar en unos segundos.

<!-- IMAGEN: tarjeta "Notificaciones en este dispositivo" activada -->

- Se activa **por dispositivo**: si usas teléfono y computadora, actívalo en los dos.
- En **iPhone** primero hay que instalar la app en la pantalla de inicio
  (sección 15); la tarjeta explica los pasos.
- Si negaste el permiso, la tarjeta te dice cómo activarlo en los ajustes del
  navegador.
- Al **cerrar sesión**, ese dispositivo deja de recibir tus avisos.
- Si la tarjeta dice **«Las notificaciones push no están configuradas en este
  servidor»**, no es un problema de tu teléfono: la versión publicada de la app se
  armó sin la llave de notificaciones. Avísale a quien administra el sistema; se
  arregla publicando de nuevo la app (ver [deployment.md](deployment.md)).

---

## 12. Finanzas

**Solo administradores.** Registra todo el dinero que entra y sale de la sede.

<!-- IMAGEN: pantalla de finanzas con las tarjetas de totales y la tabla -->

Tiene dos vistas:

- **Registros del taller**: lo que registra la app (cobros de las órdenes, costo de repuestos,
  comisiones y lo que registres a mano). Arriba, **ingresos**, **egresos** y **balance**;
  abajo, la tabla con filtros por tipo y por **mes**. **Exportar Excel** baja lo que muestra
  la tabla (por ejemplo, un mes) para el contador.
- **Estados de cuenta (contabilidad)**: los estados de cuenta del banco que importes, para
  ordenar meses anteriores y mandárselos al contador. Son contabilidad aparte: **no se suman**
  a los ingresos y egresos de la app. Cada uno muestra su periodo, cuánto entró y salió, y se
  exporta por separado.

Los métodos de pago son **efectivo, tarjeta, Zelle, transferencia y cheque**. Las comisiones
del banco y de Clover van en la categoría **Comisiones de banco y tarjeta**: regístralas a mano
una vez al mes, con el monto del estado de cuenta.

Muchos movimientos **los crea el sistema solo** (depósitos, cobros al entregar,
costo de repuestos, pagos de comisiones; sección 17). No los registres a mano o
quedarán duplicados. Un pago de comisiones aparece como **un egreso por cada orden** que
cubre ("Comisión Mario Mecánico - ORD-2026-014"), todos con el mismo número de cheque.

### Margen por orden

Entre las tarjetas y la tabla, **Margen por orden** lista las órdenes entregadas en el mes
que elijas: cuánto se **cobró**, cuánto costaron sus **repuestos**, cuánto generó en
**comisiones** y el **margen** que quedó, con los totales del mes. Las comisiones cuentan
desde que se generan, estén pagadas o no. Si una orden tiene vinculada una compra del banco
o un movimiento a mano, se ve en el **Balance** de la orden pero no se resta otra vez: el
costo de las piezas ya viene de sus líneas.

En el detalle de una orden entregada, la tarjeta **Balance de la orden** muestra lo mismo
para esa orden.

### Registrar un movimiento a mano

1. **Nueva Transacción**.
2. **Tipo**: ingreso o egreso.
3. **Categoría**: Pago de Cliente, Compra de Repuestos, Planilla o Gasto Operativo.
4. **Monto** y **fecha**. La fecha es la del taller: un movimiento del día 1
   cuenta en ese mes.
5. **Orden vinculada** (opcional): asocia el movimiento a una orden. En la tabla,
   esa columna lleva directo a la orden.
6. **Descripción**.
7. **Crear**.

<!-- IMAGEN: modal de nueva transacción con el selector "Orden vinculada"
     desplegado -->

### Eliminar un movimiento

Cada fila tiene un botón de papelera. Úsalo **solo para movimientos manuales**
capturados por error.

> **No borres movimientos automáticos** («Depósito inicial», «Pago final», «Costo
> de repuestos», «Pago de comisiones», ajustes y reversiones). El sistema los usa
> para calcular los siguientes: si borras un «Pago final» y luego se corrige la
> orden, las cuentas quedan descuadradas. Para corregir el dinero de una orden,
> corrige la orden (mano de obra, repuestos, estado) y deja que el sistema
> registre el ajuste. Para deshacer un pago de comisiones, usa **Deshacer pago**
> en Comisiones.

### Importar el estado de cuenta del banco

Permite cargar el PDF del estado de cuenta y registrar sus movimientos sin
teclearlos uno por uno.

> Por ahora solo entiende estados de cuenta de **Wells Fargo**. El archivo debe
> ser el PDF descargado del banco, no un escaneo ni una foto.

1. En la vista **Estados de cuenta (contabilidad)**, **Importar Estado de Cuenta**.
2. Selecciona el PDF. Todo el procesamiento ocurre en tu navegador; el archivo no
   se envía a ningún servicio externo.
3. Aparece la lista de transacciones encontradas. El sistema propone una categoría
   según palabras clave, marca las que parecen transferencias internas y avisa de
   posibles duplicados.
4. Revisa, ajusta categorías, desmarca lo que no quieras importar.
5. **Importar seleccionadas**.

> **Toda fila marcada necesita categoría.** Mientras quede una sin categoría, el
> botón **Importar Seleccionadas** permanece apagado y arriba de él aparece
> cuántas faltan. La barra **Asignar a las no clasificadas** aplica una categoría
> a todas de golpe.

<!-- IMAGEN: tabla de revisión de la importación, con categorías sugeridas y
     alguna fila marcada como posible duplicado -->

### Si importas el mismo estado de cuenta dos veces

Es el error más caro de esta pantalla, porque **duplica todos los ingresos y
egresos del mes**. El sistema te protege en tres niveles:

1. **Detecta el archivo repetido.** Si ese mismo archivo ya se importó en esta
   sede, aparece un aviso rojo con la fecha. Lo reconoce por su contenido, así que
   cambiarle el nombre no lo engaña.
2. **Desmarca los movimientos que ya se importaron** de otro estado de cuenta (mismo tipo,
   mismo monto, fecha con menos de dos días de diferencia) con la etiqueta «Posible
   duplicado». No los compara con los cobros que registró la app: son libros distintos.
3. **«Seleccionar todas» no las incluye.** Si de verdad es un movimiento distinto,
   márcalo a mano.

<!-- IMAGEN: aviso rojo de "este mismo archivo ya se importó" con la fecha -->

### Revertir una importación

En la lista de **Importaciones**, el botón **Revertir importación** elimina de
golpe todos los movimientos que entraron con ella. Es la salida cuando algo se
importó de más o mal categorizado: revertir y volver a importar.

<!-- IMAGEN: lista de importaciones con el botón de revertir -->

---

## 13. Comisiones

**Solo administradores.** El personal técnico cobra por comisión sobre la mano
de obra de las órdenes que entrega. El detalle técnico está en
[comisiones.md](comisiones.md).

<!-- IMAGEN: pantalla de Comisiones en la pestaña Saldos pendientes -->

### Cómo se calcula

**Cada trabajo (tarea) le paga a su técnico**, a su porcentaje (el suyo, o el de la sede si
no tiene uno):

```
comisión de una tarea = precio de la tarea × porcentaje de su técnico
```

Ejemplo (el de la reunión con el taller, al 35 %): la pintora tiene la pintura de $1,000 y
cobra **$350**; el mecánico tiene la mecánica de $200 y cobra **$70**. Si después se agrega
una mano de obra extra de pintura de $500 y se le asigna a la pintora, cobra **$175** más,
aunque haya otro pintor en la orden.

- **Una tarea sin técnico no la cobra nadie.** La orden lo avisa en el Resumen y al
  entregar. Asígnale técnico antes de entregar.
- Quien está **a salario** no cobra comisión; lo de sus tareas se queda en el taller.
- **Trabajos de antes de octubre de 2026.** Los que no tienen técnico siguen con el reparto
  por especialidad: cada especialidad es una bolsa que se reparte entre quienes están **en
  el reparto** con esa tarea (*bolsa ÷ compañeros × su porcentaje*). Si una bolsa no tiene a
  nadie, nadie la cobra, y la tarjeta **Reparto de la comisión** de la orden lo avisa.

La comisión **se genera al entregar** la orden y se recalcula sola si cambia la mano de
obra (su precio, su autorización, su técnico o su tipo), el equipo asignado o un
porcentaje. **Lo ya pagado nunca se recalcula**, y por eso un trabajo con la comisión pagada
queda bloqueado (sección 8). En **Historial de comisiones** cada fila dice qué trabajo paga:
una persona puede tener varias por orden, una por tarea.

### Las tres pestañas

- **Saldos pendientes** — cuánto se le debe a cada técnico y de qué órdenes.
- **Historial de comisiones** — cada comisión, pendiente o pagada.
- **Pagos realizados** — los pagos registrados, con su comprobante.

### Revisar y aceptar

Al entregar una orden, cada comisión nace **por revisar**. **Solo se paga lo aceptado.**

- En **Saldos pendientes**, cada técnico muestra cuántas tiene por revisar. **Aceptar todas**
  las acepta tal cual, de un golpe.
- Para cambiar una antes de aceptarla, abre la fila del técnico y usa el lápiz de esa comisión:
  cambia el **porcentaje** (el monto se recalcula) o el **monto** en dólares.
- El técnico ve su comisión y recibe un aviso cuando se acepta.

### Pagar un saldo

1. En **Saldos pendientes**, presiona **Pagar lo aceptado** en la fila del técnico (apagado si
   no hay nada aceptado).
2. El diálogo muestra lo aceptado y de cuántas órdenes viene; lo que sigue por revisar no entra.
   Elige la fecha y el método (Cheque, Efectivo, Zelle, Transferencia).
3. Con **cheque**, escribe el número o adjunta la foto (al menos uno de los dos:
   es lo que permite conciliarlo con el banco).
4. **Registrar pago**.

El monto lo calcula el sistema. El pago se registra solo como egreso en Finanzas.

### Deshacer un pago

En **Pagos realizados**, **Deshacer pago** devuelve esas comisiones a pendientes y
elimina su egreso de Finanzas (solo el de ese pago).

### Cambiar el porcentaje

El **de la sede**, en la tarjeta de arriba a la derecha o en Configuración → Sedes: de 0
a 100, por defecto 35 %. El **de una persona**, en **Empleados**. Cambiar cualquiera
recalcula solo lo pendiente.

### Empleados

*(Menú lateral, solo administradores.)* Quién trabaja en el taller, cómo se le paga y qué
ha hecho.

- **Pago de cada empleado**: la lista de mecánicos y pintores con su esquema —
  *Comisión · 35 % (el de la sede)*, *Comisión · 40 %* o *Salario · $900.00 quincenal*.
- **Ver** abre a la persona: comisiones pendientes y pagadas, órdenes activas y
  entregadas, sus órdenes y avances recientes, y su **pago**:
  - **Comisión**: su propio porcentaje, o vacío para usar el de la sede.
  - **Salario**: monto y periodo. Es informativo (no se registra en Finanzas) y a salario
    no se genera comisión. Si tiene comisiones pendientes, la app te avisa con el monto
    antes de guardar: al pasarlo a salario dejan de contar, así que págalas antes si se
    las debes.
- Debajo está la administración del **personal** (alta, edición y baja), que antes
  estaba en Configuración.

<!-- IMAGEN: Empleados, con la lista de pago y el detalle de un mecánico -->

---

## 14. Configuración

Accesible para todos desde el avatar del encabezado, con contenido distinto
según el rol.

### Para todos

- **Perfil**: foto, nombre, correo y teléfono.
- **Idioma** (Español / English) y **tema** (oscuro / claro).
- **Notificaciones en este dispositivo**: activar, probar y desactivar push
  (sección 11).

<!-- IMAGEN: sección de perfil, idioma, tema y notificaciones -->

### Solo administradores: sedes y personal

**Sedes.** Crear talleres nuevos y editar los existentes: nombre, dirección,
teléfono, **logotipo**, **color de acento**, **capacidad** (espacios de trabajo,
para la tasa de ocupación) y **porcentaje de comisión**.

Dos datos que usan los correos y el enlace del cliente:

- **Correo de contacto**: a dónde llegan las respuestas de los clientes a los
  correos automáticos. Conviene un buzón que alguien revise.
- **WhatsApp del taller**: el número del botón de WhatsApp en el enlace del cliente.
  Si lo dejas vacío, el cliente solo ve el botón para llamar.

El logo y el color de la sede también se usan en el enlace y en los correos.

Un administrador también puede **unirse a una sede** para formar parte de su
personal. Al borrar una sede, el sistema muestra antes todo lo que se va a borrar.

**Personal.** Se mudó a **Empleados** (sección 13), junto al pago de cada quien.
Configuración deja un enlace. Junto a cada persona, un ícono de campana indica en
cuántos dispositivos tiene push activo: si alguien dice que no le llegan los avisos,
empieza por ahí.

Con **Nuevo Empleado** se da de alta a alguien:

1. **Nombre** y **correo** (será su usuario).
2. **Contraseña temporal**, mínimo 8 caracteres.
3. **Rol**: Administrador, Mecánico o Pintor.
4. **Sede** a la que pertenece.
5. **Crear**.

<!-- IMAGEN: modal de nuevo empleado con todos los campos -->

Para dar de baja a alguien, usa el botón de quitar de su fila. **Si tiene órdenes
asignadas el sistema no lo permite**: primero hay que reasignar ese trabajo. **Si ya
se le pagaron comisiones, tampoco**: sus pagos son el historial de lo que se le
entregó.

---

## 15. Instalar la app en el teléfono

Restorify se puede agregar a la pantalla de inicio. Abre a pantalla completa,
con su ícono, y en iPhone es **obligatorio** para recibir notificaciones.

### Android (Chrome)

1. Abre `restorifyauto.net` en Chrome.
2. Menú ⋮ → **Instalar app** (o **Agregar a pantalla de inicio**).

### iPhone (Safari, iOS 16.4 o posterior)

1. Abre `restorifyauto.net` en **Safari** (no en Chrome ni en otra app).
2. Toca el botón **Compartir** (el cuadro con la flecha).
3. Elige **Agregar a inicio**.
4. Abre Restorify **desde el ícono nuevo**, inicia sesión y activa las
   notificaciones en Configuración.

<!-- IMAGEN: menú Compartir de Safari con "Agregar a inicio" señalado -->

La app instalada siempre carga la versión más reciente del sistema; no hay que
actualizarla.

---

## 16. Qué puede hacer cada rol

| | Administrador | Técnico (mecánico / pintor) |
|---|:---:|:---:|
| Panel principal | Todo, incluido dinero y ocupación | Sin dinero ni ocupación, solo sus órdenes |
| Clientes y vehículos: ver | ✅ | Solo los de sus órdenes, dentro de la orden |
| Clientes y vehículos: crear, editar, **eliminar** | ✅ | ❌ |
| Órdenes: ver | ✅ todas las de la sede | Solo las suyas |
| Ver mano de obra | ✅ | ✅ |
| Ver precios de repuestos, totales y depósito | ✅ | ❌ (ve las piezas sin precio) |
| Agregar o editar mano de obra y repuestos | ✅ | ❌ |
| Asignar el técnico y el tipo de cada tarea | ✅ | ❌ (ve quién tiene cada una) |
| Marcar una tarea como hecha | ✅ todas | ✅ las suyas y las que no tienen técnico |
| Ver su comisión estimada | — | ✅ en sus órdenes |
| Cambiar estado y avance | ✅ | ✅ en sus órdenes: solo En Proceso, Espera Autorización y Finalizado |
| Marcar **Entregado** | ✅ | ❌ |
| Tomar la firma del cliente en la recepción | ✅ | ❌ (la ve) |
| Subir fotos, videos y notas de voz | ✅ | ✅ en sus órdenes no entregadas |
| Publicar archivos al cliente | ✅ | ❌ |
| Abrir una orden de trabajo | ✅ | ❌ |
| Asignar técnicos (incluido a sí mismo) | ✅ | ❌ |
| Enviar reporte al cliente y descargar PDF | ✅ | ❌ |
| Enlace del cliente: ver, compartir, cambiar, avisar novedades | ✅ | ❌ |
| Ver si cada trabajo está autorizado, esperando o rechazado | ✅ | ✅ |
| Enviar presupuestos, registrar autorizaciones, cancelar | ✅ | ❌ |
| Órdenes: **eliminar** | ✅ | ❌ |
| Kanban: mover tarjetas | Todas | Solo las suyas, excepto a Entregado |
| Finanzas, Comisiones y Empleados | ✅ | ❌ |
| Configuración: perfil, idioma, tema, notificaciones | ✅ | ✅ |
| Configuración: sedes y personal | ✅ | ❌ |
| Cambiar de sede | ✅ | ❌ |
| Notificaciones | Recepciones, avances, órdenes finalizadas, tareas hechas | Asignaciones, tareas, comisiones |

Todas estas reglas las aplica la base de datos, así que se cumplen aunque alguien
intente saltarse la interfaz.

---

## 17. Cosas que el sistema hace solo

Conviene conocerlas para no sorprenderse ni registrar el mismo dinero dos veces.

**Al crear una orden con depósito**, el depósito se registra como ingreso.

**Al marcar una orden como Entregado:**
- Se registra como **ingreso** el saldo pendiente (total menos lo ya cobrado).
- Se registra como **egreso** lo que costaron los repuestos.
- Se generan las **comisiones**: la de cada tarea para su técnico (y el reparto de los
  trabajos de antes), y cada uno recibe **un** aviso con su total. Una tarea sin técnico
  no genera comisión.

**Al editar una orden ya entregada**, se registra únicamente la diferencia — como
cargo adicional o como reembolso — y las comisiones pendientes se recalculan.

**Al sacar una orden de Entregado**, se revierten el cobro y el costo de
repuestos, y se borran las comisiones no pagadas. Si se vuelve a entregar, todo
se registra de nuevo.

**Al agregar o quitar mano de obra o repuestos**, los totales se recalculan solos.

**Al pagar comisiones**, se registra el egreso. Al deshacer el pago, se borra.

**Al finalizar una orden**, el avance pasa a 100 % y se avisa a administración.

**Al firmar la recepción**, lo que estaba cotizado queda **autorizado** y empieza a
contar en el total.

**Al agregar un trabajo** después de la firma, queda sin autorizar: no se cobra
hasta que el cliente lo autorice.

**Al responder un presupuesto**, lo autorizado suma al total (y si la orden ya se
entregó, se registra el ajuste en Finanzas); los técnicos reciben qué hacer y qué no,
y al cliente le llega la constancia.

**Al firmar la recepción**, además, se crea el enlace del cliente y, si tiene correo, le
llega el aviso de ingreso.

**Al cambiar el estado de una orden**, si el cliente tiene correo, le llega el aviso
unos minutos después (uno solo aunque la muevas varias veces).

**Al entregar una orden**, el enlace del cliente queda disponible 90 días más.

**Al eliminar una orden**, se eliminan sus archivos, comisiones y movimientos
automáticos. Los importados del banco se conservan.

**Limpieza periódica.** Los avisos leídos se borran a los 60 días y todos a los
180. Los archivos que quedaron a medio subir o de órdenes borradas se eliminan
del almacenamiento.

**El número de orden** se genera de forma que dos órdenes creadas al mismo tiempo
nunca reciban el mismo número.

---

## 18. Problemas comunes

**«El total no incluye un trabajo que agregué.»**
Mira la insignia de la línea: si dice **Sin autorizar** o **Esperando al cliente**,
todavía no se cobra. Envía el presupuesto o registra la autorización.

**«No me deja editar ni borrar una línea.»**
Está **Esperando al cliente**. Cancela el presupuesto, corrige y vuelve a enviarlo.

**«El cliente firmó y los trabajos siguen sin autorizar.»**
Es lo esperado: la firma es la conformidad con cómo dejó el vehículo, no la autorización del
presupuesto. Envía el presupuesto o registra la autorización.

**«No me deja borrar una orden: dice que tiene comisiones pagadas.»**
Deshaz ese pago en **Comisiones**, borra la orden y, si corresponde, vuelve a pagar
las demás comisiones.

**«La app me sacó a la pantalla de inicio de sesión mientras trabajaba.»**
No debería pasar por mala señal. Si pasa, anota la hora y el teléfono y avísale a
administración: es un error que hay que revisar.

**«No me deja entregar la orden.»**
Tiene un presupuesto esperando respuesta. Registra la autorización (si el cliente ya
te respondió) o cancela el presupuesto.

**«Soy técnico: ¿hago este trabajo?»**
Si la línea no tiene insignia, está autorizada. **Sin autorizar** y **Esperando al
cliente**: todavía no. **No realizar**: no.

**«El cliente dice que autorizó y no aparece.»**
Revisa la tarjeta **Presupuesto** y el historial de correos de la tarjeta *Enlace del
cliente*. Si el correo salió pero no respondió, pregúntale por teléfono y usa
**Registrar autorización**.

**«El cliente no recibió el correo.»**
Abre la orden y mira el historial de la tarjeta **Enlace del cliente**:
- *Programado*: todavía está en su espera de 2–3 minutos.
- *No enviado*: el motivo lo dice (sin correo, se dio de baja, ya había recibido ese
  estado).
- *Enviado*: pídele que revise el correo no deseado o las pestañas de Promociones.
- *Error*: avisa a quien administra el sistema.
Mientras tanto, mándale el enlace con **Enviar por WhatsApp**.

**«El cliente dice que el enlace no abre.»**
Si dice "ya no está activo" o "venció", usa **Crear enlace** o **Cambiar enlace** y
mándale el nuevo. Si dice "no válido", el enlace se cortó al copiarlo: vuelve a
mandarlo.

**«El cliente no ve las fotos del avance.»**
Los archivos de los avances son internos hasta que un administrador toca **Mostrar
en el reporte del cliente** en cada uno.

**«No me llegó el correo para recuperar la contraseña.»**
Revisa el correo no deseado. Si aun así no llega, pídele a un administrador que
te asigne una contraseña nueva desde Configuración.

**«Entré pero no veo Finanzas ni Comisiones.»**
Son solo para administradores.

**«Soy técnico y no veo los precios ni el total de la orden.»**
Es a propósito: los precios los maneja administración. Ves la mano de obra, las
piezas sin precio y tu comisión estimada.

**«No puedo agregar mano de obra ni repuestos.»**
Los agrega un administrador. Si hace falta cotizar algo nuevo, avísale o déjalo
en un avance (con nota de voz si es más rápido).

**«No encuentro una orden que sé que existe.»**
Revisa que el filtro de estado esté en «Todos» y —si eres administrador— que
estés en la sede correcta.

**«Me pidieron ayudar en una orden y no puedo editarla.»**
Pídele a un administrador que te asigne a ella. Asignar reparte la comisión de la
mano de obra, así que es una decisión de administración y nadie se pone a sí mismo.

**«No puedo mover la barra de avance.»**
La orden está Finalizada o Entregada, o no estás asignado a ella.

**«Un video no sube / la bandeja dice que falló.»**
Expande la bandeja y lee el motivo. Si es la señal, presiona **Reintentar** con
mejor conexión. Si dice que el video dura más de 2 minutos o pesa más de 50 MB,
grábalo desde el botón **Video** de la app. Si no ves la bandeja pero el archivo
no aparece, vuelve a entrar con la misma cuenta en el mismo teléfono: las
subidas pendientes continúan.

**«La app no me deja usar la cámara o el micrófono.»**
Negaste el permiso. En Chrome: candado junto a la dirección → Permisos. En
iPhone: Ajustes → Safari → Cámara / Micrófono.

**«No me llegan las notificaciones al teléfono.»**
1. Configuración → **Enviar prueba**. Si llega, las notificaciones funcionan.
2. Si la tarjeta dice que no están activas en este dispositivo, actívalas.
3. En iPhone: ¿abriste la app desde el ícono de inicio y no desde Safari?
4. Revisa que el teléfono no tenga las notificaciones del navegador silenciadas
   (modo No molestar, ajustes de notificaciones de Chrome o de la app).
5. ¿Otra persona inició sesión después en ese dispositivo? Vuelve a entrar.
La campana dentro de la app funciona aunque push no esté activo.

**«Registré algo de dinero dos veces.»**
Si es un movimiento manual, bórralo con la papelera. Si es uno automático, no lo
borres: pide ayuda para corregir la orden (sección 12).

**«Presioné Importar Seleccionadas y no pasó nada.»**
Alguna fila marcada quedó sin categoría: el botón está apagado, no roto. Usa
**Asignar a las no clasificadas** o desmárcalas.

**«Importé el mismo estado de cuenta dos veces.»**
Finanzas → Importaciones → **Revertir importación** en la que sobra.

**«El importador dice que no encontró transacciones.»**
Puede ser un estado de cuenta de otro banco (solo se admite Wells Fargo) o un PDF
escaneado. Descárgalo directamente del banco.

**«No puedo eliminar un cliente.»**
Si tiene órdenes registradas, el sistema lo impide para no perder el historial.

**«No puedo dar de baja a un empleado.»**
Si todavía tiene órdenes asignadas hay que reasignarlas primero.

**«Registré un vehículo de subasta y me pide la placa.»**
Marca la casilla **Sin placa**.

---

*Fin del documento. Última revisión del contenido: septiembre de 2026.*
