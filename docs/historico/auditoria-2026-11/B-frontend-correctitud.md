### [ALTO] Arranque de sesión con fallo en `sedes` autentica con `currentSede = null` y `allSedes = []`
- Dónde: src/context/AuthContext.tsx:57-62
- Evidencia:
```ts
const { data: sedes, error: sedesError } = await supabase.from('sedes').select('*').order('nombre');
// Igual que arriba: sin respuesta se conservan las sedes que ya había.
if (sedesError) {
  setUser(perfil as UserProfile);
  return;
}
```
- Escenario: Un administrador abre la app en frío (con `allSedes` en `[]` y `currentSede` en `null`) y un fallo pasajero deja pasar `perfiles` pero hace fallar la consulta de `sedes`. `loadProfileAndSedes` autentica al usuario y sale sin poblar sedes; con `currentSede = null` y `sedeId = undefined`, el encabezado queda sin selector de sede, las lecturas mezclan todas las sedes y formularios como Finanzas (src/pages/Finance.tsx:237) envían `sede_id: ''` y fallan al insertar.
- Arreglo propuesto: Si `sedesError` ocurre cuando aún no hay sedes cargadas en memoria, reintentar o bloquear el arranque con una pantalla de reintento en lugar de entrar con `currentSede` vacío.
- Confianza: alta

### [ALTO] Fuga de cámara y micrófono si se cierra el diálogo o se cambia de cámara con `getUserMedia` pendiente
- Dónde: src/features/media/useMediaRecorder.ts:55-83
- Evidencia:
```ts
useEffect(() => release, [release]);
...
const media = await navigator.mediaDevices.getUserMedia(constraints);
streamRef.current = media;
setStream(media);
setState('ready');
```
- Escenario: Un técnico abre la grabadora de video o audio y cierra el modal (o cambia entre cámara frontal y trasera) antes de que `getUserMedia` termine de responder. La limpieza del `useEffect` (`release`) ya corrió cuando `streamRef.current` era `null`; al resolver la promesa tarde, las pistas quedan abiertas y activas indefinidamente consumiendo cámara, micrófono y batería.
- Arreglo propuesto: Llevar un ref de montaje y un contador de petición en `useMediaRecorder`: al resolver `getUserMedia`, si el hook ya se desmontó o arrancó una llamada más nueva, detener todas las pistas de `media` de inmediato y retornar sin tocar estado.
- Confianza: alta

### [ALTO] `approveCommission`, `updateLabor` y `updatePart` tragan errores y cierran la edición perdiendo cambios
- Dónde: src/features/workOrders/useWorkOrderDetail.ts:622-636, src/features/workOrders/useWorkOrderDetail.ts:722-733, src/features/workOrders/useWorkOrderDetail.ts:1052-1064, src/features/workOrders/CommissionApproval.tsx:29-37, src/features/workOrders/LaborTable.tsx:179-193 y src/features/workOrders/PartsTable.tsx:95-99
- Evidencia:
```ts
const run = async (montoNuevo?: number, porcentajeNuevo?: number) => {
  setBusy(true);
  try {
    await onApprove(comisionId, montoNuevo, porcentajeNuevo);
    setEditing(false);
  } finally {
    setBusy(false);
  }
};
```
- Escenario: Un administrador edita una comisión (p. ej. escribe un porcentaje `> 100`, o la comisión ya se pagó en Nómina), una línea de mano de obra o un repuesto que pertenece a un presupuesto abierto y guarda. Las funciones en `useWorkOrderDetail` capturan la excepción sin relanzarla ni devolver `false`, de modo que `CommissionApproval`, `LaborTable` y `PartsTable` ejecutan `setEditing(false)` / `setEditingId(null)`, cierran el editor descartando lo escrito y en comisiones/repuestos solo dejan el banner de error arriba del modal fuera de vista.
- Arreglo propuesto: Hacer que `approveCommission`, `updateLabor` y `updatePart` devuelvan `boolean` (o relancen el error) y cerrar la fila en edición únicamente cuando la operación concluya con éxito.
- Confianza: alta

### [ALTO] Borrar la fecha en Finanzas o Nómina envía `""` a Postgres y rompe el registro
- Dónde: src/pages/Finance.tsx:221-246 y src/pages/Payroll.tsx:169-196
- Evidencia:
```ts
await commissionsService.payCommissions({
  usuario_id: payTarget.usuario_id,
  comision_ids: payTarget.items.filter((c) => c.estado === 'aceptada').map((c) => c.id),
  fecha_pago: payForm.fecha_pago,
  metodo: payForm.metodo,
```
- Escenario: Al crear un movimiento manual en Finanzas o pagar comisiones en Nómina, el administrador borra el valor del campo `<input type="date">` dejando `""`. Ni `handleSave` ni `submitPayment` validan que la fecha no esté vacía y envían `""` a `finanzas_movimientos.fecha` (`date NOT NULL`) o a `pay_commissions` (`p_fecha_pago` es `date`, donde solo `NULL` activa `COALESCE(p_fecha_pago, hoy_taller(v_sede))`), fallando con error de sintaxis de fecha en Postgres (y dejando la foto del cheque ya subida huérfana en `comprobantes`).
- Arreglo propuesto: Exigir una fecha no vacía antes de enviar en Finanzas y validar `payForm.fecha_pago` en Nómina (o enviar `null` si se desea usar la fecha del taller por defecto).
- Confianza: alta

### [ALTO] Mover o entregar órdenes en Kanban deja desactualizados detalle, panel, finanzas y nómina
- Dónde: src/pages/KanbanBoard.tsx:78-82 y src/pages/KanbanBoard.tsx:489-492
- Evidencia:
```ts
onSettled: () => {
  // Delivering an order books money and stamps a completion date by
  // trigger, so the row the board shows is not what the client guessed.
  queryClient.invalidateQueries({ queryKey: boardKey });
},
```
- Escenario: Un administrador cambia de columna una orden o la entrega desde la vista tablero (`?vista=tablero`). En la base los triggers recalculan comisiones, registran ingresos/egresos de repuestos, fijan fechas y cierran parqueo, pero Kanban únicamente invalida `boardKey`. Al ir al Panel, Finanzas, Nómina o abrir de nuevo esa orden dentro de los `30 s` de `staleTime`, la app sirve datos obsoletos de caché sin los ingresos, comisiones ni el estatus nuevo.
- Arreglo propuesto: Invalidar también el detalle de la orden (`workOrderDetail`), las estadísticas y alertas del panel (`dashboardStats`, `attention`), transacciones financieras y comisiones pendientes tanto en `onSettled` como en `onDelivered`.
- Confianza: alta

### [MEDIO] Búsqueda global traga errores de Supabase y muestra "Sin resultados" en lugar de error
- Dónde: src/services/search.service.ts:40-46 y src/components/layout/Header.tsx:68-79
- Evidencia:
```ts
const none = Promise.resolve({ data: [] as unknown[] });
const [{ data: customers }, { data: vehicles }, { data: orders }] = await Promise.all([
  directory ? customerQuery : none,
  directory ? vehicleQuery : none,
  orderQuery,
]);
```
- Escenario: Con mala señal o fallo de PostgREST, un usuario busca un vehículo o cliente desde el buscador superior. `supabase-js` resuelve las promesas con `{ data: null, error }` sin lanzar excepción; `globalSearch` descarta `error` y retorna arrays vacíos, así que el `.catch(() => setSearchFailed(true))` de `Header.tsx` nunca corre y la interfaz reporta "Sin resultados" en vez de advertir el fallo.
- Arreglo propuesto: Capturar `error` en cada respuesta del `Promise.all` dentro de `globalSearch` y lanzar el primer error distinto de nulo para activar `searchFailed`.
- Confianza: alta

### [MEDIO] `OrderJobsList`, `QuoteCard` y `AuthorizationPanel` dejan obsoletas la lista de órdenes y "Requiere atención"
- Dónde: src/features/workOrders/OrderJobsList.tsx:53-56, OrderJobsList.tsx:75-78, src/features/workOrders/QuoteCard.tsx:67-75 y src/features/workOrders/AuthorizationPanel.tsx:71-76
- Evidencia:
```ts
await workOrdersService.removeJob(job.id);
await Promise.all([
  queryClient.invalidateQueries({ queryKey: queryKeys.orderJobs(orderId) }),
  queryClient.invalidateQueries({ queryKey: queryKeys.workOrderDetail(orderId) }),
]);
```
- Escenario: El administrador quita un trabajo del catálogo desde `OrderJobsList` (cambiando el total de la orden) o envía/cancela un presupuesto o registra una autorización en `QuoteCard`/`AuthorizationPanel`. `OrderJobsList` no invalida `['work-orders']` ni el balance de la orden, y ninguno de los tres invalida las consultas de "Requiere atención" ni las estadísticas del panel, dejando totales viejos o pendientes fantasmas al volver al inicio dentro de la ventana de `staleTime`.
- Arreglo propuesto: Agregar las invalidaciones de `['work-orders']`, balance de la orden y métricas/atención del panel en esas mutaciones (o delegar a un helper compartido de invalidación de orden).
- Confianza: alta

### [MEDIO] Cambiar de sede o guardar en Configuración pisa borradores sin guardar de otras sedes
- Dónde: src/pages/Settings.tsx:145-157
- Evidencia:
```ts
useEffect(() => {
  setCapacityDrafts(Object.fromEntries(sedes.map((sede) => [sede.id, String(sede.capacidad)])));
  setRateDrafts(
    Object.fromEntries(sedes.map((sede) => [sede.id, String(sede.comision_porcentaje ?? 35)]))
  );
  setRatePerHourDrafts(...);
  seedBrandDrafts(sedes);
}, [sedes]);
```
- Escenario: Un administrador modifica la comisión o los teléfonos de la Sede B y, sin guardar todavía esa tarjeta, sube un logo o guarda la capacidad de la Sede A (o regresa a la pestaña tras un refetch de `sedes`). Al cambiar la referencia del arreglo `sedes`, el `useEffect` sobreescribe todos los borradores y descarta sin aviso lo editado en la Sede B.
- Arreglo propuesto: Sincronizar cada sede solo la primera vez que aparece o tras guardar esa sede específica, manteniendo intactos los borradores con cambios locales pendientes en las demás.
- Confianza: alta

### [MEDIO] Vista previa de parqueo tiene carrera de respuestas RPC y deja el spinner atascado al desactivar
- Dónde: src/features/parking/ParkingSettingsCard.tsx:112-136
- Evidencia:
```ts
if (!activeProfile.habilitado || activeProfile.tramos.length === 0) {
  setPreviewResult(null);
  return;
}
setPreviewLoading(true);
const timer = setTimeout(async () => {
  try {
    const preview = await parkingService.getPreview(...);
    setPreviewResult(preview);
```
- Escenario: Al probar la vista previa de parqueo, si el usuario desmarca `habilitado` o borra tramos mientras `previewLoading` estaba en `true`, el `return` temprano no llama a `setPreviewLoading(false)` y deja el indicador de carga atascado; además, `clearTimeout(timer)` no cancela una RPC `vista_previa_parqueo` ya enviada, por lo que una respuesta lenta anterior puede pisar un cálculo más reciente.
- Arreglo propuesto: Llamar a `setPreviewLoading(false)` en la rama temprana y usar una variable local `cancelled = true` en el cleanup del efecto para descartar respuestas de RPCs obsoletas.
- Confianza: alta

### [MEDIO] Finanzas oculta errores de `summariesQuery`, permite cerrar modal guardando y no invalida balances de órdenes
- Dónde: src/pages/Finance.tsx:85-109 y src/pages/Finance.tsx:591
- Evidencia:
```ts
const summariesQuery = useQuery({
  queryKey: [...queryKeys.importBatches(sedeId), 'resumen'],
  queryFn: () => financeService.getStatementSummaries(sedeId),
});
...
const loadError =
  transactionsQuery.error ?? statsQuery.error ?? ordersQuery.error ?? importsQuery.error;
```
- Escenario: Si `getStatementSummaries` falla por red o permisos, `loadError` lo ignora y la pestaña de extractos bancarios muestra las importaciones sin sus totales ni mensaje de error (regla 10). Además, al crear o borrar un movimiento con `referencia_orden_id`, `loadData()` (`105-109`) no invalida el balance/margen de la orden vinculada, y el clic en el fondo del modal (`591`) permite cerrarlo mientras `saving` está en vuelo.
- Arreglo propuesto: Añadir `summariesQuery.error` a `loadError`, deshabilitar el cierre del modal cuando `saving` sea `true` e invalidar el balance/margen de la orden afectada al guardar o eliminar movimientos.
- Confianza: alta

### [MEDIO] Nómina no invalida panel ni órdenes al pagar o deshacer pagos de comisiones
- Dónde: src/pages/Payroll.tsx:77-81
- Evidencia:
```ts
const reload = () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.commissions(sedeId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.commissionPayments(sedeId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.transactions(sedeId) });
};
```
- Escenario: Al registrar un pago de comisiones (o deshacerlo), la base inserta o borra egresos de planilla y cambia si las líneas de `orden_labor` pueden reasignarse (`trg_guard_labor_tecnico`), pero `reload()` no invalida las estadísticas del panel ni los detalles/balances de órdenes ya cacheados, mostrando egresos desactualizados y estado de pago viejo en órdenes abiertas.
- Arreglo propuesto: Incluir las claves del panel (`dashboardStats`), detalle/balances de órdenes y resúmenes pagados dentro de `reload()`.
- Confianza: alta

### [MEDIO] Nómina permite doble clic en "Deshacer pago", cerrar el modal al pagar y deja huérfanos en Storage
- Dónde: src/pages/Payroll.tsx:180-196, Payroll.tsx:207-216, Payroll.tsx:532-539, Payroll.tsx:555 y Payroll.tsx:643
- Evidencia:
```ts
const undoPayment = async (payment: CommissionPayment) => {
  if (!confirm(t('payroll.confirmUndoPayment'))) return;
  try {
    await commissionsService.deletePayment(payment.id);
    reload();
```
- Escenario: Al pulsar dos veces el botón de eliminar pago (`532-539`), el botón no se deshabilita mientras corre el primer `DELETE` y la segunda petición falla en `assertDeleted` mostrando un error falso. En el diálogo de pago, pulsar Cancelar (`643`) o el fondo (`555`) cierra el modal con `pay_commissions` todavía en curso, y si `uploadComprobante` (`182`) sube la foto del cheque pero `payCommissions` (`187`) rechaza, el archivo queda huérfano en el bucket `comprobantes`.
- Arreglo propuesto: Guardar `undoingId` para deshabilitar el botón durante `undoPayment`, bloquear el cierre del modal mientras `paying` esté activo y borrar el comprobante subido en el `catch` si `payCommissions` falla.
- Confianza: alta

### [MEDIO] Clientes ignora en silencio guardar sin nombre/teléfono y no invalida detalle ni órdenes
- Dónde: src/pages/Customers.tsx:62-65 y Customers.tsx:129-130
- Evidencia:
```ts
const handleSave = async () => {
  if (!form.nombre.trim() || !form.telefono.trim()) return;
```
- Escenario: Si el administrador borra el nombre o el teléfono al editar un cliente y pulsa Guardar, `handleSave` retorna en silencio sin rellenar `formError`, haciendo parecer que el botón no funciona. Al guardar con datos válidos (p. ej. cambiando nombre, teléfono o idioma), `loadCustomers` solo invalida `customers` y `vehicles`, dejando obsoletos el detalle del cliente y las órdenes cacheadas.
- Arreglo propuesto: Asignar el error correspondiente en `formError` cuando falte nombre o teléfono, e invalidar también el detalle de cliente y las consultas de órdenes tras guardar.
- Confianza: alta

### [BAJO] `ServiceStickerModal` permite doble envío por Enter y trunca millas inválidas con `parseInt`
- Dónde: src/features/workOrders/ServiceStickerModal.tsx:102-116 y ServiceStickerModal.tsx:184-188
- Evidencia:
```ts
} else {
  numMillas = millas.trim() === '' ? null : parseInt(millas, 10);
}
```
- Escenario: Cuando la orden no tiene millas de ingreso, escribir valores no numéricos tras un dígito (p. ej. `"50,000"` o `"50000km"`) se trunca silenciosamente con `parseInt` en vez de rechazarse como en la rama `hasIntakeMiles` (`Number(...)`). Además, `executeAction` no comprueba `if (saving) return`, permitiendo envíos duplicados al pulsar Enter repetidamente dentro del formulario.
- Arreglo propuesto: Validar con `Number(millas.trim())` y `Number.isInteger` en ambas ramas, y cortar al inicio de `executeAction` si `saving` ya está en `true`.
- Confianza: alta

### [BAJO] El botón de eliminar avance en `ProgressLog` carece de `disabled={busy}`
- Dónde: src/features/workOrders/ProgressLog.tsx:188-191 y src/features/workOrders/useWorkOrderDetail.ts:934-944
- Evidencia:
```tsx
{(isAdmin || userId === avance.usuario_id) && (
  <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => onRemove(avance.id)} aria-label={t('common.delete')}>
    <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
  </button>
)}
```
- Escenario: A diferencia del botón de visibilidad (línea `178`, protegido con `disabled={busy}`), el de borrado no se deshabilita ni marca `busy` en `removeProgressUpdate`, por lo que una segunda pulsación mientras la red responde lanza otro `delete` sobre el mismo avance.
- Arreglo propuesto: Añadir `disabled={busy}` al botón de eliminar y envolver `removeProgressUpdate` con `setBusy(true)` / `finally { setBusy(false) }`.
- Confianza: alta

---

## Lo que revisé y está bien
- **Sesión y aislamiento de caché (`AuthContext.tsx`)**: Al cerrar sesión o cambiar de usuario se limpia el `QueryClient` con `forgetCachedData()`, evitando fuga de datos entre cuentas; `logout` usa `scope: 'local'` de forma intencional.
- **Límite de 1.000 filas y totales de dinero (`commissions.service.ts`, `dashboard.service.ts`, `metrics.service.ts`, `money.ts`)**: Las listas crecientes paginan con `fetchAll`, los totales financieros/KPIs/balances se calculan en RPCs de Postgres (`resumen_panel`, `requiere_atencion`, `balance_orden`, `resumen_mis_comisiones`, `pay_commissions`) y los cálculos locales de vista previa usan enteros en centavos (`sumMoney`).
- **Fechas y zona horaria (`dates.ts`, `orderDue.ts`, `workOrderPdf.ts`, `serviceStickerPdf.ts`)**: Las fechas `YYYY-MM-DD` se parsean localmente sin caer en `new Date('YYYY-MM-DD')` UTC ni desplazar un día en horario de Maryland.
- **Cola offline de medios, CSV y formularios de vehículo (`uploadQueue.ts`, `csv.ts`, `vin.ts`, `phone.ts`, `useDiscardGuard.tsx`, `backButtonTrap.ts`)**: La cola de subidas maneja reintentos/persistencia sin perder archivos, `csv.ts` mitiga inyección de fórmulas y `useDiscardGuard` protege borradores sin romper el botón atrás.
- **Validaciones en Edge/RPC y RLS (`_esquema-vigente.sql`)**: Las acciones sensibles (aprobar presupuestos, descuentos, parqueo, entregas, nómina, permisos por sede y estado) están respaldadas en base mediante funciones `SECURITY DEFINER`, triggers de guarda y `REVOKE`/`GRANT` explícitos.
