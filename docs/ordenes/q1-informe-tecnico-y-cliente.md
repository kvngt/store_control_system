# Q1 — Informe del papel B: técnico y cliente (390 px)

Ejecutado el 16/11/2026 contra la app local (`http://localhost:4173`) y la base local, con el mecánico
de pruebas y el enlace del cliente (`/r/<token>`). Datos con el prefijo `PRUEBA Q1B`
(órdenes ORD-2026-048, 049 y 050). Solo observación: no se tocó código. Guiones en `qa.local/q1b-*.mjs`;
capturas en `qa.local/shots/q1-tecnico-*.png` y `q1-cliente-*.png`.

## 1. Resumen

El flujo del técnico es corto y claro hasta que llega el final: **no puede terminar la orden** (la base le
responde 403 al finalizar, B-01). El resto es de fricción: la tarea principal queda a dos toques, hay
controles de menos de 44 px (el deslizador de avance, la casilla «Visible para el cliente», ES/EN) y
botones de módulos que se van a apagar en medio de la pantalla. El enlace del cliente es limpio, rápido
(unos 3,5 s con el servidor local en frío) y sin desbordes a 390 px; lo peor es una caja nativa del
navegador al aprobar el presupuesto (B-13). Tres tropiezos más graves: B-01, B-02 y B-13.

Conteo: **1 Alta, 6 Media, 10 Baja** (17 en total).

## 2. Hallazgos del técnico

### B-01 · Alta · Criterios 1 y 3 — El técnico no puede finalizar la orden y el error no dice por qué
- **Dónde:** detalle de la orden como mecánico, 390 px, orden ORD-2026-048 (en proceso, 2 de 2 tareas hechas, avance 100 %, sin hallazgos pendientes).
- **Pasos:** entrar como mecánico, abrir la orden, tocar el botón principal «Terminé: avisar a la oficina» (o elegir «Finalizado» en el selector de estado).
- **Qué pasó:** la petición `PATCH /rest/v1/ordenes_trabajo` responde **403** y la pantalla muestra, en un toast y en un recuadro rojo, «Solo un administrador puede cambiar los datos de recepción de una orden.» La orden se queda en «En Proceso». Pasa por los dos caminos (botón principal y selector). Es un callejón sin salida del flujo básico: el técnico no tiene otra forma de avisar que terminó.
- **Qué debería pasar:** la orden pasa a «Finalizado» y el mensaje, si fallara, diría qué hacer. La frase de «datos de recepción» no tiene nada que ver con lo que el técnico intentó.
- **Captura:** `q1-tecnico-16-finalizada.png`, `q1-tecnico-17-terminar-boton.png`.
- **Dónde está (probable):** `src/services/workOrders/orders.ts` (`updateWorkOrderStatus`, líneas ~66-68) manda `fecha_finalizacion` junto con el estatus. La migración `20261010000043_auditoria_2026_11.sql` (punto 4) quitó `fecha_finalizacion` de la lista permitida del técnico en `trg_guard_order_technician`, diciendo que «el frontend no la envía». Sí la envía. La razón mostrada sale del 42501 genérico del guardia (el texto se ve en `src/lib/errors.ts` / el trigger).

### B-02 · Media · Criterio 1 y 3 — En una orden sin autorizar el técnico puede mover el avance y se guarda
- **Dónde:** detalle de ORD-2026-049 (recepción, nada autorizado), 390 px.
- **Pasos:** como mecánico abrir la orden; escribir 50 en el campo «%» de avance.
- **Qué pasó:** el campo acepta y la base guarda `porcentaje_avance = 50` (comprobado por la API), sin aviso ni error. Justo encima la app dice «la orden no se puede empezar ni terminar hasta que administración registre la autorización» y desactiva el selector de estado.
- **Qué debería pasar:** el deslizador y el campo de avance deshabilitados (o con el mismo aviso) mientras no haya nada autorizado, igual que el selector.
- **Captura:** `q1-tecnico-18-sin-autorizar.png`, `q1-tecnico-20-avance-sin-autorizar.png`.
- **Dónde está (probable):** `src/features/workOrders/detail/OrderHeader.tsx` (el control de avance) y `TechOrderStatus.tsx`.

### B-03 · Media · Criterio 1 — Al abrir la orden desde la lista, «Tareas» está cerrada
- **Dónde:** Órdenes → abrir una orden, 390 px.
- **Pasos:** lista de órdenes del técnico → tocar ORD-2026-048.
- **Qué pasó:** se ven el selector, el avance y seis botones; «Tareas» (lo que el técnico viene a hacer) está plegada. Para marcar «Realizado» hace falta tocar «Mis tareas» (o desplegar) y luego el botón: tres toques. Desde el panel (tocando la tarea en «Mis tareas») sí llega con la sección abierta, así que el mismo trabajo se abre distinto según el camino.
- **Qué debería pasar:** al llegar desde la lista, la sección de tareas del técnico ya abierta.
- **Captura:** `q1-tecnico-fallo.png` (detalle recién abierto desde la lista, «Tareas» plegada); `q1-tecnico-03-detalle-aut.png` (llegando desde el panel).
- **Dónde está (probable):** `src/features/workOrders/WorkOrderDetail.tsx` (`TAB_SECTIONS`, `LINKED_SECTION`) y `detail/OrderTabTop.tsx`.

### B-04 · Media · Criterios 1 y 6 — Seis botones rápidos en la cabecera y módulos que se van a apagar en medio del flujo
- **Dónde:** detalle de la orden como mecánico, 390 px.
- **Qué pasó:** la cabecera ofrece «Mis tareas», «Registrar avance», «Inspección», «Reportar trabajo adicional», «Sugerir próximo servicio» y «Datos del vehículo», más el principal «Terminé…» cuando toca. En cada tarea aparece «Iniciar» (reloj), y hay una sección «Tu comisión estimada». «Inspección», el reloj y la comisión son módulos de la lista del criterio 6 y estorban en el camino básico (la tarea trae «Iniciar», «Realizado», «Agregar avance» y «Foto» en cuatro botones).
- **Qué debería pasar:** un solo botón principal por estado y lo demás agrupado; sin los botones de módulos apagados.
- **Captura:** `q1-tecnico-03-detalle-aut.png`, `q1-tecnico-10-tarea1-hecha.png`.
- **Dónde está (probable):** `src/features/workOrders/detail/OrderQuickActions.tsx`, `TechnicianTaskList.tsx`.

### B-05 · Media · Criterio 2 — El deslizador de avance mide 16 px de alto
- **Dónde:** cabecera del detalle, 390 px.
- **Qué pasó:** `input[type=range]` de 189 × 16 px (medido); en un teléfono es difícil acertarle con el dedo. El campo numérico de al lado sí es cómodo.
- **Qué debería pasar:** zona táctil de 44 px o más.
- **Captura:** `q1-tecnico-03-detalle-aut.png`.
- **Dónde está (probable):** `src/features/workOrders/detail/OrderHeader.tsx` y su CSS en `src/styles/components.css`.

### B-06 · Media · Criterio 2 — La casilla «Visible para el cliente» es de 13 px y su renglón de 22 px
- **Dónde:** diálogo «Agregar avance», 390 px.
- **Qué pasó:** casilla de 13 × 13 px, y la etiqueta clicable mide 22 px de alto. Es la decisión que más importa en ese diálogo (lo que ve el cliente) y es de lo más pequeño de la pantalla.
- **Qué debería pasar:** renglón de 44 px o más con la casilla visible más grande.
- **Captura:** `q1-tecnico-04-avance-tarea.png`.
- **Dónde está (probable):** `src/features/workOrders/TaskProgressModal.tsx` (y el avance de `ProgressLog`).

### B-07 · Baja · Criterio 2 — Los botones ES / EN miden 40 px de ancho
- **Dónde:** encabezado de toda la app, 390 px (40 × 44 px medido).
- **Qué debería pasar:** 44 px o más de ancho.
- **Captura:** `q1-tecnico-02-lista.png`.
- **Dónde está (probable):** `src/components/layout/Header.tsx`.

### B-08 · Baja · Criterio 3 — «Guardar» queda apagado sin decir qué falta
- **Dónde:** «Agregar avance» (sin texto) y «Reportar trabajo adicional» (sin texto), 390 px.
- **Qué pasó:** el botón está deshabilitado y no hay aviso de que falta escribir algo (en «Reportar…» tampoco). La regla del proyecto es que un «Guardar» nunca calle.
- **Qué debería pasar:** un texto de ayuda o que el botón avise qué campo falta.
- **Captura:** `q1-tecnico-04-avance-tarea.png`, `q1-tecnico-12-reportar.png`.
- **Dónde está (probable):** `TaskProgressModal.tsx`, `ReportFindingModal.tsx`.

### B-09 · Baja · Criterio 3 — Al marcar «Realizado» la tarea salta al final de la lista sin aviso
- **Dónde:** sección «Tareas», 390 px.
- **Qué pasó:** al tocar «Realizado» no hay toast y la tarjeta se va debajo de la que sigue pendiente; la lista se mueve bajo el dedo. El segundo toque en «Realizado» (mío) cayó en la otra tarea.
- **Qué debería pasar:** una confirmación breve («Tarea hecha») y que la tarjeta no cambie de lugar de golpe.
- **Captura:** `q1-tecnico-10-tarea1-hecha.png`.
- **Dónde está (probable):** `src/features/workOrders/TechnicianTaskList.tsx`.

### B-10 · Baja · Criterio 2 y 4 — El selector de estado apagado recorta su texto
- **Dónde:** cabecera con la orden en espera de autorización, 390 px.
- **Qué pasó:** muestra «Espera Autorizac» cortado, además de apagado.
- **Captura:** `q1-tecnico-14-tras-reportar.png`.
- **Dónde está (probable):** `OrderHeader.tsx` y `components.css` (el ancho del selector).

### B-11 · Baja · Criterio 4 — Textos mezclados en inglés
- **Dónde:** campana y botón rápido, 390 px, idioma EN.
- **Qué pasó:** (a) el aviso «Trabajos autorizados» sale en inglés como «Estimate answered», que no es lo mismo, y su cuerpo queda en español («Autorizado: PRUEBA Q1B …»); (b) el botón «Mis tareas» se vuelve «My jobs» mientras la sección se llama «Tasks».
- **Captura:** `q1-tecnico-23-ingles-campana.png`, `q1-tecnico-21-ingles-detalle.png`.
- **Dónde está (probable):** `src/i18n/translations.ts` (~línea 2870) y la función SQL de la migración `20261010000034_trabajos_y_catalogo.sql` (arma el cuerpo en español, línea ~884).

### B-12 · Baja · Criterio 1 y 4 — El panel del técnico repite lo mismo tres veces
- **Dónde:** Panel como mecánico, 390 px.
- **Qué pasó:** «Mis tareas» (7), «Mis Órdenes Activas» y «Órdenes Recientes» con una tarjeta tipo tabla por orden y su botón «Ver orden», todo de las mismas 5 órdenes. La pantalla mide unos 3.000 px de alto.
- **Captura:** `q1-tecnico-01-panel.png`.
- **Dónde está (probable):** `src/pages/Dashboard.tsx` y su tabla de órdenes recientes.

## 3. Hallazgos del cliente (enlace `/r/<token>`)

### B-13 · Media · Criterios 4 y 5 — Al aprobar el presupuesto sale una caja nativa del navegador
- **Dónde:** enlace del cliente, sección «Estimate to approve», 390 px.
- **Pasos:** marcar dos renglones, escribir el nombre, tocar «Approve checked items».
- **Qué pasó:** `confirm: Approve 2 item(s) for $390.00? Anything unchecked will not be done.` (caja nativa, con «item(s)»). Es el momento más importante del enlace y es el único que no se ve del programa.
- **Qué debería pasar:** una confirmación con el diseño del portal y con el monto bien dicho.
- **Captura:** `q1-cliente-02-presupuesto-lleno.png` (antes de tocar); la caja se registró en `page.dialogs`.
- **Dónde está (probable):** `src/portal/components/QuoteSection.tsx` (línea ~121, `confirm(question)`). Igual en `EmailPreference.tsx`.

### B-14 · Baja · Criterio 1 y 5 — Después de aprobar no se ve qué se aprobó en la pantalla principal
- **Dónde:** el enlace tras aprobar dos de tres renglones.
- **Qué pasó:** sale «Thank you. We saved your response…» y la tarjeta de presupuesto desaparece; en la pantalla solo queda «Balance due: $390.00». No se ve cuáles renglones quedaron aprobados y cuál no. (No abrí la sección «Your balance» de esa orden; en ORD-2026-048 sí lista «Sus autorizaciones».)
- **Captura:** `q1-cliente-03-presupuesto-aprobado.png`.
- **Dónde está (probable):** `src/portal/components/QuoteSection.tsx`.

### B-15 · Baja · Criterio 1 y 5 — «Enlace no válido» no da ningún teléfono ni salida
- **Dónde:** `/r/<64 letras inventadas>` y `/r/abc`, 390 px.
- **Qué pasó:** solo «Revise que el enlace esté completo…». Sin teléfono del taller ni forma de pedir otro enlace; el cliente se queda sin siguiente paso. (Es entendible que no se muestre el taller de un enlace desconocido; falta al menos un «llame al taller que le atendió».) El enlace vencido o desactivado no lo pude provocar.
- **Captura:** `q1-cliente-07-inventado.png`.
- **Dónde está (probable):** `src/portal/` (la pantalla de enlace no válido) y `src/portal/strings.ts`.

### B-16 · Baja · Criterio 4 y 5 — Plurales con «(s)» en lo que lee el cliente
- **Dónde:** «0 photo(s)» / «0 foto(s)» en la recepción; «3 autorizado(s), 0 no autorizado(s)» en la cuenta; «Approve 2 item(s)».
- **Qué debería pasar:** plural bien escrito (o «Sin fotos»).
- **Captura:** `q1-cliente-05-cuenta.png`.
- **Dónde está (probable):** `src/portal/strings.ts` (líneas ~58, 218, 275, 435).

### B-17 · Baja · Criterio 5 — Una foto que no carga deja un cuadro roto sin texto alternativo
- **Dónde:** «Work updates» del enlace de ORD-2026-048 (avance visible con dos fotos).
- **Qué pasó:** se ven dos cuadros con el ícono de imagen rota y `alt=""`. **Ojo:** las direcciones de las fotos salen como `http://kong:8000/storage/v1/object/sign/...`, que es la dirección interna de Docker, y por eso no cargan en esta base local. Esto casi seguro es del entorno local, no de producción: **no pude verificar cómo se ven las fotos del avance en el enlace**. Lo que sí se puede mejorar es el cuadro roto sin descripción.
- **Captura:** `q1-cliente-05-cuenta.png`.
- **Dónde está (probable):** `src/portal/components/` (la galería del avance); la URL interna la arma la edge function `portal` con el `SUPABASE_URL` del contenedor (`supabase/functions/portal/`).

## 4. Lo que está bien

- Entrar como técnico: login a panel en ~1,5 s, sin desbordes a 390 px en ninguna pantalla probada (scroll horizontal = 0 en panel, lista, detalle y enlace).
- «Mis tareas» en el panel lleva directo a la tarea; los avisos de la campana abren la orden y se marcan leídos; cada aviso tiene su botón de 44 px.
- Registrar un avance con foto y texto: diálogo claro, miniatura de la foto, «Guardar» en ~1 s, toast «Avance registrado» y bandeja de subida («1 de 1 archivos subidos»).
- «Atrás» con un avance a medias pregunta con el diálogo de la app («¿Descartar este avance?… Seguir editando / Descartar»), sin caja nativa.
- Orden sin autorizar: la pantalla del técnico explica con claridad por qué no puede empezar («El cliente todavía no autoriza ningún trabajo…») y qué está esperando, y las tareas aparecen «Esperando autorización» sin botones de acción.
- «Reportar trabajo adicional»: flujo corto, el aviso del toast dice que la orden quedó en pausa, y el banner naranja de la orden en pausa es claro. Al descartar el hallazgo, la orden vuelve sola a «En Proceso».
- Enlace del cliente: carga en ~3,5 s, orden de secciones lógico (estado, presupuesto, avances, cuenta, contacto), botón «Call» a 44 px, cambio EN/ES inmediato, completo y recordado al recargar; la cuenta desglosa mano de obra, repuestos y autorizaciones. Aprobar una parte del presupuesto funcionó y el saldo quedó en $390.00 (los dos renglones aprobados).
- Sin errores de consola propios ni cajas nativas en el recorrido del técnico (los 403 de B-01 son la excepción).

## 5. Lo que no pude probar

- **Fotos del avance en el enlace del cliente:** las direcciones salen con el host interno `kong:8000`, no resoluble desde el navegador (B-17). Tampoco las miniaturas con foto de «Vehicle check-in».
- **Enlace vencido o desactivado** (hace falta revocarlo como administración; no lo hice para no tocar el flujo del otro papel).
- **Si «Approve checked items» exige el nombre:** el botón quedó habilitado con el nombre vacío (con dos renglones marcados); como escribí el nombre antes de enviar, no vi qué pasa si se manda vacío.
- **Rechazar todo («Decline everything»)** y la vista del cliente con el presupuesto rechazado.
- **Cobro/entrega y el estado «Entregado» en el enlace:** la orden ORD-2026-048 quedó «lista para entregar» (la dejé así con la sesión de administración por la API para ver ese estado); no la entregué.
- **Reloj por tarea, inspección y comisiones:** fuera de alcance (criterio 6).
- **Video y nota de voz de un avance** (la cámara real no existe en el navegador de pruebas).
- **Después de una pausa de red a mitad de una subida** (se cortó la red mientras guardaba un avance con dos fotos): el toast no llegó a verse, pero el avance sí quedó guardado (aparece en el enlace del cliente), así que no es un hallazgo; solo queda dicho que no vi el toast.
- **Escritorio:** este papel era solo teléfono.
