# Q2, tanda 1: que no entren datos sucios en la recepción. Informe del jefe de obra (17/11/2026)

Orden: la sección «Tanda 1» de [q2-prioridades.md](q2-prioridades.md). Programó Gemini Hydrogen en su copia (una sola
vuelta, sin colgarse); este informe es de la verificación en el árbol principal. Hydrogen dejó su propio informe en
[q2-tanda1-hydrogen.md](q2-tanda1-hydrogen.md). **Sin commits, sin tocar el proyecto real.** El árbol principal no cambió
mientras programó Hydrogen (`principal-antes` = `principal-despues`).

## 1. Qué quedó hecho

| Punto | Estado | Cómo se comprobó |
|---|---|---|
| A-01 teléfono | Cumple | `PhoneInput` descarta letras (`sanitizePhoneInput`); `isValidPhone` valida por país (`NATIONAL_DIGIT_BOUNDS`, 18 países); alta y Clientes exigen número válido, con `aria-invalid` y el motivo en el campo. Recorrido: `abc41055` queda `41055`; incompleto no avanza y dice «Un número de Estados Unidos tiene 10 dígitos.» |
| A-02 cliente repetido | Cumple | `findDuplicateCustomerByPhone` compara en formato internacional y por sede; «Ya existe *Nombre* con este teléfono» + «Usar este cliente». No bloquea crear otro. Recorrido OK |
| A-08 buscador | Cumple | `CustomerPicker` (prop `hideInlineCreate`) en el paso 1 y «Nuevo Cliente» aparte; el paso 2 usa buscador de vehículo si hay más de 8. Busca por nombre y teléfono. `Vehicles.tsx` no cambia |
| A-03 placa/VIN repetidos | Cumple | El error de `uq_vehiculos_placa/vin` se pinta bajo su campo, el alta se queda en el paso 2, el foco va al campo. Recorrido OK |
| A-18 idioma | Cumple | Selector English / Español (inglés por defecto), `newCustomer.idioma` en el formulario, el borrador y `createCustomer`. Recorrido: el cliente queda con `idioma = es` en la base |
| B-02 avance del técnico | Cumple | Migración `20261010000047_tecnico_avance_con_autorizacion.sql` (la `046` entera + una condición); pgTAP `51` (12 aserciones); `SEC-215`; deslizador y campo apagados en pantalla |

Diseño: ninguna decisión se cambió ni quedó sin cumplir. El alta no se hizo más lenta: el paso 1 a 2 con cliente nuevo tardó
300 a 500 ms en local; no hay campo obligatorio ni paso nuevo.

## 2. Lo que corregí yo (Hydrogen no lo cubrió)

1. `OrderHeader.tsx`: usaba `detail.isAssignedToMe`, que `useWorkOrderDetail` no expone (rompía `tsc -b`). Ahora usa `detail.canEdit`.
2. `OrderHeader.tsx`: la explicación bajo el deslizador repetía la de `TechOrderStatus`, una pegada a la otra en la primera pantalla
   del teléfono. Ahora solo sale bajo el deslizador cuando esa tarjeta no la muestra; mientras tanto va en el `title` de los dos controles.
3. `components.css`: la regla de 44 px del botón de idioma iba antes de su regla base (36 px) y perdía. Movida después: 44 px en táctil (medido).
4. Pruebas que Hydrogen no actualizó: `WorkOrderCreateModal.test.tsx` (4 pruebas elegían el cliente con el `<select>`; helper `chooseCustomer`),
   pgTAP `03`, `10` y `45` (afirmaban que el técnico mueve el avance sin nada autorizado; ahora afirman el rechazo, mismo `plan`), y las
   e2e: `fixtures.ts` y `qa-cobros.spec.ts` (selectores nuevos), `qa-workorders.spec.ts` (WORK-01), `customer-crud` y
   `qa-customers-vehicles` (teléfonos de 7 dígitos que ya no son válidos).
5. `qa-cobros.spec.ts` COB-03: fallaba solo en la corrida completa. El clic en «Nuevo Cliente» justo al montarse el diálogo se perdía (con
   4 navegadores a la vez se reprodujo en cerca de la mitad de los intentos; el `<select>` anterior no lo sufría porque `selectOption` es atómico).
   Ahora reintenta con `toPass` hasta que aparece el panel. No lo vi en una persona real: el botón existe antes de que nadie lo toque.
6. `login.spec.ts` (mecánico): afirmaba `a[href="/settings"]` en cero, pero «todo el personal ve Configuración» (comentario de `Sidebar.tsx`); solo
   pasaba si la barra aún no había pintado. Ahora espera la barra (uno) y luego comprueba que no hay Finanzas ni Comisiones.
7. `security-local.mjs` crea una orden del mecánico con lo cotizado sin autorizar (`ORDEN_SIN_AUTORIZAR`) y `api-security.mjs` la usa: el descubrimiento
   de Hydrogen no la encontraba y `SEC-215` salía SKIP.
8. `useIntakeRecords.ts` y `useIntakeSubmit.ts`: tras enfocar la placa o el VIN repetidos, el motivo se desplaza a la vista (quedaba bajo el pliegue del diálogo).

## 3. Números de cada comando (árbol principal, base local 44321/44322)

| Comando | Resultado |
|---|---|
| `npm run lint` | 0 avisos, 0 errores |
| `npx tsc -b` | sin errores |
| `npm test` (Vitest) | 186 archivos, **1311 pruebas, todas pasan** (la primera corrida tuvo 6 fallos: los 4 del modal de alta, arreglados arriba, y 2 que no reaparecieron) |
| `npm run build` | compila |
| `migration up` local | aplicó la `047` (la `046` ya estaba) |
| pgTAP `50` + `51` | 14 + 12 = 26 aserciones, PASS |
| pgTAP `03`, `10`, `45`, `50`, `51` | 115 aserciones, PASS |
| `test:db` completo (51 archivos, 1196 aserciones) | Falla en `19`, `23`, `27`, `30`, `41`: **sin relación** (ninguno toca `porcentaje_avance`); son los datos de demostración y de QA de la base local (ya se sabía de `19`; `23` y `30` chocan con filas existentes; `41` espera que no exista una ORD-…-100 y ya hay una). En una base vacía pasan; no lo comprobé reiniciando la base para no borrar los datos de demostración |
| `db:types` / `db:schema` | regenerados (el esquema recoge la `046` y la `047`; `supabase.gen.ts` sin cambios de tabla) |
| `test:e2e:local` | **85 pasan, 1 salta, 0 fallan** (la primera corrida tuvo 2 fallos por el alta nueva; la segunda, 2 por COB-03 y el mecánico; ver §2) |
| `qa:security:local` | **210 PASS, 0 FAIL, 0 SKIP** (incluye `SEC-215`) |

## 4. Recorrido en el navegador (`qa.local/t1-alta.mjs`, `t1-tecnico.mjs`; app compilada contra la base local)

A 1366 px y a 390 px todas las comprobaciones pasan: teléfono inválido, cliente repetido, buscador por nombre y teléfono, idioma ES y EN, placa
repetida, sin scroll horizontal a 390 px. Como mecánico (`mecanico-a`), en una orden sin nada autorizado (ORD-2026-052) el deslizador y el campo
numérico están apagados, la tarjeta de estado explica por qué, y el mismo PATCH por la API da 403 con la razón; en una con algo autorizado
(ORD-2026-050) se mueven. Capturas en `qa.local/shots/t1-*.png` (sufijo `-d` escritorio, `-m` teléfono): 01 buscador, 02 búsqueda por teléfono,
03 teléfono inválido, 04 cliente repetido, 05 cliente elegido, 06 idioma, 07 placa repetida, 08 inglés, 10 y 11 técnico.

## 5. Archivos tocados

Hydrogen (33): migración `047`, pgTAP `51`, `scripts/qa/api-security.mjs`, `src/lib/{phone,errors}.ts` y sus pruebas, `PhoneInput`, `CustomerPicker`,
`VehicleFields`, `WorkOrderCreateModal`, `intake/{intakeUtils,useIntakeRecords,useIntakeSubmit}`, `steps/{CustomerStep,VehicleStep}`, `useWorkOrderForm`,
`workOrderForm.schema`, `intakeDraft`, `detail/{OrderHeader,permissions}`, `pages/Customers`, `i18n/translations.ts`, `styles/components.css`, pruebas de
página y su informe. Yo: `OrderHeader`, `components.css`, `useIntakeRecords` y `useIntakeSubmit`, `WorkOrderCreateModal.test.tsx`, pgTAP `03`/`10`/`45`,
`scripts/qa/{security-local,api-security}.mjs`, `e2e/{fixtures,login.spec,qa-cobros.spec,qa-workorders.spec,customer-crud.spec,qa-customers-vehicles.spec}.ts`,
`supabase/schema/actual.sql`, `src/types/supabase.gen.ts`.

## 6. Dudas y pendientes

- **Orden de publicación:** la base antes que la app. Hace falta el `db push` de la `046` **y** la `047` (producción sigue en la `045`). Con la `047` aplicada
  y la app vieja, un técnico que mueva el avance en una orden sin nada autorizado verá el error de la base (traducido); no se rompe nada más.
- **El menú del buscador tapa «Nuevo Cliente» en el teléfono** una vez abierto (también al pulsar «Cambiar» en un cliente elegido): hay que tocar afuera. El
  camino normal de cliente nuevo (pulsar el botón sin abrir el buscador) no se ve afectado. Mejora pendiente, no hecha: un «Nuevo cliente» al pie del menú.
- Los rangos de dígitos por país (`NATIONAL_DIGIT_BOUNDS`) los puso Hydrogen; conviene confirmar Colombia y Venezuela con el taller.
- Falta la documentación del paso 10 de `nueva-migracion` (`mapa-de-secciones.md`, una regla en `ai-context.md` para B-02, la bitácora): no era de esta orden.
- Una vez, durante el recorrido, compilé la app **sin** las variables locales y el navegador intentó iniciar sesión (cuentas `@qa.local`) contra el Auth del
  proyecto real: 2 o 3 intentos fallidos, sin datos escritos. Se recompiló de inmediato contra la base local y se comprobó que el bundle la usa.
