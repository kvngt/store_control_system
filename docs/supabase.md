# Supabase: qué hay y dónde está

Todo el backend de Restorify vive en un proyecto de Supabase. Este documento es el
inventario: qué servicios de Supabase se usan, qué hay dentro de cada uno, quién lo
llama, dónde se ve en el panel y qué no está en el código.

Para **por qué** está construido así: [arquitectura.md](arquitectura.md). Para
**configurar un entorno nuevo o publicar**: [deployment.md](deployment.md).

> Foto del proyecto real tomada el **15 de septiembre de 2026** con consultas de solo
> lectura. Los números de uso (archivos, tamaños) cambian; los nombres, permisos y la
> estructura solo cambian con una migración o un despliegue.

---

## Índice

1. [El proyecto](#1-el-proyecto)
2. [La plataforma completa](#2-la-plataforma-completa)
3. [Quién habla con qué](#3-quién-habla-con-qué)
4. [Base de datos](#4-base-de-datos)
5. [Storage](#5-storage)
6. [Edge Functions](#6-edge-functions)
7. [Secretos y variables](#7-secretos-y-variables)
8. [Auth](#8-auth)
9. [Realtime](#9-realtime)
10. [Tareas programadas y llamadas salientes](#10-tareas-programadas-y-llamadas-salientes)
11. [Dónde está cada cosa en el panel](#11-dónde-está-cada-cosa-en-el-panel)
12. [El Supabase local (Docker)](#12-el-supabase-local-docker)
13. [Revisar el proyecto desde la terminal](#13-revisar-el-proyecto-desde-la-terminal)
14. [Pendientes y limpieza](#14-pendientes-y-limpieza)

---

## 1. El proyecto

| | |
|---|---|
| **Nombre en Supabase** | `dbstores` (el nombre del proyecto no es el de la app) |
| **Referencia** | `lendsiqkxhvbxxkaadrt` → `https://lendsiqkxhvbxxkaadrt.supabase.co` |
| **Región** | `ca-central-1` (Canadá Central) |
| **Plan** | **Pro** desde el 30 de septiembre de 2026: respaldos diarios (Database → Backups). Los buckets siguen con 50 MB por archivo, que es lo que la app permite ([deployment.md §4.1](deployment.md#41-plan-y-límites-de-gasto)) |
| **Postgres** | 17.6 |
| **Tamaño de la base** | ~19 MB (29 de septiembre de 2026, recién limpiada) |
| **Migraciones aplicadas** | 54 (la última, `20261010000000_egresos_de_comision_por_orden`, aplicada el 29 de septiembre de 2026) |
| **Max rows de la API** | 1.000 (valor por defecto; Project Settings → API). **No bajarlo**: `fetchAll` asume páginas de 1.000 |
| **Enlace con este repositorio** | `supabase/.temp/project-ref` (lo crea `npx supabase link`) |
| **Entornos** | Solo este. No hay staging: es la primera recomendación de [mantenimiento.md](mantenimiento.md#5-plan-priorizado) |
| **Datos** | Limpiado el 29 de septiembre de 2026 para la prueba del taller: 1 administrador, 1 sede ("Taller principal"), sin clientes, órdenes, movimientos ni archivos |

---

## 2. La plataforma completa

```
                         restorifyauto.net (Hostinger, publica desde GitHub: hoy main)
                         └─ dist/: app del taller + portal del cliente (/r/<token>)
                                        │
          ┌─────────────────────────────┼─────────────────────────────────────┐
          │ Personal del taller         │                     Cliente (sin cuenta)
          │ (navegador / app instalada) │                                     │
          ▼                             ▼                                     ▼
┌──────────────────────────── Supabase · proyecto dbstores ─────────────────────────────┐
│                                                                                        │
│  Auth ─────────── sesiones del personal (correo + contraseña)                          │
│  PostgREST ────── /rest/v1: tablas y RPC, siempre con RLS                              │
│  Realtime ─────── `notificaciones` → campana · órdenes y sus hijas → pantallas al día  │
│  Storage ──────── /storage/v1: fotos, videos, audio, firmas, logos, cheques, PDFs      │
│  Edge Functions ─ /functions/v1: portal · process-outbox · cleanup-storage ·           │
│                   create-employee · update-employee · delete-employee                  │
│                                                                                        │
│  PostgreSQL 17                                                                         │
│   ├─ public: 23 tablas, 111 funciones, triggers del dinero y los avisos                │
│   ├─ pg_cron ── cada minuto / 09:00 / 15:00 UTC                                        │
│   ├─ pg_net ─── llama a las Edge Functions internas                                    │
│   └─ Vault ──── URL del proyecto y secreto de las funciones internas                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
          │                                  │                           │
          ▼                                  ▼                           ▼
   Resend (api.resend.com)       Servicios push del navegador     NHTSA vPIC
   correos al cliente,           (Google, Apple, Mozilla)         (vpic.nhtsa.dot.gov)
   dominio restorifyauto.net     avisos al teléfono               decodifica el VIN
```

**Fuera de Supabase:**

| Servicio | Para qué | Dónde se configura |
|---|---|---|
| **Hostinger** | Compila la rama configurada de GitHub (el diseño es `produccion`; hoy `main`, ver [evaluacion-2026-10.md](evaluacion-2026-10.md#5-operación-y-despliegue)) y sirve `dist/` en `restorifyauto.net`; DNS del dominio (incluidos los registros de Resend) | hPanel |
| **Resend** | Envía los correos al cliente y los de Auth (SMTP) desde `notificaciones@restorifyauto.net` | resend.com; una llave en los secretos de las funciones y otra en el SMTP de Auth |
| **Servicios push** (Google, Apple, Mozilla) | Entregan los avisos al teléfono con la app cerrada | Nada: el navegador elige el servicio; las llaves VAPID van en los secretos |
| **NHTSA vPIC** | Llena marca, modelo y año a partir del VIN, desde el navegador | Nada (API pública) |
| **Google Fonts** | Tipografía Outfit de la app | Nada |
| **Sentry** | Errores del frontend | `VITE_SENTRY_DSN`. **Hoy vacía: no está activo** |

---

## 3. Quién habla con qué

| Quién | Con qué llave | Qué usa | Qué lo limita |
|---|---|---|---|
| **App del taller** (admin, mecánico, pintor) | Clave anónima + token de la sesión del usuario | Auth, PostgREST (tablas y 29 RPC), Storage (subidas TUS al host `lendsiqkxhvbxxkaadrt.storage.supabase.co`), Realtime, funciones de empleados | RLS, triggers de guarda, políticas de Storage, `is_admin()` dentro de cada RPC |
| **Portal del cliente** | Ninguna del navegador: solo `fetch` a `functions/v1/portal` | La función `portal` | El token de 64 hexadecimales; la función arma la respuesta campo por campo |
| **La base misma** | Secreto compartido leído de Vault | `pg_net` → `process-outbox`, `cleanup-storage` | `x-restorify-secret` comparado en la función |
| **Edge Functions** | `SUPABASE_SERVICE_ROLE_KEY` (inyectada por Supabase) | Todo, sin RLS | Cada función valida por su cuenta: JWT + rol admin, token del cliente o secreto interno |
| **Sin sesión** (cualquiera con la clave pública) | Clave anónima | Nada útil: RLS devuelve listas vacías y las RPC internas están revocadas | Comprobado con `npm run qa:security` |

La clave anónima **es pública por diseño** (va dentro del JavaScript). La llave de
servicio **nunca** sale de las Edge Functions.

---

## 4. Base de datos

### 4.1 Esquemas

| Esquema | Es de | Qué hay |
|---|---|---|
| `public` | **Restorify** | Todas las tablas, funciones y triggers de la app. Lo crean las migraciones |
| `auth` | Supabase | Usuarios y sesiones. La app solo lee `auth.uid()`; los usuarios los crean y borran las funciones de empleados |
| `storage` | Supabase | `buckets` y `objects` (una fila por archivo). Las **políticas** de los buckets las crean las migraciones |
| `realtime` | Supabase | Motor de Realtime |
| `vault` | Supabase | Secretos cifrados (sección 7) |
| `cron` | Extensión pg_cron | `cron.job` (tareas) y `cron.job_run_details` (historial) |
| `net` | Extensión pg_net | Cola y respuestas de las llamadas HTTP de la base |
| `extensions` | Supabase | pg_net, pgcrypto, uuid-ossp, pg_stat_statements |
| `graphql`, `graphql_public` | Supabase | API GraphQL. **La app no la usa** |
| `supabase_migrations` | CLI | `schema_migrations`: qué migraciones se aplicaron (lo leen `npm run db:check` y `app_schema_version()`) |

**Extensiones instaladas:** `pg_cron` 1.6, `pg_net` 0.20, `supabase_vault` 0.3,
`pgcrypto` 1.3, `uuid-ossp` 1.1, `pg_stat_statements` 1.11. `pgtap` solo existe en el
Supabase local, para las pruebas.

### 4.2 Tablas de `public`

Las 23 tienen **RLS activado**. Columnas y relaciones: [arquitectura.md §4](arquitectura.md#4-modelo-de-datos).

| Dominio | Tabla | Qué guarda | Quién lee |
|---|---|---|---|
| **Organización** | `sedes` | Talleres: nombre, marca, capacidad, % de comisión, correo y WhatsApp de contacto | Todo usuario con sesión |
| | `perfiles` | Una fila por usuario de `auth.users`: nombre, rol, sede | Uno mismo, su sede, admin |
| | `perfiles_pago` | Esquema de pago de cada empleado: comisión (su % o el de la sede) o salario | **Admin**; cada quien el suyo |
| **Clientes** | `clientes` | Datos de contacto y preferencia de correos | Admin; un técnico, los de sus órdenes. **Crear y editar, solo admin** |
| | `vehiculos` | VIN, placa, marca, modelo | Admin; un técnico, los de sus órdenes. **Crear y editar, solo admin** |
| **Órdenes** | `ordenes_trabajo` | La orden: estado, avance, firma, total de mano de obra, `archivada_en` (archivo a mano, solo entregadas) | Admin; un técnico, **solo las que tiene asignadas** (`mis_ordenes_asignadas`). **Abrirla, solo admin**; el trigger decide qué columnas cambia el técnico |
| | `orden_montos` | Total, repuestos y depósito (1:1 con la orden) | **Solo admin** |
| | `orden_labor` | Líneas de mano de obra con su estado de autorización, su `especialidad`, su técnico (`asignado_a`, quien cobra su comisión) y `reparto_heredado` (línea de antes de la comisión por tarea, `20261010000006`) | Admin; un técnico, las de sus órdenes (escribe solo `completado_en` por `marcar_labor_completada`) |
| | `orden_repuestos` | Repuestos con precio | **Solo admin** (el técnico usa `repuestos_de_orden`) |
| | `orden_asignaciones` | Técnicos de la orden y su tarea; `origen` 'manual' (entra al reparto de las líneas heredadas) o 'tarea' (entró por una tarea y cobra solo sus tareas) | Admin; un técnico, las de sus órdenes; **asignar, desasignar y editar una asignación, solo admin** (editar desde `20261010000006`) |
| | `orden_avances` | Bitácora del técnico | Admin; un técnico, los de sus órdenes |
| | `orden_media` | Fotos, videos y audio: ruta en Storage, visible al cliente o no | Admin; un técnico, los de sus órdenes (también en Storage) |
| | `numero_orden_contadores` | Último folio por año | Nadie directamente (RLS sin políticas); la usa un trigger |
| **Cliente final** | `orden_enlaces` | Token del portal, vencimiento, visitas | **Solo admin** |
| | `presupuestos` | Cada presupuesto y su evidencia (vía, nombre, IP) | **Solo admin** |
| **Dinero** | `finanzas_movimientos` | Ingresos y egresos, automáticos e importados; el cobro al entregar lleva `metodo_pago` y `comprobante_ruta` | **Solo admin** |
| | `finanzas_importaciones` | Estados de cuenta importados y su huella | **Solo admin** |
| | `finanzas_reglas_categorizacion` | 56 reglas para categorizar movimientos del banco | **Solo admin** |
| | `comisiones` | Comisión devengada al entregar: una por tarea (`labor_id`) y una por técnico y bolsa heredada (`labor_id` nulo); llave (orden, usuario, especialidad, `labor_id`) | Cada técnico las suyas, admin |
| | `comision_pagos` | Pagos (cheques) de comisiones | Cada técnico los suyos, admin |
| **Avisos** | `notificaciones` | La campana de cada persona | Cada quien las suyas |
| | `push_suscripciones` | Dispositivos con push activo | Cada quien las suyas |
| | `cola_envios` | Cola de push y correos con su estado | **Solo admin** (los correos) |

**Tipos enumerados:** `user_role` (admin, mecanico, pintor), `order_status` (recepcion,
en_proceso, espera_autorizacion, finalizado, entregado), `work_type` (mecanica, pintura,
combinado), `task_status` (pendiente, en_curso, completada), `transaction_type` (ingreso,
egreso), `transaction_category` (pago_cliente, compra_repuesto, planilla, gasto_operativo).

No hay vistas.

### 4.3 Funciones de `public`

111 funciones, en cuatro grupos según **quién puede ejecutarlas**. Los grupos y los
nombres salen del catálogo (`has_function_privilege('authenticated', …)`), no de una lista
a mano: la anterior se quedó cinco funciones atrás sin que nadie lo notara.

| Grupo | Cuántas | Cuáles | Quién |
|---|---|---|---|
| **RPC de la app** | 29 | `resumen_panel`, `saldo_orden`, `entregar_orden` (migración `20261008000000`), `comisiones_estimadas`, `resumen_empleado` (migración `20261009000000`), `balance_orden`, `margen_ordenes` (migración `20261010000000`), `importar_estado_cuenta` (migración 36), `deshacer_importacion_estado_cuenta`, `create_work_order`, `repuestos_de_orden`, `marcar_labor_completada`, `pay_commissions`, `sede_delete_impact`, `delete_sede_cascade`, `registrar_push`, `eliminar_push`, `probar_push`, `usuarios_con_push`, `crear_enlace_cliente`, `regenerar_enlace_cliente`, `revocar_enlace_cliente`, `notificar_cliente_avance`, `enviar_reporte_cliente`, `enviar_presupuesto`, `registrar_autorizacion`, `cancelar_presupuesto`, `ordenes_esperando_autorizacion`, `app_schema_version` | Usuarios con sesión (`authenticated`). Las de admin lo validan por dentro |
| **Ayudantes de RLS** | 5 | `is_admin`, `current_user_role`, `current_user_sede_id`, `is_assigned_to_order`, `mis_ordenes_asignadas` (migración `20261007000000`: qué órdenes ve un técnico) | Las usan las políticas; sin sesión devuelven vacío |
| **Internas** | 30 | Dinero (`_saldo_orden`, `_reparto_comisiones`, `_balance_orden`, `recalculate_order_totals`, `sync_order_commissions`, `sync_order_parts_expense`, `reverse_order_delivery_finance`); avisos (`notificar`, `admins_de_sede`, `datos_orden_aviso`); cola (`claim_outbox`, `finish_outbox`, `dispatch_outbox_if_due`, `invoke_edge_function`, `purge_old_notifications`, `archivos_huerfanos`); portal y correos (`datos_portal`, `datos_correo`, `encolar_correo_cliente`, `asegurar_enlace_orden`, `preferencia_correos_portal`, `responder_presupuesto_portal`, `marcar_estatus_enviado`, `es_correo_valido`); presupuestos (`_crear_presupuesto`, `_agregar_borradores`, `_lineas_pendientes`, `_resolver_presupuesto`, `recordar_presupuestos_sin_respuesta`); recordatorios (`recordar_ordenes_vencidas`) | Solo `service_role` (Edge Functions), triggers y pg_cron |
| **De trigger** | 47 | `trg_*`, `handle_*`, `cleanup_order_finance` | Solo como trigger |

Qué hace cada trigger, por tabla: [arquitectura.md §5](arquitectura.md#5-dónde-vive-la-lógica-de-negocio).

> **Regla:** una función nueva nace ejecutable por `anon` y `authenticated`. Revócala en
> la misma migración y comprueba con `npm run qa:security` después de aplicarla
> ([auditoria-2026-09.md](auditoria-2026-09.md), AUD-01).

### 4.4 Migraciones

Viven en `supabase/migrations/` y se aplican con `npx supabase db push --linked`. **No se
cambia el esquema desde el panel**: lo que no está en una migración no existe en otro
entorno y lo borra el próximo `db reset`. Historia de las 54:
[evolucion.md §12](evolucion.md#12-todas-las-migraciones).

Una función se reescribe entera en cada migración que la cambia. Para saber cuál es la
versión vigente: `npm run db:donde -- <nombre>`. Antes de aplicar una migración a este
proyecto: [mantenimiento.md §4](mantenimiento.md#4-cambiar-la-base-sin-comprometer-la-operación).

---

## 5. Storage

Ocho buckets. Todo lo que no es logo ni avatar es **privado** y se lee con URLs firmadas.

| Bucket | Público | Límite y tipos | Rutas | Quién escribe | Quién lee | Estado |
|---|:---:|---|---|---|---|---|
| `orden_media` | no | 50 MB; JPEG, PNG, MP4, WebM, audio MP4/WebM/MPEG/OGG | `<sede>/<orden>/<uuid>.<ext>`, miniaturas `…-thumb.jpg`, firmas `firma-<fecha>.png` | Admin, o técnico asignado con la orden sin entregar | Admin; un técnico, solo las carpetas de sus órdenes asignadas; el cliente con URLs firmadas de 2 h que emite `portal` | **En uso** |
| `sede_logos` | **sí** | — | por sede | Admin | Cualquiera (va en correos y portal) | En uso |
| `avatares` | **sí** | — | `<usuario>/…` | Cada quien el suyo | Cualquiera | En uso |
| `comprobantes` | no | — | `<sede>/cheque-<fecha>-<nombre>` (pagos de comisiones) y `<sede>/entrega-<orden>-<fecha>.<ext>` (cobro al entregar) | Admin | Admin (URL firmada de 5 min) | En uso |
| `estados_cuenta_bancarios` | no | — | PDFs importados | Admin | Admin | En uso |
| `reportes` | no | — | PDFs de antes de la fase 6 | **Nadie** | Admin | Cerrado: solo lectura y borrado |
| `vehiculos_fotos` | no | — | Fotos del modelo anterior a la fase 2 | **Nadie** | Admin | Cerrado |
| `firmas` | no | — | Firmas del modelo anterior | **Nadie** | Admin | Cerrado |

Uso al 29 de septiembre de 2026: **todos vacíos**, tras la limpieza para la prueba del
taller. Ese día `supabase storage rm -r ss:///<bucket>` vació los archivos **y borró los
buckets**; se recrearon con la configuración de esta tabla. Si alguna vez falta uno, la app
responde "Bucket not found" al subir. Se recrea así, con los mismos valores:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('orden_media', 'orden_media', false, 52428800,
   ARRAY['image/jpeg','image/png','video/mp4','video/webm','audio/mp4','audio/webm','audio/mpeg','audio/ogg']),
  ('sede_logos', 'sede_logos', true, NULL, NULL),
  ('avatares', 'avatares', true, NULL, NULL),
  ('comprobantes', 'comprobantes', false, NULL, NULL),
  ('estados_cuenta_bancarios', 'estados_cuenta_bancarios', false, NULL, NULL),
  ('reportes', 'reportes', false, NULL, NULL),
  ('vehiculos_fotos', 'vehiculos_fotos', false, NULL, NULL),
  ('firmas', 'firmas', false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;
```

Las políticas no hay que recrearlas: viven en `storage.objects` y apuntan al bucket por
nombre. **Para vaciar un bucket, usar el panel** (Storage → el bucket → seleccionar todo →
Delete), no la CLI.

- El tope de 50 MB está en el bucket **y** en la app (`MAX_UPLOAD_BYTES`); el plan Free no
  permite más.
- Las subidas de más de 6 MB usan TUS reanudable contra el host directo de Storage.
- Las políticas viven en `storage.objects` y las crean las migraciones; se ven en el panel
  en Storage → Policies.
- La base no puede borrar archivos: al borrar una orden los borra la app, y
  `cleanup-storage` recoge los huérfanos cada noche.

---

## 6. Edge Functions

Deno 2. Código en `supabase/functions/`; se despliegan con
`npx supabase functions deploy <nombre>`.

| Función | JWT verificado por Supabase | Quién la llama | Cómo se protege | Usa | Versión (29 sep 2026) |
|---|:---:|---|---|---|---|
| `portal` | no | Portal del cliente (`/r/<token>`) | Token de 64 hex; `datos_portal` decide campo por campo | Llave de servicio | v2 |
| `process-outbox` | no | La base (`pg_net`) al crear un aviso, y pg_cron cada minuto | Secreto `x-restorify-secret` | Llave de servicio, Resend, VAPID | v5 |
| `cleanup-storage` | no | pg_cron a las 09:00 UTC | Secreto `x-restorify-secret` | Llave de servicio | v2 |
| `create-employee` | sí | Empleados → Nuevo usuario | JWT + rol admin | Admin API de Auth | v6 |
| `update-employee` | sí | Empleados → editar | JWT + rol admin; no degrada al último admin | Admin API de Auth | v4 |
| `delete-employee` | sí | Empleados → quitar | JWT + rol admin; nadie se borra a sí mismo, ni a quien tiene órdenes asignadas o pagos de comisión | Admin API de Auth | v5 |

`verify_jwt = false` para las tres primeras está declarado en `supabase/config.toml`, y
igual se despliegan con `--no-verify-jwt` para que quede explícito.

> **Una función que la app usa y no está desplegada responde 404**, y la pantalla falla sin
> más pista. Pasó con `update-employee` hasta el 15 de septiembre de 2026 (AUD-26):
> editar empleados no funcionaba. `npm run qa:security` lo comprueba en SEC-17.

---

## 7. Secretos y variables

**Nunca van valores en este documento, en el repositorio ni en la memoria de un agente.**
Aquí solo nombres y para qué.

### 7.1 Secretos de las Edge Functions

Panel: Edge Functions → Secrets. Terminal: `npx supabase secrets list` (nombres y un hash,
no valores).

| Nombre | Lo pone | Para qué |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `SUPABASE_JWKS`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS` | **Supabase**, solos | Que la función se conecte a su propio proyecto |
| `RESTORIFY_FUNCTIONS_SECRET` | Nosotros | Secreto compartido base ↔ funciones internas (el mismo valor que en Vault) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Nosotros | Firmar y cifrar los push |
| `RESEND_API_KEY` | Nosotros | Enviar correos. Llave **de solo envío** |
| `PUBLIC_SITE_URL` | Nosotros | Base de los enlaces en los correos (`https://restorifyauto.net` desde el 30/09/2026) |
| `EMAIL_FROM_ADDRESS` | Nosotros | Remitente (`notificaciones@restorifyauto.net`) |
| `SHOP_TIMEZONE` | Opcional (no está puesto) | Zona de las fechas en los correos; sin ella, `America/Chicago`. **El taller está en Maryland: debería ser `America/New_York`** (hoy las horas de los correos salen una hora atrasadas) |
| `GEMINI_API_KEY` | Nosotros (desde el 05/10/2026) | Traducción automática al inglés de los textos de la orden (`process-outbox`, canal `traduccion`). Usar una llave de un proyecto **con facturación**: en la capa gratuita Google puede usar los textos para mejorar sus productos y revisarlos personas |
| `GEMINI_MODEL` | Opcional | Modelo de Gemini; sin él, `gemini-2.5-flash`. Cuando Google retire un modelo, se cambia aquí sin desplegar |

Copia local de los que generamos nosotros: `supabase/.env.secrets.local` (ignorado por git).
La llave de Resend no está en ningún archivo.

### 7.2 Vault

Secretos que lee **la base** (no las funciones). Panel: Integrations → Vault.

| Nombre | Para qué |
|---|---|
| `restorify_project_url` | URL del proyecto, para que `invoke_edge_function` sepa a dónde llamar |
| `restorify_functions_secret` | El mismo valor de `RESTORIFY_FUNCTIONS_SECRET` |

Sin estos dos, los avisos se guardan y se ven en la campana, pero no sale ningún push ni
correo: esperan en `cola_envios`.

### 7.3 Variables del frontend

En producción, en el panel de Hostinger (el sitio compila con esas); en desarrollo, en
`.env.local`. Vite las **incrusta al compilar**, así que son públicas. Detalle en
[deployment.md §3](deployment.md#3-variables-del-frontend).

| Variable | En el sitio publicado (comprobado en su JavaScript el 30/09/2026) |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Las del proyecto `lendsiqkxhvbxxkaadrt` |
| `VITE_VAPID_PUBLIC_KEY` | Definida, la misma que en `.env.local` (sin ella no hay push) |
| `VITE_PUBLIC_SITE_URL` | `https://restorifyauto.net` |
| `VITE_SENTRY_DSN` | **Vacía**: Sentry no registra errores (PRD-06) |

---

## 8. Auth

| | |
|---|---|
| **Método** | Correo y contraseña. Sin proveedores externos, sin SMS, sin MFA |
| **Registro público** | **Apagado** (comprobado el 29 de septiembre de 2026 en `/auth/v1/settings`, `disable_signup: true`). Las cuentas las crea un admin con `create-employee`, que funciona igual con el registro apagado. `qa:security` SEC-18 lo vigila |
| **Largo mínimo de contraseña** | La app y las funciones exigen 8; en el panel sigue en 6 hasta aplicar PRD-07 |
| **Confirmación de correo** | No se pide: el admin crea la cuenta ya confirmada |
| **Duración del token** | 1 hora; supabase-js lo renueva solo |
| **Site URL y redirecciones** | Redirect URLs: `https://restorifyauto.net/**`, `https://restorifyauto.net/reset-password` y `http://localhost:5173/reset-password`. **La Site URL seguía en `https://reinventa.shop`** el 30/09/2026 (comprobado con `npx supabase config diff`): hay que cambiarla a `https://restorifyauto.net`. Hoy no rompe la recuperación, porque el enlace pide un `redirect_to` que está en la lista, pero es el respaldo de Supabase |
| **Usuarios** | 1 en `auth.users` desde la limpieza del 29 de septiembre de 2026: el administrador del taller, con su fila en `perfiles`. El personal lo da de alta desde Empleados |
| **Correo de Auth** | SMTP propio con Resend: `smtp.resend.com`, puerto `465`, usuario `resend`, remitente "Restorify" `notificaciones@restorifyauto.net` ([deployment.md §4.2](deployment.md#42-auth)). Funciona desde el 30/09/2026; ese mismo día estuvo en el puerto `464` y la recuperación de contraseña se colgaba ([password-reset.md](password-reset.md#si-el-correo-no-sale)) |

> **`supabase/config.toml` describe el Supabase local, no el real.** Los ajustes de Auth del
> proyecto real (Site URL, redirecciones, registro, SMTP) se cambian en el panel:
> Authentication → URL Configuration, Sign In / Providers y SMTP. Si cambias uno allá,
> refléjalo en `config.toml` para que el entorno local se parezca.

Un usuario de Auth sin fila en `perfiles` no entra a la app. Los empleados se crean y se
borran siempre con las funciones, nunca desde Authentication → Users, o quedan
desparejados.

---

## 9. Realtime

- **Publicación `supabase_realtime`:** `notificaciones` y, desde `20261010000002`, las
  tablas de la orden: `ordenes_trabajo`, `orden_asignaciones`, `orden_labor`,
  `orden_repuestos`, `orden_avances`, `orden_media` y `presupuestos`.
- La campana se suscribe a `postgres_changes` filtrado por `usuario_id`
  (`notifications.service.ts`). RLS aplica también aquí: nadie recibe avisos ajenos.
- **Las órdenes:** `useOrderSync` (montado en `AppLayout`) escucha las tablas de la orden
  (`workOrdersService.subscribeToChanges`) y con cada cambio vuelve a leer esa orden, el
  tablero, el Kanban y el panel por las consultas de siempre; del evento solo usa el id. Junta
  los avisos 400 ms (un cambio de estado toca varias filas) y relee todo al reconectarse o al
  volver a la app tras 30 s escondida, porque lo que cambió durante un corte no se reenvía.
  Antes el admin no veía una orden finalizada por la técnica hasta recargar (octubre 2026).
- **Quién recibe qué:** Realtime aplica la política de SELECT de cada tabla con la sesión de
  quien escucha. Comprobado contra el Supabase local con tres sesiones: el admin recibe todo;
  la técnica asignada, su orden y su avance pero no los repuestos; un técnico no asignado,
  nada. Un DELETE llega a cualquier suscriptor de la tabla con solo la llave primaria
  (Realtime no puede revisar una fila borrada).
- **Toda tabla en la publicación lleva RLS**: una sin ella mandaría sus filas a cualquiera con
  sesión. Lo fija `15_tiempo_real.test.sql`.
- Finanzas, clientes y vehículos no usan Realtime: se releen con TanStack Query.
- Consumo: cada cambio es un mensaje por cada persona que puede verlo. El plan Pro incluye
  500 conexiones simultáneas y 5 millones de mensajes al mes; un taller usa una fracción.

Agregar una tabla a Realtime es una migración (`ALTER PUBLICATION supabase_realtime ADD
TABLE …`), no un clic en el panel.

---

## 10. Tareas programadas y llamadas salientes

### 10.1 pg_cron

| Tarea | Horario (UTC) | Qué ejecuta |
|---|---|---|
| `restorify-outbox` | cada minuto | `dispatch_outbox_if_due()`: si hay avisos o correos vencidos en `cola_envios`, llama a `process-outbox` |
| `restorify-maintenance` | 09:00 | `purge_old_notifications()` y `cleanup-storage` (archivos huérfanos de más de 7 días) |
| `restorify-quote-reminders` | 15:00 | `recordar_presupuestos_sin_respuesta()`: aviso a admins por presupuestos sin respuesta de más de 24 h |
| `restorify-due-reminders` | 15:15 | `recordar_ordenes_vencidas()`: aviso por órdenes que pasaron su fecha de entrega; reemplaza el del día anterior en vez de apilar otro |

Las cuatro están activas; la de cada minuto termina en `succeeded`. Historial:

```sql
SELECT j.jobname, d.status, d.start_time, d.return_message
FROM cron.job_run_details d JOIN cron.job j USING (jobid)
ORDER BY d.start_time DESC LIMIT 20;
```

### 10.2 pg_net

La base llama por HTTP a las funciones internas con `invoke_edge_function()`. Es
asíncrono: la operación que lo pidió no espera. La respuesta queda un tiempo en
`net._http_response`:

```sql
SELECT status_code, created, left(content::text, 200)
FROM net._http_response ORDER BY created DESC LIMIT 10;
```

Un 401 ahí significa que el secreto de Vault y el de las funciones no coinciden.

---

## 11. Dónde está cada cosa en el panel

`https://supabase.com/dashboard/project/lendsiqkxhvbxxkaadrt`. Supabase cambia a veces los
nombres del menú; busca el más parecido.

| Busco… | En el panel |
|---|---|
| Ver o editar filas | Table Editor |
| Correr una consulta | SQL Editor (corre como `postgres`: **sin RLS**) |
| Políticas RLS de una tabla | Authentication → Policies, o Database → Tables → la tabla |
| Funciones y triggers | Database → Functions / Triggers |
| Extensiones | Database → Extensions |
| Qué migraciones se aplicaron | Database → Migrations |
| Tablas en Realtime | Database → Publications → `supabase_realtime` |
| Respaldos | Database → Backups (en Free no hay respaldos diarios descargables) |
| Usuarios | Authentication → Users (crear y borrar desde la app, no desde aquí) |
| Site URL y redirecciones | Authentication → URL Configuration |
| SMTP y plantillas de correo de Auth | Authentication → Emails / SMTP |
| Buckets, archivos y sus políticas | Storage |
| Funciones, sus logs y secretos | Edge Functions (→ una función → Logs; → Secrets) |
| Tareas programadas | Integrations → Cron |
| Vault | Integrations → Vault |
| Errores de la API, Auth y Storage | Logs & Analytics |
| Llaves (anónima, de servicio) | Project Settings → API Keys |
| Consumo del plan | Organization → Usage y Billing |

---

## 12. El Supabase local (Docker)

`npx supabase start` levanta en Docker una copia vacía del proyecto con las 54
migraciones. Sirve para las pruebas pgTAP y para probar una migración antes de aplicarla.
**No toca el proyecto real.** Cómo instalar Docker: [pruebas.md §2.4](pruebas.md#24-para-qué-hace-falta-docker).

| Servicio local | Dirección |
|---|---|
| API (PostgREST, Auth, Storage, Functions) | `http://127.0.0.1:54321` |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio (el panel local) | `http://127.0.0.1:54323` |
| Correos de prueba | `http://127.0.0.1:54324` |

```bash
npx supabase start     # levantar (la primera vez descarga varios GB)
npx supabase status    # direcciones y llaves locales
npm run test:db        # 13 archivos pgTAP, 330 aserciones
npx supabase db reset  # recrear la base local desde cero
npx supabase stop      # apagar
```

Diferencias con el real: sin datos, sin secretos de Vault (los avisos esperan en la cola),
con `pgtap` instalado y con la configuración de `supabase/config.toml`.

---

## 13. Revisar el proyecto desde la terminal

Todo de solo lectura, con el proyecto enlazado:

```bash
npm run db:check                      # migraciones del código contra las aplicadas
npx supabase functions list           # funciones desplegadas y su versión
npx supabase secrets list             # nombres de los secretos
npm run qa:security                   # la API expuesta se comporta como debe
npx supabase db query --linked -f scripts/qa/estado-orden.sql   # todo sobre una orden
```

Permisos de ejecución de las funciones, tal como están en la base:

```sql
SELECT proname,
       has_function_privilege('anon', oid, 'EXECUTE')          AS anon,
       has_function_privilege('authenticated', oid, 'EXECUTE') AS authenticated
FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND prorettype <> 'trigger'::regtype
ORDER BY 2 DESC, 3 DESC, 1;
```

---

## 14. Pendientes y limpieza

| Qué | Por qué importa | Cómo |
|---|---|---|
| **Pasar a Pro** | Free no tiene respaldos diarios, pausa proyectos inactivos y limita Storage a 1 GB | Organization → Billing. Mientras tanto, respaldo manual antes de cada `db push` ([mantenimiento.md §4](mantenimiento.md#4-cambiar-la-base-sin-comprometer-la-operación)) |
| **Staging** | Hoy las pruebas e2e y `qa:security` corren contra el único proyecto, y sus cuentas de prueba se borraron el 29/09/2026 | Un segundo proyecto con las mismas migraciones, secretos propios y cuentas de prueba |
| **Sentry** | Hoy nadie se entera de un error en el teléfono de un técnico | Crear el proyecto en Sentry, poner `VITE_SENTRY_DSN` en las variables del sitio en Hostinger y volver a desplegar |
| **SMTP de Auth con Resend** | El correo de Supabase permite ~2 por hora | [deployment.md §4.2](deployment.md#42-auth) |
| **`[inbucket]` en `config.toml`** | La CLI avisa que la sección es obsoleta; solo afecta al local | Renombrarla cuando se actualice la configuración local |
