# Login y marca por taller, con dominio propio

Propuesta para que cada taller tenga su propio login, su propia dirección y su propia app
instalada, sin un segundo proyecto de Supabase.

> **Estado (30 de septiembre de 2026):** propuesta, pendiente de evaluar. **Nada de esto está
> implementado.** En los ejemplos, `taller2.com` reemplaza al dominio real del segundo taller,
> que todavía no está definido.

---

## Índice

1. [La pregunta y la respuesta corta](#1-la-pregunta-y-la-respuesta-corta)
2. [Lo que se decidió con el cliente](#2-lo-que-se-decidió-con-el-cliente)
3. [Cómo funcionaría](#3-cómo-funcionaría)
4. [Cambios por área](#4-cambios-por-área)
5. [Pruebas](#5-pruebas)
6. [Documentación que habría que actualizar](#6-documentación-que-habría-que-actualizar)
7. [Despliegue y configuración externa](#7-despliegue-y-configuración-externa)
8. [Verificación](#8-verificación)
9. [Limitaciones](#9-limitaciones)
10. [Alternativas descartadas](#10-alternativas-descartadas)
11. [Estimación](#11-estimación)
12. [Preguntas abiertas](#12-preguntas-abiertas)

---

## 1. La pregunta y la respuesta corta

El cliente quiere un login distinto para cada taller. Por ahora son dos y el principal es
Restorify. La duda era que, aunque el segundo taller tuviera su propia página, todo "termina
en restorifyauto.net", y que la única salida sería un segundo proyecto de Supabase.

**No hace falta un segundo proyecto.** El login en sí no lleva a ningún lado: después de entrar,
la app se queda en el dominio por el que se entró (`Login.tsx:35` hace `navigate('/')` en el mismo
dominio) y la sesión se guarda aparte en cada dominio. Lo que hoy apunta fijo a restorifyauto.net
son tres cosas, y las tres se pueden hacer por taller:

1. **El enlace de "¿Olvidaste tu contraseña?"** se arma con `VITE_PUBLIC_SITE_URL`, que queda fijo al
   compilar (`src/lib/siteUrl.ts`). Además, Supabase solo acepta los dominios de su lista de
   Redirect URLs y manda todo lo demás a la Site URL.
2. **Los enlaces que se mandan al cliente** usan esa misma dirección fija. En la app:
   `customerPortal.service.ts:10`, de donde salen la tarjeta del enlace, el mensaje de WhatsApp y el
   PDF. En los correos: el secreto `PUBLIC_SITE_URL` de `process-outbox`.
3. **El remitente de los correos al cliente** es uno solo (`EMAIL_FROM_ADDRESS`).

| | Un proyecto (esta propuesta) | Dos proyectos |
|---|---|---|
| Supabase | US$25/mes (Pro) | US$35/mes (Pro + US$10 por el segundo proyecto) |
| Resend | Gratis: el plan gratuito admite 3 dominios | Igual |
| Operación | Igual que hoy | Todo dos veces y para siempre: migraciones, 6 funciones, 8 secretos, Vault, 4 tareas programadas, 8 buckets, Auth y SMTP, respaldos, `qa:security` |
| El dueño | Un solo inicio de sesión; finanzas y reportes de los dos talleres juntos | Dos inicios de sesión; nada consolidado |
| Datos | Separados por sede, como hoy (un técnico solo ve lo suyo) | Separados por completo |

El costo en dinero de un segundo proyecto es bajo. El problema es el costo de operarlo. Y la
separación total de datos no hace falta, porque los dos talleres son del mismo dueño.

## 2. Lo que se decidió con el cliente

| Pregunta | Decisión |
|---|---|
| ¿Mismo dueño o negocios independientes? | **Mismo dueño.** El administrador maneja los dos. No se toca el modelo de permisos |
| ¿Por qué dirección entra el personal del taller 2? | **Por un dominio propio** (por ejemplo `taller2.com`) |
| ¿Desde qué dirección salen los correos a sus clientes? | **Desde el dominio del taller 2** (por ejemplo `notificaciones@taller2.com`) |
| ¿La app instalada lleva su nombre y su ícono? | **Sí** |

## 3. Cómo funcionaría

Son dos capas. Ninguna crea una función pública para usuarios sin sesión, así que se mantiene
la regla "sin sesión, sin funciones" de [plan-de-pruebas.md](plan-de-pruebas.md).

1. **Lo que se ve antes de entrar sale de archivos fijos por dominio, que sirve el hosting.**
   - Cada taller con dominio propio tiene una carpeta `public/marcas/<dominio>/` con su nombre,
     logo, color, fondo e íconos.
   - El build genera, para cada carpeta:
     - su propio `index.html`, con el título, los metadatos y la marca (`window.__MARCA__`) ya
       escritos;
     - su manifiesto de la app instalada;
     - unas reglas de `.htaccess` que entregan esos archivos cuando la página se abre por ese
       dominio.
   - Así quedan por dominio el login, el título de la pestaña, la vista previa de los enlaces en
     WhatsApp, el favicon, el nombre y el ícono de la app instalada y el ícono de los avisos push.
     No hay parpadeo y no se le pregunta nada a la base.
   - Un dominio sin carpeta (restorifyauto.net, vistas previas, localhost) se ve exactamente como hoy.
2. **Lo que depende de la sede vive en la base.**
   - Dos campos nuevos en `sedes`: `dominio` y `correo_remitente`, que el administrador edita en
     Configuración.
   - Con ellos se arman los enlaces al cliente con el dominio de su taller, sus correos salen desde
     ese dominio y el administrador empieza en esa sede cuando entra por ese dominio.

Por ejemplo, alguien del taller 2 abre `taller2.com`:
1. El hosting le entrega la página de su taller: logo, nombre y colores del taller 2.
2. Entra con su cuenta y trabaja como hoy, viendo solo los datos de su sede.
3. Si un cliente de ese taller recibe un correo, le llega desde `notificaciones@taller2.com` con
   un enlace a `taller2.com/r/…`.

---

## 4. Cambios por área

### 4.1 Base de datos: `supabase/migrations/20261011000000_dominio_por_taller.sql`

- **Columnas:** `ALTER TABLE sedes ADD COLUMN dominio TEXT, ADD COLUMN correo_remitente TEXT`.
- **Normalización** con el trigger `BEFORE INSERT OR UPDATE OF dominio, correo_remitente`, función
  `trg_normalizar_dominio_sede()`:
  - `SET search_path = public` y `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.
  - No llama a ninguna función revocada.
  - El dominio pasa a minúsculas y se le quitan espacios, esquema, `www.`, puerto, ruta y punto
    final. El remitente pasa a minúsculas. Vacío queda en NULL.
- **Restricciones**, con la expresión regular dentro del CHECK, como `sedes_email_contacto_formato`
  (`20260923000000_customer_portal_and_emails.sql:53-54`):
  - `sedes_dominio_formato`: `dominio IS NULL OR (length(dominio) <= 253 AND dominio ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$')`.
  - `sedes_correo_remitente_formato`: la misma expresión que el correo de contacto.
  - `CREATE UNIQUE INDEX uq_sedes_dominio ON sedes (dominio) WHERE dominio IS NOT NULL`.
- **Permisos:** no cambian. Solo un administrador escribe en `sedes` (`sedes_write_update`,
  `20261002000000_afinado_rls_e_indices.sql:373-377`), y `sedes_select` sigue exigiendo perfil.
- **`datos_correo`** se reemite entero, partiendo de su versión vigente
  (`20260924000000_quotes_and_authorization.sql:1046`; confirmar con
  `npm run db:donde -- datos_correo`).
  - El bloque `taller` suma `'dominio'` y `'remitente'`.
  - Se mantiene `REVOKE ALL ... FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE TO service_role`.
- **Solo agrega.** El sitio publicado y el `process-outbox` actual siguen funcionando mientras las
  columnas estén en NULL.

### 4.2 Correos: `supabase/functions/process-outbox` y `_shared/email/envio.ts` (nuevo)

- **Funciones puras en `_shared/email/envio.ts`**, probadas con Vitest como ya se hace con las
  plantillas (`src/lib/emailTemplates.test.ts` importa desde `_shared`):
  - `baseDelPortal(dominio, general)`: `https://<dominio>` si el dominio es válido; si no,
    `PUBLIC_SITE_URL` sin barra final.
  - `remitenteDe(nombre, propio, general)`: arma el `From`, usando `displayName`
    (`process-outbox/index.ts:149`).
  - `esRechazoDeRemitente(status, body)`: reconoce un 403 `validation_error` ("domain is not
    verified") o una llave que no permite ese dominio.
- **`sendEmail`** (`index.ts:160-268`):
  - `EmailData.taller` suma `dominio` y `remitente`.
  - El enlace al portal se arma con `baseDelPortal`. Así, el enlace para darse de baja
    (`?correos=baja`) también queda en el dominio del taller.
  - El `From` usa el remitente de la sede, si tiene uno.
- **Si Resend rechaza el remitente del taller:**
  - Se reintenta una sola vez con el remitente general y la llave de idempotencia
    `${job.id}:general`. Reusar la misma llave con otro cuerpo da 409
    `invalid_idempotent_request`.
  - El trabajo queda `enviado`, con un `detalle` que explica qué pasó (`JobResult.detalle` ya
    existe).
  - Así, un dominio mal configurado no deja a ningún cliente sin su correo.

### 4.3 Archivos por dominio: `public/marcas/`, `vite.config.ts`, `src/lib/marcaShell.ts`

- **Qué lleva `public/marcas/<dominio>/`:**
  - `marca.json` con `nombre`, `color` (#rrggbb, opcional), `logo`, `fondo` (opcional) y `titulo`
    (opcional);
  - `logo.webp`, ancho y con fondo transparente (se recorta como el de Restorify);
  - la fuente del ícono, cuadrada (`icon.svg` o `icon.png`);
  - la carpeta `icons/`, generada.
- **`scripts/generate-pwa-icons.mjs` acepta `--marca <dominio>`.**
  - Lee la fuente del ícono de esa carpeta y escribe el mismo juego de íconos que hoy: `icon-192`,
    `icon-512`, `icon-maskable-512`, `apple-touch-icon`, `badge-72` y `icons/icon.svg`. Si la fuente
    es un PNG, lo mete dentro de un SVG.
  - Sin la opción, genera los íconos de siempre.
- **Funciones puras en `src/lib/marcaShell.ts`**, sin acceso a archivos y probadas con Vitest:
  - `validarMarca(json, archivos)`: los errores dicen qué falta.
  - `htmlDeMarca(indexHtml, marca)`: cambia `<title>`, la descripción, `apple-mobile-web-app-title`
    y `theme-color`, e inyecta `<script>window.__MARCA__=…</script>`. El JSON va escapado, con `<`
    convertido en `<`.
  - `manifiestoDeMarca(manifest, marca)`: cambia `name`, `short_name` y `description`. Los íconos
    siguen en `/icons/…`, porque las reglas los sirven desde la carpeta de cada dominio.
  - `reglasHtaccess(dominios)`: genera el bloque de reglas.
- **El plugin `marcasPorDominio()` de `vite.config.ts`**, junto a los plugins que ya hay:
  - Al terminar el build recorre `dist/marcas/*` (Vite ya copió `public/`). Valida que cada carpeta
    tenga nombre de dominio y escribe su `index.html` y su `manifest.webmanifest`. También reemplaza
    el comentario `# @@MARCAS@@` de `dist/.htaccess` por las reglas generadas.
  - Si algo falta o no es válido, el build falla. El CI lo detecta antes de que llegue a Hostinger,
    y Hostinger además conserva la versión anterior.
  - En desarrollo, `MARCA_DEV=taller2.com npm run dev` inyecta esa marca para verla en local.
- **El comentario `# @@MARCAS@@` en `public/.htaccess`** va después de la regla de `www` y antes de
  `RewriteRule ^index\.html$ - [L]`. Por cada dominio se generan reglas explícitas, sin pruebas `-f`
  sobre `%{DOCUMENT_ROOT}` y sin referencias `%1`:

  ```apache
  RewriteCond %{HTTP_HOST} ^taller2\.com$ [NC]
  RewriteRule ^(manifest\.webmanifest|icons/.+)$ marcas/taller2.com/$1 [L]
  RewriteCond %{HTTP_HOST} ^taller2\.com$ [NC]
  RewriteRule ^(index\.html)?$ marcas/taller2.com/index.html [L]
  RewriteCond %{HTTP_HOST} ^taller2\.com$ [NC]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . marcas/taller2.com/index.html [L]
  ```

  - En la segunda pasada la dirección ya empieza con `marcas/`, así que no hay bucle. Los
    `/assets/*` existen y no se tocan.
  - `<Files "index.html">` le pone `no-cache` también a las copias de cada dominio. Hay que agregar
    `no-cache` al manifiesto.

### 4.4 Frontend

- **`src/lib/marca.ts` (nuevo).** También lo puede importar el portal, porque no arrastra Supabase,
  contextos ni traducciones.
  - Declara el tipo de `window.__MARCA__`.
  - `marcaActual()` valida lo que trae esa variable: el color tiene que ser hexadecimal o quedar
    vacío, y las rutas tienen que empezar con `/marcas/`. Lo que falte se completa con la marca por
    defecto: Restorify, `assets/restorify-logo.webp`, `login-bg.webp` y sin color propio (la paleta
    del CSS).
  - `hostActual()` devuelve el dominio en minúsculas y sin `www.`.
- **El color, reutilizando `applySedeBranding` de `src/lib/branding.ts`:**
  - `restaurarMarca(theme)` (nueva) aplica el color de la marca del dominio, o limpia si no tiene.
  - `main.tsx` la llama al arrancar con el tema guardado (`restorify_theme`), así no aparece el
    amarillo de Restorify por un instante.
  - `AppLayout` usa `currentSede?.color_tema ?? marca.color` y, al desmontarse, llama
    `restaurarMarca` en lugar de `clearSedeBranding`.
  - El portal (`CustomerPortal.tsx:104`) usa `shop?.color ?? marca.color`.
- **`Login.tsx` y `ResetPassword.tsx`:**
  - El logo y su `alt` salen de la marca. Sin el ancho y el alto fijos del logo de Restorify: el
    tamaño máximo lo da el CSS.
  - El título se arma con `t('auth.welcomeTitle').replace('{nombre}', marca.nombre)`.
  - El placeholder del correo pasa por i18n.
  - El fondo pasa a la variable `--login-fondo`. La leen el `::before` del teléfono
    (`components.css`, `.login-page::before`) y el lado de la imagen, en lugar de una URL fija.
- **`src/lib/siteUrl.ts`:**
  - `getPasswordResetRedirect()` usa `window.location.origin` en https, y `VITE_PUBLIC_SITE_URL`
    solo en desarrollo (http). Supabase sigue filtrando: un dominio que no está en su lista cae en
    la Site URL.
  - `sedeSiteUrl(sede)` (nueva) da `https://<dominio de la sede>`, o `getPublicSiteUrl()` si la sede
    no tiene dominio.
- **`customerPortal.service.ts`:**
  - `portalUrl(token, sede?)` usa `sedeSiteUrl(sede)`.
  - Quien la llama pasa **la sede de la orden** (`orderSede`, regla 9 de
    [ai-context.md](ai-context.md)):
    - `useWorkOrderDetail.ts:612-614`, para el PDF;
    - `useWorkOrderDetail.ts:633-635`, para WhatsApp;
    - `CustomerLinkCard`, que la recibe como `sede={orderSede}` desde `WorkOrderDetail.tsx:382`.
- **`AuthContext.tsx:59-63`:** el administrador entra en la sede que eligió la última vez. Si no
  eligió ninguna, en la sede cuyo `dominio` es el actual; si ninguna lo tiene, en la suya; y si no,
  en la primera. El técnico entra siempre en la suya.
- **Configuración → Sedes (`Settings.tsx`):**
  - Dos campos nuevos, **Dominio** y **Remitente de correos**, cada uno con su explicación. Se
    validan antes de guardar: el dominio se normaliza igual que en la base, y el remitente se revisa
    con `isOptionalEmailValid`.
  - `createSede` los manda vacíos.
  - Al guardar, `updateSede` (`sedes.service.ts`) incluye los dos campos nuevos, y el tipo `Sede`
    (`types/domain/auth.types.ts`) los suma.
  - En `lib/errors.ts`, un dominio repetido (23505 de `uq_sedes_dominio`) y un formato inválido
    (23514) muestran mensajes claros.
- **Textos, en español y en inglés:**
  - `auth.welcomeTitle` pasa a "Bienvenido a {nombre}".
  - `auth.emailPlaceholder` es nuevo.
  - La instrucción de iPhone para activar los avisos pasa a "Abre {app}…" (`PushSettingsCard.tsx`).
  - Las claves nuevas de Configuración.
- **Lugares donde todavía dice "Restorify":**
  - el pie del portal (`CustomerPortal.tsx:382`), que pasa a usar el nombre del taller de la orden;
  - el título de respaldo del portal, que pasa a usar el de la marca;
  - el respaldo del menú lateral cuando no hay sede, que pasa a usar el de la marca.

---

## 5. Pruebas

- **pgTAP `14_dominio_por_taller.test.sql`:**
  - `'HTTPS://WWW.Taller2.COM/login'` se guarda como `taller2.com`.
  - Un dominio inválido da 23514 y uno repetido da 23505.
  - El UPDATE de un técnico sobre `dominio` o `correo_remitente` afecta 0 filas.
  - `datos_correo` incluye el dominio y el remitente.
  - La función del trigger no la ejecutan ni `anon` ni `authenticated`.
  - Un usuario sin sesión sigue sin leer `sedes`.
- **`qa:security`:**
  - SEC-91: un técnico intenta cambiar `sedes.dominio` con PATCH y obtiene `denied-or-empty`.
  - SEC-92: un usuario sin sesión pide `/rest/v1/sedes` y recibe una lista vacía.
- **Vitest nuevas:**
  - `marca.test.ts`: la marca por defecto y la validación de lo que trae la página.
  - `marcaShell.test.ts`: el escapado, las reglas generadas, los errores de validación y el
    manifiesto.
  - `emailEnvio.test.ts`: la dirección del enlace, el remitente y la detección del rechazo.
  - `Login.test.tsx`: el logo y "Bienvenido a Taller 2".
  - `AuthContext.test.tsx`: la sede del dominio para el administrador.
  - `restaurarMarca`.
- **Vitest que hay que ajustar:**
  - `siteUrl.test.ts`;
  - `CustomerLinkCard.test.tsx` y `ShareReportModal.test.tsx`, por la nueva firma de `portalUrl`;
  - los datos de prueba de `Sede` en `src/test/renderWithProviders.tsx`;
  - `translations.test.ts`, por los marcadores nuevos en los dos idiomas.
- **Casos manuales** `DOM-01…` en [plan-de-pruebas.md](plan-de-pruebas.md): son los de la
  [sección 8](#8-verificación).

## 6. Documentación que habría que actualizar

- **[deployment.md](deployment.md):**
  - una guía nueva, "Agregar un taller con su dominio", con los pasos de la
    [sección 7](#7-despliegue-y-configuración-externa);
  - `VITE_PUBLIC_SITE_URL` pasa a ser solo el respaldo;
  - varias Redirect URLs y la plantilla de recuperación de contraseña;
  - la llave de Resend, válida para todos los dominios.
- **[ai-context.md](ai-context.md):** tres reglas nuevas.
  - El enlace al cliente se arma con la sede de la orden, nunca con `getPublicSiteUrl()` directo.
  - La marca antes de iniciar sesión sale de `public/marcas/<dominio>`, nunca de la base.
  - El bloque de `.htaccess` es generado.
- **El resto:**
  - [arquitectura.md](arquitectura.md) y [mapa-de-secciones.md](mapa-de-secciones.md): la marca por
    dominio.
  - [password-reset.md](password-reset.md): varios dominios y `{{ .RedirectTo }}`.
  - [portal-y-correos.md](portal-y-correos.md): el enlace y el remitente de cada sede.
  - [supabase.md](supabase.md), [manual-usuario.md](manual-usuario.md),
    [traspaso.md](traspaso.md) y [evolucion.md](evolucion.md).

## 7. Despliegue y configuración externa

**Primero, el código.** Mientras `public/marcas/` esté vacía, nada cambia a la vista:
1. CI en verde.
2. Respaldo: los tres `db dump` de [deployment.md](deployment.md#5-publicar-una-versión).
3. `npx supabase db push`.
4. `npx supabase functions deploy process-outbox --no-verify-jwt`.
5. `git push origin main:produccion`.

**Después, el segundo taller:**
1. **Dominio y Hostinger:**
   - Comprar `taller2.com`, o apuntarlo a Hostinger si ya existe.
   - En hPanel, agregarlo como **dominio estacionado (alias)** del sitio de restorifyauto.net. Si
     ese sitio no lo permite, crear un segundo sitio desde el mismo repositorio y la rama
     `produccion`, con las mismas 5 variables; los dos se publican en cada push.
   - Activar SSL para `taller2.com` y `www.taller2.com`.
2. **Supabase → Authentication:**
   - En Redirect URLs, agregar `https://taller2.com/**`. La Site URL no cambia.
   - En la plantilla "Reset Password", cambiar el nombre según el dominio con
     `{{ if eq .RedirectTo "https://taller2.com/reset-password" }}…{{ end }}`. El enlace sigue
     siendo `{{ .ConfirmationURL }}`.
3. **Resend:**
   - Agregar `taller2.com` y cargar sus 4 registros DNS: TXT del DKIM, CNAME `rsend`, CNAME `send` y
     TXT `_dmarc`. Esperar a que diga "Verified".
   - Crear una llave de envío válida para todos los dominios, cargarla con
     `npx supabase secrets set RESEND_API_KEY=…` y borrar la anterior.
   - La llave del SMTP de Auth no cambia.
4. **Configuración → Sedes:**
   - "Taller principal" pasa a llamarse **Restorify**, con dominio `restorifyauto.net`, color
     `#EBC334` y su logo.
   - Crear la sede del taller 2, con su dominio, su remitente, logo, color, correo y WhatsApp.
   - Asignarle su personal en Empleados.
5. **La marca del taller 2 en el repositorio:**
   - Con el logo y el ícono que mande el cliente, crear `public/marcas/taller2.com/`.
   - Correr `node scripts/generate-pwa-icons.mjs --marca taller2.com`.
   - Commit y push a `produccion`.

**Volver atrás:**
- Si se quita la carpeta de la marca y se publica, `taller2.com` vuelve a verse como Restorify.
- Si se vacían `dominio` o `correo_remitente` en Configuración, los correos vuelven al enlace y al
  remitente generales.
- La migración solo agrega columnas: no hay que revertirla.

## 8. Verificación

- **Local:**
  - `npm run lint && npx tsc -b && npm test && npm run build`. Si una marca está incompleta, el build
    tiene que fallar.
  - `npx supabase start && npm run test:db`.
  - `MARCA_DEV=taller2.com npm run dev`.
  - En `dist/`, revisar que existan `marcas/taller2.com/index.html` y su manifiesto, y que
    `.htaccess` tenga las reglas.
- **Después de publicar:**
  - `curl -sI https://taller2.com/work-orders` da 200.
  - El `<title>` de `https://taller2.com/` y su `manifest.webmanifest` tienen el nombre del taller 2.
  - `https://www.taller2.com/` redirige con 301 a `https://taller2.com/`.
  - restorifyauto.net se ve igual que antes.
  - `npm run qa:security` da 0 FAIL.
- **Casos manuales:**
  - El login de cada dominio muestra su logo, su nombre y su color.
  - "¿Olvidaste tu contraseña?" desde `taller2.com` llega con el texto del taller 2 y abre
    `taller2.com/reset-password`.
  - Al firmar una orden del taller 2, el correo sale desde `notificaciones@taller2.com` y su botón
    abre `taller2.com/r/…`.
  - El enlace copiado desde restorifyauto.net para una orden del taller 2 también apunta a
    `taller2.com`.
  - La app instalada desde `taller2.com`, en Android y en iPhone, muestra su nombre y su ícono, y los
    avisos push llegan con su ícono.
  - El administrador que entra por `taller2.com` empieza en esa sede.

## 9. Limitaciones

- **El correo de recuperación de contraseña sale con el mismo remitente para los dos talleres**
  ("Restorify", `notificaciones@restorifyauto.net`). Supabase permite un solo remitente de Auth por
  proyecto; lo que sí cambia según el dominio es el texto del correo.
- **Un técnico puede ver los datos de contacto y el porcentaje de comisión de las dos sedes**
  (`sedes_select`). Con un solo dueño es aceptable.
- **La marca está en dos lugares:**
  - la del login y la app instalada se cambia en el repositorio y requiere un despliegue;
  - la de adentro de la app, el portal, el PDF y los correos se cambia en Configuración.

  Hay que mantenerlas iguales.
- **Si alguien usa los dos dominios en el mismo teléfono,** tiene dos sesiones y dos apps
  instaladas, y le llegan los avisos push repetidos.
- **El personal de un taller puede entrar por el login del otro.** Ve sus propios datos igual: la
  seguridad depende de la sede, no del dominio. Bloquearlo sería solo de presentación (ver la
  [sección 12](#12-preguntas-abiertas)).

## 10. Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| **Un segundo proyecto de Supabase** | Cuesta poco en dinero (+US$10/mes en Pro), pero duplica toda la operación y separa al dueño de sus propios datos (ver la [sección 1](#1-la-pregunta-y-la-respuesta-corta)) |
| **Leer la marca del login desde la base**, con una función abierta a usuarios sin sesión | Sería la primera función abierta a usuarios sin sesión, contra la regla del proyecto, y el revisor de seguridad de Supabase la marcaría. Además, el login esperaría la respuesta y mostraría primero la marca de Restorify. Y la app instalada igual necesita sus archivos por dominio |
| **Un mapa de dominios escrito en el código** | El login quedaría igual de bien. Pero el título, la vista previa en WhatsApp, el manifiesto y los íconos, que se leen antes de que corra el código, seguirían diciendo Restorify |
| **Una ruta propia en restorifyauto.net** (por ejemplo `/t/taller2`) | No necesita configuración externa, pero el cliente quiere un dominio propio |
| **Separar los permisos por empresa** | No aplica: los dos talleres son del mismo dueño. Si algún día el taller 2 fuera de otro dueño, serían unos 5 a 8 días de trabajo: un nivel "empresa", unas 21 políticas restrictivas y la reescritura de unas 21 funciones, más sus pruebas |

## 11. Estimación

**Desarrollo: entre 3.5 y 4.5 días.**

| Parte | Días |
|---|---|
| Migración y pruebas de la base | 0.5–1 |
| Correos | 0.5 |
| Archivos por dominio e íconos | 1 |
| Frontend | 1–1.5 |
| Documentación | 0.5 |

**Aparte:**
- 1 a 2 horas de configuración externa: DNS, Hostinger, Supabase y Resend.
- El logo y el ícono del taller 2, que tiene que mandar el cliente.

## 12. Preguntas abiertas

- **¿Cuál es el dominio real del taller 2?** ¿Ya lo tienen comprado?
- **¿El sitio de Hostinger acepta un dominio estacionado?** Es un sitio que se publica desde
  GitHub. Si no lo acepta, va un segundo sitio desde el mismo repositorio.
- **¿El cliente tiene el logo y un ícono cuadrado del taller 2?**
- **¿Qué nombre muestra el remitente del correo de recuperación de contraseña?** Puede seguir
  siendo "Restorify" o pasar a uno neutro para los dos talleres.
- **¿Hay que impedir que el personal de un taller entre por el login del otro?** Hoy no se impide;
  no cambia lo que cada quien ve.

---

## Fuentes

- Precios de Supabase: <https://supabase.com/pricing>
- Precios de Resend: <https://resend.com/pricing>
- Errores de Resend: <https://resend.com/docs/api-reference/errors>
- Idempotencia de Resend: <https://resend.com/docs/dashboard/emails/idempotency-keys>
- Plantillas de correo de Supabase Auth, variables y condicionales:
  <https://supabase.com/docs/guides/auth/auth-email-templates>
- Dominios estacionados en Hostinger:
  <https://www.hostinger.com/support/1583424-what-are-the-differences-between-subdomain-parked-domain-and-add-on-domain>
