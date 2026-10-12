# Análisis de la organización de la interfaz de Restorify

Este análisis revisa cómo están organizadas las pantallas de Restorify. Su objetivo es detectar pantallas saturadas, datos desordenados y botones fuera de lugar para ayudar al taller a trabajar más rápido, especialmente desde el teléfono.

> **Cómo se hizo (12/10/2026).** Leyendo el código de cada pantalla, no con capturas: lo marcado
> "(verificar con captura)" depende de cómo se ve y se confirma al tomar las capturas del manual.
> Lo redactó Gemini a partir de un mapa de los textos de cada pantalla sacado del código; Claude Code
> comprobó las referencias y las observaciones principales contra el código y corrigió lo que no
> coincidía. Sigue al [análisis del 11/10/2026](historico/comparativa-comercial-y-ux-2026-10.md#3-el-orden-de-la-interfaz-confunde-o-satura).
> No propone cambios de reglas de negocio ni de permisos, solo de cómo se ubica y se presenta lo que ya existe.

---

## 1. Estado de los 11 puntos del análisis anterior (11/10/2026)

Revisión de los puntos señalados en `docs/historico/comparativa-comercial-y-ux-2026-10.md` frente al código actual:

1. **"Resumen" no resume:** Abre con botones de acción y tres secciones cerradas (`vehiculo`, `firma`, `tecnicos`), sin mostrar una ficha fija con teléfono, fecha prometida ni saldo.
   - **Estado hoy:** Vigente.
   - **Evidencia:** `src/features/workOrders/WorkOrderDetail.tsx:93` y `WorkOrderDetail.tsx:794`.

2. **Tres avisos que se contradicen en una orden en pausa:** Coexisten el banner superior «Orden en pausa: esperando autorización del cliente.», el mensaje «El cliente respondió el presupuesto...» y el botón «Cotizar al cliente».
   - **Estado hoy:** Vigente.
   - **Evidencia:** `src/features/workOrders/WorkOrderDetail.tsx:866`, `src/features/workOrders/AuthorizationPanel.tsx:130` y `src/features/workOrders/FindingsCard.tsx:59`.

3. **Estado como selector libre y barra de avance en el encabezado:** El `<select>` de estatus permite saltos manuales y el control deslizante de porcentaje ocupa la cabecera, deshabilitados frecuentemente para el técnico.
   - **Estado hoy:** Vigente.
   - **Evidencia:** `src/features/workOrders/WorkOrderDetail.tsx:991` y `WorkOrderDetail.tsx:1037`.

4. **Doce secciones apiladas y cabecera saturada en el teléfono:** En móvil no hay pestañas; todas las secciones se apilan en una columna y la cabecera acumula PDF, idioma, reporte, retiro, estado y avance.
   - **Estado hoy:** Vigente.
   - **Evidencia:** `src/features/workOrders/WorkOrderDetail.tsx:938-980` y `WorkOrderDetail.tsx:1074-1083`.

5. **Mano de obra y repuestos van separados:** Las tareas y las piezas siguen en listas independientes; no existe la agrupación de "trabajos completos" con mano de obra y piezas integradas.
   - **Estado hoy:** Vigente.
   - **Evidencia:** `src/features/workOrders/LaborTable.tsx:225`, `src/features/workOrders/PartsTable.tsx:113` y `src/features/workOrders/WorkOrderDetail.tsx:94`.

6. **Para el técnico, "Tareas" entra cerrada y el botón rápido repite lo mismo:** La sección «Tareas» inicia contraída por defecto y el acceso rápido «Mis tareas» justo encima solo sirve para abrirla.
   - **Estado hoy:** Vigente.
   - **Evidencia:** `src/features/workOrders/WorkOrderDetail.tsx:145` y `WorkOrderDetail.tsx:783`.

7. **Error en tipo de trabajo sin traducir en la cabecera:** La insignia de la orden imprime el valor en crudo `{order.tipo_trabajo}` en lugar de usar las etiquetas traducidas.
   - **Estado hoy:** Vigente.
   - **Evidencia:** `src/features/workOrders/WorkOrderDetail.tsx:888`.

8. **El panel del administrador repite información:** «Requiere atención» lista órdenes que vuelven a aparecer en «Alertas» y se repiten otra vez en la tabla de «Órdenes Recientes».
   - **Estado hoy:** Vigente.
   - **Evidencia:** `src/pages/Dashboard.tsx:112`, `Dashboard.tsx:249` y `Dashboard.tsx:313`.

9. **Lista de órdenes con papelera roja, fechas ISO y falta de columnas:** Muestra fecha en formato `YYYY-MM-DD`, papelera de borrado en cada fila y omite datos útiles como técnico o saldo.
   - **Estado hoy:** Vigente.
   - **Evidencia:** `src/pages/WorkOrders.tsx:588`, `WorkOrders.tsx:719` y `WorkOrders.tsx:734`.

10. **El menú pone Clientes y Vehículos antes de Órdenes y falta botón central en móvil:** La barra lateral mantiene ese orden y la barra inferior del administrador no incluye un botón central para crear órdenes.
    - **Estado hoy:** Vigente.
    - **Evidencia:** `src/components/layout/Sidebar.tsx:45` y `src/components/layout/BottomNav.tsx:32-34`.

11. **Configuración es una sola página larga que mezcla lo personal con el negocio:** Junta en una sola pantalla perfil personal, idioma, tema, notificaciones push, parqueo, sedes y teléfonos.
    - **Estado hoy:** Vigente.
    - **Evidencia:** `src/pages/Settings.tsx:389`, `Settings.tsx:502`, `Settings.tsx:508` y `Settings.tsx:519`.

---

## 2. Hallazgos nuevos pantalla por pantalla

### Alta de la orden

#### Hallazgo 1: Sobrecarga masiva en el paso 2 de recepción
- **Pantalla:** Alta de la orden (`src/features/workOrders/WorkOrderCreateModal.tsx`).
- **Qué se observa:** El paso 2 se llama «Vehículo y recepción» (`intake.steps.vehicle` en `WorkOrderCreateModal.tsx:735`). En una sola pantalla de teléfono compiten: dar de alta un vehículo nuevo con decodificación de VIN de 17 caracteres (`VehicleFields.tsx:201,225`), «Nivel de Gasolina» (`workOrders.fuelLevel` en `WorkOrderCreateModal.tsx:299`), «Millas de Ingreso» (`workOrders.milesIn` en `WorkOrderCreateModal.tsx:309`), la cuadrícula de 6 fotos de «Inspección 360°» (`workOrders.inspection360` en `WorkOrderCreateModal.tsx:330`), barra de captura para fotos, video y voz, y «Notas de la inspección 360°» (`intake.inspectionNotes` en `WorkOrderCreateModal.tsx:392`). (verificar con captura)
- **Por qué le importa al taller:** Con el cliente parado en el mostrador o bajo el sol en el patio, el recepcionista tiene que hacer un desplazamiento vertical excesivo. Esto causa lentitud y fomenta que omitan las fotos de inspección para avanzar rápido.
- **Propuesta concreta:** Dividir en dos pasos claros: paso 2 "Vehículo" (identificación, placa, VIN) y paso 3 "Inspección inicial" (millas, gasolina y fotos 360°).
- **Esfuerzo:** Días.
- **Prioridad:** Alta.

#### Hallazgo 2: Seguro y fecha prometida escondidos al final de la cotización
- **Pantalla:** Alta de la orden (`src/features/workOrders/WorkOrderCreateModal.tsx`).
- **Qué se observa:** En el paso 3 («Trabajos», `intake.steps.work` en `WorkOrderCreateModal.tsx:735`), la «Fecha Estimada de Entrega» (`workOrders.estimatedDelivery` en `WorkOrderCreateModal.tsx:668`) y el bloque «Trabajo con seguro» (`workOrders.withInsurance` en `WorkOrderCreateModal.tsx:679`), con «Aseguradora» y «Número de reclamo», aparecen al final de todo, después de los formularios de agregar tareas y repuestos.
- **Por qué le importa al taller:** Si un auto ingresa para revisión y aún no se van a cotizar piezas, el recepcionista debe scrollear pasando por tablas vacías de tareas solo para fijar la fecha prometida al cliente o indicar que viene por aseguradora.
- **Propuesta concreta:** Mover la fecha estimada de entrega y los datos de aseguradora al paso de recepción del vehículo, o colocarlos en la cabecera fija del formulario.
- **Esfuerzo:** Horas.
- **Prioridad:** Media.

#### Hallazgo 3: Un paso entero para el depósito, aunque el cliente no deje nada
- **Pantalla:** Alta de la orden (`src/features/workOrders/WorkOrderCreateModal.tsx`).
- **Qué se observa:** El paso 4 es exclusivamente «Depósito» (`intake.steps.deposit` en `WorkOrderCreateModal.tsx:735`), con el texto «Si el cliente deja depósito, di cómo lo pagó. Si no deja nada, sigue con 0.» (`intake.depositHint` en `WorkOrderCreateModal.tsx:410`). (verificar con captura)
- **Por qué le importa al taller:** Cuando el cliente no deja depósito, el paso solo sirve para seguir con 0: es un toque extra en cada alta. (Cuántas órdenes entran con depósito es un dato del taller, no del código.)
- **Propuesta concreta:** Integrar el campo de depósito como un bloque opcional y plegable dentro de la recepción, ahorrando una pantalla entera en el asistente.
- **Esfuerzo:** Horas.
- **Prioridad:** Media.

---

### Clientes

#### Hallazgo 4: Insignias de conteo con colores de estado de orden
- **Pantalla:** Clientes (`src/pages/Customers.tsx`).
- **Qué se observa:** En la tabla de clientes, la columna «Vehículos» (`customers.vehicles` en `Customers.tsx:395`) usa la clase CSS `badge-en_proceso` (`Customers.tsx:428`) y la columna «Órdenes de Trabajo» (`workOrders.title` en `Customers.tsx:396`) usa `badge-finalizado` (`Customers.tsx:431`). (verificar con captura)
- **Por qué le importa al taller:** Muestra un número simple (ej. 2 autos) pintado de color naranja de orden en proceso, y 1 orden pintada de verde de orden finalizada, confundiendo cantidades con el estado operativo de los trabajos.
- **Propuesta concreta:** Reemplazar las clases de estado por insignias de estilo neutral (gris o texto simple).
- **Esfuerzo:** Horas.
- **Prioridad:** Baja.

#### Hallazgo 5: Teléfono sin enlace de llamada ni WhatsApp en la ficha de cliente
- **Pantalla:** Clientes (`src/pages/Customers.tsx`).
- **Qué se observa:** En el «Perfil del Cliente» (`customers.customerProfile` en `Customers.tsx:245`), el teléfono se muestra como texto estático dentro de un `<span>` (`Customers.tsx:252`), sin botón para llamar (`tel:`) ni botón para abrir WhatsApp. Además, la fila de la tabla no es cliqueable; exige apuntar al botón diminuto «Ver» (`common.view` en `Customers.tsx:435`).
- **Por qué le importa al taller:** El personal llama y escribe a clientes constantemente desde el teléfono del taller. Tener que memorizar o copiar el número a mano ralentiza la atención.
- **Propuesta concreta:** Convertir el teléfono en enlace de llamada directa con botón de WhatsApp, hacer la fila de la tabla cliqueable y agregar un botón "+ Nueva orden" dentro del perfil.
- **Esfuerzo:** Horas.
- **Prioridad:** Alta.

#### Hallazgo 6: Botón de eliminar cliente expuesto en cada fila
- **Pantalla:** Clientes (`src/pages/Customers.tsx`).
- **Qué se observa:** En cada fila de la lista se incluye un botón rojo de papelera «Eliminar» (`common.delete` en `Customers.tsx:442`), accesible directamente junto a editar. (verificar con captura)
- **Por qué le importa al taller:** Eliminar un cliente es una acción casi nula en el día a día y destructiva si tiene historial. En pantallas táctiles queda expuesta a toques accidentales.
- **Propuesta concreta:** Quitar la papelera de la tabla y mover la opción de eliminar al final del formulario de edición.
- **Esfuerzo:** Horas.
- **Prioridad:** Media.

---

### Vehículos

#### Hallazgo 7: Historial del vehículo con tipo y estado sin traducir
- **Pantalla:** Vehículos (`src/pages/Vehicles.tsx`).
- **Qué se observa:** En «Historial de Servicios» (`vehicles.serviceHistory` en `Vehicles.tsx:217`), la columna «Tipo» muestra `{o.tipo_trabajo}` en crudo (`Vehicles.tsx:250`) y la columna «Estatus» muestra `{o.estatus}` en crudo (`Vehicles.tsx:251`), en vez de usar las etiquetas traducidas en español.
- **Por qué le importa al taller:** El personal lee textos de base de datos como `mecanica` o `en_proceso` sin formato ni tildes, dando una imagen descuidada.
- **Propuesta concreta:** Conectar las insignias a `typeLabels` y `statusLabels`, igual que en la lista de órdenes.
- **Esfuerzo:** Horas.
- **Prioridad:** Alta.

#### Hallazgo 8: Sin acceso directo para crear orden desde el vehículo y placa con estilo de estado
- **Pantalla:** Vehículos (`src/pages/Vehicles.tsx`).
- **Qué se observa:** La «Placa» (`vehicles.plate` en `Vehicles.tsx:299`) se dibuja con la clase `badge-en_proceso` (`Vehicles.tsx:313`). Además, en la ficha del vehículo no existe ninguna acción para abrir una orden de trabajo para ese auto.
- **Por qué le importa al taller:** Cuando un cliente llega con un vehículo ya registrado, el recepcionista no puede tocar "Crear orden para este auto"; tiene que salir, ir a Órdenes de Trabajo y volver a buscar el vehículo en la lista.
- **Propuesta concreta:** Dar a la placa un diseño visual neutro de matrícula automotriz y agregar un botón destacado "+ Nueva orden" en la ficha del vehículo.
- **Esfuerzo:** Horas.
- **Prioridad:** Media.

---

### Tablero Kanban

#### Hallazgo 9: Saturación de tarjetas y selector redundante en el teléfono
- **Pantalla:** Tablero Kanban (`src/pages/KanbanBoard.tsx`).
- **Qué se observa:** En móvil, como no hay arrastre de tarjetas, cada tarjeta incluye un `<select>` con etiqueta «Mover a» (`kanban.moveTo` en `KanbanBoard.tsx:388,393`) con todas las opciones. Además, la cabecera de la tarjeta puede juntar hasta seis insignias a la vez («Esperando autorización», «Esperando repuestos», «Listo para entregar» / «Por revisar», «Retirada sin reparar», «Seguro», tipo de trabajo; `KanbanBoard.tsx:334-357`). (verificar con captura)
- **Por qué le importa al taller:** Las tarjetas se vuelven excesivamente altas. El tablero móvil resulta agotador de navegar, requiriendo desplazamiento horizontal entre 5 columnas muy cargadas.
- **Propuesta concreta:** En móvil, sustituir el selector desplegable por flechas de avance rápido o un menú de opciones "⋯", y agrupar las alertas secundarias en un icono resumen.
- **Esfuerzo:** Días.
- **Prioridad:** Media.

#### Hallazgo 10: Emojis en los títulos de columna en vez de iconos del sistema
- **Pantalla:** Tablero Kanban (`src/pages/KanbanBoard.tsx`).
- **Qué se observa:** Las cabeceras de columna usan emojis quemados en el código (`KanbanBoard.tsx:24-28`): 📥 Recepción, ⚙️ En Proceso, ⏳ Espera Autorización, ✅ Finalizado, 🚗 Entregado. (verificar con captura)
- **Por qué le importa al taller:** En diferentes teléfonos (iPhone, Android) los emojis se ven con estilos e interpretaciones distintas, rompiendo la coherencia visual con los iconos de la app.
- **Propuesta concreta:** Cambiar los emojis por los iconos vectoriales de Lucide correspondientes a cada estado.
- **Esfuerzo:** Horas.
- **Prioridad:** Baja.

---

### Notificaciones

#### Hallazgo 11: Menú desplegable móvil saturado y botones de borrado expuestos
- **Pantalla:** Notificaciones (`src/features/notifications/NotificationBell.tsx`).
- **Qué se observa:** En la cabecera del menú flotante (`NotificationBell.tsx:96-112`) compiten en pocos milímetros «Notificaciones», «Marcar todo leído» (`notifications.markAllRead`), «Borrar todas» (`notifications.deleteAll`) y «Cerrar». Además, cada notificación tiene una cruz pequeña a la derecha para «Borrar aviso» (`notifications.delete` en `NotificationBell.tsx:143,146`), pegada al área donde se hace clic para abrirla. (verificar con captura)
- **Por qué le importa al taller:** Con dedos manchados o usando el teléfono con una mano en el taller, es muy común tocar la cruz de borrar por error en vez de abrir la orden asignada.
- **Propuesta concreta:** En móvil, desplegar las notificaciones en una vista limpia; retirar el botón de borrado inmediato de cada fila y permitir borrar con deslizamiento o desde un menú secundario.
- **Esfuerzo:** Días.
- **Prioridad:** Media.

---

### Finanzas

#### Hallazgo 12: Dos tablas completas apiladas y gráfica duplicada
- **Pantalla:** Finanzas (`src/pages/Finance.tsx`).
- **Qué se observa:** En la pestaña principal de registros, la página muestra los 3 balances (`Ingresos`, `Egresos`, `Balance`), luego la gráfica «Resumen Mensual» (`finance.monthlySummary` en `Finance.tsx:421`) idéntica a la del Dashboard, luego los filtros, y en medio inserta la tarjeta «Margen por orden» (`OrderMarginCard.tsx:182`) que contiene su propia tabla paginada, seguida inmediatamente por la tabla completa de «Transacciones» (`Finance.tsx:473`). (verificar con captura)
- **Por qué le importa al taller:** Tener dos tablas financieras distintas con controles independientes en la misma pantalla genera confusión sobre qué se está filtrando y alarga la página de manera innecesaria.
- **Propuesta concreta:** Dividir en dos pestañas claras: "Transacciones" (ingresos, gastos y comprobantes) y "Rentabilidad" (gráfica y margen por orden).
- **Esfuerzo:** Días.
- **Prioridad:** Alta.

#### Hallazgo 13: Exceso de opciones simultáneas al importar estado de cuenta
- **Pantalla:** Finanzas (`src/pages/finance/ImportStatementModal.tsx`).
- **Qué se observa:** En `ImportStatementModal.tsx:213-430`, se presentan a la vez mensajes de advertencia, alertas de duplicados («transacciones parecen ya estar registradas y quedaron desmarcadas»), selector masivo «Asignar a las no clasificadas» (`finance.applyToUncategorized`), casillas individuales con aviso «Posible duplicado» y selectores de categoría en cada renglón. (verificar con captura)
- **Por qué le importa al taller:** La importación bancaria ya es un proceso delicado para el dueño del taller; recibir tantas advertencias y opciones a la vez genera temor a duplicar gastos o estropear la contabilidad.
- **Propuesta concreta:** Dividir el modal en dos fases: 1) Resumen de lo detectado; 2) Revisión exclusiva de movimientos dudosos antes de confirmar.
- **Esfuerzo:** Días.
- **Prioridad:** Media.

---

### Comisiones

#### Hallazgo 14: Porcentaje general de comisión editable en la pantalla de pagos
- **Pantalla:** Comisiones y Pagos (`src/pages/Payroll.tsx`).
- **Qué se observa:** En la parte superior de la página, junto a los saldos pendientes, aparece un campo editable para el «Porcentaje de comisión» (`payroll.commissionRate` en `Payroll.tsx:268,280`) con botón «Guardar». El texto advierte: «Cambiarlo recalcula lo que aún está pendiente; lo ya pagado no se toca.» (`payroll.commissionRateHint` en `Payroll.tsx:293`).
- **Por qué le importa al taller:** Esta pantalla se usa semanalmente para pagar dinero a los empleados. Tener un campo que altera el porcentaje global del taller expone al negocio a recálculos accidentales al tipear rápido.
- **Propuesta concreta:** Retirar la edición de la tasa global de esta pantalla y mantenerla exclusivamente dentro de Configuración y en la ficha de cada Empleado.
- **Esfuerzo:** Horas.
- **Prioridad:** Alta.

#### Hallazgo 15: Anidamiento excesivo en la lista de saldos pendientes en móvil
- **Pantalla:** Comisiones y Pagos (`src/pages/Payroll.tsx`).
- **Qué se observa:** Para ver qué se le debe a un técnico, se abre un acordeón (`card`) que despliega una tabla de 7 columnas que en móvil se transforma en otra serie de tarjetas (`cards-on-mobile`, `Payroll.tsx:388`). Dentro de cada una se encuentra el componente de aprobación con botones «Aceptar» y «Cambiar porcentaje o monto» (`Payroll.tsx:418`). (verificar con captura)
- **Por qué le importa al taller:** En días de pago con 20 o 30 trabajos, revisar técnico por técnico en el teléfono se convierte en una lista interminable de tarjetas dentro de tarjetas plegables.
- **Propuesta concreta:** Presentar una lista plana de tareas pendientes por empleado en una sola línea clara (Orden, Trabajo, Monto) con aprobación masiva o individual en un solo toque.
- **Esfuerzo:** Días.
- **Prioridad:** Media.

---

### Mis comisiones del técnico

#### Hallazgo 16: El técnico ve $0 mientras la oficina no acepte sus comisiones
- **Pantalla:** Mis comisiones (`src/pages/MyCommissions.tsx`).
- **Qué se observa:** La pantalla solo muestra «Aceptadas, por cobrar» (`myCommissions.pendingTitle` en `MyCommissions.tsx:107`), indicando: «Una comisión aparece aquí cuando administración la acepta; se paga en el siguiente pago.» (`myCommissions.pendingHint` en `MyCommissions.tsx:108`). Las tareas en órdenes en proceso o entregadas que la oficina aún no revisa no se muestran aquí.
- **Por qué le importa al taller:** Un mecánico que trabajó intensamente toda la semana entra a revisar sus ganancias y ve $0.00 en «Por cobrar» (`myCommissions.toCollect`). Esto genera desconfianza y consultas constantes a la oficina sobre si se le van a pagar sus horas.
- **Propuesta concreta:** El monto no se le puede mostrar antes: que el técnico no vea la comisión sugerida es una regla de negocio que impone la base (`20261010000014`), y este análisis no cambia reglas. Sí se puede, sin tocarla: (1) cuando «Por cobrar» está en $0, un aviso más visible que explique que sus comisiones aparecen al aceptarlas la oficina; (2) que la oficina acepte las comisiones al entregar cada orden (es proceso del taller, no código). Mostrarle el monto estimado sería una decisión del taller y un cambio de permisos.
- **Esfuerzo:** Horas (el aviso).
- **Prioridad:** Media.

---

### Empleados

#### Hallazgo 17: Dos tablas distintas para el mismo personal en una sola página
- **Pantalla:** Empleados (`src/pages/Employees.tsx`).
- **Qué se observa:** La parte superior muestra la sección «Pago de cada empleado» (`employees.payTitle` en `Employees.tsx:94,140`), con una tabla de personal y el botón «Ver» (`employees.open` en `Employees.tsx:124,167`) para editar esquemas de pago. Debajo de toda esa sección, la página renderiza `UsersCard` (`settings.users` en `Employees.tsx:180` / `UsersCard.tsx:208`) que vuelve a listar a los mismos empleados con buscador, rol, sede y botones «Editar usuario» y «Quitar empleado». (verificar con captura)
- **Por qué le importa al taller:** El administrador ve al mismo mecánico dos veces en la misma pantalla: arriba le edita el salario o porcentaje y abajo le edita el teléfono o la contraseña. La gestión del personal se siente fragmentada y desordenada.
- **Propuesta concreta:** Unificar todo en un único directorio de empleados. Al hacer clic en un empleado, abrir su ficha con dos pestañas: "Datos de usuario" y "Esquema de pago e historial".
- **Esfuerzo:** Días.
- **Prioridad:** Alta.

---

### Configuración

#### Hallazgo 18: Tarjeta de parqueo masiva que acapara la página
- **Pantalla:** Configuración (`src/pages/Settings.tsx` y `ParkingSettingsCard.tsx`).
- **Qué se observa:** `ParkingSettingsCard` (`parking.title` en `Settings.tsx:508`, `ParkingSettingsCard.tsx:418`) ocupa el ancho completo con 634 líneas de código de interfaz: perfiles de seguro y particular, tramos de tarifas, políticas en dos idiomas y simulador en vivo. Va antes de la tarjeta para reportar un problema y de la gestión de sedes del taller (`Settings.tsx:508-519`). (verificar con captura)
- **Por qué le importa al taller:** El parqueo se configura una sola vez, pero ocupa más de la mitad del espacio de la pantalla, obligando a scrollear largamente para alcanzar los datos de las sedes o teléfonos.
- **Propuesta concreta:** Mover la configuración de parqueo a un apartado propio de "Tarifas y Políticas" o mantenerla como sección plegada por defecto.
- **Esfuerzo:** Horas.
- **Prioridad:** Alta.

#### Hallazgo 19: Teléfonos de contacto configurados sin vista previa
- **Pantalla:** Configuración (`src/features/settings/SedePhonesEditor.tsx`).
- **Qué se observa:** En la edición de sedes se configuran los «Teléfonos de contacto» (`settings.phones` en `SedePhonesEditor.tsx:37`) con opciones de Celular/Oficina, notas como "English/Spanish" y la casilla «Atiende WhatsApp» (`settings.phoneWhatsapp`). No hay ninguna previsualización de cómo se muestran al cliente.
- **Por qué le importa al taller:** Es vital que los clientes sepan a qué número llamar según el idioma. Al configurarse como un formulario técnico sin muestra visual, se cometen errores de formato o etiquetas.
- **Propuesta concreta:** Añadir una pequeña muestra visual en vivo que enseñe cómo verá el cliente los botones de llamada y WhatsApp en su teléfono.
- **Esfuerzo:** Horas.
- **Prioridad:** Baja.

---

### Inicio de sesión

#### Hallazgo 20: Ejemplo de correo exclusivo para administradores
- **Pantalla:** Inicio de sesión (`src/pages/Login.tsx`).
- **Qué se observa:** El campo «Correo Electrónico» (`auth.email` en `Login.tsx:95`) tiene como texto de ejemplo fijo `placeholder="admin@restorify.com"` (`Login.tsx:101`).
- **Por qué le importa al taller:** Los mecánicos y pintores entran a la misma pantalla. Ver `admin@` les hace dudar de si están en el acceso correcto o si su cuenta de técnico sirve ahí.
- **Propuesta concreta:** Cambiar el placeholder por un texto neutro como `tu@correo.com` o `usuario@taller.com`.
- **Esfuerzo:** Horas.
- **Prioridad:** Alta.

#### Hallazgo 21: Selector de idioma oculto al final de la pantalla
- **Pantalla:** Inicio de sesión (`src/pages/Login.tsx`).
- **Qué se observa:** Los botones para cambiar de idioma entre español e inglés (`Login.tsx:146-150`) están colocados en el pie de página, debajo del botón de entrar y del enlace de recuperar contraseña. (verificar con captura)
- **Por qué le importa al taller:** En Maryland hay empleados que solo hablan inglés. Al entrar se encuentran con la pantalla en español y no descubren la opción de cambio de idioma hasta hacer scroll al fondo.
- **Propuesta concreta:** Colocar el selector de idioma en la esquina superior derecha de la pantalla de bienvenida.
- **Esfuerzo:** Horas.
- **Prioridad:** Media.

---

### Diálogos y modales de la orden

#### Hallazgo 22: Entrega trabada si faltan técnicos sin poder asignarlos ahí
- **Pantalla:** Diálogo de entrega (`src/features/workOrders/DeliveryModal.tsx`).
- **Qué se observa:** Si hay tareas autorizadas sin técnico, la entrega muestra la advertencia: «Hay {n} tarea(s) autorizada(s) sin técnico: nadie cobrará su comisión. Puedes entregar igual, o cancelar y asignarlas antes.» (`delivery.unassignedWarning` en `DeliveryModal.tsx:139`). Sin embargo, no permite asignar al mecánico en ese momento; obliga a cancelar, cerrar el cobro, ir a la orden, asignar la tarea y volver a abrir la entrega.
- **Por qué le importa al taller:** La entrega ocurre con el cliente esperando en el mostrador para pagar e irse. Tener que abortar el cobro para buscar una tarea suelta genera demoras y mala imagen.
- **Propuesta concreta:** Incluir un selector rápido de técnico junto a cada tarea sin asignar dentro del mismo modal de entrega.
- **Esfuerzo:** Días.
- **Prioridad:** Alta.

#### Hallazgo 23: Acción "Descartar" confunde al guardar observaciones preventivas
- **Pantalla:** Trabajo adicional (`src/features/workOrders/FindingsCard.tsx`).
- **Qué se observa:** La acción para convertir un reporte del taller en una observación para el cliente sin cotizar se llama «Descartar trabajo adicional» (`findings.discardTitle` en `FindingsCard.tsx:111,114`), el botón dice «Descartar…» (`findings.discard` en `FindingsCard.tsx:63`) y el botón final dice «Descartar» (`findings.discardConfirm` en `FindingsCard.tsx:161`). Por dentro ofrece: «Mostrarlo en el reporte del cliente» / «Sale como "Observación del taller". El cliente no tiene que autorizar nada.» (`findings.inReportHint` en `FindingsCard.tsx:130`).
- **Por qué le importa al taller:** La palabra "descartar" suena a desechar una equivocación. La oficina no se da cuenta de que sirve para registrar notas de desgaste futuro para el cliente.
- **Propuesta concreta:** Cambiar el nombre a "Pasar a observación" o "Anotar sin costo", reservando la palabra "Descartar" solo para descartes reales.
- **Esfuerzo:** Horas.
- **Prioridad:** Media.

#### Hallazgo 24: Duplicidad entre Autorización en Resumen y Presupuesto en Trabajos
- **Pantalla:** Detalle de la orden (`AuthorizationPanel.tsx` y `QuoteCard.tsx`).
- **Qué se observa:** En la pestaña Resumen está `AuthorizationPanel.tsx:605` («Autorización del cliente»), con botones «Enviar presupuesto» y «Registrar autorización…». En la pestaña Trabajos está `QuoteCard.tsx:984` («Presupuesto»), con los mismos botones «Enviar presupuesto al cliente» y «Registrar autorización». Ambos abren exactamente el mismo modal `AuthorizationModal` (`quotes.modalTitle`: «Trabajos autorizados por el cliente»).
- **Por qué le importa al taller:** El usuario tiene dos bloques en pestañas distintas que gestionan lo mismo con ligeras variaciones de texto, creando confusión sobre dónde se controla el presupuesto.
- **Propuesta concreta:** Mantener la gestión detallada del presupuesto en la pestaña Trabajos y dejar en Resumen solo una tarjeta de paso pendiente cuando falte acción.
- **Esfuerzo:** Días.
- **Prioridad:** Alta.

#### Hallazgo 25: Modal separado para editar únicamente dos campos de seguro
- **Pantalla:** Seguro de la orden (`src/features/workOrders/OrderInsuranceModal.tsx`).
- **Qué se observa:** Para activar seguro y poner aseguradora y reclamo, se levanta un modal completo (`OrderInsuranceModal.tsx:54`: «Editar seguro») que solo contiene «Trabajo con seguro» (`workOrders.withInsurance`), «Aseguradora» (`workOrders.insurer`) y «Número de reclamo» (`workOrders.claimNumber`). (verificar con captura)
- **Por qué le importa al taller:** En trabajos de colisión el seguro es habitual. Abrir una ventana flotante para llenar dos campos de texto interrumpe la lectura de la orden.
- **Propuesta concreta:** Permitir la edición directa en la misma tarjeta o en los datos generales sin necesidad de abrir un diálogo emergente.
- **Esfuerzo:** Horas.
- **Prioridad:** Baja.

#### Hallazgo 26: Formulario de descuento inline frente a modales en el resto del cobro
- **Pantalla:** Detalle de orden (`src/features/workOrders/OrderTotalsCard.tsx`).
- **Qué se observa:** Mientras que registrar un anticipo o entregar son modales limpios, tocar «Aplicar descuento» (`discount.add` en `OrderTotalsCard.tsx:135`) expande un formulario dentro de la misma tarjeta de totales (`OrderTotalsCard.tsx:142`) con conmutador monto/porcentaje, campo de motivo y botón de aplicar, desplazando los totales hacia abajo.
- **Por qué le importa al taller:** En el teléfono la tarjeta se estira repentinamente y oculta el botón final de cobro, generando una experiencia inconsistente con los demás movimientos de dinero.
- **Propuesta concreta:** Estandarizar la interacción del descuento como una acción limpia con confirmación directa del nuevo saldo resultante.
- **Esfuerzo:** Horas.
- **Prioridad:** Baja.

---

## 3. Las 10 mejoras con mejor relación beneficio/esfuerzo

Ordenadas de mayor a menor impacto frente al tiempo requerido de desarrollo:

| Nº | Mejora | Pantalla | Beneficio para el taller | Esfuerzo |
|---|---|---|---|---|
| 1 | **Placeholder neutro y selector de idioma arriba en el login** | Inicio de sesión | Evita confusiones a los mecánicos y permite a los empleados en inglés cambiar de idioma de inmediato. | Horas |
| 2 | **Retirar la edición del porcentaje global de comisión de la lista de pagos** | Comisiones | Elimina el riesgo crítico de alterar por error el porcentaje de todo el taller al liquidar salarios. | Horas |
| 3 | **Traducir tipo de trabajo y estatus en el historial del vehículo y cabecera de orden** | Vehículos y Orden | Quita textos en crudo (`mecanica`, `en_proceso`), unificando la presentación en español formal. | Horas |
| 4 | **Teléfono con llamada directa y WhatsApp en la ficha del cliente** | Clientes | Agiliza la comunicación diaria con los clientes desde el móvil sin copiar números a mano. | Horas |
| 5 | **Renombrar "Descartar" a "Guardar como observación" en trabajos adicionales** | Orden (Hallazgos) | La oficina deja de temer "descartar" hallazgos y empieza a registrar notas preventivas para el cliente. | Horas |
| 6 | **Reorganizar campos de seguro y fecha prometida en el alta de orden** | Alta de orden | Evita tener que recorrer formularios vacíos de tareas para anotar la fecha de entrega y aseguradora. | Horas |
| 7 | **Asignación directa de técnicos en el diálogo de entrega** | Orden (Entrega) | Permite asignar tareas pendientes en el acto sin abortar el cobro frente al cliente en el mostrador. | Días |
| 8 | **Unificar la pantalla de Empleados en un solo directorio** | Empleados | Elimina la doble lista redundante y concentra los datos personales y el pago en una sola ficha. | Días |
| 9 | **Quitar la papelera de cada fila de Clientes y de Órdenes** (borrar va dentro de la ficha) | Clientes y Órdenes | Evita borrados por un toque accidental en el teléfono; borrar es raro y destructivo. | Horas |
| 10 | **Dividir Finanzas en dos vistas ("Movimientos" y "Rentabilidad")** | Finanzas | Quita la doble tabla apilada en el teléfono y separa el control diario de gastos del análisis de margen. | Días |
