# Q2 — Prioridades y decisiones del arquitecto sobre el recorrido de calidad (16/11/2026)

Sale de los dos informes de Q1: [administración](q1-informe-administracion.md) (18 hallazgos) y
[técnico y cliente](q1-informe-tecnico-y-cliente.md) (17). Cada hallazgo tiene allí sus pasos, su
captura y el archivo probable. Aquí está **qué se arregla, en qué orden y cómo** (las decisiones
de diseño ya están tomadas: no se reabren al programar).

**Lectura del arquitecto.** El flujo completo corre y los números cuadran de punta a punta; no
falta ninguna función. Lo que separa al programa de uno comercial es: un error que rompía el
final del flujo del técnico (B-01), datos sucios que entran en la recepción, más de un camino
«principal» en la misma pantalla, cosas chicas para el dedo, y detalles en lo que ve el cliente.

## Tanda 0 — Urgente (en curso)

| Hallazgo | Decisión |
|---|---|
| B-01 el técnico no puede terminar la orden | Migración `046`: la fecha de finalización la pone la base. Con pgTAP, caso de seguridad y la e2e TEC-02. **Publicar en cuanto esté verificada** (está roto en producción desde el 15/11) |

## Tanda 1 — Que no entren datos sucios en la recepción

| Hallazgo | Decisión de diseño |
|---|---|
| A-01 teléfono incompleto o con letras | `PhoneInput` deja escribir solo dígitos y los signos de formato. Guardar un cliente (alta, Clientes) **exige** un número válido para su país (`lib/phone.ts`); el error va en el campo (`aria-invalid`), no como aviso ámbar que deja seguir. Sigue bastando nombre y teléfono |
| A-02 clientes repetidos por el mismo teléfono | Al escribir el teléfono de un cliente nuevo, si ya hay uno en la sede con ese número (comparando en formato internacional), se ofrece ahí mismo: «Ya existe *Nombre*: usar este cliente». No se prohíbe crear otro (familias comparten teléfono) y no se agrega restricción en la base |
| A-08 selector de cliente con 65 opciones sin búsqueda | En el paso 1 del alta, el `<select>` se reemplaza por el buscador que ya existe (`components/CustomerPicker.tsx`: nombre o teléfono), con «Nuevo cliente» como botón aparte. Mismo criterio para elegir vehículo si la lista es larga (más de 8) |
| A-03 placa repetida en el alta: solo un aviso y sin marcar el campo | El error de placa o VIN repetidos (`uq_vehiculos_placa`, `uq_vehiculos_vin`) se muestra en su campo del paso 2, como ya lo hace el diálogo de editar vehículo, y el alta se queda en ese paso. Que el cliente nuevo ya quede guardado es de diseño |
| A-18 el cliente nuevo nace en inglés sin poder elegir | En los datos del cliente nuevo, un selector corto «Idioma del cliente: English / Español» (por defecto inglés, como hoy). Un toque; no es obligatorio |
| B-02 el técnico mueve el avance de una orden sin nada autorizado | Migración nueva: el guardia del técnico rechaza un cambio de `porcentaje_avance` si la orden no tiene ninguna línea `aprobado` (misma razón en español que al intentar empezarla). En pantalla, el deslizador se apaga con la misma explicación de `TechOrderStatus`. pgTAP y caso en `qa:security` |

## Tanda 2 — Un solo camino claro en la orden

| Hallazgo | Decisión de diseño |
|---|---|
| A-04 dos botones principales en recepción | Una sola función pura decide **el** paso principal de administración (`adminNextStep(order)`, hermana de `techNextStep.ts`, con pruebas): sin trabajos → «Agregar trabajo»; sin firma → «Tomar firma»; con algo por autorizar → «Registrar autorización»; terminada → «Marcar listo para entregar»; lista → «Entregar y cobrar». Solo ese botón lleva el estilo principal; «Enviar presupuesto» y los demás pasan a secundario mientras no sean el paso |
| A-05 «Agregar trabajo» y «Registrar autorización…» solo cambian de pestaña | La acción rápida lleva a su pestaña **y abre lo suyo**: el editor de una tarea nueva con el foco en la descripción, o el diálogo de autorización |
| A-09 en el teléfono la acción principal queda fuera de la primera pantalla | En el teléfono, las acciones rápidas van inmediatamente debajo del título y del estado de la orden, antes del selector de estado y del avance; el encabezado no repite datos que ya están en la sección del vehículo |
| A-14 «Finalizado» desde el selector no responde ni avisa de tareas sin hacer | Si hay tareas autorizadas sin marcar, pregunta con `ChoiceDialog` («Quedan N tareas sin marcar: Revisar tareas / Terminar de todos modos»); al cambiar el estado siempre hay un aviso de confirmación |
| B-03 el técnico abre la orden y «Tareas» está cerrada | Para el técnico, la sección de sus tareas abre desplegada al entrar a la orden (las demás siguen cerradas) |
| B-04, A-07 botones de módulos apagados en medio del flujo | Lo resuelve la orden Q3. Además, para el técnico el orden de las acciones rápidas es: la principal, «Registrar avance», «Reportar trabajo adicional», y el resto |
| B-09 la tarea marcada salta al final sin aviso | La tarea hecha se queda en su lugar, tachada, hasta que se recarga la orden; aviso corto «Tarea hecha» |
| B-12 el panel del técnico repite lo mismo tres veces | Una sola lista de «Mis tareas» en el panel del técnico; se quitan las tarjetas que repiten las mismas órdenes |
| A-11 un trabajo recién cotizado sale como «$0.00» en la lista | En la lista y el tablero, una orden sin nada autorizado no muestra «$0.00»: muestra la etiqueta «Por autorizar» (sin sumar montos en el navegador) |
| A-06 «Ocupación del taller: 33/10 (100%)» | Cuando hay más carros que lugares: «33 carros · 10 lugares (sobrecupo)», en color de aviso. La barra sigue al 100 % |

## Tanda 3 — Se toca bien y se lee bien

| Hallazgo | Decisión |
|---|---|
| B-05, B-06, A-10 controles de menos de 44 px | El deslizador de avance, las casillas («Visible para el cliente» y las demás) y los botones listados en A-10 llegan a 44 px de área táctil en pantallas táctiles (el área, no el dibujo), con la regla que ya existe en `components.css` |
| B-10, A-16 selectores que recortan su texto | El selector de estado apagado y el de técnico del alta muestran el texto completo (ancho mínimo o texto en dos líneas) |
| A-12 los avisos tapan el indicador de pasos en el teléfono | En el teléfono los avisos salen abajo, encima de la barra de navegación, no sobre el encabezado del diálogo |
| B-08 «Guardar» apagado sin decir qué falta | El botón queda encendido y, al tocarlo, dice qué falta y marca el campo (regla del proyecto: un «Guardar» nunca calla) |
| B-11, A-15, A-13, B-16 textos | Textos en inglés que se colaron en español; palabras del sistema en Configuración; el doble punto del borrador; y los plurales con «(s)» en lo que lee el cliente (usar singular y plural de verdad, como ya hace el resto del portal) |
| B-07 ES / EN de 40 px de ancho | Se queda (excepción ya decidida el 15/11) |

## Tanda 4 — Lo que ve el cliente (se une a Q4)

| Hallazgo | Decisión |
|---|---|
| B-13 al aprobar el presupuesto sale la caja del navegador | El portal confirma con su propio diálogo (dentro de `src/portal/`, sin importar nada de la app), con los botones «Aprobar» y «Volver», y el texto con singular y plural correctos |
| B-14 después de aprobar no se ve qué se aprobó | Tras responder, la pantalla principal del enlace muestra un resumen: «Aprobaste N trabajos por $X» y lo que no se aprobó |
| B-15 «Enlace no válido» sin salida | Muestra cómo contactar al taller: el teléfono público del negocio (un solo taller por despliegue) con botón de llamar |
| B-17 foto que no carga deja un cuadro roto | Cada foto lleva texto alternativo y, si no carga, un recuadro con «No se pudo cargar la foto» |
| A-17 la página 2 del PDF es un dibujo del carro sin marcas | El dibujo de daños solo se imprime si hay marcas; sin marcas, esa página no existe |
| Fotos con `http://kong:8000` en el enlace (solo visto en local) | No es de esta tanda: comprobar en producción que las fotos del enlace cargan; si cargan, es un detalle del entorno local |

## Orden de ejecución

1. Tanda 0 (en curso) y Q3 (en curso).
2. Tanda 1 y tanda 4 (no comparten archivos: recepción y clientes por un lado, portal y PDF por
   otro).
3. Tanda 2 (toca el detalle de la orden: después de Q3, que toca los mismos archivos).
4. Tanda 3.
5. Q5: la prueba «un día en el taller» fija todo lo anterior.

Cada tanda la lleva un agente jefe de obra según el [protocolo](README.md), y termina con su
informe en `docs/ordenes/q2-tanda-N-informe.md` y capturas de antes y después.
