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
9. [Integración continua](#9-integración-continua)

---

## 1. Qué se despliega y dónde

Proyecto de Supabase: **`dbstores`** (`lendsiqkxhvbxxkaadrt`, región `ca-central-1`).
Inventario completo de lo que hay dentro y dónde se ve en el panel: [supabase.md](supabase.md).

| Pieza | Dónde vive | Cómo se publica |
|---|---|---|
| Frontend | Hostinger, sitio `restorifyauto.net` conectado al repositorio de GitHub | Hostinger compila y publica la rama **`produccion`** en cada push ([sección 5](#5-publicar-una-versión)). **Hoy el panel tiene `main`**: ver el aviso de la sección 5 |
| Esquema de base de datos | Supabase (proyecto enlazado en `supabase/.temp/project-ref`) | `npx supabase db push --linked` |
| Edge functions | Supabase | `npx supabase functions deploy <nombre>` |
| Secretos de funciones | Supabase → Edge Functions → Secrets | `npx supabase secrets set` |
| Secretos que usa la base | Supabase Vault | SQL una vez (sección 4.6) |
| Correo transaccional | Resend, dominio `restorifyauto.net` | DNS en Hostinger ([sección 4.8](#48-correo-resend)) |
| DNS | Hostinger (`pixel.dns-parking.com`, `byte.dns-parking.com`) | hPanel → Dominios → restorifyauto.net → DNS |

> **Dominio.** `restorifyauto.net` desde el 30 de septiembre de 2026. Antes el sitio vivía en
> `reinventa.shop`, un dominio provisional que se dio de baja: los enlaces viejos ya no abren.

> **La base y el frontend se publican juntos.** Varias migraciones eliminan o
> mueven columnas (`20260918` mueve los montos; `20260919` cambia fotos y firma).
> Un `dist` viejo contra una base nueva —o al revés— rompe pantallas. El banner de
> "esquema desactualizado" lo avisa, pero no lo arregla. Como un push a `produccion`
> publica solo, **ese push va siempre después del `db push`**.

---

## 2. Entornos

Hoy **solo existe producción**. Es un riesgo: las pruebas e2e que crean datos y la
configuración de push y correo se prueban contra datos reales.

**Recomendado** antes de la fase 4: un segundo proyecto de Supabase como
*staging*, con las mismas migraciones y secretos propios (otra llave VAPID, otro
secreto de funciones), y un subdominio (`staging.restorifyauto.net`) con otro sitio de
Hostinger que publique una rama `staging`, con las variables de ese proyecto. El flujo
sería: migrar y probar en staging → repetir en producción.

---

## 3. Variables del frontend

- **Producción:** en Hostinger, en los ajustes de compilación del sitio → **Variables de
  entorno**. Hostinger compila con esas, no con `.env.local`.
- **Desarrollo:** en `.env.local` (nunca se sube a git). Plantilla en `.env.example`.

Vite las **incrusta al compilar**: cambiar una exige un despliegue nuevo. Por lo mismo son
**públicas** (terminan dentro del JavaScript): nunca pongas ahí la llave de servicio, la de
Resend ni la VAPID privada.

| Variable | Obligatoria | Qué es |
|---|:---:|---|
| `VITE_SUPABASE_URL` | ✅ | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Clave anónima (pública por diseño) |
| `VITE_PUBLIC_SITE_URL` | recomendada | `https://restorifyauto.net`, sin barra final. Base del enlace del cliente y de la recuperación de contraseña |
| `VITE_VAPID_PUBLIC_KEY` | para push | Llave **pública** VAPID, pareja de la privada de los secretos. Sin ella, la tarjeta de push dice "no configurado" |
| `VITE_SENTRY_DSN` | opcional | Monitoreo de errores. Vacía mientras no exista el proyecto en Sentry; nunca el valor de ejemplo |

Para comprobar con qué se compiló lo publicado, se busca en los archivos de
`https://restorifyauto.net/assets/`: el dominio, la URL del proyecto y la versión de esquema
(la migración más nueva) aparecen tal cual.

---

## 4. Configuración única de Supabase

Se hace una vez por entorno. Si cambias de proyecto, repite todo.

### 4.1 Plan y límites de gasto

- Plan **Pro** ($25/mes). Capacidad estimada en
  [multimedia-y-notificaciones.md](multimedia-y-notificaciones.md#capacidad-del-plan).
- El **spend cap** viene activo: si se excede una cuota el servicio se restringe
  en lugar de cobrar. Revisa Settings → Usage mensualmente.

### 4.2 Auth

- **Site URL**: `https://restorifyauto.net`.
- **Redirect URLs**: `https://restorifyauto.net/**` (cubre `/reset-password`) y el origen de
  desarrollo que uses. Detalle en [password-reset.md](password-reset.md).
- **Registro público apagado**: Authentication → Sign In / Providers → **Allow new users
  to sign up** apagado. Las cuentas las crea un admin con la edge function
  `create-employee`. **No apagues el proveedor Email**: sin él nadie inicia sesión. En el
  proyecto real estaba abierto hasta la revisión previa a producción (PRD-01); `npm run
  qa:security` → SEC-18 lo comprueba.
- **Largo mínimo de contraseña: 8** (Email → Minimum password length), el mismo que exigen
  la app y las funciones de empleados.
- **`supabase/config.toml` no se aplica solo.** Describe el Supabase local. Si alguna vez
  usas `npx supabase config push`, revisa el diff antes de confirmar: sobrescribe la
  configuración de Auth del proyecto real.
- **SMTP propio con Resend** (configurado el 30 de septiembre de 2026, con el dominio
  definitivo). Sin él, el correo de fábrica de Supabase permite ~2 correos por hora y solo
  entrega a miembros del equipo del proyecto: el "¿Olvidaste tu contraseña?" de un técnico
  no le llega. Authentication → Emails → SMTP Settings: host `smtp.resend.com`, puerto
  `465`, usuario `resend`, contraseña = una API key de Resend de solo envío (una aparte de
  `RESEND_API_KEY`, para poder cambiar una sin romper la otra), remitente
  `notificaciones@restorifyauto.net`. Se guarda solo con el dominio ya verificado en Resend.

### 4.3 Storage

- **No hace falta cambiar el límite global de archivo.** La app y el bucket
  `orden_media` usan 50 MB por archivo, que es también el máximo del plan Free
  (migración `20260921000000`). Si algún día se sube el tope de la app, el límite
  global (Storage → Settings) tiene que ser igual o mayor, y en Free no pasa de 50 MB.
- Los buckets y sus políticas los crean las migraciones; no se crean a mano.
- **Para vaciar un bucket, usa el panel** (Storage → el bucket → seleccionar todo →
  Delete). `npx supabase storage rm -r ss:///<bucket>` borra también el bucket: pasó el
  29 de septiembre de 2026 con los ocho. Si falta uno, la app responde "Bucket not found"
  al subir; el SQL para recrearlos está en [supabase.md §5](supabase.md#5-storage).

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
VAPID_SUBJECT=mailto:notificaciones@restorifyauto.net
```

```bash
npx supabase secrets set --env-file supabase/.env.secrets.local
npx supabase secrets list          # comprobar (muestra nombres, no valores)
```

La **pública** VAPID también va como `VITE_VAPID_PUBLIC_KEY` en las variables del sitio en
Hostinger (producción) y en `.env.local` (desarrollo); las dos ya están.

Para generar un juego nuevo en otro entorno:

```bash
npx web-push generate-vapid-keys --json            # par VAPID
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # secreto
```

**Correos al cliente (fase 4)** — se cargan aparte, nunca en un archivo:

```bash
npx supabase secrets set RESEND_API_KEY=<llave de Resend de solo envío> \
  PUBLIC_SITE_URL=https://restorifyauto.net \
  EMAIL_FROM_ADDRESS=notificaciones@restorifyauto.net
# opcional; por defecto America/Chicago
npx supabase secrets set SHOP_TIMEZONE=America/Chicago
```

La llave de Resend debe ser de **solo envío** y restringida a `restorifyauto.net`. La
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

- Dominio `restorifyauto.net`; registros agregados en Hostinger el 30 de septiembre de 2026
  (antes el dominio era `reinventa.shop`). Resend usa el formato nuevo: el SPF va con **dos
  CNAME**, no con un MX y un TXT en `send`:

| Tipo | Nombre | Valor |
|---|---|---|
| TXT | `resend._domainkey` | Llave DKIM (`p=MIGf…`), copiada completa del panel de Resend |
| CNAME | `rsend` | `rsend.forge.rmta.net` |
| CNAME | `send` | `send.forge.rmta.net` |
| TXT | `_dmarc` | `v=DMARC1; p=none;` |

- En el editor de Hostinger el nombre va **sin el dominio** (`send`, no
  `send.restorifyauto.net`). Un CNAME no convive con otros registros del mismo nombre: no
  agregues un MX ni un TXT en `send`.
- Los demás registros del dominio son del sitio y no se tocan: `ALIAS @` y `CNAME www` (al
  CDN de Hostinger) y `A ftp`.
- Para comprobarlos sin esperar a la caché, preguntar directo al DNS de Hostinger:
  `dig CNAME send.restorifyauto.net @byte.dns-parking.com`, o en PowerShell
  `Resolve-DnsName send.restorifyauto.net -Type CNAME -Server byte.dns-parking.com`.
- Si se activa el correo de Hostinger en el mismo dominio, sus registros van en la
  raíz (MX, SPF) y no chocan con estos. El único que no puede duplicarse es `_dmarc`.
- Remitente: `"Nombre del taller" <notificaciones@restorifyauto.net>`, con *Reply-To*
  al correo de contacto de la sede (Configuración → Sedes).
- Dos llaves de solo envío: `RESEND_API_KEY` (los correos al cliente, en los secretos de las
  funciones) y la del SMTP de Auth (en el panel de Supabase). Las de `reinventa.shop` se
  borraron. Plan gratuito: 3.000 correos al mes, 100 por día.

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
unos minutos entre el paso 4 y el 6 (lo que tarda Hostinger en compilar) en los que la app
publicada no coincide con la base. Si una migración borra o renombra algo, o reescribe una función de dinero, sigue
antes [mantenimiento.md §4](mantenimiento.md#4-cambiar-la-base-sin-comprometer-la-operación)
(expandir y contraer, qué revisar, cómo volver atrás).

**Respaldo antes del paso 4.** Desde el 30/09/2026 el proyecto está en el plan **Pro**, que
guarda un respaldo diario (Database → Backups). Antes de una migración que mueva o borre
datos conviene además un respaldo manual del momento:

```bash
# Fuera del repositorio: lleva datos de clientes. Tres archivos, porque `db dump` sin
# opciones guarda solo el esquema.
npx supabase db dump --linked --role-only -f <carpeta fuera del repo>/roles-AAAAMMDD.sql
npx supabase db dump --linked -f <carpeta fuera del repo>/esquema-AAAAMMDD.sql
npx supabase db dump --linked --data-only --use-copy -f <carpeta fuera del repo>/datos-AAAAMMDD.sql
```

```bash
# 4. Base de datos
npx supabase db push --linked

# 5. Edge functions que hayan cambiado (sección 4.7)

# 6. Frontend: Hostinger compila y publica lo que llega a `produccion`
git push origin main:produccion
```

**Cómo publica Hostinger.** El sitio `restorifyauto.net` está conectado al repositorio de
GitHub y publica **solo la rama `produccion`**, sola, en cada push: instala con Node 22,
corre `npm run build` (que incluye `tsc -b`: un error de tipos frena el despliegue) y sirve
`dist/`, con su `.htaccess`. Las variables `VITE_*` salen de su panel
([sección 3](#3-variables-del-frontend)). `main` es la rama de trabajo: nada de lo que llega
a `main` se publica hasta el push a `produccion`.

- **Hostinger no espera al CI.** Empuja a `produccion` solo un commit con el CI de GitHub en
  verde.
- `git push origin main:produccion` es un avance rápido. Si Git lo rechaza, alguien subió
  algo directo a `produccion`: revisa qué es antes de forzar nada.
- Revisa en el panel del sitio que la rama configurada sea `produccion` y no `main`.

> **Estado al 30/09/2026: el panel publica `main`.** El sitio cambió uno o dos minutos
> después de cada uno de tres pushes a `main`, y `produccion` no se movió desde el 29/09.
> Mientras no se cambie la rama en hPanel → Sitios web → restorifyauto.net → GitHub,
> **un push a `main` es un despliegue**, antes de que termine el CI y antes de cualquier
> `db push`. Para volver al flujo de esta sección, cambia la rama a `produccion` y haz
> `git push origin main:produccion` para ponerla al día. Ver
> [evaluacion-2026-10.md](historico/evaluacion-2026-10.md#5-operación-y-despliegue).
- Para volver a compilar sin cambios en el código (por ejemplo, tras cambiar una variable),
  vuelve a desplegar desde el panel de Hostinger.

```bash
# 7. Seguridad contra la API ya desplegada (0 FAIL)
npm run qa:security
```

**Un build siempre espera todas las migraciones del código.** La app compara la
migración más nueva de su carpeta con la de la base y, si la base está atrasada,
muestra el aviso de "esquema desactualizado". Por eso el paso 4 va antes que el 6,
aunque la migración no cambie columnas: con el despliegue automático, una migración que
llega a `produccion` antes de aplicarse ya está publicada.

### Auditoría de septiembre 2026

**Ya desplegada en el proyecto enlazado** (15 de septiembre de 2026). Para otro entorno: si
`db:check` lista `20260926000000_audit_hardening`, esta versión cierra los hallazgos de
[auditoria-2026-09.md](historico/auditoria-2026-09.md). No mueve columnas: se puede aplicar en
horario de trabajo.

```bash
npx supabase db push --linked                    # la migración
npx supabase functions deploy delete-employee    # mensaje al borrar empleados con pagos
npx supabase functions deploy update-employee    # editar empleados (faltaba desplegar: AUD-26)
npm run build                                    # y subir dist/ (hoy: git push origin main:produccion)
npm run qa:security                              # SEC-05 a SEC-08 pasan a PASS
```

Si la versión incluye migraciones nuevas, **los pasos 4 y 6 van seguidos**.

---

## 6. Verificación después de publicar

Diez minutos. Es el nivel **humo** del plan de pruebas; si algo falla,
[plan-de-pruebas.md](historico/plan-de-pruebas.md) tiene el detalle de cada caso.

- [ ] `npm run qa:security` → 0 FAIL (SEC-17 confirma que las 6 edge functions están desplegadas).
- [ ] `npx supabase functions list` → `portal`, `process-outbox`, `cleanup-storage`, `create-employee`, `update-employee`, `delete-employee`.

- [ ] La app abre sin el banner de "esquema desactualizado".
- [ ] Iniciar sesión como admin y como técnico.
- [ ] Como técnico: solo aparecen las órdenes que tiene asignadas, y ninguna muestra totales,
      depósito ni precios de repuestos. En el menú no están Clientes, Vehículos ni Empleados.
- [ ] Crear una orden de prueba con una foto; la bandeja de subidas termina.
- [ ] Grabar un video corto en un avance desde el teléfono; se reproduce.
- [ ] Configuración → Notificaciones → **Enviar prueba** llega al teléfono.
- [ ] Asignar un técnico a la orden: le llega "Nueva orden asignada" (campana y push).
- [ ] Con un cliente de prueba con tu correo: firmar la recepción → al minuto llega
      "Recibimos su…" (al instante si la orden tiene foto de recepción; si no, a los 30 s); el
      botón abre `restorifyauto.net/r/…` con la orden.
- [ ] La tarjeta **Enlace del cliente** muestra el correo como **Enviado**.
- [ ] Agregar un trabajo a esa orden → **Enviar presupuesto** → llega el correo; autorizarlo desde
      el enlace → la orden suma el trabajo y llega "Recibimos su respuesta".
- [ ] **Enviar reporte → Enviar por correo** → llega el correo del reporte; **Descargar PDF**
      baja un PDF con el enlace y sin notas internas.
- [ ] Entregar la orden de prueba: el diálogo muestra lo que falta cobrar y pide el método;
      Finanzas muestra el "Pago final" con ese método.
- [ ] `curl -s "https://<ref>.supabase.co/functions/v1/portal?token=$(printf '0%.0s' {1..64})"`
      responde `{"estado_enlace":"no_encontrado"}` con HTTP 404.
- [ ] `https://restorifyauto.net/sw.js` responde con `Cache-Control: no-cache` (DevTools → Network).
- [ ] `curl -sI https://www.restorifyauto.net/work-orders` responde `301` a
      `https://restorifyauto.net/work-orders` (una sola dirección: con `www` sería otra sesión,
      otra app instalada y otro push).
- [ ] Tareas programadas activas:
  ```sql
  SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'restorify-%';
  -- restorify-outbox (cada minuto), restorify-maintenance (09:00 UTC),
  -- restorify-quote-reminders (15:00 UTC), restorify-due-reminders (15:15 UTC)
  ```
- [ ] Firmar otra vez la orden de prueba (limpiar y firmar) después de agregar un trabajo →
      el trabajo sigue **Sin autorizar** (PRE-15).
- [ ] Borrar la orden de prueba (si ya está entregada con comisiones pagadas, deshacer antes
      el pago en Comisiones).

---

## 7. Rotar secretos y llaves

| Qué | Cómo | Efecto |
|---|---|---|
| `RESTORIFY_FUNCTIONS_SECRET` | Nuevo valor en `secrets set` **y** en Vault (`vault.update_secret`) | Ninguno si ambos cambian juntos; si no, los envíos quedan pendientes (401) |
| Par VAPID | Nuevas llaves en secrets y en `VITE_VAPID_PUBLIC_KEY` (Hostinger y `.env.local`) → volver a desplegar | **Todos** deben volver a activar push; conviene borrar `push_suscripciones` |
| Clave de servicio de Supabase | Panel de Supabase | Las edge functions la reciben sola |
| API key de Resend | Crear nueva de solo envío → `secrets set RESEND_API_KEY` → borrar la vieja. La del SMTP de Auth es otra: se cambia en Authentication → Emails → SMTP | Ninguno |
| Clave anónima | Panel de Supabase → `VITE_SUPABASE_ANON_KEY` en Hostinger → volver a desplegar | Sesiones abiertas se cierran |

---

## 8. Volver atrás

- **Frontend:** `git revert` del commit que falló, en `main`, y
  `git push origin main:produccion`: Hostinger publica la versión corregida. Solo es seguro
  si la base no recibió migraciones que esa versión necesite. No reescribas `produccion` con
  un push forzado.
- **Base de datos:** las migraciones no tienen "down". Volver atrás es escribir una
  migración nueva que revierta (detalle en
  [mantenimiento.md §4](mantenimiento.md#4-cambiar-la-base-sin-comprometer-la-operación)).
  Antes de cada `db push`, **respaldo**: Database → Backups (Pro guarda 7 días) o los tres
  archivos de la [sección 5](#5-publicar-una-versión). Ojo: `db dump` sin `--data-only`
  guarda solo el esquema, no los datos.
- **Edge function:** volver a desplegar la versión anterior desde git.

---

## 9. Integración continua

`.github/workflows/ci.yml` corre en cada push y pull request a `main`: lint, tipos, pruebas
y build en un trabajo, y en otro levanta Postgres con la CLI de Supabase, aplica las 36
migraciones desde cero y corre pgTAP. No despliega ni usa secretos. Referencia del flujo
(el archivo del repositorio es la fuente de verdad):

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
      - run: npm run build

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
