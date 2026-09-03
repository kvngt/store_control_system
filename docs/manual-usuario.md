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
9. [Tablero Kanban](#9-tablero-kanban)
10. [Finanzas](#10-finanzas)
11. [Nómina](#11-nómina)
12. [Configuración](#12-configuración)
13. [Qué puede hacer cada rol](#13-qué-puede-hacer-cada-rol)
14. [Cosas que el sistema hace solo](#14-cosas-que-el-sistema-hace-solo)
15. [Problemas comunes](#15-problemas-comunes)

---

## 1. Qué es Restorify

Restorify lleva el control completo de un taller: los clientes, sus vehículos, las
órdenes de trabajo desde que el auto entra hasta que se entrega, y el dinero que
entra y sale por cada trabajo.

Funciona en el navegador, sin instalar nada. Está pensado para usarse igual desde
una computadora en la oficina que desde el teléfono en el piso del taller.

Un mismo negocio puede tener **varias sedes** (talleres). Cada sede maneja sus
propios clientes, vehículos, órdenes y finanzas por separado.

<!-- IMAGEN: pantalla completa del Panel principal con datos reales, para dar
     una idea general del sistema antes de entrar en detalle -->

---

## 2. Vocabulario del sistema

Vale la pena tener claros estos cinco términos, porque se usan en todas las
pantallas.

**Sede.** Un taller físico. Todo lo que registras pertenece a una sede y no se
mezcla con las demás. Un administrador puede cambiar de sede desde el selector
del encabezado; el resto del personal solo ve la suya.

**Rol.** Define qué puede hacer cada persona. Hay tres: **administrador**,
**mecánico** y **pintor**. Mecánicos y pintores tienen exactamente los mismos
permisos; la diferencia es el tipo de tarea que se les asigna.

**Cliente.** La persona dueña del vehículo. Un cliente puede tener varios
vehículos y varias órdenes.

**Vehículo.** El auto. Pertenece a un cliente y se identifica por su VIN
(el número de serie de 17 caracteres) y, cuando la tiene, su placa.

**Orden de trabajo.** El trabajo concreto que se le hará a un vehículo. Es el
centro del sistema: dentro de ella viven las fotos de ingreso, la mano de obra,
los repuestos, los técnicos asignados, el avance y la firma del cliente. Cada
orden recibe un número automático con el formato `ORD-2026-001`.

---

## 3. Entrar al sistema

Abre la dirección del sistema en el navegador. Verás la pantalla de acceso.

1. Escribe tu **correo electrónico**.
2. Escribe tu **contraseña**.
3. Presiona **Entrar**.

<!-- IMAGEN: pantalla de acceso completa -->

**No existe registro público.** Las cuentas las crea un administrador desde
Configuración. Si no tienes cuenta, pídesela a quien administre el sistema.

En la misma pantalla puedes cambiar el idioma entre **Español** e **English** con
los botones de abajo. La elección se recuerda para la próxima vez.

Si el correo o la contraseña no son correctos, aparece un aviso rojo sobre el
formulario y no se entra.

### Si olvidaste tu contraseña

1. Presiona **¿Olvidaste tu contraseña?** debajo del botón Entrar.
2. Escribe tu correo y presiona **Enviar enlace**.
3. Revisa tu bandeja de entrada —y la carpeta de correo no deseado— y abre el
   enlace que recibiste.
4. El enlace te lleva a una pantalla para escribir tu **contraseña nueva** dos
   veces. Al guardarla entras directo al sistema.

<!-- IMAGEN: pantalla de "Recuperar contraseña" con el campo de correo -->

Por seguridad el mensaje de confirmación es el mismo exista o no una cuenta con
ese correo, para que nadie pueda averiguar qué correos están registrados. Si no
recibes nada, pídele a un administrador que te asigne una contraseña nueva desde
Configuración.

---

## 4. Cómo está organizada la pantalla

Todas las pantallas comparten la misma estructura.

<!-- IMAGEN: vista general señalando con flechas o números: (1) barra lateral,
     (2) buscador, (3) selector de sede, (4) idioma, (5) campana, (6) avatar -->

### Barra lateral (izquierda)

El menú principal. Contiene Panel principal, Clientes, Vehículos, Órdenes de
Trabajo y Tablero Kanban. Los administradores ven además Finanzas y Nómina.
Abajo está Configuración y el botón de cerrar sesión.

Se puede plegar con la flecha para ganar espacio en pantalla.

### Encabezado (arriba)

- **Buscador global.** Escribe al menos 2 caracteres y busca a la vez entre
  clientes, vehículos y órdenes. Los resultados aparecen agrupados por tipo;
  al hacer clic te lleva directo al registro.
- **Selector de sede** (solo administradores). Cambia el taller activo. Todo lo
  que veas a partir de ese momento —panel, clientes, órdenes, finanzas— será de
  la sede seleccionada.
- **Idioma.** Botones ES / EN.
- **Campana de notificaciones.** Avisa de órdenes que necesitan atención:
  las que están esperando repuestos y las que llevan poco avance estando en
  proceso. Si eres mecánico o pintor, **solo verás avisos de las órdenes que
  tienes asignadas**. Un administrador ve las de toda la sede.
- **Avatar.** Tu foto o tus iniciales. Lleva a Configuración.

### En el teléfono

La barra lateral se convierte en un menú que se abre con el botón ☰ de arriba a
la izquierda, y aparece una **barra inferior** con los cinco accesos más usados:
Panel, Órdenes, Tablero, Clientes y Vehículos.

Las tablas se transforman en tarjetas, más fáciles de tocar con el dedo.

<!-- IMAGEN: comparación lado a lado de la lista de órdenes en computadora
     (tabla) y en teléfono (tarjetas) -->

---

## 5. Panel principal

Es la pantalla de inicio. Resume cómo va el taller.

<!-- IMAGEN: panel principal de un administrador -->

### Lo que ve un administrador

- **Órdenes activas** y cuántas se terminaron este mes.
- **Ingresos del mes.**
- **Tasa de ocupación**: cuántos espacios del taller están ocupados respecto a la
  capacidad configurada. Si supera el 80% el indicador se pone rojo.
- **Clientes nuevos del mes.**
- **Gráfico de ingresos contra egresos** de los últimos meses.
- **Alertas**: órdenes esperando repuestos o con poco avance.
- **Órdenes recientes.**

### Lo que ve un mecánico o pintor

La misma pantalla, sin nada de dinero: no aparecen ingresos, ni clientes nuevos,
ni el gráfico financiero. Y tanto las **alertas** como las **órdenes recientes**
muestran únicamente **sus propias órdenes**, no las de sus compañeros.

<!-- IMAGEN: panel principal de un mecánico, para contrastar con el anterior -->

---

## 6. Clientes

Lista de todas las personas registradas en la sede, con su teléfono, correo,
cuántos vehículos tienen y cuántas órdenes han generado.

<!-- IMAGEN: lista de clientes -->

### Registrar un cliente

1. Presiona **Nuevo Cliente**.
2. Llena nombre y teléfono (obligatorios), y correo, dirección y notas si los tienes.
3. **Crear**.

Las **notas** son un espacio libre para lo que convenga recordar de ese cliente:
preferencias, acuerdos, aclaraciones.

### Ver el perfil de un cliente

El botón del ojo abre su ficha completa: sus datos, todos sus vehículos y el
historial de órdenes con el estado de cada una.

<!-- IMAGEN: perfil de un cliente con vehículos e historial -->

### Editar y eliminar

El lápiz edita los datos. **El botón de eliminar solo aparece para
administradores**: borrar un cliente arrastra consigo todos sus vehículos, así
que es una acción reservada. Si el cliente tiene órdenes de trabajo, el sistema
impide borrarlo.

---

## 7. Vehículos

Todos los autos registrados en la sede, con marca, modelo, año, VIN, placa,
color y dueño.

<!-- IMAGEN: lista de vehículos -->

### Registrar un vehículo

El formulario está pensado para llenarse casi solo a partir del VIN.

1. Presiona **Nuevo Vehículo**.
2. **Dueño**: elige un cliente de la lista, o créalo ahí mismo sin salir del
   formulario.
3. **VIN**: escribe los 17 caracteres. Al terminar, el sistema consulta la base
   de datos oficial de vehículos y rellena marca, modelo y año automáticamente.
   Debajo aparecen los datos adicionales que trae el VIN (motor, carrocería,
   planta de ensamblaje).
4. Revisa **marca, modelo y año**. Puedes corregirlos a mano; lo que escribas
   tiene prioridad sobre lo que trajo el VIN.
5. **Color**: elige de la lista o escríbelo. El color no viene en el VIN.
6. **Placa**: elige el estado que la emitió y escribe el número. El sistema
   comprueba que el formato tenga sentido para ese estado y avisa si algo no
   cuadra, sin impedirte guardarla (hay placas personalizadas).
7. **Crear**.

<!-- IMAGEN: formulario de vehículo con el VIN ya decodificado, mostrando los
     campos rellenados solos y las etiquetas de datos del VIN -->

### Vehículos sin placa

Las unidades compradas en subasta llegan sin placa. Marca la casilla
**Sin placa** y los campos de placa y estado se desactivan. En las listas ese
vehículo aparecerá con la etiqueta «Sin placa».

No inventes un texto de relleno como «SIN PLACA» o «N/A» en el campo: aparecería
en las búsquedas y se imprimiría en la orden como si fuera una placa real.

<!-- IMAGEN: formulario con la casilla "Sin placa" marcada y los campos apagados -->

### Editar y eliminar

El lápiz edita. **Eliminar es solo para administradores**, porque borra el
historial de servicio de ese vehículo.

---

## 8. Órdenes de trabajo

El módulo más grande. Aquí vive el trabajo del taller.

### Cómo se ve la lista

**Si eres administrador**, ves una sola lista con todas las órdenes de la sede.

**Si eres mecánico o pintor**, la pantalla se divide en dos:

- **Mis Órdenes de Trabajo** — las que tienes asignadas. Es lo primero que ves.
- **Otras Órdenes de Trabajo** — el resto del tablero de la sede, plegado. Se
  abre con un clic si necesitas consultar el trabajo de un compañero o unirte a
  una orden para ayudar.

<!-- IMAGEN: vista de órdenes de un mecánico, con "Mis Órdenes" arriba y la
     sección "Otras Órdenes" plegada abajo -->

Arriba hay un **buscador** (por número de orden o nombre de cliente) y **filtros
por estado**. Los filtros aplican a las dos secciones a la vez.

### Los cinco estados de una orden

| Estado | Qué significa |
|---|---|
| **Recepción** | El vehículo acaba de ingresar. Aún no se trabaja en él. |
| **En Proceso** | Se está trabajando. Es el único estado en el que se puede mover el porcentaje de avance. |
| **Espera Repuestos** | El trabajo está detenido esperando piezas. Genera alerta. |
| **Finalizado** | El trabajo terminó. El avance pasa a 100% automáticamente. |
| **Entregado** | El cliente se llevó el vehículo. **Dispara los movimientos financieros** (ver sección 14). |

### Crear una orden

Presiona **Nueva Orden**. El formulario permite registrar todo de una vez,
incluso si el cliente y el vehículo son nuevos.

**1 — Cliente y vehículo.** Elige de las listas, o selecciona «+ Nuevo cliente» /
«+ Nuevo vehículo» para capturarlos en el mismo formulario.

**2 — Tipo de trabajo.** Mecánica, Pintura o Combinado.

**3 — Estado de ingreso del vehículo.**
- **Nivel de gasolina**: E (vacío), 1/4, 1/2, 3/4 o F (lleno).
- **Millas de ingreso**: la lectura del odómetro. Solo acepta números enteros
  positivos; si escribes un signo menos, se descarta y te lo explica.
- **Depósito**: el anticipo que dejó el cliente, si lo hubo.
- **Fecha estimada de entrega.**

**4 — Inspección 360°.** Seis zonas fijas para fotografiar el estado del auto al
entrar: **Frontal, Trasera, Izquierda, Derecha, Interior y Tablero**. Toca cada
recuadro para tomar la foto con la cámara o elegirla de la galería. Puedes
agregar fotos adicionales para daños previos o documentos.

> Estas fotos son la evidencia del taller si el cliente reclama después un daño
> que ya venía. Vale la pena tomarlas siempre, aunque el auto se vea bien.

<!-- IMAGEN: cuadrícula de las seis zonas de inspección, algunas ya con foto -->

**5 — Notas de inspección.** Texto libre sobre el estado del vehículo.

**6 — Técnicos asignados.** Un administrador elige quién trabajará la orden. Si
la orden la crea un mecánico o un pintor, **se asigna automáticamente a sí
mismo** y no puede asignar a otros; sus compañeros se unen ellos mismos desde el
detalle de la orden.

**7 — Mano de obra y repuestos.** Cada línea de mano de obra lleva descripción y
costo. Cada repuesto lleva descripción, cantidad, **costo** y **precio**:

- **Costo** es lo que el taller pagó por la pieza.
- **Precio** es lo que se le cobra al cliente.

Los dos importan. El precio forma el total de la orden; el costo se registra como
egreso en Finanzas al entregar. Si dejas el costo vacío, la ganancia de esa orden
aparecerá inflada.

<!-- IMAGEN: sección de repuestos del formulario mostrando las columnas
     Descripción, Cantidad, Costo y Precio -->

Al guardar, el sistema genera el número de orden y abre su detalle.

### El detalle de una orden

Es la pantalla donde se sigue el trabajo día a día.

<!-- IMAGEN: detalle de una orden completo -->

**Encabezado.** Número de orden, cliente, vehículo, y botones para generar el
reporte en PDF y volver a la lista.

**Estado.** Botones para mover la orden entre los cinco estados. Al marcar
**Entregado** el sistema pide confirmación explícita, porque ese cambio registra
dinero automáticamente.

**Avance.** Una barra de 0 a 100%. Solo se puede mover cuando la orden está
**En Proceso**.

**Datos del vehículo y del ingreso.** Millas, gasolina, fechas, notas y las fotos
de la inspección 360°. Al tocar una foto se amplía.

**Mano de obra y repuestos.** Se pueden agregar, editar y quitar líneas en
cualquier momento. Los totales se recalculan solos.

**Técnicos asignados.** Muestra quién trabaja la orden. Si no estás asignado,
verás el botón **Unirme a la orden**: hasta que lo hagas, la orden es de solo
lectura para ti.

**Avance del trabajo.** Aquí cada técnico documenta lo que hizo, con una nota y
fotos opcionales. Es la bitácora del trabajo y queda con fecha y autor. Puedes
borrar tus propios avances, pero no los de un compañero.

<!-- IMAGEN: sección de avances con dos o tres entradas con foto -->

**Firma del cliente.** El cliente firma con el dedo sobre el recuadro. Queda
guardada con fecha y se imprime en el reporte PDF. Se puede limpiar y volver a
firmar.

<!-- IMAGEN: recuadro de firma con una firma capturada -->

**Reporte PDF.** Genera un documento con todos los datos de la orden, las fotos
de inspección, el desglose de mano de obra y repuestos, los totales y la firma.
Es lo que se le entrega al cliente.

### Eliminar una orden

Solo un administrador puede hacerlo, y borra también los movimientos financieros
que la orden generó automáticamente.

---

## 9. Tablero Kanban

La misma información que la lista de órdenes, vista como un tablero con una
columna por estado.

<!-- IMAGEN: tablero Kanban con tarjetas repartidas en las columnas -->

Arriba se muestra la **ocupación del taller**: cuántas órdenes activas hay contra
la capacidad configurada para la sede.

Hay dos formas de cambiar una orden de estado:

- **En computadora**, arrastra su tarjeta a otra columna.
- **En teléfono**, cada tarjeta tiene abajo un selector **Mover a** con la lista
  de estados. El arrastre no existe en pantallas táctiles, así que este selector
  es el camino equivalente.

<!-- IMAGEN: tarjeta del Kanban en teléfono, mostrando el selector "Mover a" -->

Un administrador puede mover cualquier orden; un mecánico o pintor solo las que
tiene asignadas. En las tarjetas que no puedes mover, el selector no aparece.

Al mover una orden a **Entregado** se pide la misma confirmación que en el
detalle, porque también dispara los movimientos financieros.

En el teléfono el tablero se recorre deslizando de lado, una columna a la vez.

---

## 10. Finanzas

**Solo administradores.** Registra todo el dinero que entra y sale de la sede.

<!-- IMAGEN: pantalla de finanzas con las tarjetas de totales y la tabla -->

Arriba: **ingresos**, **egresos** y **balance** del período. Abajo, la tabla de
movimientos con filtros por tipo.

### Registrar un movimiento a mano

1. **Nueva Transacción**.
2. **Tipo**: ingreso o egreso.
3. **Categoría**: Pago de Cliente, Compra de Repuestos, Planilla o Gasto Operativo.
4. **Monto** y **fecha**.
5. **Orden vinculada** (opcional): asocia el movimiento a una orden de trabajo
   concreta. Sirve para dar seguimiento — por ejemplo, una compra de repuestos
   que hiciste por fuera del ciclo normal de la orden.
6. **Descripción**.
7. **Crear**.

En la tabla, la columna **Orden vinculada** muestra el número de la orden y
lleva directo a su detalle.

<!-- IMAGEN: modal de nueva transacción con el selector "Orden vinculada"
     desplegado -->

### Importar el estado de cuenta del banco

Permite cargar el PDF del estado de cuenta y registrar sus movimientos sin
teclearlos uno por uno.

> Por ahora solo entiende estados de cuenta de **Wells Fargo**. El archivo debe
> ser el PDF descargado del banco, no un escaneo ni una foto: un escaneo no
> contiene texto y no se puede leer.

1. **Importar Estado de Cuenta**.
2. Selecciona el PDF. Todo el procesamiento ocurre en tu navegador; el archivo no
   se envía a ningún servicio externo.
3. Aparece la lista de transacciones encontradas. Para cada una el sistema
   propone una categoría según palabras clave, marca las que parecen
   transferencias internas y avisa de posibles duplicados de algo ya registrado.
4. Revisa, ajusta categorías, desmarca lo que no quieras importar.
5. **Importar seleccionadas**.

> **Toda fila marcada necesita categoría.** El sistema propone una según
> palabras clave, pero hay movimientos que ninguna regla reconoce —los cheques,
> por ejemplo, no traen a quién se le pagó—. Mientras quede una fila marcada sin
> categoría, el botón **Importar Seleccionadas** permanece apagado y arriba de
> él aparece cuántas faltan.
>
> Para resolverlo rápido usa la barra **Asignar a las no clasificadas**: eliges
> una categoría y se aplica de golpe a todas las que estén sin clasificar. La
> otra salida es desmarcar las filas que no quieras importar.

Cada importación queda registrada y se puede revertir en bloque.

<!-- IMAGEN: tabla de revisión de la importación, con categorías sugeridas y
     alguna fila marcada como posible duplicado -->

---

## 11. Nómina

**Solo administradores.** Registra los pagos al personal.

1. **Nuevo Pago**.
2. Elige el **empleado**.
3. Define el **período** (inicio y fin) y la **fecha de pago**.
4. Escribe el **salario base**, y los **bonos** y **deducciones** si los hay.
5. **Crear**.

El total pagado se calcula solo. Cada pago registrado genera automáticamente su
egreso correspondiente en Finanzas, categoría Planilla.

<!-- IMAGEN: pantalla de nómina con la tabla de pagos -->

---

## 12. Configuración

Accesible para todos desde el avatar del encabezado, pero con contenido distinto
según el rol.

### Para todos: tu perfil

- Cambiar tu **foto**, **nombre**, **correo** y **teléfono**.
- Elegir **idioma** (Español / English).
- Elegir **tema** (oscuro / claro).

<!-- IMAGEN: sección de perfil y las opciones de idioma y tema -->

### Solo administradores: sedes y personal

**Sedes.** Crear talleres nuevos y editar los existentes: nombre, dirección,
teléfono, **logotipo** y **color de acento** (que tiñe la interfaz de esa sede), y
la **capacidad**, que es el número de espacios de trabajo y sirve para calcular
la tasa de ocupación.

Un administrador también puede **unirse a una sede** para pasar a formar parte
de su personal.

**Empleados.** Cada sede muestra su lista de personal. Con **Nuevo Empleado** se
da de alta a alguien:

1. **Nombre** y **correo** (será su usuario).
2. **Contraseña temporal**, mínimo 6 caracteres. Se la entregas para que entre.
3. **Rol**: Administrador, Mecánico o Pintor.
4. **Sede** a la que pertenece.
5. **Crear**.

<!-- IMAGEN: modal de nuevo empleado con todos los campos -->

Para dar de baja a alguien, usa el botón de quitar de su fila. **Si tiene órdenes
asignadas el sistema no lo permite**: primero hay que reasignar ese trabajo.

---

## 13. Qué puede hacer cada rol

| | Administrador | Mecánico / Pintor |
|---|:---:|:---:|
| Panel principal | Todo, incluido dinero | Sin datos financieros, solo sus órdenes |
| Clientes: ver, crear, editar | ✅ | ✅ |
| Clientes: **eliminar** | ✅ | ❌ |
| Vehículos: ver, crear, editar | ✅ | ✅ |
| Vehículos: **eliminar** | ✅ | ❌ |
| Órdenes: ver todas | ✅ | ✅ (en «Otras órdenes») |
| Órdenes: crear | ✅ | ✅ (se autoasigna) |
| Órdenes: editar | ✅ | Solo las asignadas a él |
| Órdenes: asignar técnicos | ✅ | Solo unirse él mismo |
| Órdenes: **eliminar** | ✅ | ❌ |
| Kanban: mover tarjetas | Todas | Solo las asignadas a él |
| Finanzas y Nómina | ✅ | ❌ (sin acceso) |
| Configuración: perfil, idioma, tema | ✅ | ✅ |
| Configuración: sedes y empleados | ✅ | ❌ |
| Cambiar de sede | ✅ | ❌ |
| Notificaciones | De toda la sede | Solo de sus órdenes |

Estas restricciones no dependen de que un botón esté oculto: están aplicadas en
la base de datos, así que se cumplen aunque alguien intente saltarse la
interfaz.

---

## 14. Cosas que el sistema hace solo

Conviene conocerlas para no sorprenderse ni registrar el mismo dinero dos veces.

**Al crear una orden con depósito**, el depósito se registra como ingreso en
Finanzas.

**Al marcar una orden como Entregado** ocurren dos cosas a la vez:
- Se calcula el saldo pendiente (total de la orden menos lo ya cobrado) y se
  registra como **ingreso**.
- Se suma lo que costaron los repuestos (cantidad × costo) y se registra como
  **egreso**.

**Al editar una orden ya entregada**, si el total cambia, se registra únicamente
la diferencia — como cargo adicional o como reembolso. Lo mismo con los
repuestos: si agregas uno después, se registra solo su costo.

**Al agregar o quitar mano de obra o repuestos**, los totales de la orden se
recalculan solos.

**Al registrar un pago de nómina**, se genera su egreso correspondiente.

**Al eliminar una orden**, se eliminan también los movimientos que ella generó,
para que las cuentas no queden descuadradas. Los movimientos importados del banco
se conservan, porque ese dinero sí se movió.

**El número de orden** se genera de forma que dos órdenes creadas al mismo tiempo
nunca reciban el mismo número.

---

## 15. Problemas comunes

**«No me llegó el correo para recuperar la contraseña.»**
Revisa la carpeta de correo no deseado. Si aun así no llega, el envío de correos
del sistema puede no estar configurado todavía; pídele a un administrador que te
asigne una contraseña nueva desde Configuración.

**«Entré pero no veo Finanzas ni Nómina.»**
Esas secciones son solo para administradores. Si necesitas acceso, un
administrador debe cambiar tu rol desde Configuración.

**«No encuentro una orden que sé que existe.»**
Revisa dos cosas: que el filtro de estado esté en «Todos», y —si eres
administrador— que estés en la sede correcta. Cada sede muestra solo sus datos.

**«Soy mecánico y no veo la orden en la que me pidieron ayudar.»**
Está en la sección **Otras Órdenes de Trabajo**, plegada debajo de las tuyas.
Ábrela y usa **Unirme a la orden** para poder editarla.

**«No puedo mover la barra de avance.»**
Solo se puede mover cuando la orden está **En Proceso**, y solo si estás asignado
a ella.

**«Presioné Importar Seleccionadas y no pasó nada.»**
Casi siempre es que alguna fila marcada quedó sin categoría: el botón está
apagado, no roto. Justo encima de él aparece el motivo y cuántas filas faltan.
Asígnales una categoría con la barra **Asignar a las no clasificadas**, o
desmárcalas.

**«El importador dice que no encontró transacciones.»**
Puede ser un estado de cuenta de otro banco (solo se admite Wells Fargo) o un PDF
escaneado. Descarga el archivo directamente del banco en lugar de escanear el
papel.

**«No puedo eliminar un cliente.»**
Si tiene órdenes de trabajo registradas, el sistema lo impide para no perder el
historial. Además, eliminar clientes es solo para administradores.

**«No puedo dar de baja a un empleado.»**
Si todavía tiene órdenes asignadas hay que reasignarlas primero.

**«Registré un vehículo de subasta y me pide la placa.»**
Marca la casilla **Sin placa** en el formulario.

---

*Fin del documento. Última revisión del contenido: septiembre de 2026.*
