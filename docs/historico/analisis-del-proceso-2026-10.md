# Análisis del proceso del taller (05/10/2026)

Seguimos una orden de punta a punta, como la vive el taller: llega el cliente, se abre la
orden, se trabaja, se piden repuestos, se cobra, el cobro genera comisiones y ganancia, y se
registran los gastos. La pregunta de fondo: **¿la app hace el trabajo más rápido y más
seguro que la hoja con la que empezaron, o solo agrega pasos?**

Fuentes: el código vigente, los datos de producción (consultas de solo lectura del
05/10/2026, con las órdenes de prueba del taller) y las reglas de Maryland de
[plan-legal-y-privacidad.md](plan-legal-y-privacidad.md).

**Veredicto corto.** El corazón de la orden aporta valor real y la hoja no lo tenía: la
firma con texto legal, las fotos de recepción, la autorización de cada trabajo, el cálculo
de comisiones y el historial. Pero el dinero que sale de la orden todavía **no se puede
leer como la ganancia del taller**. Faltan la tarjeta y el impuesto, el costo de los
repuestos es su precio de venta, y si se importa el banco los movimientos se cuentan dos
veces. Además, lo que ve el cliente tiene un error de presentación y **ningún correo le ha
llegado**. Hay tres pasos que hoy son complejidad sin retorno: el porcentaje de avance a
mano, aprobar comisiones orden por orden, y la importación del banco tal como está.

---

## 0. Decisiones del taller y lo que se hizo (05/10/2026)

El taller comentó cada punto (los comentarios están en su sección, abajo). Lo implementado está
**en local, probado y sin publicar**: migraciones `20261010000016` a `18`, pgTAP
`26_proceso_del_taller` y las pantallas. Para publicar: `db push` → push a `main`.

| | Decisión del taller | Estado |
|---|---|---|
| A | El estado de cuenta es para la contabilidad de meses pasados y para el contador, **aparte** de lo que registra la app | **Hecho.** Finanzas tiene dos vistas ("Registros del taller" y "Estados de cuenta"); lo importado no suma en el panel, ni en el saldo, el balance o el enlace de una orden; "posible duplicado" solo compara contra otros estados de cuenta; cada estado de cuenta se exporta para el contador, y los registros del taller por mes |
| B | Costo del repuesto solo para administración; por defecto el precio | **Hecho.** Columna y campo "Costo" en los repuestos; un costo escrito se queda aunque cambie el precio; el egreso de repuestos y el margen usan el costo |
| C | Tarjeta y Zelle; registrar las comisiones de Clover y del banco | **Hecho.** Métodos nuevos en el depósito, la entrega, el retiro y el pago de comisiones. Categoría nueva **Comisiones de banco y tarjeta**, que las reglas de importación ya usan. Las comisiones del banco se registran a mano una vez al mes con esa categoría (el banco las cobra así, en un solo cargo mensual: una estimación por cobro nunca cuadraría al centavo) |
| D | Sin impuestos por ahora: primero ve el Excel el contador | **Sin cambios**, a propósito |
| E | Depósito y "otros pagos" por separado; saldo a su favor | **Hecho** en el enlace del cliente (y el PDF usa el saldo de la base) |
| F | Llave de Resend cambiada; no reenviar los correos viejos | **Sin cambios en código.** Los 11 correos en error se dejan como están |
| G | El avance sale de las tareas, con peso; editable por el técnico; 100 % al finalizar | **Hecho.** Peso = precio de cada tarea; el técnico lo corrige y la próxima tarea lo recalcula |
| H | Repuestos pedido/llegó y estado "Retirada sin reparar" | **Hecho.** Pedido → Llegó por pieza (marca en lista y tablero, aviso al técnico al llegar, el cliente ve qué pieza se espera). "Retirada sin reparar": cobra el diagnóstico o nada, devuelve la diferencia, sin comisiones, no cuenta como terminada |
| I | Revisar y aceptar en bloque; cambiar % o $ de cada comisión | **Hecho.** "Aceptar todas" por empleado en Comisiones, editar % o $ por fila, y **solo se paga lo aceptado** |
| J | (Se creía implementado) | **Hecho en la base.** `SHOP_TIMEZONE` ya estaba puesto (sirve para los correos), pero la base seguía fechando en UTC. Ahora `hoy_taller(sede)` con `sedes.zona_horaria` (America/New_York) en todos los movimientos automáticos y en el recordatorio de entrega vencida |
| K | Descuento desde administración, absorbido por el taller | **Hecho.** "Aplicar descuento" en Totales: baja el total, no las comisiones; con motivo y en el historial |
| L | PDF en inglés o en español, a elección | **Hecho.** Selector ES/EN junto a "Descargar PDF"; en inglés usa la traducción automática de los textos del taller cuando ya existe. Las leyendas de Maryland siguen en el plan legal (L4) |
| M | Actualizar las reglas de negocio | **Hecho:** [reglas-de-negocio.md](reglas-de-negocio.md) |

De paso:
- La tarjeta **Totales** de la orden sumaba las líneas en el navegador y restaba el depósito;
  ahora muestra las cifras de la base (descuento, total, lo recibido y el saldo).
- Un botón deshabilitado no se veía deshabilitado (no había regla general en CSS).
- Una compra de repuestos registrada a mano y vinculada a la orden achicaba el costo
  automático, y al sacar la orden de Entregado se revertía también. Ya no.

### Segunda vuelta (05/10/2026, noche): retiro con tres salidas y lo que traen los programas comerciales

**Retirada sin reparar**, como la pidió el taller: administración elige qué pasó.

| Salida | Se cobra | Comisiones |
|---|---|---|
| Se canceló todo | Nada; se devuelve lo que dejó el cliente | Ninguna |
| Solo la revisión | La revisión del vehículo | Ninguna |
| Algunos trabajos | Lo que sí se hizo (trabajos y repuestos autorizados) y, si se quiere, la revisión | Las de esas tareas, a su técnico |

Lo no cobrado queda "no realizado" y pendiente del vehículo para la próxima visita.

**Comparación con los programas comerciales** de talleres en EE. UU. (Tekmetric, Shopmonkey,
Shop-Ware, AutoLeap). Lo que todos traen y cómo queda Restorify:

| Práctica común | Restorify antes | Decisión |
|---|---|---|
| **Trabajos declinados** que vuelven a aparecer en la siguiente visita del vehículo | Lo rechazado quedaba en la orden vieja y nadie lo volvía a ver | **Hecho:** "Pendiente de visitas anteriores" en el Resumen de la orden y al cotizar una orden nueva |
| **Pagos en cualquier momento** de la orden (anticipos, pagos parciales) | Solo el depósito del alta y el cobro al entregar | **Hecho:** "Registrar anticipo", con su método y comprobante |
| **Descuento en $ o en %**, con motivo | Solo en $ | **Hecho:** también en %, calculado por la base |
| Cerrar una orden **con parte del trabajo** hecho | Solo "no se hizo nada" | **Hecho** (la retirada de arriba) |
| Estado de las piezas (pedida, recibida) | — | Ya hecho en la primera vuelta |
| Inspección digital con fotos y enlace al cliente, autorización a distancia | Ya existe (recepción 360, portal, presupuestos) | — |
| Cobro con tarjeta integrado (terminal conectada) | Se registra el método a mano | **No por ahora:** requiere integrar Clover; el método registrado ya permite cuadrar |
| Sincronización con QuickBooks | Exportación CSV por mes y por estado de cuenta | **No por ahora:** primero ver qué pide el contador con el CSV |
| **Catálogo de trabajos frecuentes** con precio (cambio de aceite, frenos…) | Se escribe cada vez | **Siguiente candidato:** ahorra escritura en cada alta |
| **Recordatorios de mantenimiento** al cliente (próximo cambio de aceite) | — | **Siguiente candidato:** trae clientes de vuelta; necesita los correos funcionando |
| Pago a técnicos por horas facturadas | Por porcentaje de la tarea | **No:** el taller paga por porcentaje |

## 1. El recorrido, paso a paso

| # | Paso | Qué hace la app | ¿Agrega valor? | Problema |
|---|---|---|---|---|
| 1 | Llega el cliente | Alta en 4 pasos: cliente, vehículo y recepción (millas, gasolina, fotos 360, voz), depósito, trabajos | **Sí**: historial por cliente y vehículo, fotos del estado en que llegó | Hay que cronometrarlo con el taller (meta: menos de 3 minutos) |
| 2 | Firma | La primera firma aprueba lo cotizado y guarda el texto legal | **Sí**, y alto: es la defensa ante un reclamo | El texto aún sin revisión de abogado ([plan legal](plan-legal-y-privacidad.md)) |
| 3 | Se trabaja | Tareas por técnico, "Realizado", avances con fotos, **% de avance a mano** | Tareas y avances, sí. El % a mano, **no** | [G](#g-dos-medidores-de-avance-que-no-coinciden) |
| 4 | Aparece trabajo extra | El técnico reporta un hallazgo → la orden se pausa → la oficina cotiza → el cliente autoriza | **Sí**: Maryland exige autorización para el trabajo adicional | Sin correos, la autorización depende de que alguien mande el enlace a mano ([F](#f-ningún-correo-le-ha-llegado-a-un-cliente)) |
| 5 | Se piden repuestos | Línea con precio de venta | Parcial | Costo = precio ([B](#b-el-costo-de-un-repuesto-es-su-precio-de-venta)); no hay "esperando repuestos" ([H](#h-no-existen-esperando-repuestos-ni-cancelada)) |
| 6 | Se termina | El técnico marca "Finalizado"; la oficina recibe el aviso | Sí | Se puede finalizar con tareas sin marcar |
| 7 | Entrega y cobro | `entregar_orden`: cobra el saldo con su método, asienta el costo de repuestos, calcula comisiones | **Sí**: una sola acción, sin cuentas a mano | Sin tarjeta ([C](#c-no-se-puede-registrar-un-pago-con-tarjeta)), sin impuesto ([D](#d-impuesto-de-ventas-de-maryland-sobre-los-repuestos)), fecha en UTC ([J](#j-las-fechas-automáticas-salen-en-hora-utc)) |
| 8 | Comisiones | Nace sugerida → la oficina la acepta en cada orden → se paga en Comisiones | El cálculo, sí. Aceptar orden por orden, **no** | [I](#i-aceptar-comisiones-es-un-paso-más-que-no-cambia-el-pago) |
| 9 | Ganancia y gastos | Ingresos y egresos automáticos por orden, margen por orden, importación del banco | **Todavía no**: los números no se pueden usar como ganancia | [A](#a-si-se-importa-el-banco-el-dinero-se-cuenta-dos-veces), [B](#b-el-costo-de-un-repuesto-es-su-precio-de-venta) |
| 10 | Lo que ve el cliente | Enlace con avances, fotos, presupuesto y cuenta; PDF; correos | Sí, en potencia | [E](#e-el-cliente-ve-su-depósito-dos-veces), [F](#f-ningún-correo-le-ha-llegado-a-un-cliente), [L](#l-el-pdf-sale-solo-en-español) |

### El dinero de una orden real (ORD-2026-001, prueba en producción)

| Concepto | Monto | De dónde sale |
|---|---|---|
| Cobrado | $550.00 | Depósito $300 (sin método) + pago final $250 (cheque) |
| Repuestos | $400.00 | Precio de venta; el egreso "Costo de repuestos" también es $400 |
| Mano de obra | $150.00 | |
| Comisión | $52.50 | 35 % de $150, **sugerida**, sin aceptar ni pagar |
| Margen que muestra la app | $97.50 | 550 − 400 − 52.50 |

Supongamos ahora (ejemplo, no un dato) que AutoZone cobró $280 por esas piezas. El margen
real sería $217.50. Y si se importara el estado de cuenta, "AUTOZONE $280" entraría como
otro egreso de repuestos: Finanzas mostraría $680 de repuestos y esta orden saldría con
pérdida.

---

## 2. Fallas de lógica, de la más grave a la menor

### A. Si se importa el banco, el dinero se cuenta dos veces

**Qué pasa.** Cada orden asienta sola sus movimientos: depósito, pago final, costo de
repuestos y, al pagar comisiones, un egreso por orden. La importación del banco trae el
mismo dinero visto desde la cuenta, y sus reglas lo clasifican igual:

| En el banco | Regla | Lo mismo que ya asentó la orden |
|---|---|---|
| "bankcard deposit", "zelle from", "atm cash deposit", "mobile deposit" | `pago_cliente` | Depósito inicial y pago final |
| "autozone", "napa", "o'reilly", "advance auto"… | `compra_repuesto` | Costo de repuestos |
| "zelle to" | `planilla` | Pago de comisiones |

La protección contra duplicados solo desmarca filas con **el mismo monto** y menos de dos
días de diferencia. En la práctica casi nunca coinciden:

- Clover deposita los cobros con tarjeta en lotes y ya sin su comisión.
- El efectivo se deposita junto.
- El costo de la pieza en AutoZone no es el precio que se cobró ([B](#b-el-costo-de-un-repuesto-es-su-precio-de-venta)).

**Efecto.** Ingresos y egresos inflados, y un balance del mes que no sirve. Hoy no ha pasado:
en producción hay **0 importaciones**.


**Propuesta (decisión del taller).** Una sola fuente para cada tipo de dinero.
Recomendación:

Decisión de taller: que la función de importar estados de cuenta sirva solo para la contabilidad de meses anteriores, y sea separada de las finanzas registradas por la app. esta función nació como una herramienta que le ayude al dueño del taller a ordenar los pagos de mesese anteriores y enviar esta información a su contador. 

- **Cobros a clientes:** salen de las órdenes.
- **Gastos que no nacen de una orden** (renta, herramientas, comisiones del banco y de
  Clover, sueldos fijos): salen del banco.
- **Lo demás del banco** (cobros de clientes, pagos a técnicos, compras ya vinculadas a una
  orden) se marca como **"ya registrado"**: queda para conciliar, pero no suma.

Mientras no se decida, el manual debe decir que **no se importe el banco** si se quiere leer
el balance.

### B. El costo de un repuesto es su precio de venta

**Qué pasa.** La pantalla solo pide el precio de venta, y el servicio copia ese mismo
valor como costo (`costo_unitario = precio_venta_unitario`, en
`workOrders.service.ts`). La base sí guarda los dos campos.

**Efecto.**

- "Margen por orden" dice que el taller solo gana con la mano de obra.
- El egreso "Costo de repuestos" no es lo que se pagó.
- Si el taller le sube el precio a las piezas, esa ganancia no aparece en ningún lado.

**Propuesta.** Un campo **Costo** opcional, solo para administración, que por defecto sea
igual al precio. Se llena cuando se conoce (casi siempre: al pedir la pieza ya se sabe
cuánto cuesta). La otra opción es vincular la compra del banco a la orden y usarla como
costo, pero obliga a conciliar cada compra.

Decisión del taller: campo de costo solo para administrador, que por defecto sea igaul al precio y el administrador lo llena solo caundo sabe el costo real del repuesto. 

### C. No se puede registrar un pago con tarjeta

**Qué pasa.** Los métodos son efectivo, cheque y transferencia, y la base no acepta otro:
`CHECK` de `20261008000000`. Pero las reglas del banco, sacadas de sus estados de cuenta
reales, incluyen "bankcard deposit", "bankcard fee", "bankcard discount fee" y "clover fee".
Todo indica que **cobran con tarjeta por Clover**.

**Efecto.** Un cobro con tarjeta se registra como otra cosa. El cierre del día no cuadra con
Clover y la comisión de Clover no aparece en ningún lado.

**Propuesta.** Agregar `tarjeta`, y quizá `zelle` aparte de transferencia. El cambio es
pequeño: migración del `CHECK`, `PAYMENT_METHODS` y textos.
Decisión del taller: Agrega también pago con tarjeta y con zelle, no sé como agregar también el descuento de clover. y el de bankcard fee, ya que no cuadraría con los estados de cuenta si no agregamos esos fees. 

### D. Impuesto de ventas de Maryland sobre los repuestos

**Qué pasa.** La app no calcula ningún impuesto. Según el Comptroller de Maryland
(*Business Tax Tip #7*), la mano de obra de una reparación está exenta, pero **los
repuestos son gravables (6 %) cuando se cobran por separado**. Y la app siempre los cobra
por separado.

**Efecto.** Hay dos posibilidades:

- El taller no cobra el impuesto y lo paga de su bolsa (o lo debe).
- Lo cobra fuera de la app. Entonces el total de la factura y del enlace no es lo que pagó
  el cliente, y "Pagado" y "Saldo" no cuadran con el recibo de Clover.

**Propuesta.** Preguntar al taller o a su contador cómo lo manejan hoy; esto no es asesoría
fiscal. Si lo cobran, que la base agregue una línea de impuesto sobre los repuestos
autorizados, con la tasa de la sede, y que aparezca en el enlace, en el PDF y en el saldo.
Por el momento no incluyamos la parte de impuestos, hasta que su contador vea el primer excel que le vamos a mandar. en teoría la parte financiera es para registrar ingresos y egresos y luego enviar un excel al contador para que sea el quien prepare la declaración de impuestos. 


### E. El cliente ve su depósito dos veces

**Qué pasa.** En el enlace, la cuenta muestra **Depósito $100** y **Pagado $100**, pero
"Pagado" ya incluye el depósito (`datos_portal` suma todos los `pago_cliente`). Es el mismo
caso que fija `CustomerPortal.test.tsx`: total $400, depósito $100, pagado $100, saldo $300.
El cliente lee que pagó $200 y pregunta dónde está el resto.

Además, si el depósito supera el total, el enlace dice "Pagado en su totalidad" aunque el
taller le debe la diferencia. El PDF sí dice "Saldo a favor del cliente".

**Propuesta.** Mostrar "Depósito" y luego "Otros pagos" (pagado − depósito), o una sola
línea "Pagado (incluye depósito)". Y "Saldo a su favor" cuando corresponda. Es un cambio
pequeño, solo en el portal. 
Decisión del cliente: Procede de esta forma

### F. Ningún correo le ha llegado a un cliente

**Qué pasa.** En producción, `cola_envios` tiene **11 correos en error, 1 omitido y 0
enviados**. Todos fallaron con `Resend HTTP 400: API key is invalid`; el último intento fue
el 02/10/2026. 

**Efecto.**

- El cliente no recibe el enlace, ni el presupuesto, ni el aviso de "listo".
- El flujo de autorización termina siendo más lento que una llamada, porque alguien tiene
  que mandar el enlace por WhatsApp a mano.
- Es la mitad del valor del portal.

**Propuesta.** Es la F0 del plan: una llave nueva de Resend para `restorifyauto.net`. Solo
la puede hacer quien administra la cuenta. Después, "Reintentar" en la orden o en
Configuración.
Decisión del cliente: Creo que ya se arregló, cambie la clave de la api key de resend, por el momento no mandes correos anteriores 


### G. Dos medidores de avance que no coinciden

**Qué pasa.** El técnico marca cada tarea como "Realizado" **y además** mueve a mano un
porcentaje de avance. Ese porcentaje lo ve el cliente en su enlace, y el panel lo usa para
señalar órdenes atrasadas (en proceso con menos de 30 %). En las órdenes de prueba ya no
coinciden:

| Orden | Estado | % a mano | Tareas hechas |
|---|---|---|---|
| ORD-2026-002 | Finalizado | 100 % | 0 de 1 |
| ORD-2026-007 | Entregado | 100 % | 0 de 1 |
| ORD-2026-003 | En proceso | 100 % | 1, y otra sin autorizar |

**Propuesta.** Que el porcentaje salga de las tareas: hechas sobre autorizadas. Se quita la
barra a mano y el técnico solo toca "Realizado". Si no hay tareas, el porcentaje sale del
estado.
Comentario del cliente: 
Me parece bien, que el porcentaje salga de las tareas realizadas, aunque cada tarea no tiene el mismo peso, por ejemplo si una orden tiene dos tareas una es camibo de aciete y la otra cambio de amortiguadores no tiene le mismo peso cada una. 
Creo que está bien que el porcentaje vaya cambiando automáticamente en función de las tareas realizadas pero que sea editable por el técnico, si el considera que no es el porcentaje correcto que refleje el avance global de la orden de trabajo, cuando se marque la orden de trabajo como finalizada
el procentaje si debe cambiar automáticamente a 100%. 

### H. No existen "esperando repuestos" ni "cancelada"
**Qué pasa.**

- **Esperando repuestos.** El 29/09 el estado se convirtió en "espera de autorización"
  (`20260929000000`). Un carro que espera una pieza aparece "En proceso", se vence en el
  panel y el cliente ve "En proceso" sin explicación.
- **Cancelada.** Un trabajo que el cliente no autoriza, o un carro que se retira sin
  reparar, solo se cierra **entregándolo**: se devuelve el depósito y cuenta como orden
  terminada en el panel.

**Propuesta (decisión del taller).**

- **Esperando repuestos:** marcar cada repuesto como "pedido" o "llegó" (sin agregar un
  estado a la orden), y que el panel y el enlace lo digan: "esperando la pieza X". comentari de usuario: Me parece bien implementa esto
- **Cierre sin reparar:** un estado de cierre, por ejemplo "Retirada sin reparar", que:
  - devuelva el depósito o cobre el diagnóstico;
  - no genere comisiones;
  - no cuente en los indicadores.
  comentario de usuario: agrega también este estado de retiro sin reparar

### I. Aceptar comisiones es un paso más que no cambia el pago

**Qué pasa.** Desde la `014`, cada comisión nace sugerida y la oficina la acepta en la
tarjeta de cada orden. Pero `pay_commissions` paga lo sugerido igual que lo aceptado, y la
pantalla de Comisiones no muestra si algo está aceptado. Aceptar solo decide **cuándo ve el
técnico su monto**.

**Efecto.** Es un clic por técnico en cada orden entregada. Si se olvida, el técnico ve
"Pendiente" para siempre aunque ya le hayan pagado.

**Propuesta (confirmar con el taller).** Revisar y aceptar **en bloque** desde Comisiones,
justo antes de pagar, y pagar solo lo aceptado. comentario de usuario: haz esta opción, que se revise y se acepte en bloque, también el administrador puede cambiar el monto tanto en % como en dólares de la comisión que se le va pagar a cada empleado. 

 La otra opción es que se acepte sola al entregar y se pueda corregir hasta el pago.

### J. Las fechas automáticas salen en hora UTC

**Qué pasa.** La base de producción está en UTC (comprobado: `TimeZone = UTC`). Depósito,
pago final, costo de repuestos y comisiones se fechan con `CURRENT_DATE`. Pasa lo
siguiente:

- Un cobro después de las **8 p. m.** (7 p. m. en invierno) queda con fecha del día
  siguiente.
- El último día del mes, ese cobro cuenta en el mes siguiente.
- Los recordatorios de "fecha de entrega vencida" usan la hora de Chicago.
- `SHOP_TIMEZONE` no está puesto.

**Propuesta.** Una sola función `hoy_taller()` con la zona del taller (`America/New_York`, o
una zona por sede) para todos los movimientos automáticos y los recordatorios, en una
migración nueva. Y poner `SHOP_TIMEZONE=America/New_York`. comentario de usuario: creo que esto ya lo implementé. 

### K. No hay descuentos

Para hacer un descuento hoy hay que bajar el precio de la mano de obra. Así no queda
constancia de que hubo descuento, y la comisión se calcula sobre el precio rebajado (puede
ser lo correcto, pero nadie lo decidió). **Preguntar al taller** si dan descuentos y quién
los absorbe. Agrega una opción en el panel de administrador de aplicar descuento, que se absorba del ingreso del taller. 

### L. El PDF sale solo en español

El enlace del cliente es bilingüe y traduce los textos del taller. El PDF, que hace de
factura, tiene todas sus etiquetas fijas en español ("Depósito recibido", "Saldo
pendiente"…), y en Maryland muchos clientes leen inglés. Le faltan también las leyendas
que Maryland exige en la factura (plan legal, fase L4).
Actualiza el pdf para que pueda salir en inglés o en español de acuerdo a como lo requiera el administrador. 

### M. Documentación desactualizada

[reglas-de-negocio.md](reglas-de-negocio.md) §1 todavía describe el estado "Espera de
repuestos" y dice que un técnico puede crear órdenes. Las dos cosas cambiaron
(`20260929000000` y `20261004000000`). Puede confundir a quien lea las reglas o a otro
agente.

actualiza el archivo [reglas-de-negocio.md](reglas-de-negocio.md) para que refleje los cambios realizados.

---

## 3. ¿Valor o complejidad?

| Parte | Veredicto | Por qué |
|---|---|---|
| Alta de orden, cliente y vehículo | **Valor** | Historial por vehículo y búsqueda. Cronometrar el alta |
| Firma con texto legal y fotos de recepción | **Valor alto** | Defensa ante reclamos por daños; Maryland pide autorización y factura |
| Presupuesto y autorización por línea | **Valor alto** | Hace cumplir la regla de Maryland (no pasar del estimado sin consentimiento). Cuesta dos pasos por línea agregada: un atajo "agregar ya autorizado por teléfono" lo reduce a uno |
| Hallazgos del técnico | Valor probable | El mecánico no tiene que ir a buscar a la oficina. Aún sin usar en producción (0): medirlo |
| Tareas con técnico y comisión por tarea | **Valor** | Resuelve el problema real: la pintora que no cobró |
| % de avance a mano | **Complejidad** | Duplica las tareas y ya no coincide con ellas ([G](#g-dos-medidores-de-avance-que-no-coinciden)) |
| Avances con fotos para el cliente | Valor, si le llegan | Hoy depende del enlace por WhatsApp ([F](#f-ningún-correo-le-ha-llegado-a-un-cliente)) |
| Enlace del cliente | Valor potencial alto | Menos llamadas de "¿cómo va mi carro?". Corregir [E](#e-el-cliente-ve-su-depósito-dos-veces) |
| Aceptar comisiones orden por orden | **Complejidad** | No cambia lo que se paga ([I](#i-aceptar-comisiones-es-un-paso-más-que-no-cambia-el-pago)) |
| Cálculo de comisiones | **Valor alto** | Era la cuenta más propensa a error en la hoja |
| Movimientos automáticos de Finanzas | Valor a medias | Correctos como **registro de cobros**, no como ganancia ([B](#b-el-costo-de-un-repuesto-es-su-precio-de-venta), [C](#c-no-se-puede-registrar-un-pago-con-tarjeta), [D](#d-impuesto-de-ventas-de-maryland-sobre-los-repuestos)) |
| Importación del banco | **Riesgo** | Cuenta dos veces ([A](#a-si-se-importa-el-banco-el-dinero-se-cuenta-dos-veces)); 0 usos. Redefinirla como conciliación |
| Historial de la orden | Valor | Auditoría sin pasos extra para nadie |
| Traducción automática | Valor | Para clientes que leen inglés; usar una llave con facturación (privacidad) |
| Multi-sede | Neutro | Hay una sola sede; no agrega pasos visibles. No tocar |

---

## 4. Qué preguntar y medir con el taller (una semana)

**Preguntas al dueño:**

1. **Cobros.** ¿Cómo cobran hoy y en qué proporción (tarjeta por Clover, efectivo, Zelle,
   cheque)?
2. **Impuesto.** ¿Cobran el impuesto de los repuestos? ¿Cómo lo reportan?
3. **Precio de las piezas.** ¿Le suben el precio a las piezas? ¿Quieren ver esa ganancia?
4. **Finanzas.** ¿Para qué quieren Finanzas: saber cuánto ganan, cuadrar con el banco o
   pasarle datos al contador?
5. **Descuentos.** ¿Dan descuentos? ¿Quién los absorbe?
6. **Comisiones.** ¿Quieren revisar cada comisión antes de que el técnico la vea, o basta
   con revisarlas al pagar?
7. **Carros parados.** ¿Qué pasa con un carro que espera piezas varios días? ¿Y con uno que
   el cliente no autoriza?

**Medir:**

- Cuánto tarda el alta de tres órdenes reales.
- Cuántas órdenes cambian de precio después de firmadas.
- Cuántas veces una orden se finaliza sin marcar sus tareas.

---

## 5. Plan propuesto

| Prioridad | Qué | Tamaño | ¿Necesita al taller? |
|---|---|---|---|
| 1 | **F0: llave de Resend** (F) | — | Quien administra la cuenta |
| 2 | Depósito y saldo a favor en el enlace del cliente (E) | S | No |
| 3 | Fecha del taller en movimientos y recordatorios (J) | S | No (confirmar la zona) |
| 4 | Pago con tarjeta (C) | S | Confirmar métodos |
| 5 | % de avance calculado desde las tareas (G) | M | Avisar a los técnicos |
| 6 | Modelo de Finanzas: una fuente por tipo, banco como conciliación (A) y costo de repuestos (B) | L | **Sí** (preguntas 3 y 4) |
| 7 | Impuesto de ventas (D) | M | **Sí** (pregunta 2, con su contador) |
| 8 | Repuestos pedido/llegó y cierre sin reparar (H) | M | **Sí** (pregunta 7) |
| 9 | Comisiones: aceptar en bloque al pagar (I) | S | **Sí** (pregunta 6) |
| 10 | PDF bilingüe con las leyendas de Maryland (L) | M | Parte del plan legal |
| 11 | Descuentos (K) | M | **Sí** (pregunta 5) |
| — | Corregir [reglas-de-negocio.md](reglas-de-negocio.md) §1 (M) | S | No |

Las prioridades 2 a 5 no cambian ninguna regla de dinero que el taller haya decidido. La 6
en adelante cambia cómo se leen sus números: va después de las preguntas.

---

## 6. Para agentes: dónde está cada cosa

| Falla | Código |
|---|---|
| A | `importar_estado_cuenta`; reglas en `finanzas_reglas_categorizacion` (editables); duplicados en `pages/finance/ImportStatementModal.tsx`; totales en `resumen_panel` (`20260929000000`) |
| B | `workOrders.service.ts` (`costo_unitario: item.precio_venta_unitario`); egreso en `sync_order_parts_expense` (`20260924000000`) |
| C | `CHECK` de `finanzas_movimientos.metodo_pago` (`20261008000000`); `PAYMENT_METHODS` en `types/domain/finance.types.ts`; `PaymentFields.tsx` |
| E | `datos_portal` (`20261010000011`, `v_pagado`); `CustomerPortal.tsx` (sección de la cuenta) |
| G | `porcentaje_avance` (deslizador en `WorkOrderDetail.tsx`; `laggingOrders` en `Dashboard.tsx`; enlace del cliente) |
| I | `pay_commissions` (`20261010000000`, filtra solo `pago_id IS NULL`); `aprobar_comision` (`20261010000014`); `pages/Payroll.tsx` |
| J | `CURRENT_DATE` en `entregar_orden`, `handle_order_delivery_payment`, `trg_order_deposit_sync`, `pay_commissions`; `'America/Chicago'` en los recordatorios (`20261005000001`) |
| L | `src/lib/workOrderPdf.ts` (etiquetas fijas) |
