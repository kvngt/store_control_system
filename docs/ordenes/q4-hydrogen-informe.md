# Q4 — Informe de cambios (lo que sale hacia afuera)

Resumen de los 8 ajustes realizados sin ejecutar comandos (pendiente de verificación de lint, tipos y pruebas por el verificador).

---

## T-01 (alta) PDF: el vehículo se encima con la etiqueta «VIN»
- **Qué se cambió:**
  - En `src/lib/workOrderPdf.ts` (líneas 344–354), `label` ahora guarda el resultado de `doc.splitTextToSize(value || '—', width)`, pinta el arreglo de líneas y devuelve la altura utilizada (`4.5 + lines.length * 4.5 + 2`, equivalente a `11` mm para 1 línea y `15.5` mm para 2 líneas).
  - En el bloque «Customer & vehicle» (`src/lib/workOrderPdf.ts`, líneas 460–488), cada fila usa `row(left, right)` que avanza `y` por `Math.max(11, left, right)`, manteniendo exactamente `11` mm en filas de una línea.
- **Prueba que lo fija:**
  - `src/lib/workOrderPdf.test.ts` (líneas 354–374): `con un vehículo de varias líneas, la etiqueta VIN se pinta debajo de la última línea del vehículo`.

## T-02 (media) PDF: en la firma, el nombre largo del cliente se encima con «Firmado: fecha»
- **Qué se cambió:**
  - En `src/lib/workOrderPdf.ts` (líneas 786–825), antes de reservar espacio se fija `doc.setFontSize(8)` y `doc.setFont('helvetica', 'normal')` para partir el nombre con `doc.splitTextToSize(..., 70)`.
  - `ensureSpace` ajusta su reserva según `nameLines.length` y la línea de `Firmado: …`.
  - El nombre se imprime en varias líneas en `(MARGIN, y)` y la fecha «Firmado: …» se pinta debajo en su propia línea alineada a la izquierda (`MARGIN, y`), sin `{ align: 'right' }`.
- **Prueba que lo fija:**
  - `src/lib/workOrderPdf.test.ts` (líneas 376–396): `en la firma, un nombre largo se parte en varias líneas y «Firmado: …» sale debajo, alineado a la izquierda`.

## T-03 (media) PDF: fechas ambiguas en español y hora del dispositivo
- **Qué se cambió:**
  - En `src/lib/workOrderPdf.ts` (líneas 184–218), se introdujeron `formatInZone` (con respaldo a `DEFAULT_TIMEZONE` si `Intl` rechaza la zona) y una única función de fecha corta `formatShortDate(date, locale, timeZone?)` usando `Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', ... })`.
  - `formatDay` usa `formatShortDate` sin zona horaria a partir de `new Date(y, m - 1, d)` (para evitar el corrimiento de un día de `AAAA-MM-DD`).
  - `formatTimestampDate` usa `formatShortDate` con la zona horaria de la sede (`sedeTimeZone`).
  - Se aplica en: «Generado» (líneas 414–420, junto con la hora `hour: '2-digit', minute: '2-digit'` en `sedeTimeZone`), Fecha de ingreso (línea 486), Entrega estimada (línea 487), el día de cada avance (línea 720, reemplazando `toLocaleDateString` por `formatDay`) y «Firmado» (línea 797).
- **Prueba que lo fija:**
  - `src/lib/workOrderPdf.test.ts` (líneas 325–352 y 398–432): prueba existente actualizada al nuevo formato `Intl.DateTimeFormat('es-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone })`, más prueba nueva para fechas cortas en `es`/`en` (entrega estimada y avance) y zona horaria del taller en «Generado» / «Generated».

## T-04 (media) Correos: «trabajo(s)» y «job(s)» en el texto de vista previa
- **Qué se cambió:**
  - En `supabase/functions/_shared/email/templates.ts` (líneas 261–264 y 283–287 en `copyEs`; líneas 400–403 y 422–426 en `copyEn`), se reemplazaron los textos con `(s)` en `preheader` de `presupuesto` y `presupuesto_confirmacion` por singular y plural reales según la cantidad de trabajos (`1 trabajo ... espera` / `n trabajos ... esperan`, `1 job ... is waiting` / `n jobs ... are waiting`, `Autorizó 1 trabajo` / `n trabajos`, `You approved 1 job` / `n jobs`). Se revisó todo el archivo y no quedan otros `(s)`.
- **Prueba que lo fija:**
  - `src/lib/emailTemplates.test.ts` (líneas 215–264): `usa singular y plural sin "(s)" en la vista previa de presupuesto y confirmación` (incluye verificación en todas las plantillas en `es` y `en`).

## T-05 (media) Correos: la línea «No quiero recibir estos correos» se lee mal; los teléfonos se parten por la mitad
- **Qué se cambió:**
  - En `supabase/functions/_shared/email/templates.ts` (línea 566 en `renderEmail` y línea 653 en `renderEmployeeEmail`), se cambió `#9A9AA6` por `#6B6B76` tanto en el `<p>` y el `<a>` de baja como en el aviso «Aviso automático de Restorify...».
  - En `renderEmail` (`supabase/functions/_shared/email/templates.ts`, líneas 523–531 y 564), cada teléfono devuelto por `shopPhones` se envuelve en HTML con `<span style="white-space:nowrap">${escapeHtml(p)}</span>` (sin envolver la dirección ni alterar la versión de texto plano).
- **Prueba que lo fija:**
  - `src/lib/emailTemplates.test.ts` (líneas 354–377): `usa #6B6B76 en el pie en lugar de #9A9AA6 y envuelve cada teléfono con white-space:nowrap`.

## T-06 (baja) Correos: el asunto con un vehículo de nombre largo esconde el número de orden
- **Qué se cambió:**
  - En `supabase/functions/_shared/email/templates.ts` (líneas 117–119), se agregó `shortVehicle(vehicle)` que recorta a un máximo de 40 caracteres con `…` al final (`vehicle.length <= 40 ? vehicle : `${vehicle.slice(0, 39).trimEnd()}…``).
  - En `copyEs` (línea 190) y `copyEn` (línea 330), `subjectVehicle` se usa únicamente en el `subject` de las plantillas que incluyen el vehículo (`recepcion`, `estatus`, `presupuesto`, `reporte`, `avance`). El título del correo (`heading`), el cuerpo y el pie siguen mostrando el vehículo completo, y `<title>` sigue reflejando `copy.subject`.
- **Prueba que lo fija:**
  - `src/lib/emailTemplates.test.ts` (líneas 379–389): `recorta el vehículo largo en el asunto a 40 caracteres y lo deja completo en el cuerpo`.

## T-07 (baja) Correos: un color de taller muy claro hace desaparecer el botón
- **Qué se cambió:**
  - En `supabase/functions/_shared/email/templates.ts` (líneas 99–115), se extrajo `luminance(hex)` desde `textOn(hex)` y se agregó `buttonBorder(hex)`, que añade `border:1px solid #1A1A1F;` cuando `luminance(hex) > 0.75`.
  - Se aplicó `buttonBorder(color)` al botón principal en `renderEmail` (línea 558) y en `renderEmployeeEmail` (línea 650).
- **Prueba que lo fija:**
  - `src/lib/emailTemplates.test.ts` (líneas 391–415): `agrega borde oscuro al botón cuando el color del taller es muy claro, pero no con colores normales`.

## T-08 (media) Página del QR (`/s/<código>`): un código que ya no existe es un callejón sin salida, y la página no declara su idioma
- **Qué se cambió:**
  - En `src/portal/strings.ts`, se agregó `service.notFoundAskAgain` en `es` (línea 182) y `en` (línea 419).
  - En `src/portal/ServicePage.tsx`:
    - Se importaron `ContactPhones` (`./components/ContactPhones`) y `publicShopPhones` (`./publicContact`) (líneas 19 y 21) sin importar `landing/business` directo.
    - Se añadió `useEffect` para actualizar `document.documentElement.lang = language` (líneas 49–51).
    - En `estado === 'no_existe'` (líneas 145–154), debajo de `notFoundTitle` y `notFoundBody`, se muestran `strings.service.notFoundAskAgain` y `<ContactPhones phones={publicShopPhones()} s={strings} whatsappMessage="" />`.
- **Prueba que lo fija:**
  - `src/portal/ServicePage.test.tsx` (líneas 166–194): prueba de `estado: 'no_existe'` verificando el texto nuevo, al menos un enlace `tel:` y ausencia de nombres de personas; y prueba de `estado: 'ok'` comprobando `document.documentElement.lang` en `es` y `en`.

---

## Notas y dudas
- **Archivos tocados:** únicamente los 7 indicados en la orden (`src/lib/workOrderPdf.ts`, `src/lib/workOrderPdf.test.ts`, `supabase/functions/_shared/email/templates.ts`, `src/lib/emailTemplates.test.ts`, `src/portal/ServicePage.tsx`, `src/portal/ServicePage.test.tsx`, `src/portal/strings.ts`) más este informe (`docs/ordenes/q4-hydrogen-informe.md`).
- **Pendiente de verificación:** por restricción de la tarea no se ejecutaron `npm run lint`, `npx tsc -b` ni `npm test` / `npm run test:functions`.
- **Detalle menor en `shortVehicle` (T-06):** al recortar a 40 caracteres se usa `vehicle.slice(0, 39).trimEnd() + '…'` para evitar un espacio antes de la elipsis manteniendo el largo en `<= 40` caracteres.
