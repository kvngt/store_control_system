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

`VITE_PUBLIC_SITE_URL` no está en `.env.local` por defecto, y sin ella el código
cae en el origen del navegador: un `dist/` compilado así sigue emitiendo enlaces a
localhost por más correcto que esté el panel.

```bash
# .env.local, en la máquina que compila
VITE_PUBLIC_SITE_URL=https://reinventa.shop
```

Vite **incrusta** el valor en el bundle, no lo lee al ejecutar. Después de definirla
hay que recompilar y volver a subir `dist/` (ver [deployment.md](deployment.md)); el
`dist/` que ya está publicado conserva el comportamiento viejo. `npm run build`
avisa cuando la variable falta, pero no falla: un preview desechable no lo merece.

## Lo que hay que configurar en el panel de Supabase

Ningún cambio en el código sustituye estos dos pasos.
**Authentication → URL Configuration:**

| Campo | Valor |
| --- | --- |
| **Site URL** | `https://reinventa.shop` (el dominio de producción, nunca localhost) |
| **Redirect URLs** | `https://reinventa.shop/reset-password`<br>`https://reinventa.shop/**`<br>`http://localhost:5173/reset-password` |

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
<p>— Taller Reinventa</p>
```

### Lo que sí está limitado sin SMTP propio

No es la plantilla, sino el **envío**:

- El servicio de correo integrado de Supabase está pensado para pruebas y tiene
  un límite muy bajo (unos 2 correos por hora, por proyecto). Con varios
  empleados pidiendo restablecer la contraseña el mismo día, se alcanza.
- Los correos salen desde una dirección de Supabase, no desde el dominio del
  taller, así que es más probable que caigan en spam.

Ambas cosas se resuelven con **SMTP propio**. El dominio `reinventa.shop` ya está
verificado en **Resend** (registros DNS en Hostinger), que es también el
proveedor elegido para los correos al cliente de la fase 4.

**Authentication → Emails → SMTP Settings:**

| Campo | Valor |
| --- | --- |
| Host | `smtp.resend.com` |
| Puerto | `465` |
| Usuario | `resend` |
| Contraseña | Una API key de Resend **de solo envío** para `reinventa.shop` |
| Remitente | `notificaciones@reinventa.shop`, nombre `Restorify` |

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
