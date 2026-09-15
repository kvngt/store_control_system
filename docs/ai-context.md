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
  lista permitida de ese trigger en una migración nueva. Al **insertar** una orden,
  `trg_guard_order_insert` fuerza recepción, avance 0, sin firma y el número del
  sistema para quien no es admin.
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
   inglés, `useLanguage().t(key)`). Los errores se guardan crudos y se traducen al
   pintar con `lib/errors.ts`; nunca muestres el mensaje del backend. Excepción: un
   `RAISE ... USING ERRCODE = '42501'` con una oración en español para el taller
   ("La orden ya fue entregada…") se muestra tal cual en español; escribe esos
   mensajes pensando en quien los va a leer.
8. **Fechas locales** con `lib/dates.ts` (`todayLocal`, `daysFromTodayLocal`, `isSameMonth`). Nunca
   `toISOString().split('T')[0]` ni `new Date('AAAA-MM-DD')` para comparar meses.
8b. **Lo que va junto se escribe junto.** Dos o más escrituras que no pueden quedar a
   medias (un lote y sus movimientos, una orden y sus líneas) van en una RPC o un trigger,
   no en varias llamadas desde el navegador (`importar_estado_cuenta`, `create_work_order`).
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
| Edge functions | `supabase/functions/` (Deno). Internas verifican `x-restorify-secret` con `_shared/internal.ts`. Si agregas una, súmala a la lista de SEC-17 en `scripts/qa/api-security.mjs` y despliégala: una función que la app usa y no está desplegada responde 404 |
| Qué hay en el proyecto de Supabase real (buckets, secretos por nombre, cron, Realtime, versiones de funciones, panel) | [supabase.md](supabase.md) |
| Contextos | `src/context/` (Auth, Language, Theme, Toast, UnsavedChanges) |
| Listas completas y totales | `fetchAll` en `src/services/support.ts`; `resumen_panel` (panel y Finanzas); `importar_estado_cuenta` (importación bancaria) |
| Largo mínimo de contraseña | `src/lib/password.ts` (8), igual en `create-employee`, `update-employee` y el panel de Auth |
| Traspaso, cuentas, operación y emergencias | [traspaso.md](traspaso.md); antes de publicar a clientes reales, [salida-a-produccion.md](salida-a-produccion.md) |
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
- **Un `DELETE` rechazado por RLS devuelve éxito sin filas**: usa `.select('id')` y
  `assertDeleted` (`src/services/support.ts`).

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
