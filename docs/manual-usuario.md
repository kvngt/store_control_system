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

**Comisión.** La parte de la mano de obra que le toca a cada técnico asignado
cuando la orden se entrega.

**Presupuesto.** Los trabajos que se le presentan al cliente para que los autorice.
**Lo que el cliente no autoriza no se hace ni se cobra.**

---

## 3. Entrar al sistema

Abre la dirección del sistema en el navegador (`reinventa.shop`). Verás la
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

### Cerrar sesión en un teléfono compartido

Si varias personas usan la misma tablet o teléfono, **cierra sesión al terminar**.
Además de proteger tu cuenta, así ese dispositivo deja de recibir tus
notificaciones y empieza a recibir las de quien entre después.

---

## 4. Cómo está organizada la pantalla

<!-- IMAGEN: vista general señalando con flechas o números: (1) barra lateral,
     (2) buscador, (3) selector de sede, (4) idioma, (5) campana, (6) avatar -->

### Barra lateral (izquierda)

El menú principal: Panel principal, Clientes, Vehículos, Órdenes de Trabajo y
Tablero Kanban. Los administradores ven además **Finanzas** y **Comisiones**.
Abajo está Configuración y el botón de cerrar sesión.

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
  Tablero, Clientes y Vehículos.
- Las tablas se transforman en tarjetas, más fáciles de tocar con el dedo.
- Los formularios grandes (como Nueva Orden) se abren a pantalla completa.

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
  capacidad configurada. Si supera el 80 % el indicador se pone rojo.
- **Clientes nuevos del mes.**
- **Gráfico de ingresos contra egresos** de los últimos meses.
- **Alertas**: órdenes esperando repuestos o con poco avance.
- **Órdenes recientes**, con su total.

### Lo que ve un técnico

La misma pantalla, sin nada de dinero: no aparecen ingresos, totales, clientes
nuevos ni el gráfico financiero. Las **alertas** y las **órdenes recientes**
muestran únicamente **sus propias órdenes**.

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

**Si eres técnico**, la pantalla se divide en dos:

- **Mis Órdenes de Trabajo** — las que tienes asignadas. Es lo primero que ves.
- **Otras Órdenes de Trabajo** — el resto de la sede, plegado. Se abre con un
  toque si necesitas consultar el trabajo de un compañero o unirte para ayudar.

<!-- IMAGEN: vista de órdenes de un mecánico, con "Mis Órdenes" arriba y la
     sección "Otras Órdenes" plegada abajo -->

Arriba hay un **buscador** (por número de orden o nombre de cliente) y **filtros
por estado**, que aplican a las dos secciones a la vez.

### Los cinco estados de una orden

| Estado | Qué significa |
|---|---|
| **Recepción** | El vehículo acaba de ingresar. Aún no se trabaja en él. |
| **En Proceso** | Se está trabajando. |
| **Espera Repuestos** | El trabajo está detenido esperando piezas. Genera alerta. |
| **Finalizado** | El trabajo terminó. El avance pasa a 100 % y **se avisa a administración** que está lista para entregar. |
| **Entregado** | El cliente se llevó el vehículo. **Solo un administrador** la marca. Registra el cobro en Finanzas y genera las comisiones (sección 17). |

### Crear una orden

Presiona **Nueva Orden**. El formulario permite registrar todo de una vez,
incluso si el cliente y el vehículo son nuevos.

**1 — Cliente y vehículo.** Elige de las listas, o selecciona «+ Nuevo cliente» /
«+ Nuevo vehículo» para capturarlos en el mismo formulario.

**2 — Tipo de trabajo.** Mecánica, Pintura o Combinado.

**3 — Estado de ingreso del vehículo.**
- **Nivel de gasolina**: E (vacío), 1/4, 1/2, 3/4 o F (lleno).
- **Millas de ingreso**: la lectura del odómetro. Solo números enteros positivos.
- **Depósito** *(solo administradores)*: el anticipo que dejó el cliente.
- **Fecha estimada de entrega.**

**4 — Inspección 360°.** Seis zonas fijas para fotografiar el estado del auto al
entrar: **Frontal, Trasera, Izquierda, Derecha, Interior y Tablero**. Toca cada
recuadro para tomar la foto o elegirla de la galería. Puedes agregar fotos
adicionales para daños previos o documentos.

Las fotos se reducen en el teléfono antes de subirse (mientras tanto el botón
dice «Procesando…»). Así suben rápido aunque la señal sea mala, y se les quita la
ubicación GPS que guarda la cámara.

> Estas fotos son la evidencia del taller si el cliente reclama después un daño
> que ya venía. Tómalas siempre, aunque el auto se vea bien. Son las únicas que
> quedan **visibles para el cliente** desde el principio.

<!-- IMAGEN: cuadrícula de las seis zonas de inspección, algunas ya con foto -->

**5 — Notas de inspección.** Texto libre sobre el estado del vehículo.

**6 — Técnicos asignados.** Un administrador elige quién trabajará la orden. Si
la crea un técnico, **se asigna automáticamente a sí mismo** y no puede asignar a
otros; sus compañeros se unen desde el detalle de la orden.

**7 — Mano de obra y repuestos** *(solo administradores)*. Cada línea de mano de
obra lleva descripción y costo. Cada repuesto lleva descripción, cantidad y
precio. Los repuestos se cobran a lo que costaron: el taller gana en la mano de
obra.

Lo que cotizas aquí queda **sin autorizar** hasta que el cliente **firme la
recepción**: con su firma queda autorizado y empieza a contar en el total.

<!-- IMAGEN: formulario de nueva orden con la nota "Se cobran cuando el cliente firma la recepción o autoriza el presupuesto" -->

Al guardar, el sistema genera el número de orden y abre su detalle. **No hace
falta esperar a que suban las fotos**: siguen subiendo en segundo plano y puedes
seguir usando la app (sección 9).

### Si eres técnico y registras una recepción

Registras lo que ves: cliente, vehículo, fotos, gasolina, millas y notas. No
aparecen depósito, mano de obra ni repuestos: **la cotización la hace
administración**. Al guardar, los administradores reciben el aviso «Recepción
registrada · Falta cotizar».

### El detalle de una orden

Es la pantalla donde se sigue el trabajo día a día.

<!-- IMAGEN: detalle de una orden completo, vista de administrador -->

**Encabezado.** Número de orden, cliente, vehículo y, para administradores, los
botones **Reporte PDF** y **Generar y enviar**.

**Estado.** Un selector con los cinco estados.
- Al elegir **Entregado** el sistema pide confirmación, porque registra dinero.
  Si cancelas, el selector vuelve al estado real.
- Al sacar una orden de **Entregado** también pide confirmación: se revierten el
  cobro y el costo de repuestos, y se borran las comisiones no pagadas.
- Los técnicos no ven la opción Entregado.

**Avance.** Una barra de 0 a 100 %. Se puede mover mientras la orden no esté
**Finalizada** ni **Entregada**.

**Datos del vehículo y del ingreso.** Millas, gasolina, fechas, notas y las fotos
de la inspección 360°.

**Mano de obra.** Las líneas del trabajo cotizado. Un administrador las agrega,
edita y quita; los totales se recalculan solos. Un técnico las ve sin poder
cambiarlas.

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
entregara hoy, con la cuenta a la vista: *mano de obra × porcentaje de la sede ÷
técnicos asignados*. Se confirma al entregar y cambia si cambia la mano de obra o
el equipo.

<!-- IMAGEN: detalle de la misma orden vista por un mecánico: sin totales, con
     repuestos sin precio y la tarjeta "Tu comisión estimada" -->

**Técnicos asignados.** Quién trabaja la orden. Si no estás asignado, verás el
aviso de solo lectura y el botón **Unirme a la orden**. En una orden ya entregada
no te puedes unir, porque cambiaría el reparto de comisiones de quienes hicieron
el trabajo.

**Fotos, videos y notas de voz.** La galería de la orden (sección 9).

**Avance del trabajo.** La bitácora: cada técnico documenta lo que hizo con una
nota y, si quiere, fotos, videos o una nota de voz. Un avance puede ser **solo
una nota de voz**, sin texto. Queda con fecha y autor. Puedes borrar tus propios
avances, pero no los de un compañero.

<!-- IMAGEN: sección de avances con una entrada con fotos y una nota de voz -->

**Firma del cliente.** El cliente firma con el dedo sobre el recuadro. Queda
guardada con fecha y se imprime en el reporte PDF. Se puede limpiar y volver a
firmar; las firmas anteriores quedan como historial.

**Enlace del cliente** *(solo administradores)*. Ver la sección siguiente.

**Reporte PDF y Generar y enviar** *(solo administradores)*. El PDF lleva los
datos de la orden, las fotos de inspección, el desglose, los totales y la firma.
**Generar y enviar** crea el PDF y abre WhatsApp o el correo con el mensaje y el
enlace listos. El enlace deja de funcionar a los 30 días.

> Los técnicos no envían reportes al cliente: lo que sale del taller hacia el
> cliente lo decide administración.

### Enlace del cliente y avisos por correo

Cada orden tiene un **enlace personal** para el cliente, por ejemplo
`reinventa.shop/r/3f9a…`. Al abrirlo, el cliente ve **sin crear una cuenta**:

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
| "Recibimos su vehículo" | ~2 minutos después de firmar la recepción |
| "Estamos trabajando en su vehículo" | ~3 minutos después de pasar a En Proceso |
| "Su vehículo espera repuestos" | ~3 minutos después de pasar a Espera Repuestos |
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

### Orden entregada

Queda cerrada para los técnicos: no pueden cambiar su estado, mano de obra,
repuestos, asignaciones ni subir archivos. Un administrador sí puede corregirla;
cada corrección de dinero se registra como un ajuste en Finanzas.

### Eliminar una orden

Solo un administrador. Borra también sus fotos y videos, sus comisiones y los
movimientos financieros que la orden generó automáticamente. Los movimientos
importados del banco se conservan.

---

## 9. Fotos, videos y notas de voz

Cada orden tiene su galería. Se alimenta desde la **inspección 360°** al crear la
orden y desde **Avance del trabajo** después.

<!-- IMAGEN: barra de captura con los botones Foto, Video, Nota de voz y Galería -->

### Capturar

| Botón | Qué hace | Límite |
|---|---|---|
| **Foto** | Abre la cámara. La foto se reduce antes de subir | — |
| **Video** | Graba dentro de la app, en calidad adecuada para el teléfono. En los últimos 15 segundos el contador se pone rojo y **a los 2 minutos se detiene solo**. Puedes cambiar de cámara antes de grabar, repetir o usar el video | 2 min |
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
columna por estado.

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

Mover una orden a Entregado pide la misma confirmación que en el detalle.

---

## 11. Notificaciones

### La campana

El número rojo sobre la campana son tus avisos sin leer. Llegan **al instante**
mientras la app está abierta, con un mensaje breve en pantalla.

<!-- IMAGEN: campana abierta con tres avisos, uno sin leer -->

- Toca un aviso para abrir su orden; queda marcado como leído.
- **Marcar todo leído** limpia el contador.
- Nunca recibes aviso de algo que hiciste tú.

### Qué avisos llegan

| Aviso | Lo recibe |
|---|---|
| **Nueva orden asignada** | El técnico al que asignan |
| **Ya no estás asignado** | El técnico al que quitan |
| **Recepción registrada · Falta cotizar** | Administradores, cuando un técnico crea una orden |
| **Nuevo avance** | Administradores, cuando un técnico agrega un avance |
| **Lista para entregar** | Administradores, cuando una orden pasa a Finalizado |
| **Comisión generada** | Cada técnico, cuando se entrega su orden, con su monto |

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

---

## 12. Finanzas

**Solo administradores.** Registra todo el dinero que entra y sale de la sede.

<!-- IMAGEN: pantalla de finanzas con las tarjetas de totales y la tabla -->

Arriba: **ingresos**, **egresos** y **balance** del período. Abajo, la tabla de
movimientos con filtros por tipo.

Muchos movimientos **los crea el sistema solo** (depósitos, cobros al entregar,
costo de repuestos, pagos de comisiones; sección 17). No los registres a mano o
quedarán duplicados.

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

1. **Importar Estado de Cuenta**.
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
2. **Desmarca los movimientos que ya existen** (mismo tipo, mismo monto, fecha con
   menos de dos días de diferencia) con la etiqueta «Posible duplicado».
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

```
bolsa        = mano de obra de la orden × porcentaje de la sede
por técnico  = bolsa ÷ técnicos asignados
```

Ejemplo: mano de obra $1,000 al 35 % = bolsa de $350. Con dos técnicos, $175 cada
uno. Con tres, $116.67 + $116.67 + $116.66 (el reparto suma la bolsa exacta).

La comisión **se genera al entregar** la orden y se recalcula sola si cambia la
mano de obra, el equipo asignado o el porcentaje. **Lo ya pagado nunca se
recalcula.**

### Las tres pestañas

- **Saldos pendientes** — cuánto se le debe a cada técnico y de qué órdenes.
- **Historial de comisiones** — cada comisión, pendiente o pagada.
- **Pagos realizados** — los pagos registrados, con su comprobante.

### Pagar un saldo

1. En **Saldos pendientes**, presiona **Pagar saldo** en la fila del técnico.
2. El diálogo muestra el saldo completo y de cuántas órdenes viene. Elige la
   fecha y el método (Cheque, Efectivo, Transferencia).
3. Con **cheque**, escribe el número o adjunta la foto (al menos uno de los dos:
   es lo que permite conciliarlo con el banco).
4. **Registrar pago**.

El monto lo calcula el sistema. El pago se registra solo como egreso en Finanzas.

### Deshacer un pago

En **Pagos realizados**, **Deshacer pago** devuelve esas comisiones a pendientes y
elimina su egreso de Finanzas (solo el de ese pago).

### Cambiar el porcentaje

En la tarjeta de arriba a la derecha, o en Configuración → Sedes. Es por sede, de
0 a 100; por defecto 35 %. Cambiarlo recalcula solo lo pendiente.

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

**Personal.** Cada sede muestra su lista. Junto a cada persona, un ícono de
campana indica en cuántos dispositivos tiene push activo: si alguien dice que
no le llegan los avisos, empieza por ahí.

Con **Nuevo Empleado** se da de alta a alguien:

1. **Nombre** y **correo** (será su usuario).
2. **Contraseña temporal**, mínimo 6 caracteres.
3. **Rol**: Administrador, Mecánico o Pintor.
4. **Sede** a la que pertenece.
5. **Crear**.

<!-- IMAGEN: modal de nuevo empleado con todos los campos -->

Para dar de baja a alguien, usa el botón de quitar de su fila. **Si tiene órdenes
asignadas el sistema no lo permite**: primero hay que reasignar ese trabajo.

---

## 15. Instalar la app en el teléfono

Restorify se puede agregar a la pantalla de inicio. Abre a pantalla completa,
con su ícono, y en iPhone es **obligatorio** para recibir notificaciones.

### Android (Chrome)

1. Abre `reinventa.shop` en Chrome.
2. Menú ⋮ → **Instalar app** (o **Agregar a pantalla de inicio**).

### iPhone (Safari, iOS 16.4 o posterior)

1. Abre `reinventa.shop` en **Safari** (no en Chrome ni en otra app).
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
| Panel principal | Todo, incluido dinero | Sin dinero, solo sus órdenes |
| Clientes y vehículos: ver, crear, editar | ✅ | ✅ |
| Clientes y vehículos: **eliminar** | ✅ | ❌ |
| Órdenes: ver todas las de la sede | ✅ | ✅ (en «Otras órdenes») |
| Órdenes: crear | ✅ completa | ✅ solo recepción, se autoasigna |
| Ver mano de obra | ✅ | ✅ |
| Ver precios de repuestos, totales y depósito | ✅ | ❌ (ve las piezas sin precio) |
| Agregar o editar mano de obra y repuestos | ✅ | ❌ |
| Ver su comisión estimada | — | ✅ en sus órdenes |
| Cambiar estado y avance | ✅ | ✅ en sus órdenes, excepto Entregado |
| Marcar **Entregado** | ✅ | ❌ |
| Subir fotos, videos y notas de voz | ✅ | ✅ en sus órdenes no entregadas |
| Publicar archivos al cliente | ✅ | ❌ |
| Asignar técnicos | ✅ | Solo unirse él mismo |
| Reporte PDF y enviar al cliente | ✅ | ❌ |
| Enlace del cliente: ver, compartir, cambiar, avisar novedades | ✅ | ❌ |
| Ver si cada trabajo está autorizado, esperando o rechazado | ✅ | ✅ |
| Enviar presupuestos, registrar autorizaciones, cancelar | ✅ | ❌ |
| Órdenes: **eliminar** | ✅ | ❌ |
| Kanban: mover tarjetas | Todas | Solo las suyas, excepto a Entregado |
| Finanzas y Comisiones | ✅ | ❌ |
| Configuración: perfil, idioma, tema, notificaciones | ✅ | ✅ |
| Configuración: sedes y personal | ✅ | ❌ |
| Cambiar de sede | ✅ | ❌ |
| Notificaciones | Recepciones, avances, órdenes finalizadas | Asignaciones, comisiones |

Todas estas reglas las aplica la base de datos, así que se cumplen aunque alguien
intente saltarse la interfaz.

---

## 17. Cosas que el sistema hace solo

Conviene conocerlas para no sorprenderse ni registrar el mismo dinero dos veces.

**Al crear una orden con depósito**, el depósito se registra como ingreso.

**Al marcar una orden como Entregado:**
- Se registra como **ingreso** el saldo pendiente (total menos lo ya cobrado).
- Se registra como **egreso** lo que costaron los repuestos.
- Se generan las **comisiones** de los técnicos asignados, y cada uno recibe el
  aviso.

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
Está en **Otras Órdenes de Trabajo**. Ábrela y usa **Unirme a la orden**. Si ya
está entregada, no es posible.

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
