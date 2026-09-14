# Portal del cliente y correos automáticos

La fase 4: el cliente sigue su vehículo sin crear una cuenta. Cada orden tiene un
**enlace personal** (`reinventa.shop/r/<token>`) que abre un reporte web, y el
sistema le **manda correos** cuando hay algo nuevo. Los correos no traen los datos:
traen el enlace.

Reglas en lenguaje de negocio: [reglas-de-negocio.md](reglas-de-negocio.md#7-portal-del-cliente-y-correos).
Cómo probarlo: [pruebas.md](pruebas.md#413-portal-del-cliente-y-correos).

---

## Índice

1. [El recorrido](#1-el-recorrido)
2. [El enlace](#2-el-enlace)
3. [El portal](#3-el-portal)
4. [Los correos](#4-los-correos)
5. [Piezas](#5-piezas)
6. [Decisiones de diseño](#6-decisiones-de-diseño)
7. [Configuración](#7-configuración)
8. [Límites y costos](#8-límites-y-costos)
9. [Diagnóstico](#9-diagnóstico)
10. [El reporte web](#10-el-reporte-web)
11. [Pendiente](#11-pendiente)

---

## 1. El recorrido

```
El técnico captura la firma de recepción
  └─ trg_order_portal (AFTER UPDATE OF firma_ruta)
       ├─ asegurar_enlace_orden()       → orden_enlaces (token nuevo)
       └─ encolar_correo_cliente('recepcion', espera 2 min)
                                         → cola_envios (canal email)

pg_cron cada minuto → dispatch_outbox_if_due() → pg_net → process-outbox
  └─ datos_correo(id)  lee cliente, taller, estatus y enlace EN ESE MOMENTO
  └─ renderEmail()     plantilla (_shared/email/templates.ts)
  └─ Resend API        Idempotency-Key = id de la fila
  └─ finish_outbox()   enviado / omitido / reintentar

El cliente toca el botón del correo → reinventa.shop/r/<token>
  └─ main.tsx ve /r/ y carga solo el portal (sin la app del taller)
  └─ GET functions/v1/portal?token=…
       └─ datos_portal(token)  JSON armado campo por campo
       └─ URLs firmadas de 2 h para fotos, videos, audio y firma
```

---

## 2. El enlace

| Momento | Qué pasa |
|---|---|
| El cliente **firma la recepción** | Se crea solo |
| Un admin pulsa **Crear enlace** | Se crea (para órdenes sin firma o sin correo) |
| Se encola cualquier correo | Se crea si no existe |
| La orden se **entrega** | `expira_en` = ahora + 90 días |
| Se **saca de Entregado** | `expira_en` vuelve a null |
| Un admin pulsa **Cambiar enlace** | El anterior se revoca y nace otro |
| Un admin pulsa **Desactivar** | Se revoca; no abre hasta crear otro |

- **Uno activo por orden** (índice único parcial `WHERE revocado_en IS NULL`).
- **Token**: 64 hexadecimales de dos `gen_random_uuid()` (244 bits de
  `pg_strong_random`). No depende de pgcrypto.
- **Se guarda tal cual**, no un hash: el admin tiene que poder copiarlo otra vez
  para mandarlo por WhatsApp. Lo protege RLS (solo admin lee `orden_enlaces`).
- Cada apertura suma `accesos` y actualiza `ultimo_acceso_en`: la tarjeta muestra
  "Abierto 3 veces · última vez hace 2 h".
- Un enlace **vencido** que se necesita para un correo se revoca y se reemplaza.

---

## 3. El portal

### Qué ve el cliente

| Sección | Contenido |
|---|---|
| Encabezado | Logo y nombre del taller, número de orden, estado, vehículo (color, placa, últimos 6 del VIN) |
| Estado | Cuatro pasos (Recibido → En proceso → Listo → Entregado), "esperando repuestos" como texto, avance y fecha estimada |
| **Presupuesto por autorizar** (fase 5) | Si hay uno enviado: cada trabajo con su monto, casillas sin marcar, total de lo marcado, nombre, comentario, "Autorizar lo marcado" / "No autorizar nada". Ver [presupuestos.md](presupuestos.md) |
| Avances | Solo fotos, videos y notas de voz de avances que un admin **publicó**, con fecha |
| Recepción | Fecha, millaje, gasolina, observaciones, fotos de recepción visibles, firma |
| Cuenta | Mano de obra y repuestos **autorizados** a **precio de venta**, total, depósito, pagado, saldo; lo **no autorizado** aparte y tachado; "Sus autorizaciones" (presupuesto, vía, fecha, conteos) |
| Contacto | Llamar al taller; WhatsApp y correo si la sede los tiene configurados |
| Avisos por correo | Dejar de recibir / volver a recibir (solo si el cliente tiene correo) |

Español o inglés (según el teléfono; se puede cambiar), tema claro, una columna.

### Qué nunca ve

Comisiones, técnicos asignados, **texto** de los avances (notas internas), archivos
no publicados, costo del taller en repuestos, VIN completo, correo del cliente,
rutas internas de Storage, datos de otras órdenes. `datos_portal` arma el JSON
campo por campo, nunca con `to_jsonb(fila)`: una columna nueva no aparece sola.

### Estados del enlace

| Respuesta | HTTP | La página muestra |
|---|---|---|
| `ok` | 200 | El reporte |
| `no_encontrado` | 404 | "Enlace no válido" |
| `revocado` | 410 | "Ya no está activo" + botón para llamar al taller |
| `vencido` | 410 | "Venció" + botón para llamar al taller |

### Carga separada

`main.tsx` decide por la ruta: `/r/…` importa `portal/start.tsx`; todo lo demás,
`appStart.tsx`. El portal **no descarga** la app del taller, el cliente de Supabase
(habla con la función por `fetch`), Sentry (grabaría la sesión de una persona
ajena), ni registra el service worker de push. Pesa unos 80 KB comprimidos
(React, el portal y los estilos), menos de la mitad que la app del taller.

Además `portal/start.tsx` pone `referrer=no-referrer` (el token no sale como
Referer al tocar WhatsApp), `robots=noindex` y quita el manifest (instalar desde ahí
pondría el login del taller en el teléfono del cliente).

---

## 4. Los correos

| Plantilla | Cuándo | Espera | Clave de agrupación |
|---|---|---|---|
| `recepcion` | Primera firma de la orden | 2 min (que suban las fotos) | `recepcion:<orden>`; nunca se repite |
| `estatus` | Pasa a en proceso, espera de repuestos, finalizado o entregado | 3 min | `estatus:<orden>` |
| `avance` | Un admin pulsa **Avisar novedades** | 1 min | `avance:<orden>` |
| `presupuesto` | Un admin pulsa **Enviar presupuesto** (fase 5) | 1 min | `presupuesto:<presupuesto>`; se omite si ya se respondió o canceló |
| `presupuesto_confirmacion` | Se responde un presupuesto desde el enlace o lo registra un admin | Inmediato | `presupuesto_confirmacion:<presupuesto>` |
| `reporte` | Un admin pulsa **Enviar reporte → Enviar por correo** (fase 6) | 1 min | `reporte:<orden>`; dos toques seguidos son un correo |

### Reglas al enviar

Todo se decide con los datos **del momento del envío**, no del momento en que se
encoló:

- Correo del cliente vacío o inválido → **omitido**.
- El cliente se dio de baja → **omitido** (la baja además cancela lo pendiente).
- `estatus`: si la orden volvió a un estado que no se anuncia (recepción) →
  **omitido**; si es el mismo estado que ya se anunció → **omitido**
  ("en proceso → espera → en proceso" no manda dos veces "en proceso").
- Se usa el correo actual del cliente: corregir un error de dedo mientras el aviso
  espera lo hace llegar a la dirección corregida.

### Agrupación

Un segundo cambio dentro de la espera **reemplaza** la fila pendiente (índice único
parcial sobre `clave_dedupe` con `estado = 'pendiente'`) y reinicia la espera. Quien
arrastra una orden por tres columnas manda un solo correo, con el último estado.

### Resend

- `from`: `"<Nombre del taller>" <notificaciones@reinventa.shop>`.
- `reply_to`: el correo de contacto de la sede, si está configurado. Sin él, el pie
  no ofrece responder.
- `Idempotency-Key`: el id de la fila. Si la función muere después de que Resend
  aceptó, el reintento no duplica el correo.
- 429 o 5xx → reintento con espera creciente (1, 4, 16, 64 min; error al quinto).
  Otro 4xx (dirección rechazada, llave sin permiso) → **error** sin reintentar.
- 550 ms entre correos: el plan gratuito permite 2 por segundo.
- Etiqueta `plantilla` en Resend para filtrar en su panel.

### Baja

El pie de cada correo lleva "No quiero recibir estos correos" →
`/r/<token>?correos=baja`. **Esa página no da de baja sola**: resalta la sección y
pide confirmar con un botón (POST). Los filtros de correo corporativos abren los
enlaces para revisarlos; una baja por GET daría de baja a todos sus usuarios.

---

## 5. Piezas

| Pieza | Dónde |
|---|---|
| Tabla del enlace, funciones, trigger | `supabase/migrations/20260923000000_customer_portal_and_emails.sql` |
| Función pública del portal | `supabase/functions/portal/index.ts` (`verify_jwt = false`) |
| Envío de correos | `supabase/functions/process-outbox/index.ts` (`sendEmail`) |
| Plantillas | `supabase/functions/_shared/email/templates.ts` (TS puro; se prueba con Vitest) |
| Página del cliente | `src/portal/` (`CustomerPortal.tsx`, `strings.ts`, `portal.api.ts`, `portal.css`) |
| Arranque separado | `src/main.tsx`, `src/appStart.tsx`, `src/portal/start.tsx` |
| Tarjeta del admin | `src/features/workOrders/CustomerLinkCard.tsx` |
| Enviar reporte (fase 6) | `src/features/workOrders/ShareReportModal.tsx`, `src/services/reports.service.ts` (mensaje de WhatsApp) |
| PDF de descarga | `src/lib/workOrderPdf.ts`, filtros en `src/lib/reportMedia.ts` |
| Servicio | `src/services/customerPortal.service.ts` |
| Pruebas | `src/lib/emailTemplates.test.ts`, `src/portal/CustomerPortal.test.tsx`, `src/features/workOrders/CustomerLinkCard.test.tsx`, `supabase/tests/database/04_portal_y_correos.test.sql` |

### Funciones SQL

| Función | Quién la llama | Qué hace |
|---|---|---|
| `asegurar_enlace_orden(orden)` | Interna | Devuelve el activo o crea uno |
| `crear_enlace_cliente`, `regenerar_enlace_cliente`, `revocar_enlace_cliente` | Admin (RPC) | Tarjeta del enlace |
| `notificar_cliente_avance(orden)` | Admin (RPC) | "Avisar novedades"; devuelve `encolado` o `sin_correo` |
| `enviar_reporte_cliente(orden)` | Admin (RPC) | "Enviar por correo" del reporte; asegura el enlace, devuelve `{correo: encolado \| sin_correo, token}` |
| `encolar_correo_cliente(...)` | Interna | Valida correo y baja, asegura el enlace, encola o agrupa |
| `trg_portal_on_order_change` | Trigger | Firma → enlace + recepción; estatus → aviso y vencimiento. Nunca rompe la operación (EXCEPTION → WARNING) |
| `datos_portal(token)` | `service_role` (función `portal`) | El JSON del cliente; cuenta el acceso |
| `preferencia_correos_portal(token, acepta)` | `service_role` | Alta o baja; la baja cancela lo pendiente |
| `datos_correo(id)` | `service_role` (`process-outbox`) | Contexto actual para redactar |
| `marcar_estatus_enviado(id, estatus)` | `service_role` | Recuerda qué estado se anunció |

### Columnas nuevas

- `clientes.acepta_correos` (default true), `clientes.correos_baja_en`.
- `sedes.email_contacto` (Reply-To), `sedes.whatsapp` (botón del portal).
- CHECK de formato en `clientes.email` y `sedes.email_contacto` (`NOT VALID`: no
  bloquea datos viejos, sí lo nuevo y lo editado).

---

## 6. Decisiones de diseño

**Sin cuentas de cliente.** Pedirle usuario y contraseña a alguien que deja su auto
una vez al año hace que nadie lo use. El enlace es el estándar de la industria para
este flujo, revocable y con vencimiento.

**El correo no lleva los datos.** Precios, fotos y firma viven detrás del enlace. Un
correo reenviado o una bandeja comprometida exponen solo "hay novedades"; el admin
puede cambiar el enlace y lo anterior deja de abrir.

**Edge function y no RLS para anónimos.** Dar a `anon` acceso a tablas con una
política "si trae el token correcto" obliga a mandar el token en cada consulta y
deja la forma de las tablas expuesta. La función con la llave de servicio llama una
sola función SQL que decide campo por campo.

**Decidir al enviar.** El trigger solo dice "algo cambió en esta orden". Qué correo,
a qué dirección y si todavía vale la pena, lo decide `datos_correo` minutos después.
Así la baja, la corrección del correo o el regreso de estado se respetan.

**Resend y no el SMTP de Hostinger.** Resend dice si un correo se entregó o rebotó
(queda en el historial de la orden), da idempotencia y no bloquea cuentas por envío
automatizado. Los buzones de Hostinger sirven para **recibir** las respuestas
(Reply-To).

**Español en los correos.** La mayoría de los clientes del taller hablan español. El
portal tiene inglés; los correos, por ahora, no (ver sección 10).

---

## 7. Configuración

### Secretos de las funciones

```bash
npx supabase secrets set RESEND_API_KEY=<llave de solo envío> \
  PUBLIC_SITE_URL=https://reinventa.shop \
  EMAIL_FROM_ADDRESS=notificaciones@reinventa.shop
# Opcional (por defecto America/Chicago): zona horaria de las fechas del correo
npx supabase secrets set SHOP_TIMEZONE=America/Chicago
```

La llave de Resend **nunca** va en un archivo del repositorio ni en
`.env.secrets.local`: se carga directo con `secrets set`.

### Despliegue

```bash
npx supabase db push --linked
npx supabase functions deploy portal --no-verify-jwt
npx supabase functions deploy process-outbox --no-verify-jwt
npm run build   # y subir dist/ a Hostinger
```

`public/.htaccess` ya reescribe `/r/...` a `index.html`; no hace falta nada en
Hostinger.

### Datos de cada sede (Configuración → Sedes)

- **Correo de contacto**: a dónde llegan las respuestas de los clientes. Sin él,
  los correos salen igual pero sin opción de responder.
- **WhatsApp del taller**: sin él, el portal ofrece llamar y no WhatsApp.

---

## 8. Límites y costos

| Recurso | Plan | Consumo estimado (2 talleres, ~120 órdenes/mes) |
|---|---|---|
| Resend | Gratis: 3.000 correos/mes, **100 por día** | ~4–6 correos por orden → ~600/mes, ~30/día |
| Edge function `portal` | Supabase: 500 K (Free) / 2 M (Pro) invocaciones | ~10 aperturas por orden → ~1.200/mes |
| Egress de Storage | 5 GB (Free) / 250 GB (Pro) | Solo lo que el cliente abre; las miniaturas pesan ~30 KB |

Si un día se superan los 100 correos diarios, Resend responde 429 y los envíos se
reintentan con espera creciente; los que no alcancen quedan en **error** en el
historial de la orden. El plan de $20/mes de Resend quita el límite diario.

---

## 9. Diagnóstico

**"El cliente no recibió el correo."** Primero la tarjeta **Enlace del cliente** de
la orden: el historial dice si salió, si se omitió y por qué. Luego:

```sql
-- Los correos de una orden, con su motivo
SELECT plantilla, estado, destinatario, datos, intentos, ultimo_error,
       enviar_despues_de, enviado_en, proveedor_id
FROM cola_envios
WHERE canal = 'email' AND orden_id = (SELECT id FROM ordenes_trabajo WHERE numero_orden = 'ORD-2026-014')
ORDER BY creado_en DESC;
```

| Estado / motivo | Qué significa |
|---|---|
| `pendiente` con `enviar_despues_de` futuro | Está en su espera (2–3 min). Normal |
| `omitido` "no tiene un correo válido" | Corregir el correo del cliente |
| `omitido` "pidió no recibir correos" | El cliente se dio de baja desde su enlace |
| `omitido` "ya recibió el aviso de este estado" | Se evitó un duplicado. Normal |
| `error` "Resend HTTP 403" | La llave no tiene permiso o el dominio perdió la verificación (revisar DNS) |
| `error` "Resend HTTP 422" | Resend rechazó la dirección |
| `enviado` pero no llegó | Buscar el `proveedor_id` en Resend → Emails: dice si rebotó o cayó en spam |

**"El enlace no abre."**

```sql
SELECT e.creado_en, e.expira_en, e.revocado_en, e.accesos, e.ultimo_acceso_en
FROM orden_enlaces e JOIN ordenes_trabajo o ON o.id = e.orden_id
WHERE o.numero_orden = 'ORD-2026-014'
ORDER BY e.creado_en DESC;
```

Un enlace revocado se reemplaza con **Cambiar enlace** o **Crear enlace**.

**"El portal muestra 'No pudimos cargar el reporte'."** Panel de Supabase → Edge
Functions → `portal` → Logs. Un 500 con `datos_portal` es de la base; con "firmar
URLs", de Storage.

---

## 10. El reporte web

Fase 6 (migración `20260925000000_web_report`). **El reporte es este enlace.** Antes,
"Generar y enviar" armaba un PDF en el navegador, lo subía al bucket `reportes` y
mandaba un enlace firmado de 30 días por WhatsApp o `mailto:`. Ese PDF se congelaba el
día que se hacía, no reproducía video, no se podía retirar y mostraba la bitácora
interna y los nombres de los técnicos.

### Qué hace hoy el botón

En el detalle de la orden, **solo un administrador** ve **Enviar reporte**. Al tocarlo
se crea el enlace si no existía y se abre una ventana con:

| Opción | Qué hace |
|---|---|
| **Enviar por correo** | `enviar_reporte_cliente` encola la plantilla `reporte` (1 min, agrupada por orden). Deshabilitado si el cliente no tiene correo válido o se dio de baja |
| **Enviar por WhatsApp** | `wa.me/<teléfono>` con el mensaje y el enlace |
| **Copiar enlace** / **Abrir** | Para mandarlo por otro medio o revisarlo antes |
| **Descargar PDF** | El PDF para imprimir o archivar (abajo) |

El correo sale del sistema como los demás (Resend, Reply-To de la sede) y queda en el
historial de la tarjeta **Enlace del cliente**.

### El PDF de descarga

Ya no se sube a ningún lado: se genera en el navegador y se descarga. Muestra **lo mismo
que el portal**:

- Solo fotos **publicadas** al cliente (miniaturas, para que pese poco), de recepción y
  de avances agrupadas por día. Sin videos ni notas de voz.
- Solo líneas **autorizadas**; si la orden está entregada, el saldo es 0 ("Pagado al
  entregar").
- Sin texto de los avances, sin técnicos asignados.
- El enlace del portal, que se puede tocar en el PDF.

### Seguridad

- `enviar_reporte_cliente` rechaza a quien no es admin (42501).
- El bucket `reportes` perdió sus políticas de INSERT y UPDATE: nadie sube PDFs nuevos.
  Los que ya estaban siguen legibles solo para admin.

---

## 11. Pendiente

- ~~**Presupuestos** (fase 5)~~ **hecho**: plantillas `presupuesto` y
  `presupuesto_confirmacion`, POST `responder_presupuesto` en la función `portal`, la
  cuenta del portal con solo lo aprobado. Ver [presupuestos.md](presupuestos.md).
- ~~**Reporte web** (fase 6)~~ **hecho**: ver la sección 10.
- **PDFs viejos** en el bucket `reportes`: se pueden borrar desde el panel de Storage
  cuando ya no hagan falta.
- **Correos en inglés**: agregar `clientes.idioma` y un segundo juego de textos en
  `templates.ts`.
- **Datos de contacto de las sedes**: el correo y el WhatsApp quedaron pendientes de
  cargar en Configuración.
