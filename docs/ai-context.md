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
  lista permitida de ese trigger en una migración nueva.
- **Roles:** `admin`, `mecanico`, `pintor`. Mecánico y pintor tienen los mismos
  permisos.
- **Fases 1–3 hechas; 4–6 (portal del cliente, correos, presupuestos, reporte web)
  pendientes.** Plan y estado en [README.md](README.md#estado-del-proyecto-septiembre-2026).

## 2. Reglas de oro

1. **Todo cambio de esquema o permisos es una migración nueva** en
   `supabase/migrations/AAAAMMDDHHMMSS_descripcion.sql`. Nunca edites una migración
   ya aplicada ni cambies tablas desde el panel.
2. **Una función nueva en `public` es una RPC pública.** Revócala:
   `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated;` y concede solo lo
   necesario. Las `SECURITY DEFINER` llevan `SET search_path = public` y verifican
   rol/sede por dentro.
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
   pintar con `lib/errors.ts`; nunca muestres el mensaje del backend.
8. **Fechas locales** con `lib/dates.ts` (`todayLocal`, `isSameMonth`). Nunca
   `toISOString().split('T')[0]` ni `new Date('AAAA-MM-DD')` para comparar meses.
9. **Commits solo cuando se piden.**

## 3. Dónde está cada cosa

| Necesitas | Ve a |
|---|---|
| Consultas a Supabase | `src/services/<dominio>.service.ts`. Ningún componente llama `supabase.from` directo. `supabaseService.ts` es una fachada heredada; en código nuevo importa el servicio del dominio |
| Lecturas y caché | TanStack Query; claves en `src/lib/queryClient.ts`. Tras mutar, **invalida** (la base cambia cosas que el cliente no predice) |
| Formularios | react-hook-form + `zod/mini`; ejemplo en `src/features/workOrders/workOrderForm.schema.ts` |
| Detalle de orden | `src/features/workOrders/useWorkOrderDetail.ts` (permisos derivados: `canEditLines`, `canSendReport`, `canDeliver`, `canJoin`…) y `WorkOrderDetail.tsx` |
| Multimedia | `src/lib/media/` (compresión, grabación, conversión, cola TUS en IndexedDB) y `src/features/media/`. Detalle en [multimedia-y-notificaciones.md](multimedia-y-notificaciones.md) |
| Notificaciones | Triggers `trg_*_notify` → `notificar()` → `notificaciones` + `cola_envios`; edge function `process-outbox`; frontend en `src/features/notifications/`, `src/lib/push.ts`, `public/sw.js` |
| Edge functions | `supabase/functions/` (Deno). Internas verifican `x-restorify-secret` con `_shared/internal.ts` |
| Contextos | `src/context/` (Auth, Language, Theme, Toast, UnsavedChanges) |
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
npm run test:db     # si tocaste SQL (requiere Docker + npx supabase start)
```

Qué probar a mano y en qué dispositivos: [pruebas.md](pruebas.md). Las pruebas
e2e corren contra el proyecto de `.env.local`: no agregues pruebas que entreguen
órdenes o paguen comisiones mientras no exista staging.

## 6. Observabilidad y despliegue

- Errores del frontend en Sentry (`@sentry/react`), si `VITE_SENTRY_DSN` está
  definida.
- Producción: `dist/` en Hostinger (Apache, `public/.htaccess` reescribe a
  `index.html`), dominio `reinventa.shop`; Supabase (hoy en plan Free: 50 MB por archivo; pasar a
  Pro antes de atender clientes reales). Pasos en
  [deployment.md](deployment.md).
