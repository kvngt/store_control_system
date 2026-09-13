# Multimedia y notificaciones

Los dos subsistemas con más piezas: el recorrido de una foto, un video o una nota
de voz desde el teléfono hasta el reporte, y el de un aviso desde un trigger
hasta el teléfono de un mecánico con la app cerrada.

Las reglas de negocio (quién sube, qué ve el cliente, quién recibe cada aviso)
están en [reglas-de-negocio.md](reglas-de-negocio.md). Aquí va cómo funciona.

---

## Parte 1 — Multimedia

### El recorrido de un archivo

```
Captura                 Preparación (en el teléfono)        Cola de subida                   Base de datos
───────                 ─────────────────────────────       ──────────────                   ─────────────
Foto (cámara/galería) → compressImage: 1920 px JPEG ──┐
Video (grabador)      → MediaRecorder 720p 1.5 Mbps ──┼─► MediaUploadQueue ──► Storage ──► INSERT orden_media
Video (galería)       → Mediabunny/WebCodecs → MP4 ───┤    IndexedDB, 2 a la vez,  (TUS si
Nota de voz           → MediaRecorder 48 kbps ────────┘    reintentos, reanudable  > 6 MB)
```

1. **Se prepara antes de subir.** La foto de un teléfono pesa 3–8 MB y un video 4K
   de iPhone entre 60 y 350 MB por minuto. Aquí salen a ~300 KB y ~11 MB/min. Es
   lo que hace que el plan de Supabase alcance (ver [capacidad](#capacidad-del-plan)).
2. **Entra a la cola y la persona sigue trabajando.** Crear una orden o un avance
   no espera a la red.
3. **Sube en segundo plano**, de a dos archivos, con reintentos automáticos (3) y
   manuales desde la bandeja de subidas.
4. **Al terminar** se guarda la fila en `orden_media` y el detalle de la orden se
   vuelve a leer: la tarjeta "subiendo" se reemplaza por el archivo real.

### Piezas

| Archivo | Rol |
|---|---|
| `src/lib/media/image.ts` | Comprime a JPEG 1920 px + miniatura 480 px. Quita EXIF/GPS al recodificar |
| `src/lib/media/mime.ts` | Formatos que graba cada navegador (MP4 primero), extensiones, rutas |
| `src/lib/media/galleryVideo.ts` | Convierte videos de galería a MP4 H.264 720p con WebCodecs (carga diferida) |
| `src/lib/media/videoFrame.ts` | Duración, dimensiones y miniatura de un video |
| `src/lib/media/uploadQueue.ts` | La cola: estados, concurrencia, reintentos, reanudación. Sin React ni Supabase |
| `src/lib/media/queueStore.ts` | Persistencia de la cola en IndexedDB (cae a memoria si no hay) |
| `src/services/media.service.ts` | Transporte: subida normal o TUS, fila, URLs firmadas, borrado |
| `src/features/media/MediaUploadsProvider.tsx` | Una cola por sesión, montada en el layout |
| `src/features/media/MediaCaptureBar.tsx` | Botones Foto / Video / Nota de voz / Galería |
| `src/features/media/VideoRecorderModal.tsx`, `AudioRecorderModal.tsx` | Grabadores con corte a 2 min |
| `src/features/media/MediaGallery.tsx` | Miniaturas, visor, visibilidad, borrado |
| `src/features/media/UploadTray.tsx` | Bandeja flotante de subidas |
| `supabase/migrations/20260919000000_order_media.sql` | Tabla, bucket, políticas, triggers |

### Decisiones de diseño

**Grabación dentro de la app, no con la cámara nativa.** La cámara nativa graba
HEVC en 1080p/4K que habría que convertir. `MediaRecorder` graba ya liviano y
corta en el segundo 120 mientras graba, en vez de avisar después.

**MP4 antes que WebM.** MP4 lo reproduce cualquier navegador, incluido el iPhone
del cliente. Safari y Chrome ≥ 126 graban MP4; Firefox y Chrome antiguo caen a
WebM.

**WebCodecs (Mediabunny) para videos de galería, no ffmpeg.wasm.** Usa el
codificador por hardware del teléfono: segundos en vez de minutos, sin descargar
30 MB. La librería (~410 kB) solo se descarga cuando alguien elige un video. Si el
navegador no puede convertir, se sube el original solo si ya es MP4/WebM y pesa
menos de 100 MB; si no, se pide grabarlo desde la app.

**Subidas reanudables (TUS) para lo que pasa de 6 MB.** Un corte de red retoma
desde el último bloque confirmado. Supabase exige bloques de exactamente 6 MB. Se
usa el host directo de Storage (`<ref>.storage.supabase.co`), más rápido para
archivos grandes.

**La cola sobrevive a una recarga.** El archivo preparado y su estado viven en
IndexedDB. Si el teléfono descarta la pestaña a mitad de un video, la próxima vez
que la persona abre la app la subida sigue donde iba. La cola de un usuario no se
reanuda en la sesión de otro.

**Pasos persistidos.** Si el archivo subió pero guardar la fila falló, el
reintento no vuelve a subir 25 MB para escribir una fila. Un "ya existe" (409 en
Storage, 23505 en la tabla) cuenta como éxito.

**Qué no se reintenta solo.** Permisos (42501), restricciones de la base (23xxx),
archivos rechazados por el bucket (4xx) y errores de preparación: esperar no los
arregla y gastaría datos móviles.

**Bucket privado y URLs firmadas.** Placas, VIN y la cara del cliente no deben
estar en URLs adivinables. Las galerías firman todas las rutas de una orden en
una sola petición (1 h, cacheadas 50 min). Firmar no descarga nada: el archivo
viaja solo cuando un `<img>`/`<video>` lo usa, y en las listas solo viajan
miniaturas.

**`proveedor` en cada fila.** Hoy siempre `supabase`. Si algún día los videos se
mueven a un servicio de streaming (Cloudflare Stream), el modelo no cambia.

### Capacidad del plan

Supabase Pro ($25/mes): 100 GB de Storage, 250 GB de egress, 8 GB de base. Con el
**spend cap** activo (por defecto), exceder una cuota restringe el servicio en vez
de cobrar.

| Por orden (supuesto) | Comprimido | Sin comprimir |
|---|---|---|
| 20 fotos | ~7 MB | ~100 MB |
| 3 videos de ~1 min | ~33 MB | 200–1 000 MB |
| 3 notas de voz | ~0.5 MB | ~1 MB |
| **Total** | **~40 MB** | 300 MB – 1.1 GB |

Con ~120 órdenes/mes (2 talleres × 60): ~4.8 GB/mes → los 100 GB duran unos 20
meses; egress estimado ~19 GB/mes de 250. **Revisa el uso real** en Supabase →
Settings → Usage después del primer mes.

### Configuración requerida

- **Límite global de archivo de Storage a 100 MB** (Storage → Settings). El
  global manda sobre el del bucket; viene en 50 MB.
- Nada más: el bucket y sus políticas los crea la migración.

### Diagnóstico

| Síntoma | Dónde mirar |
|---|---|
| "No se pudo subir" en la bandeja | Expande la bandeja: debajo de cada archivo aparece el motivo. 413/"too large" → límite global de Storage. 42501 → la persona no está asignada o la orden está entregada |
| El video no pasa de 0 % | Red del dispositivo; ¿está en modo sin conexión? La bandeja lo dice. Probar con wifi |
| "Este teléfono no puede convertir ese video" | Navegador sin WebCodecs y archivo `.mov`/HEVC. Grabar con el botón **Video** |
| "El video dura más de 2 minutos" | Esperado. Recortarlo en el teléfono o grabarlo desde la app |
| Una foto aparece de lado | No debería: la orientación se aplica al dibujar. Reportar navegador y versión |
| Miniaturas grises que no cargan | URL firmada vencida en una pestaña abierta más de 1 h: recargar |
| El cliente (fase 4) no ve un video | ¿Está marcado **Visible al cliente**? Solo un admin lo marca |
| Espacio en Storage creciendo sin órdenes nuevas | Revisar que la tarea `restorify-maintenance` corra (sección de tareas abajo) |

---

## Parte 2 — Notificaciones

### El recorrido de un aviso

```
1. Algo pasa en la base              INSERT orden_asignaciones, UPDATE estatus, INSERT comisiones…
2. Un trigger llama notificar()      trg_assignment_notify, trg_order_finished_notify, …
3. notificar() inserta               notificaciones  ──Realtime──► campana (app abierta) + toast
4. …y si la persona tiene teléfono   cola_envios (canal push)
5. …y avisa al procesador            invoke_edge_function('process-outbox')  ──pg_net (asíncrono)──┐
6. pg_cron cada minuto               dispatch_outbox_if_due()  ──────────────────────────────────────┤
7. La edge function                  claim_outbox → web-push cifra y firma → fetch al servicio push ─┘
8. Apple / Google                    entregan al dispositivo → public/sw.js muestra la notificación
9. Tocar la notificación             abre /work-orders?open=<orden>
```

### Piezas

| Pieza | Rol |
|---|---|
| `supabase/migrations/20260920000000_notifications_and_push.sql` | Tablas, RLS, `notificar()`, triggers de eventos, cola, cron |
| `supabase/functions/process-outbox` | Envía la cola. Push hoy; correo en la fase 4 |
| `supabase/functions/cleanup-storage` | Limpieza diaria de archivos huérfanos |
| `supabase/functions/_shared/internal.ts` | Autenticación por secreto compartido |
| `src/features/notifications/NotificationBell.tsx` | Campana, conteo, toast |
| `src/features/notifications/useNotifications.ts` | Lista + conteo + Realtime |
| `src/features/notifications/renderNotification.ts` | Traduce el aviso al idioma de la pantalla |
| `src/features/notifications/PushSettingsCard.tsx` | "Notificaciones en este dispositivo" |
| `src/features/notifications/pushDevice.ts` | Re-asociar el dispositivo al iniciar sesión; soltarlo al cerrarla |
| `src/lib/push.ts` | Soporte, suscripción, service worker |
| `public/sw.js` | Muestra el push y abre la orden al tocarlo |

### Decisiones de diseño

**Los avisos los crean triggers.** Llegan igual los cree quien los cree, desde
cualquier pantalla o desde la API, y no dependen de que alguien tenga la app
abierta.

**Aviso en español + datos crudos.** El push viaja en español (no se sabe qué
idioma prefiere nadie en el servidor). La campana vuelve a redactar el aviso con
`notifications.types.<tipo>` para quien usa la app en inglés; un tipo sin
traducción se muestra con el texto de la base.

**Push por outbox, no directo.** `cola_envios` deja registro de cada envío, permite
reintentos con espera creciente y es el mismo camino que usarán los correos de la
fase 4. `FOR UPDATE SKIP LOCKED` evita dobles envíos entre la invocación
inmediata y el cron.

**Dispositivo, no cuenta.** Un permiso de push es de un navegador en un aparato.
`registrar_push` mueve el endpoint a quien inició sesión; al cerrar sesión se
elimina la asociación (la suscripción del navegador se conserva para no volver a
pedir permiso).

**Service worker sin caché.** `sw.js` no tiene manejador de `fetch`. Una PWA con
caché puede quedarse con una versión vieja tras un despliegue, justo el desfase
que `SchemaDriftBanner` existe para detectar.

**`web-push` solo para cifrar y firmar.** La petición la hace `fetch`
(`generateRequestDetails`), sin depender de la compatibilidad de `https` de Node
en Deno. Verificado bajo Deno 2: el cuerpo descifra según RFC 8291 y la firma
VAPID valida.

### Configuración requerida

Pasos completos en [deployment.md](deployment.md#4-configuración-única-de-supabase).
En resumen:

| Dónde | Nombre | Valor |
|---|---|---|
| Build (`.env.local`) | `VITE_VAPID_PUBLIC_KEY` | Llave pública VAPID |
| Secrets de edge functions | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Par VAPID + `mailto:` |
| Secrets de edge functions | `RESTORIFY_FUNCTIONS_SECRET` | Secreto aleatorio |
| Vault | `restorify_functions_secret` | **El mismo** secreto |
| Vault | `restorify_project_url` | `https://<ref>.supabase.co` |
| Edge functions | `process-outbox`, `cleanup-storage` | Desplegadas sin verificación de JWT |

Los valores generados para este proyecto están en `supabase/.env.secrets.local`
(ignorado por git). Si se pierden: nuevo par VAPID → todos deben volver a activar
push en sus dispositivos.

### Tareas programadas (pg_cron)

| Nombre | Cuándo | Qué |
|---|---|---|
| `restorify-outbox` | cada minuto | Si hay envíos vencidos o trabados, llama a `process-outbox` |
| `restorify-maintenance` | 09:00 UTC | Borra avisos y envíos viejos; llama a `cleanup-storage` |

```sql
-- ¿Existen y corren?
SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'restorify-%';
SELECT jobid, status, return_message, start_time
FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
```

### iPhone

- Push web solo existe en iOS/iPadOS **16.4 o posterior** y solo para la app
  **agregada a la pantalla de inicio**. Desde una pestaña de Safari la API no
  existe; la tarjeta de Configuración explica cómo instalarla.
- El permiso se pide desde la app instalada y desde un toque del usuario.
- Si se borra el ícono de la pantalla de inicio, la suscripción muere; el servicio
  responde 410 y la edge function la elimina sola.

### Diagnóstico

Recorre en orden; cada paso descarta una capa.

1. **¿Se creó el aviso?** Si no aparece en la campana, el problema está en el
   trigger o en la regla (¿fue la misma persona quien hizo la acción?).
   ```sql
   SELECT tipo, titulo, creado_en FROM notificaciones
   WHERE usuario_id = '<uuid>' ORDER BY creado_en DESC LIMIT 10;
   ```
2. **¿Tiene dispositivos?** Configuración → Usuarios muestra el ícono de campana con
   la cantidad. Sin dispositivos no se encola push.
   ```sql
   SELECT endpoint, ultimo_error, actualizado_en FROM push_suscripciones WHERE usuario_id = '<uuid>';
   ```
3. **¿Se encoló y qué pasó?**
   ```sql
   SELECT estado, intentos, ultimo_error, creado_en, enviado_en FROM cola_envios
   WHERE canal = 'push' AND destinatario = '<uuid>' ORDER BY creado_en DESC LIMIT 10;
   ```
   - `pendiente` con `intentos = 0` durante minutos → la base no está llamando a la
     función: faltan los secretos de Vault o `pg_net`.
   - `pendiente`/`error` con "VAPID … no configuradas" → faltan secrets de la función.
   - `omitido` "no tiene dispositivos" → paso 2.
   - `enviado` y no llegó → paso 5.
4. **¿La base llega a la función?**
   ```sql
   SELECT id, status_code, content, error_msg, created FROM net._http_response
   ORDER BY created DESC LIMIT 10;
   ```
   401 → el secreto de Vault no coincide con `RESTORIFY_FUNCTIONS_SECRET`. 404 → la
   función no está desplegada. Logs en Supabase → Edge Functions → process-outbox.
5. **¿El dispositivo lo muestra?** Configuración → **Enviar prueba**.
   - Android: ajustes de notificaciones de Chrome para el sitio; ahorro de batería
     agresivo retrasa entregas.
   - iPhone: ¿se abrió desde el ícono de inicio? Ajustes → Notificaciones → Restorify.
   - Escritorio: permisos del sitio y "No molestar" del sistema.
6. **La campana no se actualiza sola** pero el aviso existe: Realtime bloqueado
   (proxy, red corporativa). El conteo igual se refresca cada 5 minutos.
