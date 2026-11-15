### [ALTO] "Enviar presupuesto" falla con error si el cliente no tiene correo y manda a buscar el enlace en otra pestaña
- Dónde: src/features/workOrders/AuthorizationPanel.tsx:65-71, src/features/workOrders/QuoteCard.tsx:89-95 y src/features/workOrders/WorkOrderDetail.tsx:108-111
- Evidencia:
```tsx
const send = async () => {
  if (!confirm(t('quotes.sendConfirm'))) return;
  setSending(true);
  try {
    const result = await quotesService.sendQuote(order.id, true);
    showToast(result.correo === 'sin_correo' ? 'error' : 'success', t(result.correo === 'sin_correo' ? 'quotes.sentNoEmail' : 'quotes.sent'));
```
- Escenario: La administradora da de alta un carro solo con nombre y teléfono (`AGENTS.md`: ningún paso debe depender del correo), carga un trabajo y pulsa `Enviar presupuesto` en la pestaña `resumen`. Primero sale un `confirm()` hablando de enviar un correo; al confirmar, aparece un toast rojo de error (`quotes.sentNoEmail`) indicando *"Compártele el enlace por WhatsApp (tarjeta Enlace del cliente)"*, obligando a cambiar de pestaña a `cobro` (`enlace`, línea 111) y abrir esa sección plegada.
- Arreglo propuesto: Eliminar el `confirm()` centrado en correo y automatizar que, cuando `result.correo === 'sin_correo'`, `AuthorizationPanel` y `QuoteCard` muestren un toast informativo y las acciones directas de WhatsApp/SMS y copiar enlace ahí mismo, evitando saltar a la sección `enlace` de otra pestaña.
- Confianza: alta

### [ALTO] Registrar un gasto en Finanzas deja la categoría trabada en "Pago de cliente" y permite grabar egresos con categoría falsa
- Dónde: src/pages/Finance.tsx:129-136 y src/pages/Finance.tsx:602-625
- Evidencia:
```tsx
  const [form, setForm] = useState({
    tipo: 'ingreso' as TransactionType,
    categoria: 'pago_cliente' as TransactionCategory,
...
<select className="form-input form-select" id="txn-type" value={form.tipo}
  onChange={(e) => setForm({ ...form, tipo: e.target.value as TransactionType })}>
  <option value="ingreso">{t('finance.income')}</option>
  <option value="egreso">{t('finance.expense')}</option>
</select>
```
- Escenario: El dueño abre `Nuevo movimiento` desde el teléfono para anotar una compra de aceite o repuesto, cambia `#txn-type` a `Egreso`, teclea monto y descripción y guarda sin notar que `#txn-category` sigue en `pago_cliente` ("Pago de cliente"). El egreso queda guardado en la base bajo una categoría de ingreso de cliente.
- Arreglo propuesto: Automatizar en el `onChange` de `#txn-type` el cambio de `categoria` a `'gasto_operativo'` cuando pasa a `'egreso'` (y a `'pago_cliente'` al volver a `'ingreso'`), y filtrar las opciones de `#txn-category` según `form.tipo` en lugar de listar todas mezcladas.
- Confianza: alta

### [ALTO] Dos botones principales (`primary`) simultáneos en `QuickActions` y botón "Marcar listo para entregar" duplicado en el encabezado
- Dónde: src/features/workOrders/WorkOrderDetail.tsx:962-975 y src/features/workOrders/WorkOrderDetail.tsx:1140-1150
- Evidencia:
```tsx
...(isFinalizadoPendingReview
  ? [{ key: 'markReady', icon: CheckCircle2, label: 'workOrders.markReady', onClick: () => void detail.markReadyForPickup(), primary: true }]
  : []),
...(detail.isReadyForPickup && detail.canDeliver
  ? [{ key: 'deliver', icon: PackageCheck, label: 'quickActions.deliver', onClick: detail.startDelivery, primary: true }]
  : []),
{ key: 'work', icon: Plus, label: 'quickActions.addWork', onClick: () => goTo('trabajos', 'mano_obra'), primary: !hasLabor && !isFinalizadoPendingReview },
```
- Escenario: Si la orden está lista para entregar (`isReadyForPickup && canDeliver`) pero no tiene líneas de mano de obra (`!hasLabor`, por ejemplo solo venta de repuesto o retirada sin reparar), `QuickActions` pinta dos botones `primary`: `Entregar` y `Agregar trabajo`, rompiendo la regla de un solo botón principal por estado. Además, en `finalizado` pendiente de revisión (`isFinalizadoPendingReview`), el botón `Marcar listo para entregar` aparece repetido arriba: en `#order-mark-ready` (línea 1143) y en `QuickActions` (línea 967).
- Arreglo propuesto: Quitar `#order-mark-ready` del encabezado para dejar la acción únicamente en `QuickActions`, y excluir `!(detail.isReadyForPickup && detail.canDeliver)` en la condición `primary` de `work`.
- Confianza: alta

### [ALTO] Guardar un cliente o taller con un campo obligatorio vacío ejecuta `return` en silencio (botón "muerto")
- Dónde: src/pages/Customers.tsx:129-130 y src/pages/Settings.tsx:204-206 (mismo patrón en `LaborTable.tsx:179-180` y `PartsTable.tsx:95-96`)
- Evidencia:
```tsx
  const handleSave = async () => {
    if (!form.nombre.trim() || !form.telefono.trim()) return;
```
```tsx
  const handleSaveBranding = async (sedeId: string) => {
    const draft = brandDrafts[sedeId];
    if (!draft || !draft.nombre.trim()) return;
```
- Escenario: La administradora abre `Nuevo Cliente` (Customers.tsx:560), escribe el nombre, olvida el teléfono y pulsa `Crear` (habilitado porque solo depende de `saving`). El modal no cierra ni muestra error en `AlertError` ni marca el campo; parece que la app dejó de responder. Lo mismo ocurre al guardar un taller sin nombre en Configuración.
- Arreglo propuesto: Eliminar el `return` silencioso y automatizar la asignación de `formError` (o toast de validación en `Settings.tsx`) indicando exactamente qué campo obligatorio falta antes de abortar el guardado.
- Confianza: alta

### [ALTO] Alta de empleado partida en dos flujos desconectados y esquema de pago oculto en sección plegada en móvil
- Dónde: src/pages/Employees.tsx:91-98,180 y src/features/settings/UsersCard.tsx:373-401
- Evidencia:
```tsx
      {isMobile ? (
        <div className="employee-mobile">
          <CollapsibleSection
            title={t('employees.payTitle')}
            icon={<UserCog size={18} />}
            summary={String(staff.length)}
            defaultOpen={false}
          >
```
- Escenario: Para dar de alta a un mecánico nuevo desde el teléfono, la administradora crea primero su usuario en `UsersCard` (Employees.tsx:180), cuyo modal (UsersCard.tsx:330-430) solo pide nombre, correo, teléfono, rol, taller y contraseña temporal, sin ningún campo de comisión o salario. Luego debe recordar subir en la pantalla, abrir la sección plegada `Pago de cada empleado` (`defaultOpen={false}`), desplegar al empleado y tocar `Ver` para recién configurar su pago en otro modal.
- Arreglo propuesto: Fusionar el alta integrando un selector inicial de esquema de pago (comisión % o salario fijo) o enlazar automáticamente tras crear el usuario con la apertura de `EmployeeDetailModal` para ese empleado, eliminando la necesidad de buscarlo manualmente arriba.
- Confianza: alta

### [MEDIO] Controles con `.btn-sm` y el botón para borrar notificaciones miden menos de `44 px` en teléfono de `390 px`
- Dónde: src/styles/components.css:2328-2336 y src/styles/components.css:3997-4007 (usado en WorkOrderDetail.tsx:1206, Employees.tsx:123, SignatureCard.tsx:110,116, Settings.tsx:667, AuthorizationPanel.tsx:96)
- Evidencia:
```css
@media (max-width: 768px) {
  .btn { min-height: 44px; }
  .btn-icon { min-width: 44px; min-height: 44px; }
  .btn-sm { min-height: 38px; }
```
```css
.notif-item-delete {
  /* 32 px: lo mínimo para acertarle con el dedo en un teléfono. */
  width: 32px;
  height: 32px;
```
- Escenario: En un teléfono de `390 px`, la regla de `@media (max-width: 768px)` reduce `.btn-sm` a `38 px` (y `.notif-item-delete` a `32 px`), por debajo del mínimo de `44 px` fijado en `AGENTS.md`. Afecta acciones táctiles frecuentes como limpiar/guardar firma, `Ver` empleado, `Enviar presupuesto` o borrar una notificación sin abrirla por error.
- Arreglo propuesto: Quitar la excepción `.btn-sm { min-height: 38px; }` y ampliar `.notif-item-delete` a `44px × 44px` dentro de `@media (max-width: 768px)` para que hereden automáticamente el tamaño táctil de `44 px` en móvil.
- Confianza: alta

### [MEDIO] La grilla de sedes en Configuración (`minmax(320px, 1fr)`) fuerza desbordamiento en teléfono de `390 px`
- Dónde: src/pages/Settings.tsx:555-556
- Evidencia:
```tsx
          {loading ? (
            <div className="loading-state"><div className="spinner" /></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
              {sedes.map((sede) => {
```
- Escenario: El dueño abre `Configuración` en un teléfono de `390 px`. La tarjeta `.card` de Sedes contiene márgenes internos tanto de página como de tarjeta y de cada tarjeta de taller, por lo que `320px` fijos como mínimo de columna en el grid superan el ancho útil disponible y provocan desbordamiento horizontal o recorte del borde derecho.
- Arreglo propuesto: Automatizar el ajuste al ancho móvil cambiando `minmax(320px, 1fr)` por `minmax(min(320px, 100%), 1fr)`, sin alterar la vista de escritorio.
- Confianza: alta

### [MEDIO] Errores duplicados al crear vehículo en el alta y toast falso ("No se pudo crear la orden") al guardar cliente/vehículo
- Dónde: src/features/workOrders/WorkOrderCreateModal.tsx:331-340 y src/pages/WorkOrders.tsx:317-327
- Evidencia:
```tsx
            <VehicleFields value={newVehicle} onChange={form.setNewVehicle}
              touched={formState.isSubmitted || !!errors.newVehicle}
              requirePlate={false} disabled={saving} />
            <FieldError messageKey={errors.newVehicle?.vin?.message} />
            <FieldError messageKey={errors.newVehicle?.marca?.message} />
            <FieldError messageKey={errors.newVehicle?.modelo?.message} />
```
```tsx
    } catch (err) {
      showToast('error', t('workOrders.orderCreatedError'), getErrorMessage(err, language));
      return false;
    }
```
- Escenario: Si la administradora intenta avanzar el alta con marca o modelo vacíos, `VehicleFields` ya pinta `vehicles.brandRequired` / `vehicles.modelRequired` bajo cada campo (VehicleFields.tsx:283-300) y `WorkOrderCreateModal` vuelve a apilar otros tres `<FieldError>` repetidos debajo del panel. Además, si falla el guardado independiente de cliente o vehículo antes de crear la orden (`saveStandaloneRecord`), muestra como título `No se pudo crear la orden` aunque ni siquiera se intentó crear la orden todavía.
- Arreglo propuesto: Quitar los `<FieldError>` redundantes de `marca` y `modelo` en `WorkOrderCreateModal` (dejando los mensajes junto a cada campo en `VehicleFields`) y corregir el título del toast en `saveStandaloneRecord` según `key === 'customer'` o `'vehicle'`.
- Confianza: alta

### [MEDIO] Doble criterio al descartar cambios sin guardar (`confirm()` nativo vs. `ChoiceDialog`) y doble confirmación al retirar un carro
- Dónde: src/pages/WorkOrders.tsx:458-460, src/features/workOrders/ProgressLog.tsx:88-103 y src/features/workOrders/WithdrawalModal.tsx:116
- Evidencia:
```tsx
  useEffect(() => {
    if (showCreateModal) {
      setGuard(() => !form.isDirty || confirm(t('workOrders.confirmDiscard')), () => form.isDirty);
    } else {
```
```tsx
    if (!confirm(t('withdrawal.confirm'))) return;
```
- Escenario: Si la administradora pulsa la `X` o "Atrás" en Android dentro de `Nueva orden` o `ProgressLog`, se abre `ChoiceDialog` con opciones claras (en el alta incluso ofrece guardar borrador); pero si toca el menú lateral o la barra inferior, dispara un `window.confirm()` que descarta sin guardar borrador. En `WithdrawalModal`, tras llenar un formulario completo que ya exige botón rojo de cierre irreversible, al enviarlo vuelve a pedir un `confirm()` del navegador.
- Arreglo propuesto: Quitar `confirm()` de `WithdrawalModal` (la acción ya está contenida en su modal explícito) y unificar el guard de `setGuard`/`registerGuard` en `WorkOrders` y `ProgressLog` para reutilizar el mismo `ChoiceDialog` ya existente en vez del `confirm()` nativo.
- Confianza: alta

### [MEDIO] Diálogos modales operativos sin `role="dialog"`, `aria-modal="true"` ni `aria-label` en el botón de cerrar
- Dónde: src/pages/Payroll.tsx:555-560, src/features/settings/UsersCard.tsx:331-337, src/pages/Settings.tsx:807-814, src/pages/Finance.tsx:591-595 y src/pages/Customers.tsx:492-500
- Evidencia:
```tsx
      {payTarget && (
        <div className="modal-overlay" onClick={() => setPayTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('payroll.payBalance')}</h3>
              <button className="modal-close" onClick={() => setPayTarget(null)}><X size={20} /></button>
            </div>
```
- Escenario: Al abrir el modal de pagar comisiones, crear usuario, eliminar taller, nuevo movimiento o nuevo cliente, no hay atributos `role="dialog"` / `aria-modal="true"` ni `aria-labelledby`, el foco del teclado no se mueve ni se restaura al cerrar, y el botón con solo icono `<X />` carece de `type="button"` y `aria-label={t('common.close')}`, anunciándose solo como "botón" para tecnologías de asistencia.
- Arreglo propuesto: Añadir `role="dialog"`, `aria-modal="true"` y `aria-label={t('common.close')}` (con `type="button"`) en las cabeceras de estos cinco modales, automatizando el manejo inicial del foco como ya hace `ChoiceDialog`.
- Confianza: alta

### [BAJO] Jerga técnica del sistema expuesta en pantallas diarias de mostrador y patio
- Dónde: src/i18n/translations.ts:130,583-584,1544,2027
- Evidencia:
```ts
130:  crmNotes: 'Notas CRM',
583:  inheritedSplit: 'Reparto por especialidad',
584:  inheritedHint: 'Trabajo de antes de la comisión por tarea: se reparte entre el equipo de su especialidad hasta que le asignes un técnico.',
1544: averageTicket: 'Ticket promedio (ARO)',
2027: crmNotes: 'CRM Notes',
```
- Escenario: La administradora nueva lee `"Notas CRM"` al registrar clientes, el dueño ve las siglas en inglés `"ARO"` en métricas en español y el mecánico lee `"Trabajo de antes de la comisión por tarea..."`, un texto pensado para explicar una migración histórica del código a alguien que recién entra al taller.
- Arreglo propuesto: Sustituir las etiquetas por lenguaje directo de taller (`"Notas del cliente"`, `"Promedio por carro"`, `"Sin técnico asignado"` en la leyenda visible), sin tocar estructura ni agregar ayudas nuevas.
- Confianza: alta

### [BAJO] Textos en inglés con mezcla UK/US, "Quote" vs. "Estimate", "Check" vs. "Cheque" y traducciones literales del español
- Dónde: src/i18n/translations.ts:2089,2444-2446,2718,2759,2965-2972,3101,3136-3142,3334,3348
- Evidencia:
```ts
2089: colorNotInVin: 'Colour is not part of the VIN; enter it by hand.',
2446: restoreBody: 'A draft was saved on {fecha}. Do you continue it or start a new order?',
2759: cheque: 'Check',          // pero 3136-3142: methodCheque: 'Cheque' / 'Cheque number'
2967: sentNoEmail: 'Quote ready...', // pero authorization.send: 'Send estimate'
3334: themeColor: 'Theme colour',
3348: phoneInvalid: 'A phone has too few digits to be dialled.',
```
- Escenario: Para un taller en Maryland (EE. UU.) usado en inglés, el sistema mezcla inglés británico (`Colour`, `dialled`, `Cheque` en Comisiones, `cancelled` vs. `canceled`), llama `"Quote"` al presupuesto en una pantalla y `"Estimate"` en el botón de arriba, y usa calcos literales del español como `"Do you continue it or start a new order?"` o `"you pick it up when you open «New order»"`.
- Arreglo propuesto: Unificar la rama `en` en inglés estadounidense natural de taller (`Color`, `Check`, `canceled`, `dialed`, `Estimate` consistente, y frases idiomáticas como `"Would you like to continue or start a new order?"`), reemplazando únicamente las cadenas existentes.
- Confianza: alta

## Lo que revisé y está bien
- **Botones del mecánico en la orden**: En TechnicianTaskList.tsx:311-348, los cuatro botones principales del técnico (`Iniciar reloj`, `Realizado`, `Agregar avance`, `Foto rápida`) garantizan `minHeight: 44`, captura directa con cámara (`capture="environment"`) y ocultan desmarcar si la orden ya finalizó.
- **Navegación móvil (`BottomNav`, `Sidebar`, `Header`)**: El menú inferior móvil ofrece 4 accesos directos con altura táctil adecuada y en `Settings` solo aparece cuando corresponde.
- **Recepción de vehículo (`VehicleFields`) y alta sin correo obligatorio**: El VIN decodifica marca/modelo/año con validación clara de longitud/caracteres sin bloquear si el carro no lo trae, y el correo del cliente es opcional tanto en clientes como en el wizard de alta.
- **Diálogo de salida (`ChoiceDialog`)**: Tiene `role="dialog"`, `aria-modal="true"` y foco inicial al abrirse, y el flujo de borrador en `WorkOrders` evita perder datos al cerrar con `X` o botón Atrás.
- **Avisos en órdenes listas/entregadas y cálculo en servidor**: El banner de espera de autorización y los avisos de solo lectura están bien jerarquizados arriba del detalle, y en Comisiones (`Payroll`) queda claro que el total a pagar lo calcula el servidor y qué queda pendiente de revisión.
