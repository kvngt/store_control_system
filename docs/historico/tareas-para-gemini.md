# Tareas para Gemini: teléfonos de la sede, oficina o celular, y WhatsApp por teléfono

> Arquitecto: Claude Code (10/10/2026). Implementa: Gemini. Si algo de aquí no se puede hacer
> como está escrito, **detente y dilo en la bitácora**; no improvises otro diseño.

## 0. Antes de empezar (obligatorio)

1. Lee `AGENTS.md`, `docs/ai-context.md` y la entrada "10/10/2026 — Claude Code (auditoría de los
   teléfonos por sede de Gemini)" de la bitácora en `docs/historico/plan-mejoras-2026-10.md`:
   explica por qué el código actual es como es.
2. `git status` (debe estar limpio) y `npm run db:check` (producción tiene hasta la `025`).
3. Reglas de este trabajo. Romper una es un error, aunque las pruebas pasen:
   - **Migración nueva** `supabase/migrations/20261010000026_telefonos_tipo_y_whatsapp.sql`.
     **No edites la `025`**: ya está aplicada en producción.
   - Antes de reescribir `_telefonos_sede`, `npm run db:donde -- _telefonos_sede` y parte de esa
     versión. **No reemitas `datos_portal` ni `datos_correo`**: ya llaman al helper.
   - **Ningún número del taller dentro de la migración ni del código.** Se capturan en
     Configuración (paso 6).
   - **No borres la columna `sedes.whatsapp`** (expandir y contraer, `docs/mantenimiento.md` §4):
     queda como respaldo heredado, igual que `sedes.telefono`.
   - Todo texto visible pasa por i18n, en español **e** inglés (`src/i18n/translations.ts`; en el
     portal, `src/portal/strings.ts`). Colores solo con tokens CSS.
   - Ni commit, ni `supabase db push`, ni `functions deploy`, ni push a `main`.
   - En la bitácora pones **lo que de verdad corriste**, con sus números. Si algo no se pudo
     correr (por ejemplo `test:db` sin Docker), escríbelo así.

## 1. Lo que pide el taller

- Al agregar un teléfono: elegir **Oficina** o **Celular** y marcar si **atiende WhatsApp**.
- Quitar el campo "WhatsApp del taller" de la tarjeta de la sede en Configuración.
- El cliente ve cada teléfono con su descripción, un botón para llamar y, si atiende WhatsApp,
  un botón de WhatsApp para **ese** número.

## 2. Diseño (decidido; no lo cambies)

- Cada elemento de `sedes.telefonos`:
  `{ "label": string, "numero": string, "tipo": "oficina" | "celular", "whatsapp": boolean }`.
- Fila nueva por defecto: `tipo: 'celular'`, `whatsapp: false`. WhatsApp se puede marcar en
  cualquier tipo. Un dato viejo sin `tipo` se lee como `oficina` y sin `whatsapp` como `false`.
- Para marcar WhatsApp, el número necesita su código de área: 10 dígitos o más, o empezar con
  "+" y tener 8 o más (`wa.me` falla sin país).
- Respaldo heredado, que escribe **solo** `sedesService`: `sedes.telefono` = el primer número de
  la lista (como hoy) y `sedes.whatsapp` = el primer número con WhatsApp, o `null`.
- Enlace del cliente: cada fila lleva un ícono por tipo (`Building2` oficina, `Smartphone`
  celular), la descripción (o, sin descripción, el tipo traducido), el número, el botón
  **Llamar** (`tel:`) y, si `whatsapp`, el botón **WhatsApp** (`wa.me` con el mensaje de la
  orden). Con lista, desaparece el botón suelto de WhatsApp; sin lista, todo queda como hoy.
- PDF y pie de los correos: `Descripción: número (WhatsApp)` (el sufijo solo si atiende
  WhatsApp); sin descripción, el tipo en el idioma del documento.

## 3. Tareas

### T1. Migración `20261010000026_telefonos_tipo_y_whatsapp.sql`

Encabezado en español como el de la `025` (qué pide el taller, que `datos_portal` y
`datos_correo` no cambian porque usan el helper, y que `sedes.whatsapp` queda como respaldo).
Cuerpo, en este orden:

```sql
-- 1. Lo que sale al cliente: ahora con tipo y WhatsApp. Reescrita desde 20261010000025.
CREATE OR REPLACE FUNCTION public._telefonos_sede(p_telefonos JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'label', COALESCE(btrim(e.v->>'label'), ''),
      'numero', btrim(e.v->>'numero'),
      'tipo', CASE WHEN e.v->>'tipo' = 'celular' THEN 'celular' ELSE 'oficina' END,
      'whatsapp', COALESCE(e.v->'whatsapp' = 'true'::jsonb, false)
    ) ORDER BY e.n
  ), '[]'::jsonb)
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_telefonos) = 'array' THEN p_telefonos ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS e(v, n)
  WHERE jsonb_typeof(e.v) = 'object'
    AND NULLIF(btrim(e.v->>'numero'), '') IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public._telefonos_sede(JSONB) FROM PUBLIC, anon, authenticated;

-- 2. Lo guardado pasa a la forma completa (tipo y whatsapp en cada teléfono).
UPDATE public.sedes SET telefonos = public._telefonos_sede(telefonos);

-- 3. El WhatsApp suelto de la sede marca su teléfono en la lista (mismo número: los
--    últimos diez dígitos, así "+1 (240) 355-1266" y "240-355-1266" coinciden)...
UPDATE public.sedes s
SET telefonos = (
  SELECT jsonb_agg(
    CASE
      WHEN right(regexp_replace(e.v->>'numero', '\D', '', 'g'), 10)
         = right(regexp_replace(s.whatsapp, '\D', '', 'g'), 10)
      THEN e.v || jsonb_build_object('tipo', 'celular', 'whatsapp', true)
      ELSE e.v
    END ORDER BY e.n)
  FROM jsonb_array_elements(s.telefonos) WITH ORDINALITY AS e(v, n)
)
WHERE length(regexp_replace(COALESCE(s.whatsapp, ''), '\D', '', 'g')) >= 7
  AND jsonb_array_length(s.telefonos) > 0;

-- 4. ...y si no estaba en la lista, entra al final como celular con WhatsApp, sin descripción.
UPDATE public.sedes s
SET telefonos = s.telefonos || jsonb_build_array(jsonb_build_object(
  'label', '', 'numero', btrim(s.whatsapp), 'tipo', 'celular', 'whatsapp', true))
WHERE length(regexp_replace(COALESCE(s.whatsapp, ''), '\D', '', 'g')) >= 7
  AND NOT s.telefonos @> '[{"whatsapp": true}]'::jsonb;
```

No agregues GRANT: el helper solo lo llaman funciones `SECURITY DEFINER`. SEC-141 en
`scripts/qa/api-security.mjs` ya cubre el helper; no hace falta otro caso.

### T2. pgTAP

- `supabase/tests/database/04_portal_y_correos.test.sql`: el `UPDATE sedes SET telefonos = …`
  de la prueba agrega `"tipo": "celular", "whatsapp": true` al primer teléfono. La aserción que
  compara `d->'taller'->'telefonos'` espera ahora
  `[{"label":"English","numero":"240-355-1266","tipo":"celular","whatsapp":true},
  {"label":"","numero":"+1 (301) 909-9937","tipo":"oficina","whatsapp":false}]`.
  `plan(31)` no cambia.
- Nuevo `supabase/tests/database/31_telefonos_tipo_y_whatsapp.test.sql` (estructura igual a la
  04: `BEGIN; SELECT plan(n); … SELECT * FROM finish(); ROLLBACK;`):
  - `_telefonos_sede`: conserva `celular` y `whatsapp: true`; sin `tipo` → `oficina`; `tipo:
    "fax"` → `oficina`; `whatsapp: "si"` (texto) → `false`; sin `whatsapp` → `false`; una llave
    extra no sale.
  - Repite **literalmente** los pasos 2 a 4 de la migración (con un comentario: "copia de la
    026; si cambias una, cambia la otra") sobre dos sedes de prueba:
    - Sede A, `telefonos = [{"label":"English","numero":"240-355-1266"},{"label":"Office","numero":"301-909-9937"}]`
      y `whatsapp = '+1 (240) 355-1266'` → English queda `celular` + `whatsapp: true`; Office
      queda `oficina` + `false`; no se agrega nada.
    - Sede B, `telefonos = [{"numero":"301-909-9937"}]` y `whatsapp = '202-607-6126'` → se
      agrega al final `{"label":"","numero":"202-607-6126","tipo":"celular","whatsapp":true}`.
    - Sede C, sin `whatsapp`: solo se normaliza (`tipo`/`whatsapp` por defecto).

### T3. Tipos

- `src/types/domain/auth.types.ts`: `export type SedeTelefonoTipo = 'oficina' | 'celular';`.
  `SedeTelefono` pasa a `{ label: string; numero: string; tipo: SedeTelefonoTipo; whatsapp:
  boolean }`. Exporta `SedeTelefonoTipo` desde `src/types/database.ts`. El comentario de
  `Sede.whatsapp` dice ahora: respaldo heredado, el primer teléfono con WhatsApp; lo escribe solo
  `sedesService`.
- `src/portal/portal.types.ts`: `PortalPhoneContact` suma `tipo?: 'oficina' | 'celular'` y
  `whatsapp?: boolean` (opcionales: el portal no debe romperse con una respuesta vieja).

### T4. Servicio `src/services/sedes.service.ts` (+ `sedes.service.test.ts`)

- Junto a `primaryPhone`, agrega `primaryWhatsApp(telefonos)`: el primer `numero` (recortado)
  con `whatsapp: true`, o `null`.
- `createSede(input: Omit<Sede, 'id' | 'fecha_creacion' | 'telefono' | 'whatsapp'>)`: el payload
  lleva `telefono` y `whatsapp` calculados de la lista.
- `updateSede`: saca `'whatsapp'` de la lista del `Pick`. Si viene `telefonos`, calcula los dos.
- Pruebas: los dos campos se calculan al crear y al editar; sin WhatsApp en la lista,
  `whatsapp: null`; sin `telefonos` en el update no se tocan.

### T5. `src/lib/phone.ts` (+ `phone.test.ts`)

```ts
/**
 * Un teléfono de la sede en una línea, para el PDF y Configuración: "Spanish: 202-607-6126
 * (WhatsApp)". Sin descripción va `fallbackLabel` (el tipo, en el idioma de quien lo lee).
 */
export function sedePhoneLine(
  p: { label?: string | null; numero: string; whatsapp?: boolean },
  fallbackLabel: string
): string
```

Pruebas: con descripción, sin descripción, con y sin WhatsApp.

### T6. Configuración

- `src/features/settings/sedePhones.ts` (+ `sedePhones.test.ts`):
  - `EMPTY_PHONE = { label: '', numero: '', tipo: 'celular', whatsapp: false }`.
  - `normalizeSedePhone(p: Partial<SedeTelefono>)`: completa `tipo` (`'celular'` solo si así
    viene; si no, `'oficina'`) y `whatsapp` (`=== true`). Se usa al leer de la base.
  - `cleanSedePhones` conserva `tipo` y `whatsapp` y agrega el error
    `'settings.phoneWhatsappInvalid'` cuando `whatsapp` es `true` y el número no cumple la regla
    del §2 (10+ dígitos, o "+" y 8+). Orden de los errores: falta número → no se puede marcar →
    WhatsApp inválido.
- `src/features/settings/SedePhonesEditor.tsx`: cada teléfono en un bloque con borde
  (`var(--color-surface-border)`) que se acomoda en dos renglones con `flex-wrap`:
  1. `<select className="form-select">` de tipo (Celular / Oficina, `aria-label`
     `settings.phoneType`) y la descripción (`flex: 1`).
  2. El número (`type="tel"`, `flex: 1`), un `<label>` con checkbox + ícono `MessageCircle` +
     `settings.phoneWhatsapp`, y el botón borrar (el actual).
  El ícono del tipo (`Building2` / `Smartphone`) puede ir antes del select. Sin estilos
  nuevos con colores literales; `inputs` con `form-input` (ya son de 16 px en el teléfono).
- `src/pages/Settings.tsx`:
  - Quita el campo WhatsApp de la tarjeta: el `input`, `whatsapp` del tipo y del sembrado de
    `brandDrafts`, y `whatsapp` del `updateSede` de `handleSaveBranding`. Quita el import de
    `MessageCircle` si queda sin uso.
  - `seedBrandDrafts`: los teléfonos pasan por `normalizeSedePhone`; el respaldo desde
    `s.telefono` nace `{ label: '', numero, tipo: 'oficina', whatsapp: false }`.
  - El resumen de teléfonos del encabezado de la tarjeta usa `sedePhoneLine` con el tipo traducido.
- `src/i18n/translations.ts` (es / en):
  - Nuevas: `settings.phoneType` (Tipo / Type), `settings.phoneTypeOffice` (Oficina / Office),
    `settings.phoneTypeMobile` (Celular / Mobile), `settings.phoneWhatsapp` (Atiende WhatsApp /
    Answers WhatsApp), `settings.phoneWhatsappInvalid` ("Para WhatsApp, el número necesita su
    código de área (10 dígitos) o su país con +." / "For WhatsApp, the number needs its area code
    (10 digits) or its country with +.").
  - `settings.phonesHint`: "El cliente los ve en su enlace, con botón para llamar y, si atiende
    WhatsApp, para escribirle; también en el PDF y en los correos, en este orden." / "Customers
    see them on their link, with a button to call and, if it answers WhatsApp, to message it;
    also on the PDF and the emails, in this order."
  - **Borra** `settings.whatsapp` en los dos idiomas, solo después de comprobar con una búsqueda
    que nadie más la usa.

### T7. Enlace del cliente (`src/portal/`)

- `strings.ts`: `phoneOffice` (Oficina / Office) y `phoneMobile` (Celular / Mobile).
- `CustomerPortal.tsx`, componente `ContactPhones({ phones, s, whatsappMessage })`:
  - Cada `li.portal-contact-phone` ya **no** es un enlace. Lleva:
    - la info: el ícono del tipo, la descripción o el tipo traducido, y el número;
    - `span.portal-contact-phone-actions` con:
      - `<a className="btn btn-secondary">` a `telUrl(numero)`, `aria-label` = `` `${s.call}: ${nombre}, ${numero}` ``;
      - si `whatsapp`, `<a className="btn btn-primary">` a `whatsAppUrl(numero, whatsappMessage)`
        con `target="_blank" rel="noopener noreferrer"` y `aria-label` =
        `` `${s.whatsapp}: ${nombre}, ${numero}` ``.
  - `tipo` ausente cuenta como `oficina` y `whatsapp` ausente como `false`.
  - En `Report`: `whatsappMessage = s.whatsappMessage.replace('{numero}', orden.numero)`. El botón
    suelto de WhatsApp de `.portal-actions` sale **solo si `phones.length === 0`** (como el de
    llamar).
  - En `Unavailable`: `whatsappMessage = ''`.
- `portal.css`: la fila es un contenedor con `flex-wrap` (info a la izquierda, acciones a la
  derecha; en un teléfono angosto las acciones bajan). Los botones de acciones tienen
  `min-height: 44px`. Borra las reglas que suponían que la fila era un enlace
  (`a.portal-contact-phone:hover`, `a.portal-contact-phone:focus-visible`,
  `.portal-contact-phone-call`).
- `CustomerPortal.test.tsx`, bloque "teléfonos de la sede": usa los datos de la tarjeta (Spanish
  celular + WhatsApp, English celular + WhatsApp, Office oficina sin WhatsApp). Prueba:
  - tres enlaces "Llamar" con sus `tel:`;
  - exactamente dos de WhatsApp, a `https://wa.me/12026076126?text=…` y
    `https://wa.me/12403551266?text=…`, con el número de la orden en el texto;
  - ninguno al WhatsApp suelto del fixture (`wa.me/15125550199`);
  - un teléfono sin descripción muestra "Celular";
  - el enlace vencido muestra los mismos botones;
  - la prueba de lista que no es un arreglo (respaldo) sigue pasando sin cambios.

### T8. Correos

- `supabase/functions/_shared/email/templates.ts`:
  - el tipo de `taller.telefonos` suma `tipo?` y `whatsapp?`;
  - `CHROME` suma `office` / `mobile` por idioma;
  - `shopPhones(taller, chrome)` arma `` `${nombre}: ${numero}${whatsapp ? ' (WhatsApp)' : ''}` ``,
    con `nombre` = la descripción o el tipo traducido.
- `supabase/functions/process-outbox/index.ts`: el tipo `EmailData.taller.telefonos` suma los
  dos campos (el valor ya se pasa).
- `src/lib/emailTemplates.test.ts`: el pie lleva "Spanish: 202-607-6126 (WhatsApp)" y, en
  inglés, un teléfono sin descripción sale como "Mobile: …"; el escape de la descripción sigue
  probado.

### T9. PDF `src/lib/workOrderPdf.ts` (+ `workOrderPdf.test.ts`)

- `STRINGS.es/en` suman `phoneOffice` / `phoneMobile`.
- La línea de teléfonos usa `sedePhoneLine(p, tipo traducido)` unida con `'  ·  '`, y pasa por
  `doc.splitTextToSize(texto, pageWidth - MARGIN - headerX)` para que tres teléfonos con
  "(WhatsApp)" no se salgan de la hoja. `textBottom` crece con el número total de renglones (la
  fórmula de hoy ya usa `contactLines.length`).
- Pruebas: el encabezado lleva "Spanish: 202-607-6126 (WhatsApp)" y el de oficina sin sufijo;
  sin lista, el `telefono` de siempre (la prueba que ya existe).

### T10. Documentación y bitácora

- `docs/portal-y-correos.md` (párrafo de `sedes.telefonos`): `tipo` y `whatsapp`, un botón de
  WhatsApp por teléfono, y `sedes.whatsapp` como respaldo heredado (= primer teléfono con
  WhatsApp; lo escribe solo `sedesService`; se borra en una migración que contraiga, cuando
  nadie lo lea).
- `docs/supabase.md`: la fila de `sedes` (el WhatsApp ahora va dentro de los teléfonos).
- `docs/historico/plan-mejoras-2026-10.md`: tu entrada arriba de todo en la bitácora (pedido,
  qué hiciste, verificación con números reales, qué falta, orden de publicación del §5) y la
  fila "Teléfonos (2)" de la tabla de Estado en "Hecho, sin publicar".

## 4. Verificación (todo, en este orden)

```bash
npm run lint && npx tsc -b && npm test && npm run build
npx supabase start && npm run test:db      # necesita Docker
```

A mano, con la app local (`npm run dev` contra `npx supabase start`):

1. En Configuración, en una sede, agrega los tres teléfonos de la tarjeta (§6) y guarda. Recarga:
   se ven igual.
2. Marca WhatsApp en un número de 7 dígitos: debe avisar `phoneWhatsappInvalid` y no guardar.
3. Abre el enlace de una orden de esa sede: tres "Llamar", dos "WhatsApp" que abren `wa.me` con
   el número de la orden y ningún botón suelto de WhatsApp.
4. Descarga el PDF y revisa el encabezado.
5. Crea una sede nueva con un teléfono de oficina.

Criterios de aceptación:

- La tarjeta de la sede ya no tiene el campo "WhatsApp del taller".
- `sedes.whatsapp` = el primer teléfono con WhatsApp, después de guardar.
- `test:db` pasa con la 04 y la 31.
- Las 763+ pruebas de Vitest pasan.

## 5. Publicación (NO la haces tú; déjala escrita en la bitácora)

1. `npm run test:db`.
2. `db push` de la `026`.
3. `functions deploy process-outbox` (el pie de los correos).
4. Push a `main`, **enseguida** del `db push`: la app que hoy está publicada guarda los teléfonos
   sin `tipo` ni `whatsapp`, así que si alguien guarda una sede entre los dos pasos, se pierden
   las marcas.
5. `npm run qa:security`.

## 6. Después de publicar (lo hace el admin en Configuración)

Dejar la sede Restorify como en su tarjeta, en este orden:

| Descripción | Número | Tipo | WhatsApp |
|---|---|---|---|
| Spanish | 202-607-6126 | Celular | Sí |
| English | 240-355-1266 | Celular | Sí |
| Office | 301-909-9937 | Oficina | No |

La migración marca solo el número que coincida con el WhatsApp suelto de la sede; los demás
quedan como oficina sin WhatsApp hasta que el admin los corrija.
