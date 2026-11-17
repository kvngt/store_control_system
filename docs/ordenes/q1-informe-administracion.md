# Q1 — Informe del Papel A (Administración)

Recorrido hecho el 16/11/2026 con Playwright contra la app compilada local (`http://localhost:4173`) y la
base local, en escritorio 1366 px y teléfono 390 px. Datos con el prefijo `PRUEBA Q1A`. Orden de prueba
completa: ORD-2026-051 (escritorio) y ORD-2026-052 (teléfono). Capturas en `qa.local/shots/q1-admin-*`
(el sufijo `-d` es escritorio y `-m` teléfono). Scripts en `qa.local/q1a-*.mjs`. En todo el recorrido hubo
**cero errores de consola** (salvo los 409 esperados de la placa repetida) y **ninguna caja nativa** del
navegador, salvo el aviso de salida (`beforeunload`) al recargar a medio alta.

## 1. Resumen

El flujo completo corre sin ayuda y los números son correctos: alta en cuatro pasos (unos 14 s con el
guion), autorización que pasa sola la orden a «En Proceso», anticipo, «Marcar listo para entregar» con su
mensaje de WhatsApp, entrega con método de pago, cobro visible en Finanzas ($470 total, $150 previo, $320
cobrado al entregar, costo de repuestos −$90) y portal del cliente limpio. En 390 px no hubo desbordes
horizontales en ninguna pantalla probada. No encontré ningún defecto de gravedad **Alta**; lo más pesado es:
(1) el alta deja guardar un teléfono incompleto y crea clientes duplicados por teléfono sin avisar,
(2) la placa repetida en el alta solo avisa con un toast y deja un cliente suelto, y (3) en recepción
compiten dos botones principales y los módulos que se van a apagar (catálogo, reloj, comisiones, estados de
cuenta, indicadores) estorban en pantallas del flujo básico.

Total: 0 Alta, 10 Media, 8 Baja.

## 2. Hallazgos (del más grave al menos grave)

### A-01 — Un teléfono incompleto se guarda (y las letras caben en el campo)
- **Gravedad:** Media. **Vara:** 3.
- **Dónde:** Nueva orden, paso 1 (cliente nuevo), 1366 px; el mismo campo en Clientes > Editar.
- **Pasos:** Nueva Orden > «+ Nuevo Cliente» > nombre `PRUEBA Q1A Cliente`, teléfono `123` > Siguiente.
- **Qué pasó:** Sale un aviso ámbar («Un número de Estados Unidos tiene 10 dígitos.») pero no bloquea:
  pasa al paso 2 y el cliente se guarda con `+1123` (confirmado en la base). El campo también acepta letras
  (`abc12` se queda escrito). En Clientes > Editar, con `abc` y «Actualizar», el mensaje dice «El teléfono del
  cliente es obligatorio.» aunque está lleno (es inválido, no vacío).
- **Qué debería pasar:** o pide confirmar («¿Guardar así?») o bloquea; sin correo, el teléfono es el único
  canal (WhatsApp/SMS). El mensaje debe decir «teléfono no válido», no «obligatorio».
- **Captura:** `q1-admin-06-alta-telefono-invalido-d.png`, `q1-admin-07-telefono-123-aviso-d.png`,
  `q1-admin-63-cliente-editar-tel-invalido-d.png`.
- **Archivo probable:** `src/lib/phone.ts` (`looksIncomplete`), `src/components/PhoneInput.tsx`,
  `src/features/workOrders/workOrderForm.schema.ts` (línea ~115, solo revisa que no esté vacío).

### A-02 — Clientes duplicados por el mismo teléfono, sin aviso
- **Gravedad:** Media. **Vara:** 1 (dato que se escribe dos veces).
- **Dónde:** Nueva orden, paso 1, 1366 px.
- **Pasos:** crear dos veces un cliente nuevo con el teléfono `4105550101`.
- **Qué pasó:** los dos se guardan sin advertencia; en Clientes aparecen «PRUEBA Q1A Cliente d» ×2 con
  `+1 (410) 555-0101`, y lo mismo «PRUEBA Q1A Alta d» ×2.
- **Qué debería pasar:** al salir del paso 1 con un teléfono que ya existe, ofrecer «Ya existe: [nombre].
  ¿Usarlo?». Es el atajo para el cliente que vuelve.
- **Captura:** salida de `qa.local/q1a-cli.mjs` (lista de Clientes con duplicados); `q1-admin-61-clientes-busqueda-d.png`.
- **Archivo probable:** `src/features/workOrders/intake/useIntakeRecords.ts` y `useIntakeSubmit.ts`
  (donde se guarda el cliente al salir del paso); `src/services/customers.service.ts`.

### A-03 — Placa repetida en el alta: solo un toast, y queda un cliente suelto
- **Gravedad:** Media. **Vara:** 3.
- **Dónde:** Nueva orden, paso 2 > Siguiente, 1366 px.
- **Pasos:** cliente nuevo + vehículo con una placa y estado ya registrados (`Q1A 001`, MD) > Siguiente (dos veces).
- **Qué pasó:** no avanza y el único aviso es un toast rojo («No se pudo guardar el vehículo… Búscalo en
  Vehículos y úsalo…») que aparece junto a un toast verde «Cliente guardado»; el campo Placa no se marca. En
  el segundo intento sale otro toast igual. El cliente nuevo ya quedó guardado (0 vehículos, 0 órdenes en
  Clientes). Al editar un vehículo desde Vehículos, el mismo error sí sale **dentro** del diálogo (inconsistente).
  Además, el consejo «Búscalo en Vehículos» obliga a salir del alta a mitad.
- **Qué debería pasar:** error en el campo Placa (`aria-invalid`), con el dato que ya tiene esa placa y un
  botón «Usar ese vehículo»; sin toast de éxito del cliente en el mismo momento.
- **Captura:** `q1-admin-18-placa-repetida-d.png`, `q1-admin-66-vehiculo-placa-repetida-d.png`.
- **Archivo probable:** `src/features/workOrders/intake/useIntakeSubmit.ts` (línea ~239) y
  `useIntakeRecords.ts` (línea ~173).

### A-04 — Dos botones principales (amarillos) a la vez en recepción
- **Gravedad:** Media. **Vara:** 1.
- **Dónde:** Detalle de orden en Recepción con trabajos cotizados, 1366 y 390 px.
- **Pasos:** crear una orden con trabajo y repuesto sin marcar «El cliente aceptó» > abrir la orden > Resumen.
- **Qué pasó:** «Tomar firma» y «Enviar presupuesto» son amarillos al mismo tiempo; además «Registrar
  autorización…» queda como enlace secundario. La regla es un solo botón principal por estado.
- **Qué debería pasar:** uno solo (lo que sigue: cotizar/autorizar) y la firma como acción secundaria, porque
  la firma «no autoriza lo cotizado».
- **Captura:** `q1-admin-27-tras-crear-d.png`, `q1-admin-87-detalle-recepcion-m.png`.
- **Archivo probable:** `src/features/workOrders/detail/OrderQuickActions.tsx`,
  `src/features/workOrders/AuthorizationPanel.tsx`.

### A-05 — «Agregar trabajo» y «Registrar autorización…» del Resumen solo cambian de pestaña
- **Gravedad:** Media. **Vara:** 1.
- **Dónde:** Detalle de orden > Resumen, 1366 px (en 390 px el salto va a unos 1240 px de scroll).
- **Pasos:** Resumen > «Agregar trabajo» (o «Registrar autorización…»).
- **Qué pasó:** no abre el formulario ni el diálogo: cambia a la pestaña Trabajos y hay que volver a tocar
  «Agregar trabajo» (`#labor-new-open`) o «Registrar autorización». La elipsis de «Registrar autorización…»
  promete un diálogo que no se abre. Dos toques de más en dos de las acciones más frecuentes.
- **Qué debería pasar:** abrir el formulario/diálogo directamente (o que el botón del Resumen lo abra ya
  desplegado).
- **Captura:** `q1-admin-31-tras-autorizar-d.png`, `q1-admin-33-agregar-trabajo-detalle-d.png`.
- **Archivo probable:** `src/features/workOrders/detail/OrderQuickActions.tsx`,
  `src/features/workOrders/AuthorizationPanel.tsx` (clave `registerInWork`, `translations.ts` línea 670).

### A-06 — «Ocupación del taller: 33/10 (100%)»
- **Gravedad:** Media. **Vara:** 4 (muestra algo que no cuadra).
- **Dónde:** Tablero (arriba de las columnas) y Panel («32/10 espacios ocupados»), 1366 px.
- **Pasos:** Órdenes > Tablero.
- **Qué pasó:** muestra 33 de 10 y el 100 % con barra roja; el porcentaje se corta en 100 % y la fracción
  dice otra cosa. Con datos de prueba (más órdenes que capacidad), pero un taller real que se pase de su
  capacidad vería lo mismo.
- **Qué debería pasar:** «33 de 10 (sobrecupo)» o mostrar el real (330 %), o no contar entregadas.
- **Captura:** `q1-admin-72-tablero-d.png`.
- **Archivo probable:** `src/pages/KanbanBoard.tsx`, `src/pages/Dashboard.tsx` (clave `occupancy` / `spacesInUse`).

### A-07 — Los módulos que se van a apagar estorban en el flujo básico
- **Gravedad:** Media. **Vara:** 6.
- **Dónde:** varias pantallas, 1366 px.
- **Qué vi (solo lo que está en el camino del flujo básico, sin recorrer los módulos):**
  - Alta, paso 3: botón «Del catálogo» junto a «Agregar trabajo».
  - Detalle > Trabajos: «Tiempos» (reloj) en cada tarea, «Del catálogo» y la tarjeta «Reparto de la comisión».
  - Diálogo de entrega: «…y se generan las comisiones.»
  - Finanzas > Margen por orden: columna COMISIONES; pestañas «Estados de cuenta (contabilidad)» e «Indicadores».
  - Configuración: tarjetas «Catálogo de trabajos frecuentes» y «Plantillas de inspección multipunto»; menú
    lateral «Comisiones».
- **Qué debería pasar:** nada de eso en el camino de recibir, cotizar, entregar y cobrar.
- **Captura:** `q1-admin-16b-paso4-sin-trabajos-d.png` (alta), `q1-admin-33-agregar-trabajo-detalle-d.png`,
  `q1-admin-43-entregar-dialogo-d.png`, `q1-admin-60-finanzas-d.png`, `q1-admin-67-config-d.png`.
- **Archivo probable:** `src/features/workOrders/intake/` (paso de trabajos), `src/features/workOrders/detail/sections/`,
  `src/features/workOrders/DeliveryModal.tsx` (`translations.ts` línea 883), `src/pages/Finance.tsx`, `src/pages/Settings.tsx`.

### A-08 — El selector de cliente del alta es un `<select>` nativo con 65 opciones y sin búsqueda
- **Gravedad:** Media. **Vara:** 1 (recibir en menos de 60 s con cliente que vuelve).
- **Dónde:** Nueva orden, paso 1, 1366 y 390 px.
- **Qué pasó:** «Perfil del Cliente» lista a todos los clientes por orden alfabético en un `<select>` nativo; en
  este taller de prueba ya son 65 y en un taller real serán cientos. Encontrar a quien vuelve es desplazarse o
  teclear letras a ciegas. El resto de la app (Marca, Modelo) sí tiene buscador.
- **Qué debería pasar:** el mismo combobox con búsqueda por nombre/teléfono que usa Marca.
- **Captura:** `q1-admin-02-alta-paso1-d.png`.
- **Archivo probable:** `src/features/workOrders/intake/` (campo `#intake-customer`).

### A-09 — En el teléfono, el encabezado del detalle empuja la acción principal fuera de la primera pantalla
- **Gravedad:** Media. **Vara:** 2.
- **Dónde:** Detalle de orden, 390 px.
- **Qué pasó:** antes de la primera acción de recepción hay: «Volver», título, 3 botones, «Retirada sin
  reparar», selector de estado con barra y % de avance, «Desplegar todo» y 6 botones de acciones rápidas en 3
  filas. La tarjeta de autorización está debajo (la página mide 1.869 px y «Registrar autorización…» salta a
  ~1.240 px). En escritorio las pestañas lo resuelven, en el teléfono no hay pestañas.
- **Qué debería pasar:** en el teléfono, estado y avance compactos, y la acción del estado a la vista.
- **Captura:** `q1-admin-87-detalle-recepcion-m.png`, `q1-admin-88-detalle-recepcion-full-m.png`.
- **Archivo probable:** `src/features/workOrders/detail/OrderHeader.tsx`, `OrderTabTop.tsx`, `WorkOrderDetail.tsx`.

### A-10 — Objetivos táctiles de menos de 44 px
- **Gravedad:** Media. **Vara:** 2.
- **Dónde:**
  - 390 px, Panel: los enlaces `ORD-2026-0xx` de las alertas miden 19 px de alto (82–88 px de ancho).
  - 390 px, Alta: las fichas del indicador de pasos miden 41 × 79 px.
  - 1366 px: «Cerrar» (X) de los diálogos mide 28 × 31; botones de fila en Órdenes (Abrir/Archivar/Eliminar)
    34 × 34; pestañas Lista/Tablero 27 px de alto; botones «Revisar» 28 px; Foto/Video/Nota de voz del alta 28 px.
- **Qué debería pasar:** 44 px o más (al menos en el teléfono).
- **Captura:** salida de `q1a-mob.mjs` y `q1a-alta1.mjs`; `q1-admin-80-panel-m.png`.
- **Archivo probable:** `src/styles/components.css` (`.modal-close`, `.icon-btn`, chips de alerta del Panel en
  `src/pages/Dashboard.tsx`).

### A-11 — Un trabajo recién cotizado aparece como «$0.00» en la lista
- **Gravedad:** Baja (por diseño: solo lo autorizado se cobra). **Vara:** 4.
- **Dónde:** Órdenes > Lista, 1366 px.
- **Qué pasó:** ORD-2026-052, con $390 cotizados y sin autorizar, muestra TOTAL $0.00 en la columna de la
  lista; quien mira solo la lista no sabe que hay una cotización pendiente.
- **Qué debería pasar:** una marca «$390 por autorizar» junto al $0.00.
- **Captura:** salida de `q1a-tab.mjs` (texto de la lista filtrada).
- **Archivo probable:** `src/pages/WorkOrders.tsx` (columna Total).

### A-12 — Los avisos «Cliente guardado» y «Vehículo guardado» tapan el indicador de pasos en el teléfono
- **Gravedad:** Baja. **Vara:** 4.
- **Dónde:** Alta, pasos 2 y 3, 390 px (en 1366 px el toast cubre la X de cerrar).
- **Qué pasó:** dos toasts apilados cubren el título y el indicador de pasos; además son ruido: el paso ya
  avanzó y el indicador marca una palomita.
- **Qué debería pasar:** sin toast de éxito al avanzar de paso (solo para errores).
- **Captura:** `q1-admin-86-alta-trabajo-form-m.png`, `q1-admin-06-alta-telefono-invalido-d.png`.
- **Archivo probable:** `src/features/workOrders/intake/useIntakeSubmit.ts` / `useIntakeRecords.ts` (`showToast`).

### A-13 — El pedido de «recuperar borrador» tiene doble punto
- **Gravedad:** Baja. **Vara:** 4.
- **Dónde:** Nueva orden después de recargar a medio alta, 1366 px.
- **Qué pasó:** «Quedó un borrador guardado el 16 nov, 6:43 p.m.. ¿Lo continúas…?» (dos puntos seguidos, porque
  la fecha en es-MX ya termina en «p.m.»).
- **Qué debería pasar:** un solo punto.
- **Captura:** `q1-admin-12-recargar-nueva-orden-d.png`.
- **Archivo probable:** `src/i18n/translations.ts` línea 555 (`restoreBody`) o el formateador de la fecha.

### A-14 — «Finalizado» desde el selector no da respuesta ni avisa que hay tareas sin hacer
- **Gravedad:** Baja. **Vara:** 3.
- **Dónde:** Detalle de orden, selector de estado, 1366 px.
- **Pasos:** orden En Proceso con 0/2 tareas hechas > selector > «Finalizado».
- **Qué pasó:** cambia al instante (el avance salta a 100 %) pero sin toast ni confirmación, y con las
  tareas sin marcar. Es de administración y es válido, pero no hay respuesta de «guardado».
- **Qué debería pasar:** un toast corto («Orden finalizada») y/o aviso si hay tareas pendientes.
- **Captura:** `q1-admin-39-finalizado-d.png`, `q1-admin-40-resumen-finalizado-d.png`.
- **Archivo probable:** `src/features/workOrders/detail/useOrderTransitions.ts`.

### A-15 — Palabras del sistema en Configuración
- **Gravedad:** Baja. **Vara:** 4.
- **Dónde:** Configuración > «Correos al cliente», 1366 px.
- **Qué pasó:** «…corrígela primero (secreto RESEND_API_KEY) y después reintenta.» — un texto para quien
  mantiene el sistema, visible para el dueño del taller.
- **Captura:** `q1-admin-67-config-d.png`.
- **Archivo probable:** `src/i18n/translations.ts` líneas 1437 y 3316.

### A-16 — El selector «Técnico» del alta se corta en el escritorio
- **Gravedad:** Baja. **Vara:** 4.
- **Dónde:** Alta, paso 3, formulario «Agregar trabajo», 1366 px.
- **Qué pasó:** el selector del técnico es angosto y muestra «Mecánico Prue…» (en 390 px sí ocupa todo el ancho).
- **Captura:** `q1-admin-19-agregar-repuesto-d.png`.
- **Archivo probable:** `src/features/workOrders/intake/` (formulario de trabajo) y `src/styles/components.css`.

### A-17 — La página 2 del PDF es solo un dibujo del carro sin marcas
- **Gravedad:** Baja. **Vara:** 5.
- **Dónde:** PDF de ORD-2026-051 (Descargar PDF, ES).
- **Qué pasó:** el PDF tiene 2 páginas; la segunda es únicamente el encabezado «Daños del Vehículo
  (Recepción)» y las seis vistas vacías (sin daños marcados), que ocupan un tercio de hoja. El texto extraído
  de la primera página es correcto (datos, líneas, totales $470 / depósito $150 / saldo $0). Aviso: mi
  visualizador de PDF no pudo dibujar las letras (sin fuentes), por lo que **no juzgo la tipografía ni la
  maquetación fina**; solo el contenido y la estructura.
- **Qué debería pasar:** si no hay marcas ni fotos, omitir la página.
- **Captura:** `q1-admin-50-pdf-es-p2.png` (las letras ilegibles son del visor, no del PDF).
- **Archivo probable:** `src/lib/workOrderPdf.ts`.

### A-18 — El cliente nuevo nace en inglés y el alta no permite elegir idioma
- **Gravedad:** Baja (es la decisión vigente). **Vara:** 5.
- **Dónde:** alta y «Marcar listo para entregar», 1366 px.
- **Qué pasó:** el mensaje de WhatsApp para el cliente salió en inglés («Hi PRUEBA, your Toyota Camry is ready
  for pickup…») y el portal también abre en inglés, para un cliente creado sin poder indicar su idioma (solo se
  elige después, en Clientes > Editar > «Idioma de los correos»). El administrador que opera en español no ve
  ese idioma hasta que envía el mensaje.
- **Qué debería pasar:** mostrar el idioma (o preguntarlo en el alta junto al teléfono) o, al menos, mostrar
  la vista previa del mensaje antes de enviarlo.
- **Captura:** `q1-admin-41-listo-dialogo-d.png`, `q1-admin-70-portal-d.png`.
- **Archivo probable:** `src/features/workOrders/intake/` (paso del cliente), `src/lib/portalShare.ts`.

## 3. Lo que está bien (no tocar)

- El alta en cuatro pasos cumple la meta de tiempo: con cliente y vehículo nuevos, un trabajo, un repuesto y un
  depósito en efectivo, la orden se creó en unos 14 s con el guion; el aviso de «Orden creada» y el detalle
  abren sin pantalla vacía.
- Validaciones claras y en su campo: nombre y teléfono vacíos, «Describe el trabajo.», «Elige cómo pagó el
  cliente.», «Escribe el monto del anticipo.»; la placa fuera de formato avisa sin bloquear.
- «Atrás» a medio alta no pierde nada: pregunta «Seguir editando / Guardar borrador y salir / Descartar»; tras
  recargar, el alta ofrece «Continuar el borrador».
- Los números cuadran de punta a punta: autorizado $470, anticipos $150, saldo $320; Finanzas muestra el pago
  final y el costo de repuestos; el PDF trae los mismos totales.
- Registrar la autorización pasa la orden sola a «En Proceso»; después de finalizar, el botón principal es uno
  solo («Marcar listo para entregar», luego «Entregar y cobrar $320.00»), con el mensaje de WhatsApp listo
  para copiar y el aviso de que el cliente no tiene correo.
- Sin desborde horizontal en 390 px en Panel, Órdenes, alta (4 pasos), detalle, diálogo de autorización y
  portal; los botones de pie de los diálogos (Cancelar/Registrar) miden 39 px de alto y las entradas 43 px o más.
- Sin errores de consola y sin cajas nativas en todo el recorrido; la lista, el tablero y la búsqueda
  responden en menos de 1 s; `?vista=tablero` sobrevive a recargar.
- El portal del cliente (`/r/<token>`) se ve limpio y profesional (estado en 4 pasos, contacto, saldo «Paid in
  full», cambio EN/ES) en 1366 y 390 px.
- La placa repetida al editar un vehículo muestra un error claro dentro del diálogo.

## 4. Lo que no pude probar (y por qué)

- **«Tomar firma»**, «Registrar avance», «Sticker de servicio», «Aplicar descuento», parqueo y «Retirada sin
  reparar»: fuera del camino pedido o sin margen; no los abrí.
- **Enviar reporte, WhatsApp/SMS real, «Copiar enlace»/«Cambiar enlace»/«Desactivar»**: no se pueden ejecutar
  en el navegador sin salida real; solo vi el mensaje y el enlace. Enlace vencido o inventado: lo cubre el
  papel B (vi «Enlace no válido» al usar un token vacío, en español).
- **Visual del PDF:** mi visualizador (pdfjs en Node, sin fuentes) dibuja las letras rotas, así que no puedo
  opinar de la tipografía ni de la maquetación fina; solo comprobé texto, páginas y enlaces.
- **Teléfono (390 px):** probé alta, lista, detalle en recepción y diálogo de autorización. No recorrí en
  teléfono la entrega, Finanzas, Clientes, Vehículos ni Configuración.
- **Configuración > datos del taller:** vi la pantalla (perfil, idioma, sedes con teléfonos de contacto) pero
  no edité nada (la dirección del taller se ve en el PDF y el portal: «1234 Main Street, Silver Spring, MD»).
- **Inglés en la app de administración:** todo el recorrido fue en español; no verifiqué que el cambio a EN
  esté completo en estas pantallas.
- **Banner «Esta pestaña está desactualizada»:** apareció a mitad del recorrido («la aplicación espera
  …045 · la base de datos tiene …046»), porque otro agente o el arquitecto aplicó una migración 046 a la base
  local mientras corría. Es el comportamiento esperado de una app compilada más vieja que la base; no lo conté
  como hallazgo. Para esa fecha ya no usé datos que dependieran de la 046.
- **Datos que dejé en la base local** (todos con `PRUEBA Q1A`): ~8 clientes (algunos sin vehículo ni orden por
  las pruebas de abandono y de placa repetida), 3 vehículos y las órdenes ORD-2026-051 (entregada) y
  ORD-2026-052 (recepción).
