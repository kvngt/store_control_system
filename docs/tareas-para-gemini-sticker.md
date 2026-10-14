# Tareas para Gemini: sticker de próximo servicio con QR (Brother QL-810W, rollo DK-4205 de 62 mm)

> Arquitecto: Claude Code (14/10/2026). Implementa: Gemini. Parte de un prompt del taller, revisado
> contra el código; lo que cambió y por qué está en el §2. Si algo de aquí no se puede hacer como
> está escrito, **detente y dilo en la bitácora**; no improvises otro diseño.

## 0. Antes de empezar (obligatorio)

1. Lee `AGENTS.md`, `docs/ai-context.md` y `docs/mapa-de-secciones.md`. Para cada función SQL que
   reescribas, `npm run db:donde -- <nombre>` y parte de **esa** versión.
2. `git status` (debe estar limpio) y `npm run db:check`.
3. Reglas de este trabajo. Romper una es un error aunque las pruebas pasen:
   - **Una migración nueva**: `supabase/migrations/20261010000029_proximo_servicio.sql`. No edites
     ninguna aplicada.
   - Toda función nueva en `public`: `SECURITY DEFINER`, `SET search_path = public`,
     `REVOKE ALL ... FROM PUBLIC, anon, authenticated` y `GRANT` solo a quien la usa. Verifica el
     rol **dentro** de la función.
   - Los nombres de verdad: la URL pública es `getPublicSiteUrl()` (`src/lib/siteUrl.ts`). El
     nombre del taller sale de la sede de la orden (`orderSede.nombre`), no de `branding.ts`, que
     solo maneja colores. Los estados de una orden son `recepcion`, `en_proceso`,
     `espera_autorizacion`, `finalizado` y `entregado` (no existe "completado"). Las millas son
     `ordenes_trabajo.millas_ingreso`.
   - **No toques** `entregar_orden` ni `DeliveryModal`: entregar es dinero, y esto no lo es.
   - **No hay que subir la versión del esquema a mano**: el build la toma de la carpeta de
     migraciones (`src/lib/schemaVersion.ts`).
   - Todo texto visible en español **e** inglés: la app en `src/i18n/translations.ts`, el portal en
     `src/portal/strings.ts`, el PDF en su propio `STRINGS` (como `lib/workOrderPdf.ts`). Colores
     solo con tokens. Fechas sin `new Date('AAAA-MM-DD')`: es medianoche UTC y en Maryland cae el
     día anterior.
   - Ni commit, ni `supabase db push`, ni `functions deploy`, ni push a `main`.
   - En la bitácora pones **lo que de verdad corriste**, con sus números.

## 1. Lo que pide el taller

- Al entregar (o cuando haga falta), imprimir un **sticker removible** de 62 × 50 mm para el
  parabrisas o el marco de la puerta, con el próximo servicio recomendado:
  - mantenimiento por **millas y fecha** (aceite, frenos);
  - revisión de pintura o garantía **solo por fecha** (por ejemplo, a los 30 días).
- El sticker lleva un **QR**. Al escanearlo, el cliente ve su próximo servicio y botones para
  **agendar por WhatsApp** o **llamar** al taller.
- **Solo administración** programa el próximo servicio e imprime el sticker. El **técnico
  asignado puede sugerirlo**, y administración lo acepta (tal cual o corregido) o lo descarta.
- Se imprime desde **Windows y desde iPhone/iPad** con una Brother QL-810W y rollo continuo
  DK-4205 de 62 mm.

## 2. Diseño (decidido con el usuario; no lo cambies)

### Por qué no se usa el enlace del cliente (`/r/<token>`)

El prompt original apuntaba el QR al enlace del cliente, pero ese enlace:
- **vence 90 días después de entregar** (`orden_enlaces.expira_en`), así que un sticker de aceite a
  6 meses llevaría un QR muerto;
- **muestra el reporte completo**: nombre del cliente, placa, montos y fotos. Un sticker en el
  parabrisas lo puede escanear cualquiera en un estacionamiento.

Por eso el QR lleva a una **página de servicio propia**, `/s/<código>`. Muestra solo:
- el taller (nombre, logo, color y teléfonos con botón de llamar y de WhatsApp);
- el vehículo (año, marca, modelo y color; **sin placa ni VIN**);
- el próximo servicio (fecha, millas y nota) con su semáforo.

No muestra ni el nombre del cliente, ni montos, ni fotos, ni el número de orden. **El código no
vence** mientras la orden tenga próximo servicio; si administración lo quita, el código deja de
funcionar.

### Datos

Una tabla hija de la orden, `orden_proximo_servicio` (1:1), en vez de columnas en
`ordenes_trabajo`: así no se toca el guardia del técnico ni sus 24 triggers, y nadie la escribe por
la API (solo las funciones de abajo).

```sql
CREATE TABLE public.orden_proximo_servicio (
  orden_id        UUID PRIMARY KEY REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  sede_id         UUID NOT NULL REFERENCES public.sedes(id) ON DELETE CASCADE,
  -- Lo que programó administración (lo que va en el sticker y en la página /s/).
  fecha           DATE,
  millas          INTEGER CHECK (millas IS NULL OR millas >= 0),
  nota            TEXT CHECK (nota IS NULL OR char_length(nota) <= 120),
  token           TEXT UNIQUE CHECK (token IS NULL OR token ~ '^[0-9a-f]{64}$'),
  programado_por  UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  programado_en   TIMESTAMPTZ,
  -- La sugerencia del técnico, mientras administración no la acepta ni la descarta.
  sugerido_fecha  DATE,
  sugerido_millas INTEGER CHECK (sugerido_millas IS NULL OR sugerido_millas >= 0),
  sugerido_nota   TEXT CHECK (sugerido_nota IS NULL OR char_length(sugerido_nota) <= 120),
  sugerido_por    UUID REFERENCES public.perfiles(id) ON DELETE SET NULL,
  sugerido_en     TIMESTAMPTZ,
  -- Programado = tiene fecha o millas, y entonces tiene código.
  CONSTRAINT proximo_servicio_programado CHECK ((fecha IS NULL AND millas IS NULL) = (token IS NULL))
);
```

- **RLS:** `SELECT` para `is_admin()` **o** `orden_id = ANY ((SELECT mis_ordenes_asignadas())::uuid[])`
  (la misma condición que las demás hijas de la orden). Sin políticas de `INSERT`, `UPDATE` ni
  `DELETE`. `REVOKE ALL ON TABLE ... FROM anon` y `GRANT SELECT ... TO authenticated`.
- **El código** se genera como el del enlace del cliente: 64 hexadecimales de dos
  `gen_random_uuid()` (ver `20260923000000_customer_portal_and_emails.sql`).
- **Tiempo real:** agrégala a la publicación `supabase_realtime` y a `ORDER_TABLES`
  (`workOrders.service.ts`), para que administración vea al momento la sugerencia del técnico.

### Funciones (todas `SECURITY DEFINER`, `search_path = public`, revocadas y concedidas a `authenticated`, salvo `datos_servicio`)

| Función | Quién | Qué hace |
|---|---|---|
| `sugerir_proximo_servicio(p_orden_id UUID, p_fecha DATE, p_millas INTEGER, p_nota TEXT)` | Técnico **asignado**, orden **no entregada** | Guarda la sugerencia (`sugerido_*`, quién y cuándo), creando la fila si no existe, y avisa a administración (`notificar`, tipo `proximo_servicio_sugerido`, a los admins de la sede). Un admin que la llama recibe 42501: él programa directo |
| `programar_proximo_servicio(p_orden_id UUID, p_fecha DATE, p_millas INTEGER, p_nota TEXT)` | Solo admin, **cualquier estado** (también entregada o archivada, para reimprimir) | Guarda fecha, millas y nota; pone el código si no tenía (lo conserva si ya tenía, para que un sticker impreso siga sirviendo) y borra la sugerencia pendiente. Devuelve la fila |
| `quitar_proximo_servicio(p_orden_id UUID)` | Solo admin | Borra fecha, millas, nota **y código** (el QR impreso deja de funcionar) |
| `descartar_sugerencia_proximo_servicio(p_orden_id UUID)` | Solo admin | Borra `sugerido_*` |
| `datos_servicio(p_token TEXT)` | **Solo `service_role`** (la llama la edge function `portal`) | JSON mínimo; ver abajo |

Validaciones (en las tres que escriben; mensajes en español para el taller, `ERRCODE = '22023'`):
- al menos fecha **o** millas;
- la fecha no puede ser anterior a `hoy_taller(sede)`;
- las millas no pueden ser menores que `millas_ingreso` de la orden (si la orden las tiene);
- la nota se recorta y no pasa de 120 caracteres.

`datos_servicio(p_token)` devuelve exactamente esto (arma cada campo a mano, **nunca `to_jsonb(fila)`**):

```json
{ "estado": "ok",
  "taller": { "nombre": "...", "logo_url": "...", "color": "...", "telefonos": [/* _telefonos_sede(...) */] },
  "vehiculo": { "anio": 2019, "marca": "Toyota", "modelo": "Camry", "color": "Gris" },
  "servicio": { "fecha": "2027-04-14", "millas": 66250, "nota": "Aceite sintético 5W-30" },
  "idioma": "en" }
```

- Con un código que no existe (o que se quitó): `{ "estado": "no_existe" }`.
- `idioma` es `clientes.idioma` del dueño, que solo sirve para el idioma inicial de la página.

### Otras funciones que se reescriben (parte de la versión vigente, `npm run db:donde`)

- **`datos_portal`**: agrega `proximo_servicio` al JSON del enlace del cliente (`{fecha, millas,
  nota}` o `null`), solo con lo programado, para que el reporte también lo muestre mientras el
  enlace siga vivo.
- **`requiere_atencion`** (vigente en `20261010000022`): agrega el grupo `sugerencias_servicio`
  (órdenes con `sugerido_en` no nulo), con sus órdenes, como los demás grupos.
- **Historial**: suma `orden_proximo_servicio` a `trg_historial` (su lista de columnas: `fecha`,
  `millas`, `nota`, `sugerido_fecha`, `sugerido_millas`, `sugerido_nota`) con su `CREATE TRIGGER`,
  y su etiqueta en `features/workOrders/historyFormat.ts`.

### Pantallas

- **En la orden**, una tarjeta plegable nueva, «Próximo servicio» (`CollapsibleSection`, id
  `proximo_servicio` en `TAB_SECTIONS`):
  - **administración**, pestaña `cobro`: lo programado, la sugerencia del técnico si la hay (con
    **Usar sugerencia** y **Descartar**) y los botones **Editar / imprimir sticker** y **Quitar**;
  - **técnico**, pestaña `orden`: lo programado (solo lectura) y **Sugerir próximo servicio**
    mientras la orden no esté entregada.
- **Acciones rápidas** (`QuickActions`): administración, **Sticker de servicio**; técnico, **Sugerir
  próximo servicio** (orden no entregada).
- **Diálogo** `ServiceStickerModal` (un solo componente con modo `admin` o `tecnico`):
  - cuatro presets de un toque, calculados desde `millas_ingreso` y la fecha del taller:
    1. Aceite sintético: +5,000 mi y +6 meses;
    2. Aceite convencional: +3,000 mi y +3 meses;
    3. Revisión general: +5,000 mi y +6 meses;
    4. Revisión de pintura / garantía: +30 días, sin millas;
  - campos: fecha (`type="date"`), millas (opcional) y nota (máximo 120);
  - en modo admin: idioma del sticker (ES / EN, **por defecto el idioma del cliente**,
    `clientes.idioma`) y los botones **Guardar** y **Guardar e imprimir**;
  - en modo técnico: **Enviar sugerencia**.
- **Página pública `/s/<código>`** (paquete del portal, sin `lib/supabase` ni la app): taller,
  vehículo y el próximo servicio con su semáforo:
  - **Al día**: verde, faltan más de 14 días;
  - **Pronto**: ámbar, faltan 14 días o menos;
  - **Vencido**: rojo, la fecha ya pasó;
  - sin fecha, solo millas: sin semáforo, solo «a las N millas».

  Debajo, un botón principal **Agendar por WhatsApp**: el primer teléfono de la sede con
  `whatsapp: true`, con un mensaje escrito en el idioma de la página que nombra el vehículo y el
  servicio. Después, **Llamar** por cada teléfono. Un selector ES/EN cambia el idioma **solo en
  pantalla** (no escribe nada en la base).
- **Enlace del cliente (`/r/`)**: si `proximo_servicio` viene, una tarjeta «Próximo servicio
  recomendado» con la fecha, las millas y la nota.
- **Lo que se quitó del prompt original:**
  - la sección en el diálogo de entrega (ya está cargado y es dinero);
  - el aviso por palabras clave en la mano de obra (ruido para poco valor);
  - cambiar la edge function para agregar datos (el JSON lo arma la base).

### El sticker (PDF de 62 × 50 mm)

- `new jsPDF({ unit: 'mm', format: [62, 50], orientation: 'landscape' })`: 62 de ancho, 50 de alto.
  Márgenes de 3 mm (el área imprimible del rollo de 62 mm es de unos 58 mm). Solo negro sobre
  blanco y texto de 6 pt como mínimo.
- **El QR se dibuja en vectores**, con la librería `qrcode` (`QRCode.create(url, {
  errorCorrectionLevel: 'M' })`): cada módulo es un `doc.rect` relleno, con zona de silencio de 2
  módulos. Sin canvas ni imagen, así sale nítido en la térmica y funciona en las pruebas. El QR
  mide 20 × 20 mm y codifica `${getPublicSiteUrl()}/s/<código>`.
- **Composición:**
  - **arriba**: el nombre del taller (`orderSede.nombre`), en negrita, y su primer teléfono;
  - **línea divisoria**;
  - **columna izquierda** (de 3 a 37 mm): «PRÓXIMO SERVICIO» / «NEXT SERVICE»; la fecha (si la
    hay), con el mes en letras («14 abr 2027» / «Apr 14, 2027»); las millas (si las hay) como
    «66,250 mi»; y la nota en 2 renglones como máximo;
  - **columna derecha** (de 38 a 59 mm): el QR y debajo, a 6 pt, «Escanea para agendar» / «Scan to
    book»;
  - **pie**: año, marca, modelo y placa (es el carro del cliente) y el número de orden.
- **Imprimir**: abre la ventana **dentro del clic** (`window.open('', '_blank')`, antes de generar,
  o el navegador la bloquea), genera el PDF y pon su `blob:` en esa ventana. Desde ahí se imprime
  (Windows) o se comparte → Imprimir (iPhone, AirPrint). Si la ventana no se abrió, descarga el PDF
  (`doc.save`).

## 3. Tareas

### T1. Migración `20261010000029_proximo_servicio.sql`

Encabezado en español (qué pide el taller, por qué una página propia y no el enlace del cliente, y
qué funciones se reescriben). En orden:
1. la tabla, su RLS y sus permisos;
2. la publicación de tiempo real;
3. las cinco funciones nuevas;
4. `datos_portal`, `requiere_atencion` y `trg_historial`, reescritas enteras desde su versión
   vigente, más el trigger del historial en la tabla nueva.

Si `notificar` filtra los tipos que acepta, agrégale `proximo_servicio_sugerido` (revisa su versión
vigente). **Sin correo**: no lo sumes al `v_grupo`.

### T2. pgTAP: `supabase/tests/database/34_proximo_servicio.test.sql`

Con la estructura de las demás (`BEGIN; SELECT plan(n); … finish(); ROLLBACK;`):
- **el técnico asignado sugiere** en una orden en proceso; uno no asignado recibe cero filas o
  42501; en una orden entregada, 42501;
- **el técnico no programa, ni quita, ni descarta** (42501), ni escribe la tabla directo;
- **el admin programa**:
  - se crea el código;
  - la sugerencia se borra;
  - reprogramar conserva el código;
  - programar una orden entregada funciona;
- **validaciones**: sin fecha ni millas, fecha pasada, millas menores que las de ingreso y nota de
  más de 120 caracteres;
- **quitar** borra el código, y entonces `datos_servicio` devuelve `no_existe`;
- **`datos_servicio`**:
  - devuelve el taller, el vehículo y el servicio;
  - **no** trae `cliente`, `placa`, `vin`, montos ni número de orden: compara las llaves de cada
    objeto;
  - `anon` y `authenticated` no la pueden llamar;
- **`datos_portal`** trae `proximo_servicio`;
- **`requiere_atencion`** cuenta la sugerencia;
- **RLS**: el técnico lee la fila de su orden y no la de otra;
- **tiempo real**: si `15_tiempo_real.test.sql` lista las tablas publicadas, súmala.

### T3. Tipos y servicio

- Tipos en `src/types/domain/nextService.types.ts` (la fila y el JSON de `datos_servicio`),
  exportados desde `src/types/database.ts`.
- `src/services/nextService.service.ts`: `getNextService(ordenId)` (`maybeSingle`), `suggest`,
  `program`, `remove` y `discardSuggestion`, con los **nombres exactos** de los parámetros de cada
  RPC (`p_orden_id`, `p_fecha`, `p_millas`, `p_nota`). Lo fija `nextService.service.test.ts`, como
  `workOrders.service.test.ts` fija los de `create_work_order`.
- La clave de consulta en `src/lib/queryClient.ts`; tras cada escritura, invalida esa clave y la de
  la orden.

### T4. Lógica pura: `src/features/workOrders/nextService.ts` (+ `nextService.test.ts`)

- `presetsFor(millasIngreso: number | null, hoy: string)`: los cuatro presets con fecha
  `'AAAA-MM-DD'` y millas (o `null`).
- Sumar meses **sin `Date` en UTC**: el 31/01 más 1 mes da el 28/02 o el 29/02.
- `validate({ fecha, millas, nota }, hoy, millasIngreso)`: los mismos errores que la base, como
  claves de i18n.
- `serviceStickerUrl(token)` → `${getPublicSiteUrl()}/s/${token}`.

### T5. Sticker: `src/lib/serviceStickerPdf.ts` (+ `serviceStickerPdf.test.ts`)

- `buildServiceStickerPdf(data, idioma)` devuelve el `jsPDF`.
- `printServiceSticker(data, idioma)` abre la ventana o descarga, como en el §2.
- Agrega `qrcode` y `@types/qrcode` con versión exacta. Carga el módulo de forma diferida, como
  `workOrderPdf`, para que no pese en la app.
- Pruebas:
  - la hoja mide 62 × 50 mm;
  - con fecha y millas, y solo con fecha (pintura): sin millas no sale la palabra «MILLAS»;
  - la URL que va al QR termina en `/s/<token>` (espía `QRCode.create`);
  - textos en los dos idiomas;
  - la fecha `2027-01-01` se escribe como 1 de enero (no 31 de diciembre).

### T6. Pantallas de la orden

- `ServiceStickerModal.tsx` y `NextServiceCard.tsx` en `src/features/workOrders/`. La tarjeta, en
  `TAB_SECTIONS`: `cobro` para administración y `orden` para el técnico.
- Las acciones nuevas en `QuickActions.tsx`, con los permisos del §2.
- Los permisos se derivan en `useWorkOrderDetail.ts` (`canProgramNextService` = admin;
  `canSuggestNextService` = técnico asignado y orden no entregada). Recuerda que esconder un botón
  no es un permiso: la base ya lo impone.
- Prueba de humo (`WorkOrders.smoke.test.tsx` o una propia):
  - el admin ve **Sticker de servicio** y el técnico **Sugerir próximo servicio**;
  - el técnico no ve **Guardar e imprimir**;
  - **Usar sugerencia** llena el formulario.
- Textos en `translations.ts` (es / en), incluido el título del aviso
  `notifications.types.proximo_servicio_sugerido` («Próximo servicio sugerido · {numero_orden}» /
  «Next service suggested · {numero_orden}»).
- El grupo nuevo de «Requiere atención» con su texto, en `features/dashboard/`.

### T7. Página pública `/s/<código>` y enlace del cliente

- `src/portal/path.ts`: el prefijo `/s/` con `isServicePath()` y `serviceTokenFromPath()`. En
  `src/main.tsx`, la ruta `/s/` carga el paquete del portal igual que `/r/`, y `start.tsx` pinta la
  página nueva.
- `src/portal/ServicePage.tsx`:
  - pide `fetchService(token)` en `portal.api.ts` (edge function `portal` con `?servicio=<token>`);
  - muestra la tarjeta con su semáforo (`src/portal/serviceStatus.ts`, función pura con prueba);
  - lleva los botones de WhatsApp y llamar (`telUrl` y `whatsAppUrl` de `lib/phone.ts`) y el
    selector de idioma local;
  - con `no_existe`: un mensaje amable y nada más.
- `supabase/functions/portal/index.ts`: un `GET` con `servicio` llama `datos_servicio`; el resto
  queda igual. Un código mal formado devuelve 404 sin llamar a la base.
- `CustomerPortal.tsx`: la tarjeta «Próximo servicio recomendado» cuando `proximo_servicio` viene.
- Textos en `src/portal/strings.ts` (es / en) y estilos en `portal.css`, con los tokens del portal.
- Pruebas:
  - `ServicePage.test.tsx`:
    - con datos, la tarjeta, el semáforo y el WhatsApp al número que atiende WhatsApp, con el
      mensaje;
    - **en la página no aparece el nombre del cliente ni la placa**;
    - con `no_existe`, el mensaje;
  - `CustomerPortal.test.tsx`: la tarjeta aparece con `proximo_servicio` y no aparece con `null`.

### T8. Seguridad de la API: `scripts/qa/api-security.mjs`

Casos nuevos, con los siguientes números libres:
- anon y técnico **denegados** en `programar_`, `quitar_` y `descartar_sugerencia_proximo_servicio`;
- anon **denegado** en `sugerir_proximo_servicio`;
- **ni un admin** llama `datos_servicio`;
- un técnico lee **0 filas** de `orden_proximo_servicio` de una orden ajena;
- el portal con `?servicio=<código inexistente>` responde 404.

### T9. Manual de usuario y documentación

- **Manual (Ayuda)**, en los dos idiomas y con la misma estructura (lo exige `helpDoc.test.ts`):
  - en «8. Órdenes de trabajo», una subsección «Sticker de próximo servicio» con
    `<!-- rol: admin -->`: presets, imprimir, quitar y cómo configurar la impresora (§6);
  - otra subsección «Sugerir el próximo servicio» con `<!-- rol: tecnico -->`;
  - en «Qué avisos llegan», la fila del aviso nuevo.
- `docs/portal-y-correos.md`: la página `/s/` y el campo nuevo de `datos_portal`.
- `docs/mapa-de-secciones.md`: la sección «Próximo servicio y sticker».
- `docs/reglas-de-negocio.md`: quién programa y quién sugiere, y que el código no vence.
- `docs/bitacora.md`: tu entrada arriba de todo (qué hiciste, verificación con números reales, qué
  falta y el orden de publicación del §5) y la fila de la tabla de Estado.

## 4. Verificación (todo, en este orden)

```bash
npm run lint && npx tsc -b && npm test && npm run build
npx supabase start && npm run test:db      # necesita Docker
```

A mano, con la app local (`npm run dev` contra `npx supabase start`):
1. Como técnico asignado, sugiere un próximo servicio. Como admin, ve el aviso y el grupo nuevo en
   «Requiere atención», y acepta la sugerencia con **Usar sugerencia** → **Guardar e imprimir**.
2. El PDF mide 62 × 50 mm, el QR se lee con la cámara del teléfono y abre `/s/<código>`.
3. En `/s/<código>`: taller, vehículo sin placa, semáforo y WhatsApp con el mensaje. Sin nombre del
   cliente.
4. **Quitar** y volver a abrir `/s/<código>` → mensaje de que ya no existe.
5. El enlace del cliente (`/r/`) muestra la tarjeta del próximo servicio.

Criterios de aceptación:
- todas las pruebas pasan, incluida la 34 de pgTAP;
- ninguna respuesta de `datos_servicio` trae datos del cliente ni montos;
- `entregar_orden` y `DeliveryModal.tsx` sin cambios (`git diff` vacío en los dos).

## 5. Publicación (NO la haces tú; déjala escrita en la bitácora)

1. `npm run test:db`.
2. `db push` de la `029`. Solo agrega (tabla y funciones nuevas, más tres reescritas compatibles),
   así que la app publicada sigue funcionando.
3. `functions deploy portal`: sin esto, `/s/` no carga.
4. Push a `main`.
5. `npm run qa:security`.

**No imprimas stickers para clientes antes del paso 3**: el QR apuntaría a una página que todavía no
existe.

## 6. La impresora (lo hace la persona responsable, antes y después)

**Antes de implementar**, imprime desde los dos equipos la hoja de calibración de 62 × 50 mm. Está
en `Documentos\Restorify - Sticker\calibracion-sticker-62x50.pdf`, fuera del repositorio, y la armó
Claude Code con jsPDF, igual que se armará el sticker. Trae:
- el borde de la hoja;
- el margen de 3 mm, punteado;
- texto de 14, 10, 8 y 6 pt;
- el recuadro de 20 × 20 mm del QR;
- una regla en mm.

Imprímela así:
- **Windows**: driver de Brother QL-810W, papel «62mm» continuo con largo de 50 mm (o un tamaño
  personalizado de 62 × 50), escala **100 % / tamaño real**, sin «ajustar a la página».
- **iPhone / iPad**: abre el PDF → Compartir → Imprimir → la QL-810W. Si AirPrint no ofrece
  62 × 50, prueba la app **Brother iPrint&Label** con el PDF, y anota qué tamaño ofrece.

Anota en la bitácora qué funcionó en cada equipo (tamaño elegido y márgenes que quedaron). Si
AirPrint solo ofrece un largo fijo (por ejemplo 62 × 100), avisa antes de la T5: se ajusta el tamaño
de la hoja.
