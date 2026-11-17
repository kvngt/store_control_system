# Informe Tanda 1 de Q2 — Recepción sin datos sucios y avance con autorización (`hydrogen`)

> **Alcance:** Implementación de los seis puntos (`A-01`, `A-02`, `A-08`, `A-03`, `A-18`, `B-02`) decididos por el arquitecto para la Tanda 1 de Q2.  
> **Nota sobre verificación:** No se ejecutaron comandos en este entorno; el verificador debe correr `npm run lint`, `npx tsc -b`, `npm test`, `npm run build`, `npm run test:db` y `npm run qa:security:local`.

---

## 1. Resumen por decisión de diseño

### A-01 — Teléfono incompleto o con letras
- **`src/lib/phone.ts`**:
  - `sanitizePhoneInput(raw)`: filtra todo carácter fuera de dígitos (`0-9`) y signos de formato (` `, `(`, `)`, `-`, `.`, y un único `+` solo al inicio).
  - `isValidPhone(value)`: exige al menos un dígito, rechaza letras o `+` intermedio, y valida el largo de dígitos nacionales según el país en `NATIONAL_DIGIT_BOUNDS` (cubre los 18 países de `PHONE_COUNTRIES`; p. ej. 10 dígitos en US/PR/DO/MX/CO/VE, 10–11 en AR, 9 en CL/ES/PE, 8–9 en EC, 7–8 en PA, 8 en CR/CU/SV/GT/HN/NI; números `+` fuera de la lista exigen 8–15 dígitos E.164; teléfonos heredados sin `+` se evalúan bajo las reglas de EE. UU. sin reescribirlos).
- **`src/components/PhoneInput.tsx`**:
  - Aplica `sanitizePhoneInput(e.target.value)` en cada cambio del `<input type="tel">` antes de emitir a E.164.
  - Aplica clase `.is-invalid` junto con `aria-invalid={invalid || undefined}` cuando el formulario marca error.
- **Validación bloqueante en recepción y Clientes**:
  - `src/features/workOrders/workOrderForm.schema.ts`: en `customerMode === 'new'`, si el teléfono está vacío rechaza con `workOrders.validation.customerPhone`, y si `!isValidPhone(form.newCustomer.telefono)` rechaza con `workOrders.validation.customerPhoneInvalid`. Nombre y teléfono siguen siendo suficientes.
  - `src/pages/Customers.tsx`: `handleSave` exige `isValidPhone(form.telefono)`, marcando `invalidField = 'telefono'` (`aria-invalid`) y mostrando `t('workOrders.validation.customerPhoneInvalid')`.
- **i18n**: clave `workOrders.validation.customerPhoneInvalid` añadida en `es` y `en` en `src/i18n/translations.ts`.

### A-02 — Aviso de cliente repetido por teléfono (sin bloqueo)
- **`src/features/workOrders/intake/intakeUtils.ts`**: `findDuplicateCustomerByPhone(customers, phone, sedeId)` compara el número validado en formato internacional (`toWhatsAppNumber`) contra clientes de la misma sede (`c.sede_id === sedeId`), sin restringir la creación de otro cliente ni agregar índice único en la base.
- **`src/features/workOrders/intake/steps/CustomerStep.tsx`**: cuando `customerMode === 'new'` y coincide un teléfono en la sede, muestra `.intake-duplicate-notice` (`role="status"`) con «Ya existe *{Nombre}* con este teléfono.» (`intake.duplicatePhoneNotice`) y el botón «Usar este cliente» (`intake.useExistingCustomer`), que selecciona a ese cliente y vuelve al modo existente (`form.selectCustomer(id)` + `form.backToExistingCustomer()`).

### A-08 — Buscador de clientes (y vehículos cuando la lista supera 8)
- **`src/components/CustomerPicker.tsx`**:
  - Se agregaron props opcionales (`hideInlineCreate?: boolean`, `inputId?: string`, `placeholder?: string`, `onCreate` opcional) y `aria-invalid={invalid || undefined}` sin alterar el comportamiento actual en `src/pages/Vehicles.tsx`.
  - Se corrigió el filtro por dígitos en `matches`: antes `needle.replace(/\D/g, '')` era `''` al buscar letras y hacía que `telefono.includes('')` coincidiera con todos los clientes; ahora solo compara dígitos cuando `needleDigits.length > 0`.
- **`src/features/workOrders/intake/steps/CustomerStep.tsx`**:
  - Se reemplazó `<select id="intake-customer">` por `CustomerPicker` (`inputId="intake-customer-search"`, `hideInlineCreate`) dentro de `.intake-picker-row`, acompañado del botón aparte `#intake-new-customer` («Nuevo Cliente»).
- **`src/features/workOrders/intake/steps/VehicleStep.tsx`**:
  - Cuando `vehiclesForCustomer.length > 8`, muestra un buscador de vehículos (`#intake-vehicle-search`, filtrando por año, marca, modelo, placa o VIN, hasta 8 resultados en `.combo-menu` + tarjeta `.owner-card` al elegir) junto al botón aparte `#intake-new-vehicle` («Nuevo Vehículo»). Con 8 o menos vehículos se mantiene `<select id="intake-vehicle">` para no alargar ni cambiar flujos simples.

### A-03 — Placa o VIN repetidos en el paso 2 del alta
- **`src/lib/errors.ts`**: `duplicateVehicleField(err)` detecta si el error proviene de `uq_vehiculos_placa` (`'placa'`) o `uq_vehiculos_vin` (`'vin'`).
- **`src/features/vehicles/VehicleFields.tsx`**: admite props opcionales `plateError?: string` y `vinError?: string`; marca `#vehicle-plate` o `#vehicle-vin` con `.is-invalid` y `aria-invalid="true"`, y pinta el error debajo del campo con `role="alert"`.
- **`src/features/workOrders/intake/useIntakeRecords.ts`** y **`src/features/workOrders/intake/useIntakeSubmit.ts`**: cuando `saveNewVehicle` falla por `uq_vehiculos_placa` o `uq_vehiculos_vin`, asigna el error traducido en `newVehicle.placa` o `newVehicle.vin` mediante `form.form.setError`, permanece en el paso 2 (o vuelve al paso 2 si venía del envío) y enfoca `#vehicle-plate` / `#vehicle-vin`. El cliente nuevo guardado en el paso 1 se conserva guardado según diseño.
- **`src/features/workOrders/useWorkOrderForm.ts`**: `setNewVehicle` limpia `errors.newVehicle.placa` / `errors.newVehicle.vin` al editar el campo correspondiente.

### A-18 — Idioma del cliente nuevo en el alta
- **`src/features/workOrders/workOrderForm.schema.ts`**: `newCustomer.idioma` (`z.enum(['en', 'es'])`), por defecto `'en'` en `emptyWorkOrderForm()`.
- **`src/features/workOrders/intakeDraft.ts`**: `loadIntakeDraft` fusiona `newCustomer` y `newVehicle` con `emptyWorkOrderForm()` para completar `idioma: 'en'` en borradores previos guardados en `localStorage`.
- **`src/features/workOrders/intake/steps/CustomerStep.tsx`**: selector de un toque «Idioma del cliente» (`English` / `Español`, `.intake-lang-toggle` / `.intake-lang-btn` con `aria-pressed` y altura mínima táctil de 44 px en móvil).
- **`src/features/workOrders/intake/useIntakeRecords.ts`**: `saveNewCustomer` envía `idioma: values.newCustomer.idioma` a `customersService.createCustomer` (la columna `clientes.idioma` ya existe en la base).

### B-02 — Técnico no mueve `porcentaje_avance` sin trabajo autorizado
- **Migración `supabase/migrations/20261010000047_tecnico_avance_con_autorizacion.sql`**:
  - Reemite `public.trg_guard_order_technician()` partiendo íntegramente de `20261010000046` y amplía la guarda del técnico que ya bloquea pasar a `en_proceso`/`finalizado` sin líneas `aprobado` en `orden_labor` u `orden_repuestos` para bloquear también cuando `NEW.porcentaje_avance IS DISTINCT FROM OLD.porcentaje_avance`, con la misma razón (`El cliente todavía no autoriza ningún trabajo de esta orden...`, `ERRCODE = '42501'`) ya cubierta por `SHOP_REASONS_EN` en `src/lib/errors.ts`.
  - Termina con `REVOKE ALL ON FUNCTION public.trg_guard_order_technician() FROM PUBLIC, anon, authenticated;`.
  - Verificación estática de `marcar_labor_completada` / `_avance_por_tareas`: solo operan sobre líneas con `estado = 'aprobado'`, por lo que `trg_avance_por_tareas` no choca con esta guarda cuando el técnico marca una tarea autorizada.
- **pgTAP `supabase/tests/database/51_tecnico_avance_con_autorizacion.test.sql`**: `plan(12)` cubriendo los 6 casos (rechazo sin líneas aprobadas, éxito con mano de obra aprobada, éxito con solo un repuesto aprobado, actualización con mismo avance y `fecha_finalizacion`, éxito de administración sin autorizar y técnico ajeno sin acceso).
- **Seguridad API `scripts/qa/api-security.mjs`**: descubre `ctx.ORDEN_SIN_AUTORIZAR` usando `TOKEN_ADMIN` (orden asignada al técnico, no entregada, sin filas `aprobado` en `orden_labor` ni `orden_repuestos`) y agrega el caso `SEC-215`.
- **Pantalla (`src/features/workOrders/detail/permissions.ts`, `src/features/workOrders/detail/OrderHeader.tsx`)**:
  - `computeOrderPermissions` deshabilita `canEditProgress` para no-admins cuando no existe ninguna línea con `estado === 'aprobado'` en `labor_items`, `repuestos` o `repuestos_resumen`.
  - `OrderHeader` mantiene el deslizador y el campo numérico deshabilitados, oculta el sufijo `(la orden ya está cerrada)` si la orden no está finalizada/entregada, y muestra `techStatus.waitingAuthorizationNote` en `.progress-locked-note` para el técnico asignado.

---

## 2. Archivos tocados e impactos fuera del núcleo

### Archivos modificados / creados
- Estilos y textos: `src/i18n/translations.ts`, `src/styles/components.css`
- Teléfono y errores: `src/lib/phone.ts`, `src/lib/phone.test.ts`, `src/components/PhoneInput.tsx`, `src/components/PhoneInput.test.tsx`, `src/lib/errors.ts`, `src/lib/errors.test.ts`
- Buscador y clientes: `src/components/CustomerPicker.tsx`, `src/pages/Customers.tsx`, `src/pages/Customers.test.tsx`
- Formulario y pasos de alta: `src/features/workOrders/workOrderForm.schema.ts`, `src/features/workOrders/workOrderForm.schema.test.ts`, `src/features/workOrders/intakeDraft.ts`, `src/features/workOrders/intakeDraft.test.ts`, `src/features/workOrders/useWorkOrderForm.ts`, `src/features/workOrders/WorkOrderCreateModal.tsx`, `src/features/workOrders/intake/intakeUtils.ts`, `src/features/workOrders/intake/useIntakeRecords.ts`, `src/features/workOrders/intake/useIntakeSubmit.ts`, `src/features/workOrders/intake/steps/CustomerStep.tsx`, `src/features/workOrders/intake/steps/VehicleStep.tsx`, `src/features/vehicles/VehicleFields.tsx`
- Permisos y detalle de orden: `src/features/workOrders/detail/permissions.ts`, `src/features/workOrders/detail/permissions.test.ts`, `src/features/workOrders/detail/OrderHeader.tsx`
- Pruebas de página Vitest: `src/pages/workOrdersTestKit.tsx`, `src/pages/WorkOrders.intake.test.tsx`, `src/pages/WorkOrders.detail.test.tsx`
- Base de datos y QA: `supabase/migrations/20261010000047_tecnico_avance_con_autorizacion.sql`, `supabase/tests/database/51_tecnico_avance_con_autorizacion.test.sql`, `scripts/qa/api-security.mjs`

### Archivos extra necesarios y puntos de atención para el verificador
1. **`src/features/vehicles/VehicleFields.tsx`**: se agregaron props opcionales (`plateError`, `vinError`) y `aria-invalid` en `#vehicle-plate` / `#vehicle-vin` para poder mostrar el error de duplicado en su campo durante el alta sin tocar la pantalla `Vehicles.tsx`.
2. **`src/pages/workOrdersTestKit.tsx` y `src/pages/WorkOrders.intake.test.tsx`**: al reemplazar `<select id="intake-customer">` por `CustomerPicker` + botón `#intake-new-customer` (A-08), los selectores existentes de `pickCustomer` y de `WorkOrders.intake.test.tsx` que apuntaban a `#intake-customer` debieron actualizarse al buscador y al nuevo botón; además se añadieron pruebas para A-01, A-02, A-08 (>8 vehículos), A-03 y A-18.
3. **`src/features/workOrders/detail/permissions.test.ts`**: `makeOrder` incluía solo estado sin líneas; al exigir una línea `'aprobado'` para `canEditProgress` del técnico (B-02), `makeOrder` incluye ahora `labor_items: [{ estado: 'aprobado' }]` por defecto para los casos generales y se añadió la prueba específica de B-02 sin autorización.
4. **Impacto en E2E (no modificado)**: `e2e/qa-cobros.spec.ts` (línea 110) selecciona un cliente con `#intake-customer`; si se ejecuta `test:e2e:local`, deberá actualizarse a `#intake-customer-search` + opción de cliente.
5. **Validación de países en `src/lib/phone.ts`**: las cotas `NATIONAL_DIGIT_BOUNDS` reflejan los largos nacionales estándar de los 18 países listados en `PHONE_COUNTRIES`; conviene confirmar con el taller si algún país requiere rango más amplio (p. ej. fijos antiguos en Colombia o Venezuela).
