# Despliegue

Cómo se pone Restorify en producción y qué hay que configurar fuera del código.
Si solo vas a publicar una versión nueva sobre un entorno ya configurado, salta a
[5. Publicar una versión](#5-publicar-una-versión).

---

## Índice

1. [Qué se despliega y dónde](#1-qué-se-despliega-y-dónde)
2. [Entornos](#2-entornos)
3. [Variables del frontend](#3-variables-del-frontend)
4. [Configuración única de Supabase](#4-configuración-única-de-supabase)
5. [Publicar una versión](#5-publicar-una-versión)
6. [Verificación después de publicar](#6-verificación-después-de-publicar)
7. [Rotar secretos y llaves](#7-rotar-secretos-y-llaves)
8. [Volver atrás](#8-volver-atrás)
9. [Integración continua (recomendado)](#9-integración-continua-recomendado)

---

## 1. Qué se despliega y dónde

| Pieza | Dónde vive | Cómo se publica |
|---|---|---|
| Frontend (`dist/`) | Hostinger, hosting compartido Apache, `reinventa.shop` | Subir el contenido de `dist/` a `public_html/` |
| Esquema de base de datos | Supabase (proyecto enlazado en `supabase/.temp/project-ref`) | `npx supabase db push --linked` |
| Edge functions | Supabase | `npx supabase functions deploy <nombre>` |
| Secretos de funciones | Supabase → Edge Functions → Secrets | `npx supabase secrets set` |
| Secretos que usa la base | Supabase Vault | SQL una vez (sección 4.6) |
| Correo transaccional | Resend, dominio `reinventa.shop` | DNS en Hostinger (ya verificado) |
| DNS | Hostinger (`ns1/ns2.dns-parking.com`) | hPanel → Dominios → DNS |

> **La base y el frontend se publican juntos.** Varias migraciones eliminan o
> mueven columnas (`20260918` mueve los montos; `20260919` cambia fotos y firma).
> Un `dist` viejo contra una base nueva —o al revés— rompe pantallas. El banner de
> "esquema desactualizado" lo avisa, pero no lo arregla.

---

## 2. Entornos

Hoy **solo existe producción**. Es un riesgo: las pruebas e2e que crean datos y la
configuración de push y correo se prueban contra datos reales.

**Recomendado** antes de la fase 4: un segundo proyecto de Supabase como
*staging*, con las mismas migraciones y secretos propios (otra llave VAPID, otro
secreto de funciones), y un subdominio (`staging.reinventa.shop`) apuntando a otro
`dist` compilado contra ese proyecto. El flujo sería: migrar y probar en staging →
repetir en producción.

---

## 3. Variables del frontend

En `.env.local` (nunca se sube a git). Vite las **incrusta al compilar**: cambiar
una exige volver a compilar y subir `dist/`.

| Variable | Obligatoria | Qué es |
|---|:---:|---|
| `VITE_SUPABASE_URL` | ✅ | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Clave anónima (pública por diseño) |
| `VITE_PUBLIC_SITE_URL` | recomendada | `https://reinventa.shop`. Base de los enlaces de recuperación de contraseña |
| `VITE_VAPID_PUBLIC_KEY` | para push | Llave **pública** VAPID. Sin ella, la tarjeta de push dice "no configurado" |
| `VITE_SENTRY_DSN` | opcional | Monitoreo de errores |

Plantilla en `.env.example`.

---

## 4. Configuración única de Supabase

Se hace una vez por entorno. Si cambias de proyecto, repite todo.

### 4.1 Plan y límites de gasto

- Plan **Pro** ($25/mes). Capacidad estimada en
  [multimedia-y-notificaciones.md](multimedia-y-notificaciones.md#capacidad-del-plan).
- El **spend cap** viene activo: si se excede una cuota el servicio se restringe
  en lugar de cobrar. Revisa Settings → Usage mensualmente.

### 4.2 Auth

- **Site URL**: `https://reinventa.shop`.
- **Redirect URLs**: `https://reinventa.shop/reset-password` y el origen de
  desarrollo que uses. Detalle en [password-reset.md](password-reset.md).
- **Registro público apagado** (`enable_signup = false`): las cuentas las crea un
  admin con la edge function `create-employee`.
- **SMTP (recomendado)**: el correo propio de Supabase permite ~2 correos por hora.
  Authentication → Emails → SMTP Settings con Resend:
  host `smtp.resend.com`, puerto `465`, usuario `resend`, contraseña = una API key
  de Resend de solo envío, remitente `notificaciones@reinventa.shop`.

### 4.3 Storage

- **No hace falta cambiar el límite global de archivo.** La app y el bucket
  `orden_media` usan 50 MB por archivo, que es también el máximo del plan Free
  (migración `20260921000000`). Si algún día se sube el tope de la app, el límite
  global (Storage → Settings) tiene que ser igual o mayor, y en Free no pasa de 50 MB.
- Los buckets y sus políticas los crean las migraciones; no se crean a mano.

### 4.4 Extensiones

La migración `20260920000000` activa `pg_net` y `pg_cron`. Si el `db push` falla en
ese punto por permisos, actívalas en Database → Extensions y vuelve a correrlo.

### 4.5 Secretos de las edge functions

Los valores de este proyecto están generados en `supabase/.env.secrets.local`
(ignorado por git):

```
RESTORIFY_FUNCTIONS_SECRET=…   # secreto compartido base ↔ funciones internas
VAPID_PUBLIC_KEY=…             # par VAPID para push
VAPID_PRIVATE_KEY=…
VAPID_SUBJECT=mailto:notificaciones@reinventa.shop
```

```bash
npx supabase secrets set --env-file supabase/.env.secrets.local
npx supabase secrets list          # comprobar (muestra nombres, no valores)
```

La **pública** VAPID también va en `.env.local` como `VITE_VAPID_PUBLIC_KEY` (ya
agregada en la máquina de desarrollo).

Para generar un juego nuevo en otro entorno:

```bash
npx web-push generate-vapid-keys --json            # par VAPID
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # secreto
```

**Correos al cliente (fase 4)** — se cargan aparte, nunca en un archivo:

```bash
npx supabase secrets set RESEND_API_KEY=<llave de Resend de solo envío> \
  PUBLIC_SITE_URL=https://reinventa.shop \
  EMAIL_FROM_ADDRESS=notificaciones@reinventa.shop
# opcional; por defecto America/Chicago
npx supabase secrets set SHOP_TIMEZONE=America/Chicago
```

La llave de Resend debe ser de **solo envío** y restringida a `reinventa.shop`. La
de acceso total que se usó para verificar el dominio debe borrarse de Resend.
Detalle en [portal-y-correos.md](portal-y-correos.md#7-configuración).

### 4.6 Vault (secretos que usa la base)

La base llama a las funciones internas con `pg_net`. La URL y el secreto no pueden
ir en una migración (quedarían en git), así que se guardan en Vault. En SQL Editor:

```sql
SELECT vault.create_secret('https://<ref>.supabase.co', 'restorify_project_url');
SELECT vault.create_secret('<el mismo valor de RESTORIFY_FUNCTIONS_SECRET>', 'restorify_functions_secret');

-- comprobar (sin mostrar el valor)
SELECT name, created_at FROM vault.decrypted_secrets WHERE name LIKE 'restorify_%';
```

Para cambiar uno: `SELECT vault.update_secret(id, 'nuevo valor') FROM vault.secrets WHERE name = '…';`

> Sin estos dos secretos todo funciona excepto el envío: los avisos se guardan y
> se ven en la campana, y los push esperan en `cola_envios`.

### 4.7 Edge functions

```bash
# Con verificación de JWT (las llama el navegador de un admin)
npx supabase functions deploy create-employee
npx supabase functions deploy update-employee
npx supabase functions deploy delete-employee

# Internas: las llama la base, sin JWT; se protegen con el secreto compartido
npx supabase functions deploy process-outbox --no-verify-jwt
npx supabase functions deploy cleanup-storage --no-verify-jwt

# Pública: el reporte del cliente; la protege el token
npx supabase functions deploy portal --no-verify-jwt
```

`supabase/config.toml` ya declara `verify_jwt = false` para las tres; el flag lo
hace explícito.

### 4.8 Correo (Resend)

- Dominio `reinventa.shop` **verificado** (septiembre 2026). Registros en Hostinger:

| Tipo | Nombre | Valor |
|---|---|---|
| TXT | `resend._domainkey` | llave DKIM (ver panel de Resend) |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` (prioridad 10) |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |
| CNAME | `rsend` | `send.forge.rmta.net` |
| TXT | `_dmarc` | `v=DMARC1; p=none;` |

- Si se activa el correo de Hostinger en el mismo dominio, sus registros van en la
  raíz (MX, SPF) y no chocan con estos. El único que no puede duplicarse es `_dmarc`.
- Remitente: `"Nombre del taller" <notificaciones@reinventa.shop>`, con *Reply-To*
  al correo de contacto de la sede (Configuración → Sedes).
- Llave de solo envío cargada como `RESEND_API_KEY` (septiembre 2026). Plan gratuito:
  3.000 correos al mes, 100 por día.

---

## 5. Publicar una versión

En este orden. Los pasos 1–3 no cambian nada; los 4–6 sí.

```bash
# 1. Todo en verde localmente
npm run lint && npx tsc -b && npm test

# 2. (Si hay Docker) pruebas de base de datos contra Supabase local
npx supabase start && npm run test:db

# 3. Qué migraciones faltan en el proyecto enlazado
npm run db:check
npx supabase db push --dry-run --linked
```

**Avisa al taller** si la versión incluye migraciones que mueven columnas: hay
unos minutos entre el paso 4 y el 6 en los que la app publicada no coincide con la
base.

```bash
# 4. Base de datos
npx supabase db push --linked

# 5. Edge functions que hayan cambiado (sección 4.7)

# 6. Frontend
npm run build          # compila con .env.local → dist/
```

Sube el **contenido** de `dist/` (no la carpeta) a `public_html/` en Hostinger
(hPanel → Administrador de archivos, o FTP), reemplazando lo anterior. Verifica
que `.htaccess`, `sw.js`, `manifest.webmanifest` e `icons/` quedaron en la raíz.

Si la versión incluye migraciones nuevas, **los pasos 4 y 6 van seguidos**.

---

## 6. Verificación después de publicar

Diez minutos. Si algo falla, [pruebas.md](pruebas.md) tiene el detalle de cada caso.

- [ ] La app abre sin el banner de "esquema desactualizado".
- [ ] Iniciar sesión como admin y como técnico.
- [ ] Como técnico: una orden no muestra totales, depósito ni precios de repuestos.
- [ ] Crear una orden de prueba con una foto; la bandeja de subidas termina.
- [ ] Grabar un video corto en un avance desde el teléfono; se reproduce.
- [ ] Configuración → Notificaciones → **Enviar prueba** llega al teléfono.
- [ ] Asignar un técnico a la orden: le llega "Nueva orden asignada" (campana y push).
- [ ] Con un cliente de prueba con tu correo: firmar la recepción → en ~2 minutos
      llega "Recibimos su…"; el botón abre `reinventa.shop/r/…` con la orden.
- [ ] La tarjeta **Enlace del cliente** muestra el correo como **Enviado**.
- [ ] `curl -s "https://<ref>.supabase.co/functions/v1/portal?token=$(printf '0%.0s' {1..64})"`
      responde `{"estado_enlace":"no_encontrado"}` con HTTP 404.
- [ ] `https://reinventa.shop/sw.js` responde con `Cache-Control: no-cache` (DevTools → Network).
- [ ] Tareas programadas activas:
  ```sql
  SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'restorify-%';
  ```
- [ ] Borrar la orden de prueba.

---

## 7. Rotar secretos y llaves

| Qué | Cómo | Efecto |
|---|---|---|
| `RESTORIFY_FUNCTIONS_SECRET` | Nuevo valor en `secrets set` **y** en Vault (`vault.update_secret`) | Ninguno si ambos cambian juntos; si no, los envíos quedan pendientes (401) |
| Par VAPID | Nuevas llaves en secrets y en `VITE_VAPID_PUBLIC_KEY` → recompilar | **Todos** deben volver a activar push; conviene borrar `push_suscripciones` |
| Clave de servicio de Supabase | Panel de Supabase | Las edge functions la reciben sola |
| API key de Resend | Crear nueva de solo envío → `secrets set RESEND_API_KEY` → borrar la vieja | Ninguno |
| Clave anónima | Panel de Supabase → recompilar | Sesiones abiertas se cierran |

---

## 8. Volver atrás

- **Frontend:** conserva una copia del `dist` anterior antes de subir; volver es
  subirla de nuevo. Solo es seguro si la base no recibió migraciones nuevas.
- **Base de datos:** las migraciones no tienen "down". Volver atrás es escribir una
  migración nueva que revierta. Antes de migraciones destructivas, **respaldo**:
  Database → Backups (Pro guarda 7 días) o `npx supabase db dump --linked -f respaldo.sql`.
- **Edge function:** volver a desplegar la versión anterior desde git.

---

## 9. Integración continua (recomendado)

No hay CI configurada. Un flujo mínimo de GitHub Actions para cada pull request:

```yaml
name: CI
on:
  pull_request:
    branches: [main]

jobs:
  verificar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run lint
      - run: npx tsc -b
      - run: npm test

  base-de-datos:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - run: supabase start
      - run: supabase test db
```

Playwright (`npm run test:e2e`) necesita credenciales y un proyecto donde crear
datos: agrégalo cuando exista staging.
