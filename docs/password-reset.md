# Restablecer contraseña — configuración y personalización

## El problema reportado

Al hacer clic en el enlace del correo de "restablecer contraseña", el navegador
abría esto y fallaba:

```
http://localhost:3000/#access_token=eyJhbGciOi...&type=recovery
```

> No se puede acceder a este sitio web. La página localhost ha rechazado la conexión.

El enlace no está roto: apunta a `localhost:3000`, que es una dirección que solo
existe dentro de la máquina donde corría el servidor de desarrollo. Abierto
desde cualquier otro lado —otra computadora, un teléfono, o la misma máquina con
el servidor apagado— no hay nada escuchando ahí.

Supabase construye ese enlace a partir de dos cosas:

1. El `redirectTo` que envía la aplicación, **si** esa URL está en la lista de
   *Redirect URLs* del proyecto.
2. Si no lo está —o si no se envía ninguno— usa el **Site URL** del proyecto.

La app enviaba `window.location.origin`, es decir, la dirección desde la que
estaba abierta en ese momento. Pedido desde el servidor de desarrollo, eso es
`http://localhost:3000`, y como esa URL no estaba en la lista permitida,
Supabase la descartó y cayó al Site URL — que en el panel también apuntaba a
localhost.

## Lo que ya se corrigió en el código

- Nueva variable de entorno `VITE_PUBLIC_SITE_URL` (ver `.env.example`). Fija el
  dominio público desde el que se sirve la app, de modo que el enlace generado
  desde cualquier lugar apunte a una dirección real. Si no se define, se sigue
  usando el origen del navegador — lo que mantiene el desarrollo local
  funcionando.
- El enlace ahora apunta a una ruta con nombre, `/reset-password`, en lugar de a
  la raíz del sitio. Así la persona ve directamente la pantalla de "elige una
  contraseña" y la lista de Redirect URLs tiene algo concreto que permitir.

Ver [`src/lib/siteUrl.ts`](../src/lib/siteUrl.ts).

## Lo que hay que definir al compilar

`VITE_PUBLIC_SITE_URL` no viene definida por defecto, y sin ella el código cae en el
origen del navegador: un `dist/` compilado así sigue emitiendo enlaces a localhost por
más correcto que esté el panel. En producción está en las variables del sitio en
Hostinger.

```bash
# En producción: variables de entorno del sitio en Hostinger. En desarrollo: .env.local
VITE_PUBLIC_SITE_URL=https://restorifyauto.net
```

Vite **incrusta** el valor en el bundle, no lo lee al ejecutar. Después de cambiarla
hay que volver a desplegar (ver [deployment.md](deployment.md)); lo que ya está publicado
conserva el comportamiento viejo. `npm run build`
avisa cuando la variable falta, pero no falla: un preview desechable no lo merece.

## Lo que hay que configurar en el panel de Supabase

Ningún cambio en el código sustituye estos dos pasos.
**Authentication → URL Configuration:**

| Campo | Valor |
| --- | --- |
| **Site URL** | `https://restorifyauto.net` (el dominio de producción, nunca localhost) |
| **Redirect URLs** | `https://restorifyauto.net/reset-password`<br>`https://restorifyauto.net/**`<br>`http://localhost:5173/reset-password` |

Notas:

- El Site URL es el **respaldo** que Supabase usa cuando el `redirectTo` no está
  permitido. Si apunta a localhost, se seguirán enviando enlaces a localhost por
  más correcto que sea el cliente. Esta es la causa raíz del reporte.
- Las Redirect URLs se comparan de forma **exacta** (salvo por los comodines
  `**`). Una barra final de más hace que no coincida, y Supabase no avisa: cae
  silenciosamente al Site URL.
- Agrega el puerto real del servidor de desarrollo. Vite usa `5173` por defecto;
  si en esa máquina corre en `3000`, hay que listar ese.

## Personalizar el mensaje del correo

**Authentication → Emails → Templates → "Reset Password"**

Se puede editar el asunto y el HTML completo del correo sin costo. Las variables
disponibles en la plantilla son:

| Variable | Contenido |
| --- | --- |
| `{{ .ConfirmationURL }}` | El enlace de recuperación completo |
| `{{ .Token }}` | Código de 6 dígitos, como alternativa al enlace |
| `{{ .SiteURL }}` | El Site URL del proyecto |
| `{{ .Email }}` | El correo del destinatario |

Ejemplo con la identidad del taller:

```html
<h2>Restablecer tu contraseña</h2>
<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
<p><a href="{{ .ConfirmationURL }}">Elegir una contraseña nueva</a></p>
<p>El enlace vence en una hora. Si no fuiste tú, puedes ignorar este mensaje.</p>
<p>— Restorify</p>
```

### Lo que sí está limitado sin SMTP propio

No es la plantilla, sino el **envío**:

- El servicio de correo integrado de Supabase está pensado para pruebas y tiene
  un límite muy bajo (unos 2 correos por hora, por proyecto). Con varios
  empleados pidiendo restablecer la contraseña el mismo día, se alcanza.
- Los correos salen desde una dirección de Supabase, no desde el dominio del
  taller, así que es más probable que caigan en spam.

Ambas cosas se resuelven con **SMTP propio**. El dominio `restorifyauto.net` ya está
verificado en **Resend** (registros DNS en Hostinger), que es también el
proveedor elegido para los correos al cliente de la fase 4.

**Authentication → Emails → SMTP Settings:**

| Campo | Valor |
| --- | --- |
| Host | `smtp.resend.com` |
| Puerto | `465` |
| Usuario | `resend` |
| Contraseña | Una API key de Resend **de solo envío** para `restorifyauto.net` |
| Remitente | `notificaciones@restorifyauto.net`, nombre `Restorify` |

Crea en Resend una llave nueva con permiso *Sending access* limitada al dominio;
no uses una llave de acceso completo. La llave vive solo en el panel de Supabase
(y como secreto `RESEND_API_KEY` cuando existan los correos de la fase 4), nunca
en el repositorio. Después de configurar SMTP, sube el límite en
*Authentication → Rate Limits* si hace falta.

No se usa el correo de Hostinger para enviar: no informa si un correo rebotó y
Hostinger puede bloquear un buzón que envía de forma automatizada. Los buzones
de Hostinger sirven para **recibir** (por ejemplo, como dirección de respuesta).

## Cómo probarlo

1. Define `VITE_PUBLIC_SITE_URL` y vuelve a compilar (Vite incrusta las
   variables en el build; no las lee en tiempo de ejecución).
2. Configura Site URL y Redirect URLs como arriba.
3. Pide un restablecimiento desde la pantalla de inicio de sesión.
4. En el correo, **copia el enlace antes de abrirlo** y verifica que empiece con
   el dominio de producción y no con `localhost`.
5. Ábrelo desde otro dispositivo. Debe cargar la pantalla de "elige una
   contraseña nueva".

## Si el correo no sale

**Síntoma (30 de septiembre de 2026):** "Enviar enlace" se quedaba cargando unos 30 segundos
y después mostraba un error. Desde ese día la pantalla dice "No se pudo enviar el correo de
recuperación…" (`getRecoveryErrorMessage`, `src/lib/errors.ts`). Antes decía "No se pudo
iniciar sesión. Revisa tu conexión", que mandaba a buscar el problema en el lugar equivocado.

**Causa:** el puerto del SMTP estaba en `464` en lugar de `465`. Supabase intentaba
conectarse a un puerto donde Resend no atiende, esperaba hasta agotar el tiempo y respondía
`504 upstream request timeout`.

**Cómo distinguir dónde está el problema sin entrar al panel:**

```bash
# Pide la recuperación de un correo que NO existe: si responde 200 al instante, Auth
# funciona; no envía nada a nadie.
curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" -X POST "$VITE_SUPABASE_URL/auth/v1/recover" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"no-existe@ejemplo.com"}'

# La configuración real de Auth, comparada con supabase/config.toml. Solo lee: muestra
# Site URL, Redirect URLs y el host, puerto, usuario y remitente del SMTP, nunca la contraseña.
npx supabase config diff
```

| Lo que pasa | Qué revisar |
|---|---|
| Tarda ~30 s y falla (504) con un correo que sí existe | Host y **puerto** del SMTP: `smtp.resend.com`, `465` (o `587`). Un puerto equivocado no da error, se cuelga |
| Falla al instante con un correo que sí existe | Llave de Resend (contraseña del SMTP) o remitente de un dominio que Resend no tiene verificado. El detalle está en Supabase → Logs → Auth |
| Llega, pero el enlace abre otro dominio | Site URL y Redirect URLs (arriba). Si el `redirect_to` no está en la lista, Supabase usa la Site URL |
| "Ya se envió un correo hace poco" | Es el intervalo mínimo por persona (60 s). Esperar |

**Nunca uses `supabase config push` para corregirlo**: subiría todo `config.toml` (la copia
local) encima de la configuración real de Auth. Se corrige en el panel.
