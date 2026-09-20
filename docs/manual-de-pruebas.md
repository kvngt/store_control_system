# Manual de pruebas para tester

Guía paso a paso para que **una persona** pruebe Restorify completo desde la pantalla, como
lo usaría el taller: sin programar y sin tocar la base de datos. Cada caso dice qué hacer y
qué tiene que pasar. Si pasa otra cosa, es un fallo que hay que reportar.

> Hay otro documento, [plan-de-pruebas.md](plan-de-pruebas.md), con casos técnicos (API,
> SQL, pruebas automáticas) pensados para programadores y agentes de IA. Este no los
> necesita.

---

## Índice

0. [Antes de empezar](#0-antes-de-empezar)
1. [Sesión A — Entrar y contraseñas](#sesión-a--entrar-y-contraseñas)
2. [Sesión B — Sedes y personal](#sesión-b--sedes-y-personal)
3. [Sesión C — Clientes y vehículos](#sesión-c--clientes-y-vehículos)
4. [Sesión D — Una orden de principio a fin (administrador)](#sesión-d--una-orden-de-principio-a-fin-administrador)
5. [Sesión E — La misma orden vista por el técnico](#sesión-e--la-misma-orden-vista-por-el-técnico)
6. [Sesión F — Presupuestos y autorización del cliente](#sesión-f--presupuestos-y-autorización-del-cliente)
7. [Sesión G — Enlace del cliente y correos](#sesión-g--enlace-del-cliente-y-correos)
8. [Sesión H — Entregar, cobrar y pagar comisiones](#sesión-h--entregar-cobrar-y-pagar-comisiones)
9. [Sesión I — Finanzas](#sesión-i--finanzas)
10. [Sesión J — Notificaciones y teléfono](#sesión-j--notificaciones-y-teléfono)
11. [Sesión K — Tablero, panel y búsqueda](#sesión-k--tablero-panel-y-búsqueda)
12. [Sesión L — Uso real: tablet compartida, mala señal, idioma](#sesión-l--uso-real-tablet-compartida-mala-señal-idioma)
13. [Sesión M — Borrar y deshacer](#sesión-m--borrar-y-deshacer)
14. [Cómo reportar un fallo](#14-cómo-reportar-un-fallo)
15. [Hoja de resultados](#15-hoja-de-resultados)

---

## 0. Antes de empezar

### 0.1 Qué necesitas

| Qué | Para qué |
|---|---|
| Una computadora con Chrome | La mayoría de las sesiones |
| Un teléfono **Android** con Chrome | Fotos, video, notas de voz, push |
| Un **iPhone** con Safari (si hay) | Lo mismo; en iPhone las notificaciones funcionan distinto |
| **Cuatro correos que puedas abrir** | Uno por cuenta: administrador, mecánico, pintor y un "cliente" |
| Un PDF de estado de cuenta de **Wells Fargo** (opcional) | Importación bancaria (sesión I) |
| 2 a 3 horas en total | Se puede hacer por sesiones, en días distintos |

> **Truco para los correos.** Con Gmail puedes usar alias: si tu correo es
> `nombre@gmail.com`, también te llegan los de `nombre+mecanico@gmail.com`,
> `nombre+pintor@gmail.com` y `nombre+cliente@gmail.com`. Cuentan como correos distintos
> para la app y todo llega a tu misma bandeja.

### 0.2 Dejar la plataforma limpia

Para que los números de las pruebas cuadren, empieza sin órdenes, clientes ni movimientos.
Quien administra Supabase usa [scripts/admin/limpiar-datos.sql](../scripts/admin/limpiar-datos.sql)
(borra datos y usuarios de prueba, conserva el administrador que indiques y las sedes) y
vacía los buckets de Storage que indica el propio script.

Si al terminar no queda ningún administrador, nadie puede entrar ni crear cuentas: se
recupera con [scripts/admin/crear-primer-admin.sql](../scripts/admin/crear-primer-admin.sql).

### 0.3 El caso de prueba (números para comprobar)

Todas las sesiones usan la misma orden. Los montos son redondos a propósito:

| Dato | Valor |
|---|---|
| Cliente | **Cliente Prueba**, teléfono `555-0100`, tu correo de "cliente" |
| Vehículo | VIN `1HGCM82633A004352` (debe decodificar un **Honda Accord 2003**), color Gris, **sin placa** |
| Depósito | **$300** |
| Mano de obra al crear | **Frenos $1,000** |
| Repuesto al crear | **Pastillas**, cantidad 2 × $100 = **$200** |
| Agregado después (presupuesto) | **Alineación $150** (el cliente la autoriza) y **Pintura puerta $400** (la rechaza) |
| Técnicos asignados | El mecánico y el pintor |
| Porcentaje de comisión de la sede | **35 %** |

Lo que debe resultar al final, y que se va comprobando en cada sesión:

| Concepto | Cuenta | Resultado |
|---|---|---|
| Total autorizado | 1,000 + 200 + 150 | **$1,350** |
| Pago final al entregar | 1,350 − 300 de depósito | **$1,050** |
| Costo de repuestos al entregar | | **$200** (egreso) |
| Bolsa de comisión | (1,000 + 150) × 35 % | **$402.50** |
| Comisión de cada técnico | 402.50 ÷ 2 | **$201.25** |
| Ingresos del mes | 300 + 1,050 | **$1,350** |

### 0.4 Cómo marcar

Marca cada caso con ✅ (salió como dice), ❌ (salió distinto: repórtalo, sección 14) o ⏭️
(no se pudo probar; anota por qué). Anota **fecha, dispositivo y cuenta** usada en la
[hoja de resultados](#15-hoja-de-resultados).

Prioridad: **🔴** = si falla, no se sale a producción. **🟡** = importante. **⚪** = detalle.

---

## Sesión A — Entrar y contraseñas

Cuenta: el administrador. Dispositivo: computadora.

| # | Pri | Pasos | Debe pasar |
|---|---|---|---|
| A-01 | 🔴 | Abre `reinventa.shop` sin haber entrado antes | Aparece la pantalla de inicio de sesión. No hay ningún botón de "registrarse" |
| A-02 | 🔴 | Entra con el correo y la contraseña correctos | Entra al **Panel principal** |
| A-03 | 🔴 | Cierra sesión. Entra con la contraseña equivocada | Aviso rojo: "Correo o contraseña incorrectos…". No entra |
| A-04 | 🟡 | Entra con un correo que no existe | El mismo aviso que A-03 (no revela si el correo existe) |
| A-05 | 🟡 | Entra y **recarga la página** (F5) | Sigue dentro, no vuelve al login |
| A-06 | 🟡 | Cierra la pestaña, ábrela otra vez | Sigue dentro |
| A-07 | 🔴 | Cierra sesión y presiona el botón **Atrás** del navegador | No se ven datos; vuelve al login |
| A-08 | 🔴 | **¿Olvidaste tu contraseña?** → tu correo → **Enviar enlace** | Mensaje: "Si existe una cuenta con ese correo, te enviamos un enlace…" |
| A-09 | 🔴 | Abre el correo que llegó (revisa también no deseado) y toca el enlace | Abre **Nueva contraseña** en `reinventa.shop/reset-password` (no `localhost`) |
| A-10 | 🟡 | Escribe una contraseña de 5 letras en los dos campos → **Guardar contraseña** | "La contraseña debe tener al menos 8 caracteres." |
| A-11 | 🟡 | Escribe dos contraseñas distintas | "Las dos contraseñas no coinciden." |
| A-12 | 🔴 | Escribe la misma contraseña nueva (8+) dos veces → Guardar → **Entrar al sistema** | "Tu contraseña se cambió correctamente." y luego entra al Panel |
| A-13 | 🔴 | Cierra sesión. Entra con la contraseña **anterior** | No entra |
| A-14 | 🔴 | Entra con la **nueva** | Entra |
| A-15 | 🟡 | Abre **otra vez el mismo enlace** del correo | "Este enlace ya no sirve: venció o ya se usó…" y un botón para volver. No muestra el formulario |
| A-16 | ⚪ | Pide el enlace dos veces seguidas en menos de un minuto | La segunda vez puede decir "Ya se envió un correo hace poco…". No debe decir "revisa tu conexión" |
| A-17 | ⚪ | Cambia el idioma a **English** en el login | Todo el login en inglés; al recargar se recuerda |

> **Si el correo de A-08 no llega.** El correo de recuperación lo manda Supabase, no Resend.
> Con el servidor de correo que trae Supabase de fábrica se envían muy pocos por hora y
> solo a correos del equipo del proyecto en Supabase. Si te llega a ti pero no al mecánico
> (sesión B), no es un fallo de la app: falta configurar un SMTP propio
> ([salida-a-produccion.md](salida-a-produccion.md), PRD-05). Anótalo como ⏭️ con ese motivo.

---

## Sesión B — Sedes y personal

Cuenta: administrador. Dispositivo: computadora. Menú: **Configuración**.

### Sedes

| # | Pri | Pasos | Debe pasar |
|---|---|---|---|
| B-01 | 🟡 | Edita la sede: dirección, teléfono, **correo de contacto** (uno tuyo), **WhatsApp**, capacidad **5**, porcentaje de comisión **35** | Se guarda. Al recargar sigue igual |
| B-02 | ⚪ | Sube un **logo** y cambia el **color de acento** | El logo y el color se ven en la app sin recargar |

### Personal

| # | Pri | Pasos | Debe pasar |
|---|---|---|---|
| B-03 | 🔴 | **Nuevo usuario**: nombre "Luis Mecánico", tu correo de mecánico, contraseña temporal `Temporal-2026`, rol **Mecánico**, la sede → **Crear** | "Empleado creado correctamente." Aparece en la lista |
| B-04 | 🔴 | Igual con "Pedro Pintor", correo de pintor, rol **Pintor** | Aparece en la lista |
| B-05 | 🟡 | Intenta crear otro con una contraseña de 5 caracteres | "La contraseña temporal debe tener al menos 8 caracteres." No lo crea |
| B-06 | 🔴 | Intenta crear otro con **el mismo correo** del mecánico (cambia mayúsculas) | "Ya existe una cuenta con ese correo…". Nunca un texto en inglés como "non-2xx status code" |
| B-07 | 🟡 | Intenta crear uno sin elegir sede | Te pide elegir la sede |
| B-08 | 🔴 | En otra ventana **de incógnito**, entra como el mecánico con `Temporal-2026` | Entra. En el menú **no** aparecen Finanzas ni Comisiones |
| B-09 | 🔴 | Como mecánico, abre Configuración | Ve su perfil, idioma, tema y notificaciones. **No** ve Sedes ni Personal |
| B-10 | 🔴 | Como admin, edita al mecánico y ponle contraseña nueva `Mecanico-2026` → Guardar | "Usuario actualizado". En incógnito, la vieja ya no entra y la nueva sí |
| B-11 | 🟡 | Como admin, edita **tu propia cuenta** y cambia tu rol a Mecánico (siendo el único admin) | Lo impide con un mensaje claro: no se puede quitar el rol al único administrador |
| B-12 | 🟡 | Como mecánico, en Configuración cambia tu nombre y foto | Se guarda y se ve en el encabezado |
| B-13 | ⚪ | Pide "¿Olvidaste tu contraseña?" para el correo del mecánico | Llega el correo (ver la nota de la sesión A si no llega) |

> El **borrado** de un empleado se prueba al final, en la sesión M, para no perder al
> mecánico que se usa en las demás sesiones.

---

## Sesión C — Clientes y vehículos

Cuenta: administrador, luego mecánico. Dispositivo: computadora.

| # | Pri | Pasos | Debe pasar |
|---|---|---|---|
| C-01 | 🔴 | **Clientes → Nuevo Cliente**: los datos de [0.3](#03-el-caso-de-prueba-números-para-comprobar) → Crear | Aparece con 0 vehículos y 0 órdenes. Tiene marcada **Recibe avisos por correo** |
| C-02 | 🟡 | Intenta crear un cliente con el correo `cliente@@mal` | Avisa que el correo está mal antes de guardar |
| C-03 | 🔴 | **Vehículos → Nuevo Vehículo**: dueño Cliente Prueba, VIN `1HGCM82633A004352` | Rellena solo **Honda / Accord / 2003** |
| C-04 | 🟡 | Escribe un VIN con la letra **O** | Avisa que un VIN no lleva I, O ni Q |
| C-05 | 🟡 | Marca **Sin placa**, color Gris → Crear | En la lista aparece con la etiqueta «Sin placa» |
| C-06 | 🟡 | Vuelve a Clientes | Cliente Prueba muestra **1 vehículo** |
| C-07 | 🟡 | Abre el perfil del cliente (ojo) | Ve sus datos y su vehículo |
| C-08 | 🔴 | Como **mecánico**: abre Clientes y Vehículos | Puede ver y crear, pero **no aparece el botón de eliminar** |

---

## Sesión D — Una orden de principio a fin (administrador)

Cuenta: administrador. Dispositivo: **teléfono Android** (para las fotos) o computadora.

| # | Pri | Pasos | Debe pasar |
|---|---|---|---|
| D-01 | 🔴 | **Órdenes → Nueva Orden**: Cliente Prueba y su Honda, tipo Combinado, gasolina 1/2, millas 45000, depósito **300**, fecha estimada | Los campos aceptan los valores; millas negativas no |
| D-02 | 🔴 | Inspección 360°: toma las **6 fotos** (Frontal, Trasera, Izquierda, Derecha, Interior, Tablero) | Cada recuadro muestra su foto |
| D-03 | 🔴 | Mano de obra **Frenos $1,000**; repuesto **Pastillas 2 × $100**; asigna al **mecánico y al pintor** → Guardar | Se crea con número **ORD-AAAA-001** y abre el detalle. No hay que esperar a las fotos |
| D-04 | 🟡 | Mira la bandeja de subidas | "N de 6 archivos subidos" hasta terminar; puedes seguir usando la app |
| D-05 | 🔴 | En el detalle: Frenos y Pastillas dicen **Sin autorizar** | El total autorizado todavía no los incluye |
| D-06 | 🔴 | Ve a **Finanzas** | Un ingreso **"Depósito inicial" $300** |
| D-07 | 🔴 | Vuelve a la orden. **Firma del cliente**: firma con el dedo o el mouse → guardar | Las líneas dejan de decir *Sin autorizar*; total **$1,200** |
| D-08 | 🟡 | Aparece la tarjeta **Enlace del cliente** con un enlace | Se puede **Copiar** y **Abrir** |
| D-09 | 🟡 | A los ~2 minutos, revisa el correo de "cliente" | Llega "Recibimos su vehículo" con el nombre del taller y un botón al enlace |
| D-10 | 🟡 | Firma **otra vez** | La firma nueva se guarda; nada cambia en lo autorizado |
| D-11 | 🟡 | Cambia el estado a **En Proceso** | El selector cambia; a los ~3 minutos llega "Estamos trabajando en su vehículo" |
| D-12 | ⚪ | Cambia rápido: Espera Repuestos → En Proceso → Espera Repuestos | Al cliente le llega **un solo** correo, con el último estado |
| D-13 | 🟡 | **Descargar PDF** | Se descarga: datos, fotos de recepción, trabajos autorizados, totales y firma. Sin notas internas ni nombres de técnicos |

---

## Sesión E — La misma orden vista por el técnico

Cuenta: **mecánico**, en el teléfono. Deja la sesión del admin abierta en la computadora.

| # | Pri | Pasos | Debe pasar |
|---|---|---|---|
| E-01 | 🔴 | Panel principal | **Ningún monto**: sin ingresos, totales ni gráfico de dinero |
| E-02 | 🔴 | Órdenes | La orden aparece en **Mis Órdenes de Trabajo**, **sin total** |
| E-03 | 🔴 | Abre la orden | Ve la mano de obra (Frenos $1,000), los repuestos **sin precio**, **no** ve totales ni depósito |
| E-04 | 🔴 | Tarjeta **Tu comisión estimada** | $1,000 × 35 % ÷ 2 = **$175.00** |
| E-05 | 🔴 | Busca botones para editar mano de obra, repuestos, **Enviar reporte** o **Descargar PDF** | No existen |
| E-06 | 🔴 | En el selector de estado | No aparece **Entregado** |
| E-07 | 🟡 | Mueve el **avance** a 40 % | Se guarda |
| E-08 | 🔴 | **Avance del trabajo**: nota "Desarmé frenos" + **Foto** | Se agrega con tu nombre y la hora; la foto dice **Interno** |
| E-09 | 🔴 | Otro avance con **Video** de 20 segundos grabado desde la app | Se sube y se reproduce al tocarlo |
| E-10 | 🟡 | Otro avance **solo con Nota de voz** | Se reproduce |
| E-11 | ⚪ | Graba un video y déjalo correr | A los 15 s finales el contador se pone rojo; **a los 2 minutos se detiene solo** |
| E-12 | 🟡 | Activa **modo avión**, agrega un avance con foto, espera, quita modo avión | La bandeja dice "Sin conexión" y luego sube sola |
| E-13 | 🟡 | Sube un video, y a mitad **cierra la app** y vuelve a abrirla | La subida continúa |
| E-14 | 🟡 | Intenta borrar un avance del admin (si hay) | No puede; los suyos sí |
| E-15 | 🟡 | En la computadora (admin): campana | Llegaron avisos "Nuevo avance" del mecánico |
| E-16 | 🔴 | Como mecánico: buscar **Nueva Orden** en /work-orders | El botón no existe. Abrir una orden es de administración desde 20261004000000 |

> Borra la orden de E-16 al terminar (como admin), para que no altere los números.

---

## Sesión F — Presupuestos y autorización del cliente

Cuenta: administrador (computadora) y el correo de "cliente" en el teléfono.

| # | Pri | Pasos | Debe pasar |
|---|---|---|---|
| F-01 | 🔴 | En la orden, agrega mano de obra **Alineación $150** y **Pintura puerta $400** | Las dos dicen **Sin autorizar**; el total sigue en $1,200 |
| F-02 | 🔴 | Tarjeta **Presupuesto → Enviar presupuesto** | Las líneas pasan a **Esperando al cliente** y no se pueden editar. La orden muestra "Esperando autorización" en la lista y el tablero |
| F-03 | 🔴 | Intenta marcar la orden **Entregado** | No deja: hay un presupuesto esperando respuesta |
| F-04 | 🔴 | En el teléfono, abre el correo del presupuesto y su botón | Abre el reporte con **Presupuesto por autorizar**, casillas por línea y el total |
| F-05 | 🔴 | Marca **solo Alineación**, escribe tu nombre, un comentario → autorizar | Confirmación en pantalla |
| F-06 | 🔴 | En la computadora, recarga la orden | Alineación autorizada; Pintura puerta **No realizar** (tachada). Total **$1,350** |
| F-07 | 🟡 | Campana del admin | "El cliente respondió el presupuesto" con el comentario |
| F-08 | 🟡 | Campana del mecánico | "Trabajos autorizados · ORD-…" diciendo qué hacer y qué no |
| F-09 | 🟡 | Tarjeta Presupuesto | Guarda la respuesta: cómo, quién, cuándo y cuánto |
| F-10 | 🟡 | Agrega **Lavado $50**, **Registrar autorización**, **desmarca** Lavado, elige "Por teléfono" → Registrar | Lavado queda **No realizar**; el total sigue en $1,350; al cliente le llega la constancia |
| F-11 | ⚪ | Agrega otra línea, envía presupuesto y luego **Cancelar presupuesto** | La línea vuelve a *Sin autorizar* y se puede editar. Bórrala para no alterar los números |

---

## Sesión G — Enlace del cliente y correos

Cuenta: administrador y el teléfono como "cliente".

| # | Pri | Pasos | Debe pasar |
|---|---|---|---|
| G-01 | 🔴 | Abre el enlace del cliente en el teléfono (sin sesión, en incógnito) | Se ve sin cuenta: estado, avance, recepción con las 6 fotos y la firma, cuenta con total, depósito y saldo |
| G-02 | 🔴 | Busca en el enlace nombres de técnicos, comisiones, las notas de los avances o los archivos internos | **No aparece nada de eso** |
| G-03 | 🔴 | Como admin, en la galería pulsa **Mostrar en el reporte del cliente** sobre la foto del mecánico | Recarga el enlace: ahora la foto se ve |
| G-04 | 🟡 | **Avisar novedades** | Al minuto llega un correo al cliente con el enlace |
| G-05 | 🟡 | Botones **Llamar** y **WhatsApp** del enlace | Llaman / abren WhatsApp al número de la sede (B-01) |
| G-06 | 🟡 | **Enviar reporte → Enviar por WhatsApp** | Abre WhatsApp con el teléfono del cliente y el mensaje con el enlace |
| G-07 | 🟡 | Responde a uno de los correos del sistema | La respuesta llega al **correo de contacto** de la sede |
| G-08 | 🟡 | **Cambiar enlace** | El enlace viejo ya no abre; el nuevo sí |
| G-09 | 🟡 | Historial de correos de la tarjeta | Cada correo con estado Enviado / No enviado (con motivo) |
| G-10 | ⚪ | Desde el enlace, date de baja de los correos | En la ficha del cliente se desmarca "Recibe avisos por correo"; ya no llegan correos de estado |

> Si diste de baja al cliente en G-10, vuelve a marcar la casilla para la sesión H.

---

## Sesión H — Entregar, cobrar y pagar comisiones

Cuenta: administrador. Ten a mano la [tabla de resultados esperados](#03-el-caso-de-prueba-números-para-comprobar).

| # | Pri | Pasos | Debe pasar |
|---|---|---|---|
| H-01 | 🔴 | Estado **Finalizado** | Avance 100 %; el admin recibe "Lista para entregar"; al cliente "Su vehículo está listo" |
| H-02 | 🔴 | Estado **Entregado** y **cancela** la confirmación | El selector vuelve a Finalizado; no se registra nada |
| H-03 | 🔴 | Estado **Entregado** y confirma | Queda entregada |
| H-04 | 🔴 | **Finanzas** | Ingreso **"Pago final" $1,050** y egreso **"Costo de repuestos" $200**, además del depósito de $300 |
| H-05 | 🔴 | **Panel principal** | Ingresos del mes **$1,350** |
| H-06 | 🔴 | Campana del mecánico y del pintor | "Comisión generada · ORD-… **$201.25**" a cada uno |
| H-07 | 🔴 | **Comisiones → Saldos pendientes** | Mecánico $201.25 y pintor $201.25 |
| H-08 | 🔴 | Como mecánico: intenta cambiar el estado, subir una foto o unirte | No puede: la orden está cerrada para técnicos |
| H-09 | 🔴 | **Pagar saldo** del mecánico: cheque número 1001 → Registrar pago | Pasa a **Pagos realizados**. En Finanzas, egreso "Pago de comisiones – Luis…" $201.25 |
| H-10 | 🔴 | Abre Comisiones en **dos pestañas**. En las dos, **Pagar saldo** del pintor; confirma en una y después en la otra | Solo se registra **un** pago. La segunda dice "No hay comisiones pendientes para pagar en esta selección" |
| H-11 | 🟡 | **Deshacer pago** del pintor | Vuelve a pendientes y desaparece **solo** su egreso en Finanzas |
| H-12 | 🟡 | Edita la orden entregada: Frenos de $1,000 a $1,100 | Finanzas: ingreso "Ajuste por cargo adicional" $100. La comisión **pendiente** del pintor se recalcula; la **pagada** del mecánico no cambia |
| H-13 | 🟡 | Devuelve Frenos a $1,000 | Se registra el reembolso por ajuste de $100 |
| H-14 | 🟡 | Saca la orden de **Entregado** (a Finalizado) y confirma | Finanzas: "Reversión de entrega" y "Reversión de costo de repuestos". La comisión pendiente se borra; la pagada del mecánico se conserva |
| H-15 | 🟡 | Vuelve a marcarla **Entregado** | Se registra otra vez el cobro y el costo; el balance neto de la orden vuelve a cuadrar |

---

## Sesión I — Finanzas

Cuenta: administrador.

| # | Pri | Pasos | Debe pasar |
|---|---|---|---|
| I-01 | 🔴 | Como **mecánico**, escribe `reinventa.shop/finance` en la barra | No entra: lo manda al panel |
| I-02 | 🟡 | **Nueva Transacción**: egreso, Gasto Operativo, $50, hoy, "Prueba luz" → Crear | Aparece en la tabla; las tarjetas de egresos y balance cambian $50 |
| I-03 | 🟡 | Otra transacción **vinculada a la orden** | La columna de orden lleva a la orden |
| I-04 | 🟡 | Borra la transacción de I-02 | Desaparece y los totales vuelven |
| I-05 | ⚪ | Crea un movimiento con fecha del **día 1 del mes** a las 9 p. m. | Cuenta en ese mes, no en el anterior |
| I-06 | 🟡 | **Importar Estado de Cuenta** con el PDF de Wells Fargo | Lista las transacciones con categoría sugerida; el botón no se activa mientras falte categoría |
| I-07 | 🟡 | Importa las seleccionadas | Aparecen en la tabla y en **Importaciones** |
| I-08 | 🔴 | Intenta importar **el mismo PDF** otra vez (aunque le cambies el nombre) | Aviso rojo "este mismo archivo ya se importó" con la fecha |
| I-09 | 🟡 | **Revertir importación** | Desaparecen todos sus movimientos; el archivo se puede importar de nuevo |
| I-10 | ⚪ | Un PDF que no sea de Wells Fargo o una foto | Mensaje que lo explica; no importa nada |

---

## Sesión J — Notificaciones y teléfono

Cuenta: mecánico en Android y, si hay, en iPhone. Admin en la computadora.

| # | Pri | Pasos | Debe pasar |
|---|---|---|---|
| J-01 | 🟡 | **Android**: menú ⋮ → **Instalar app** y ábrela desde el ícono | Abre a pantalla completa con su ícono |
| J-02 | 🔴 | Configuración → **Notificaciones en este dispositivo → Activar** → aceptar → **Enviar prueba** | Llega la notificación de prueba en segundos |
| J-03 | 🔴 | **Cierra la app**. Como admin, crea una orden y asígnala al mecánico | Al teléfono le llega "Nueva orden asignada" con la app cerrada; al tocarla abre la orden |
| J-04 | 🟡 | Configuración → Personal (admin) | Junto al mecánico, una campana con el número de dispositivos con push |
| J-05 | 🟡 | **iPhone**: Safari → Compartir → **Agregar a inicio** → abrir desde el ícono → activar notificaciones → prueba | Llega la prueba (iOS 16.4 o posterior) |
| J-06 | 🟡 | En el mismo teléfono, **cierra sesión** del mecánico y asigna otra orden | Ya **no** le llega el push a ese teléfono |
| J-07 | ⚪ | Campana con la app abierta: toca un aviso; **Marcar todo leído** | Abre la orden y se marca leído; el contador queda en cero |
| J-08 | ⚪ | Haz tú mismo una acción (por ejemplo, un avance) | No te llega aviso de lo que hiciste tú |

> Borra la orden de J-03 al terminar.

---

## Sesión K — Tablero, panel y búsqueda

| # | Pri | Pasos | Debe pasar |
|---|---|---|---|
| K-01 | 🟡 | **Tablero Kanban** (computadora): arrastra una orden de columna | Cambia de estado; al recargar sigue ahí |
| K-02 | 🟡 | Kanban en el teléfono: selector **Mover a** | Cambia de estado |
| K-03 | 🔴 | Kanban como mecánico: una orden que **no** tiene asignada | No tiene selector para moverla |
| K-04 | 🟡 | Ocupación arriba del tablero | Órdenes activas / capacidad 5 (B-01) |
| K-05 | 🟡 | Panel: **Órdenes activas**, **Clientes nuevos del mes**, gráfico | Coinciden con lo creado en las pruebas |
| K-06 | 🟡 | **Buscador** del encabezado: escribe "Prueba", luego parte del VIN y luego "ORD" | Encuentra el cliente, el vehículo y la orden, agrupados |
| K-07 | ⚪ | Filtros por estado en Órdenes | Muestran solo ese estado |

---

## Sesión L — Uso real: tablet compartida, mala señal, idioma

| # | Pri | Pasos | Debe pasar |
|---|---|---|---|
| L-01 | 🔴 | En el **mismo navegador**: entra como admin, abre Panel, Órdenes y Finanzas. Cierra sesión. Entra como mecánico | En **ningún momento**, ni por un instante mientras carga, se ve un monto del admin |
| L-02 | 🔴 | Con la sesión del mecánico abierta, en Chrome DevTools → Network pon **Offline** 30 segundos y vuelve a **Online** | La app no lo saca al login; lo que tenía escrito sigue ahí |
| L-03 | 🟡 | A mitad de crear una orden, intenta salir de la pantalla | Avisa que hay cambios sin guardar |
| L-04 | 🟡 | Todo el recorrido de una orden en **inglés** | No aparecen textos en español mezclados (salvo los correos, que van en español) |
| L-05 | ⚪ | **Tema claro** y **oscuro** | Todo se lee bien en los dos |
| L-06 | 🟡 | En el teléfono, abre cada menú | Nada se sale de la pantalla ni obliga a desplazarse de lado; las tablas se ven como tarjetas |

---

## Sesión M — Borrar y deshacer

Hazla al final: borra lo que las otras sesiones usan.

| # | Pri | Pasos | Debe pasar |
|---|---|---|---|
| M-01 | 🔴 | Como admin, intenta **eliminar la orden** con la comisión del mecánico ya pagada | No deja: tiene comisiones pagadas |
| M-02 | 🟡 | Deshaz ese pago en Comisiones y elimina la orden | Se borra; en Finanzas desaparecen sus movimientos automáticos |
| M-03 | 🟡 | Elimina el **cliente** | Se borra con su vehículo (ya no tiene órdenes) |
| M-04 | 🟡 | Elimina a un cliente **con** órdenes (crea una rápida antes) | No deja |
| M-05 | 🔴 | Configuración → Personal: **elimina al pintor** | "Empleado eliminado". Si tiene la sesión abierta en otro dispositivo, al moverse lo saca al login |
| M-06 | 🔴 | Entra como el pintor borrado | "Correo o contraseña incorrectos" |
| M-07 | 🟡 | Intenta eliminar a un técnico con órdenes asignadas | No deja: primero hay que reasignar |
| M-08 | ⚪ | Busca el botón para eliminarte a ti mismo | No existe |

---

## 14. Cómo reportar un fallo

Un fallo que no se puede repetir no se puede arreglar. Por cada ❌ anota:

```
Caso:            (ej. H-04)
Fecha y hora:
Dispositivo:     (ej. Samsung A54, Chrome / iPhone 13, Safari / computadora, Chrome)
Cuenta:          (admin / mecánico / pintor / cliente sin cuenta)
Orden:           (ej. ORD-2026-001)
Qué hice:        (los pasos, en orden)
Qué esperaba:    (lo que dice este manual)
Qué pasó:        (el mensaje exacto, copiado tal cual)
Captura:         (sí / no; si hay video, mejor)
¿Se repite?:     (siempre / a veces / una vez)
```

Consejos:

- **Copia el mensaje exacto.** "Salió un error" no alcanza.
- Toma **captura o video** del teléfono; en la computadora, captura de pantalla completa.
- Si algo tiene que ver con **dinero**, anota también lo que muestra Finanzas.
- Si es un **fallo 🔴**, para esa sesión y avisa antes de seguir: lo que viene puede depender
  de él.

---

## 15. Hoja de resultados

Copia esta tabla en una hoja de cálculo o imprímela.

| Sesión | Casos | ✅ | ❌ | ⏭️ | Fecha | Dispositivos | Notas |
|---|---|---|---|---|---|---|---|
| A — Entrar y contraseñas | 17 | | | | | | |
| B — Sedes y personal | 13 | | | | | | |
| C — Clientes y vehículos | 8 | | | | | | |
| D — Orden (admin) | 13 | | | | | | |
| E — Orden (técnico) | 16 | | | | | | |
| F — Presupuestos | 11 | | | | | | |
| G — Enlace del cliente | 10 | | | | | | |
| H — Entregar y comisiones | 15 | | | | | | |
| I — Finanzas | 10 | | | | | | |
| J — Notificaciones | 8 | | | | | | |
| K — Tablero y panel | 7 | | | | | | |
| L — Uso real | 6 | | | | | | |
| M — Borrar | 8 | | | | | | |
| **Total** | **142** | | | | | | |

**Criterio para salir a producción:** todos los 🔴 en ✅. Los 🟡 en ❌ se revisan uno por uno
antes de decidir; los ⚪ pueden quedar para después.
