# Contexto para agentes de IA

Léelo antes de modificar Restorify. Es corto a propósito: dice qué no romper y
dónde está el detalle. Para todo lo demás, [arquitectura.md](arquitectura.md) y
[reglas-de-negocio.md](reglas-de-negocio.md).

---

## 1. Lo que tienes que saber antes de tocar nada

- **No hay backend propio.** El navegador habla directo con Supabase con la clave
  anónima. Cualquier usuario con sesión puede llamar a la API sin la interfaz.
  **La seguridad vive en RLS, triggers y RPCs** (`supabase/migrations/`). Ocultar
  un botón en React nunca es una regla de permisos.
- **El dinero lo calcula la base.** Totales, depósitos, cobros al entregar, costo
  de repuestos, ajustes, reversiones y comisiones los asientan triggers
  idempotentes con signo. El frontend nunca calcula ni escribe un total.
- **Los montos están separados.** `orden_montos` (total, repuestos, depósito) y
  `orden_repuestos` son solo admin. `ordenes_trabajo.total_labor` y `orden_labor`
  los ve la sede, porque la comisión del técnico sale de la mano de obra. Un
  técnico lee repuestos por la RPC `repuestos_de_orden` (sin precios).
- **Multi-sede.** Casi toda tabla tiene `sede_id`. Un técnico ve solo su sede; un
  admin, todas. Helpers SQL: `is_admin()`, `current_user_sede_id()`,
  `is_assigned_to_order(orden_id)`.
- **Un técnico modifica una orden solo si está asignado y no está entregada**, y
  solo estado, avance y firma (`trg_order_technician_guard`). Si agregas una
  acción de técnico que cambie otra columna de `ordenes_trabajo`, añádela a la
  lista permitida de ese trigger en una migración nueva. **Tampoco elige cualquier estado**: solo
  `en_proceso`, `espera_autorizacion` y `finalizado`; devolver una orden a recepción y
  entregarla son de administración.
- **Abrir una orden y asignar a alguien son solo de admin** (`ordenes_trabajo_insert` y
  `orden_asignaciones_insert`, ambas `is_admin()`). Lo segundo es dinero, no una etiqueta:
  `trg_assignment_commissions` llama a `sync_order_commissions`, que reparte la mano de obra
  entre los asignados, así que auto-asignarse era concederse una comisión y diluir la de
  quien sí trabajó la orden. `create_work_order` es `SECURITY INVOKER`, así que la política
  la cubre sin tocarla. `trg_guard_order_insert` (que bajaba a recepción la orden de un
  no-admin) se queda como red, pero su cuerpo ya no es alcanzable desde la API. Un técnico
  sigue **viendo** las órdenes de su sede y moviendo el `estatus_tarea` de su propia
  asignación, que no toca el reparto.
- **Pedir autorización exige un motivo.** `espera_autorizacion` (antes "espera de
  repuestos") es donde el técnico dice que encontró algo que hay que cotizar, y la base
  rechaza el estado sin `ordenes_trabajo.motivo_autorizacion`. Al salir del estado el
  motivo se limpia. Cuando el cliente autoriza, `_resolver_presupuesto` devuelve la orden
  a `en_proceso` sola.
- **El técnico puede tachar una mano de obra hecha**, pero `orden_labor` sigue siendo
  escritura solo de admin: se hace por la RPC `marcar_labor_completada`, que solo toca
  `completado_en`/`completado_por` y solo sobre una línea `aprobado`. Si necesitas que un
  técnico escriba algo más de una tabla de dinero, otra RPC estrecha, nunca una política
  más laxa.
- **Solo la primera firma de la orden autoriza lo cotizado** (`trg_quote_on_signature`).
  Volver a firmar no aprueba nada: lo agregado después pasa por presupuesto o por
  "Registrar autorización".
- **Roles:** `admin`, `mecanico`, `pintor`. Mecánico y pintor tienen los mismos
  permisos.
- **Las seis fases del cliente están hechas** (restricciones de técnicos, multimedia,
  notificaciones, portal del cliente y correos, presupuestos, reporte web). **El
  reporte es el enlace del portal:** no subas PDFs a Storage (el bucket `reportes`
  ya no acepta archivos); el PDF solo se descarga y muestra lo mismo que ve el
  cliente (fotos publicadas, líneas aprobadas, sin notas internas ni nombres de
  técnicos; filtros en `src/lib/reportMedia.ts`). Plan y estado en
  [README.md](README.md#estado-del-proyecto-septiembre-2026); historia y decisiones en
  [evolucion.md](evolucion.md).
- **Solo lo autorizado se cobra.** `orden_labor` y `orden_repuestos` tienen `estado`
  (`borrador` | `pendiente` | `aprobado` | `rechazado`) y los totales suman solo
  `aprobado`. Nunca cambies el estado con un UPDATE: pasa por `enviar_presupuesto`,
  `registrar_autorizacion`, `cancelar_presupuesto` o la firma de recepción (bandera
  `restorify.presupuesto`). Si agregas un cálculo de dinero sobre líneas, filtra por
  `aprobado`.
- **Un avance puede ser visible para el cliente.** `orden_avances.visible_cliente` lo
  marca el técnico, y con él salen su texto y sus archivos (`trg_publicar_archivos_avance`
  y la herencia en `trg_prepare_orden_media`). Ya no es cierto que todo lo del técnico sea
  interno hasta que un admin lo publique. Lo que **sigue** siendo cierto: al cliente no le
  llega el nombre de ningún técnico, y el archivo suelto lo publica solo un admin.
- **La lista de órdenes no trae el histórico.** `getWorkOrders` excluye las entregadas de
  más de 90 días; el archivo se pide con `getArchivedWorkOrders`, paginado y buscando en
  el servidor. No le quites el filtro para "ver todo": es lo que evita descargar miles de
  órdenes con sus relaciones embebidas.
- **El portal del cliente (`src/portal/`) es un paquete aparte.** No importes ahí
  nada que arrastre `lib/supabase`, `services/`, contextos de la app ni
  `i18n/translations.ts`: habla con la edge function `portal` por `fetch` y tiene
  sus propios textos. Todo dato nuevo que deba ver el cliente se agrega a mano en
  `datos_portal` (nunca `to_jsonb(fila)`).

## 2. Reglas de oro

0. **Listas con `fetchAll`, totales con una RPC.** La API de Supabase devuelve como máximo
   1.000 filas por consulta y no avisa. Nunca leas una tabla que crece con un `select`
   sin `.range()` (usa `fetchAll` de `src/services/support.ts`, con un orden que termine
   en `id`) y nunca sumes dinero en el navegador: los KPIs salen de `resumen_panel`.
   Tampoco uses `.in('col', [muchos ids])`: la URL tiene un largo máximo; usa conteos
   embebidos (`select('*, hijos(count)')`) o una RPC.
1. **Todo cambio de esquema o permisos es una migración nueva** en
   `supabase/migrations/AAAAMMDDHHMMSS_descripcion.sql`. Nunca edites una migración
   ya aplicada ni cambies tablas desde el panel.
2. **Una función nueva en `public` es una RPC pública.** Postgres da `EXECUTE` a
   `PUBLIC` y Supabase a `anon` y `authenticated` al crearla. Revócala siempre:
   `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;` y concede solo lo
   necesario. Las `SECURITY DEFINER` llevan `SET search_path = public` y verifican
   rol/sede por dentro. Una función que solo llaman triggers no necesita ningún
   `GRANT` (el trigger corre como su dueño). Olvidarlo dejó
   `reverse_order_delivery_finance` abierta a cualquiera
   ([auditoria-2026-09.md](auditoria-2026-09.md), AUD-01); `npm run qa:security` lo
   detecta. Si agregas una función interna, agrega su caso a
   `scripts/qa/api-security.mjs`.
3. **Prueba con pgTAP** (`supabase/tests/database/`) todo lo que toque dinero o
   permisos. Un cuerpo plpgsql roto se aplica sin error y falla en producción.
4. **Si una migración elimina o renombra columnas**, la base y el `dist` se
   despliegan juntos. Nunca ejecutes `supabase db push` ni despliegues funciones
   sin que la persona responsable lo pida.
5. **Nunca pongas secretos en el repositorio ni en la documentación.** Viven en
   archivos `*.local` (ignorados por git), en `supabase secrets` y en Vault. Solo
   la llave **pública** VAPID va en el frontend.
6. **Sin framework de UI ni Tailwind.** CSS plano: variables en
   `src/styles/index.css`, componentes en `src/styles/components.css`. Nunca un
   color literal.
7. **Todo texto visible pasa por i18n** (`src/i18n/translations.ts`, español e
   inglés, `useLanguage().t(key)`). `Translations` es una firma de índice, así que
   TypeScript no compara los dos árboles y `getTranslation` devuelve **la clave** cuando
   falta: la pantalla mostraría `workOrders.archivedSearch`. `src/i18n/translations.test.ts`
   es la red — mismas claves, mismos marcadores `{dato}`, ningún texto vacío — con una lista
   corta de omisiones a propósito. Los errores se guardan crudos y se traducen al
   pintar con `lib/errors.ts`; nunca muestres el mensaje del backend. Excepción: un
   `RAISE ... USING ERRCODE = '42501'` con una oración en español para el taller
   ("La orden ya fue entregada…") se muestra tal cual en español; escribe esos
   mensajes pensando en quien los va a leer.
7b. **El dinero se escribe con `lib/money.ts`** (`money`, `moneySigned`), nunca con
   `toFixed(2)` ni `toLocaleString()`. El segundo no es otro estilo, está mal:
   `toLocaleString()` sin opciones se come los centavos ($1,650.50 → "$1,650.5") y cambia
   según el idioma del teléfono. El portal y los correos ya tenían su propio
   `Intl.NumberFormat`; son paquetes aparte y siguen con el suyo.
8. **Fechas locales** con `lib/dates.ts` (`todayLocal`, `daysFromTodayLocal`, `isSameMonth`). Nunca
   `toISOString().split('T')[0]` ni `new Date('AAAA-MM-DD')` para comparar meses.
8b. **Lo que va junto se escribe junto.** Dos o más escrituras que no pueden quedar a
   medias (un lote y sus movimientos, una orden y sus líneas) van en una RPC o un trigger,
   no en varias llamadas desde el navegador (`importar_estado_cuenta`,
   `deshacer_importacion_estado_cuenta`, `create_work_order`).
   Una operación de dinero que se puede disparar dos veces bloquea sus filas
   (`FOR UPDATE`, ver `pay_commissions`).
8c. **La caché de datos es de una persona.** `AuthContext` la vacía al cambiar de usuario;
   no guardes datos de la sesión en otro lado (localStorage, IndexedDB) sin borrarlos al
   cerrar sesión.
8d. **`supabase/config.toml` es la configuración local, no la real.** No uses
   `supabase config push` sin revisar el diff: `[auth.email] enable_signup = false` apaga el
   inicio de sesión con correo. La configuración real de Auth está en el panel.
9. **Una orden puede ser de otra sede que la elegida.** Un admin abre órdenes desde
   avisos y enlaces. Lo que depende de la sede (logo, nombre, porcentaje, personal)
   sale de `order.sede_id` (`orderSede` en `useWorkOrderDetail`), no de `currentSede`.
10. **Una consulta que falla no es "no hay datos".** Distingue el error de red de la
   fila inexistente (`PGRST116`) antes de vaciar estado, cerrar sesión o borrar algo.
11. **Commits solo cuando se piden.**

## 3. Dónde está cada cosa

| Necesitas | Ve a |
|---|---|
| Consultas a Supabase | `src/services/<dominio>.service.ts`. Ningún componente llama `supabase.from` directo. `supabaseService.ts` es una fachada heredada; en código nuevo importa el servicio del dominio |
| Lecturas y caché | TanStack Query; claves en `src/lib/queryClient.ts`. Tras mutar, **invalida** (la base cambia cosas que el cliente no predice) |
| Formularios | react-hook-form + `zod/mini`; ejemplo en `src/features/workOrders/workOrderForm.schema.ts` |
| Detalle de orden | `src/features/workOrders/useWorkOrderDetail.ts` (permisos derivados: `canEditLines`, `canSendReport`, `canDeliver`, `canJoin`…) y `WorkOrderDetail.tsx` |
| Multimedia | `src/lib/media/` (compresión, grabación, conversión, cola TUS en IndexedDB) y `src/features/media/`. Detalle en [multimedia-y-notificaciones.md](multimedia-y-notificaciones.md) |
| Notificaciones | Triggers `trg_*_notify` → `notificar()` → `notificaciones` + `cola_envios`; edge function `process-outbox`; frontend en `src/features/notifications/`, `src/lib/push.ts`, `public/sw.js` |
| Presupuestos | `quotes.service.ts`, `features/workOrders/QuoteCard.tsx`, `LineStateBadge.tsx`, `lineState.ts`; sección `QuoteSection` del portal. Detalle en [presupuestos.md](presupuestos.md) |
| Portal y correos | `trg_order_portal` → `encolar_correo_cliente()`; `process-outbox` (`sendEmail`) + `_shared/email/templates.ts`; edge function `portal` → `datos_portal()`; `src/portal/`; tarjeta `CustomerLinkCard.tsx`. Detalle en [portal-y-correos.md](portal-y-correos.md) |
| Edge functions | `supabase/functions/` (Deno). Internas verifican `x-restorify-secret` con `_shared/internal.ts`. Si agregas una, súmala a la lista de SEC-17 en `scripts/qa/api-security.mjs` y despliégala: una función que la app usa y no está desplegada responde 404. Llámalas con `invokeAdminFunction` (`users.service.ts`): `functions.invoke` pierde el motivo de un 4xx y la pantalla mostraba "non-2xx status code" |
| Administración de datos del proyecto real | `scripts/admin/`: `limpiar-datos.sql` (termina en `ROLLBACK`) y `crear-primer-admin.sql`. Solo los corre quien administra, con su aprobación explícita |
| Qué hay en el proyecto de Supabase real (buckets, secretos por nombre, cron, Realtime, versiones de funciones, panel) | [supabase.md](supabase.md) |
| Contextos | `src/context/` (Auth, Language, Theme, Toast, UnsavedChanges) |
| Listas completas y totales | `fetchAll` en `src/services/support.ts`; `resumen_panel` (panel y Finanzas); `importar_estado_cuenta` (importación bancaria) |
| Largo mínimo de contraseña | `src/lib/password.ts` (8), igual en `create-employee`, `update-employee` y el panel de Auth |
| Traspaso, cuentas, operación y emergencias | [traspaso.md](traspaso.md); antes de publicar a clientes reales, [salida-a-produccion.md](salida-a-produccion.md) |
| Formato del dinero | `src/lib/money.ts` (`money`, `moneySigned`); el portal y los correos tienen el suyo |
| Tipos de dominio | `src/types/domain/` |

## 4. Patrones de interfaz

- **Modales** controlados (`modal-overlay` + `modal`); los pesados con
  `LazyModal`. No uses `prompt` ni `alert`. `confirm` solo para confirmaciones
  destructivas, como hace el resto del código.
- **Un error dentro de un diálogo se muestra dentro del diálogo** o con toast: el
  modal (z-index 400) tapa el recuadro de error de la página. Un `return` mudo
  parece un botón roto.
- **Feedback** de toda operación asíncrona con `showToast`; botones deshabilitados
  mientras corre.
- **Móvil primero.** Tablas con `cards-on-mobile` y `data-label`; inputs de 16 px;
  `useIsMobile()` para renderizar una sola versión; respeta `env(safe-area-inset-*)`.
- **Un `<select>` controlado que se cancela con `confirm`** se remonta con una `key`
  (`statusEpoch`).
- **Un `DELETE` o un `UPDATE` rechazado por RLS devuelve éxito sin filas**: usa
  `.select('id')` y `assertDeleted` / `assertAffected` (`src/services/support.ts`). Sin eso
  la pantalla dibuja el cambio sobre una fila que la base no tocó; en `uploadSignature`
  llegaba a decir "firmada" con la orden sin firma y el total en cero. Excepción: marcar un
  aviso como leído, donde cero filas significa "ya estaba leído".

## 5. Verificar un cambio

```bash
npx tsc -b && npm run lint && npm test && npm run build
npm run test:db       # si tocaste SQL (requiere Docker + npx supabase start)
npm run qa:security   # después de aplicar una migración que toque permisos
```

Qué cubren las pruebas automatizadas: [pruebas.md](pruebas.md). Qué probar según lo
que cambiaste, con casos que un agente puede ejecutar: [plan-de-pruebas.md](plan-de-pruebas.md)
(§1.4 tiene las instrucciones para agentes; §8, qué módulos probar según el cambio).
Para comprobar el estado de una orden en la base: `scripts/qa/estado-orden.sql` (solo
lectura). Las pruebas e2e y `qa:security` corren contra el proyecto de `.env.local`: no
agregues pruebas que entreguen órdenes o paguen comisiones mientras no exista staging.

## 6. Observabilidad y despliegue

- Errores del frontend en Sentry (`@sentry/react`), si `VITE_SENTRY_DSN` está
  definida.
- Producción: `dist/` en Hostinger (Apache, `public/.htaccess` reescribe a
  `index.html`), dominio `reinventa.shop`; Supabase (hoy en plan Free: 50 MB por archivo; pasar a
  Pro antes de atender clientes reales). Pasos en
  [deployment.md](deployment.md).
