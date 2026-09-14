# Arquitectura de Restorify

Guía para quien llega nuevo al código y necesita entender cómo está armado el
sistema antes de tocarlo. Para *qué* hace y *por qué* (reglas de dinero, roles,
avisos), el complemento es [reglas-de-negocio.md](reglas-de-negocio.md).

---

## Índice

1. [Lo esencial en un minuto](#1-lo-esencial-en-un-minuto)
2. [La decisión que explica todo lo demás](#2-la-decisión-que-explica-todo-lo-demás)
3. [Mapa del repositorio](#3-mapa-del-repositorio)
4. [Modelo de datos](#4-modelo-de-datos)
5. [Dónde vive la lógica de negocio](#5-dónde-vive-la-lógica-de-negocio)
6. [Seguridad y permisos](#6-seguridad-y-permisos)
7. [Servidor: edge functions, cola de envíos y tareas programadas](#7-servidor-edge-functions-cola-de-envíos-y-tareas-programadas)
8. [El frontend por dentro](#8-el-frontend-por-dentro)
9. [Migraciones: el flujo de trabajo](#9-migraciones-el-flujo-de-trabajo)
10. [Levantar el proyecto](#10-levantar-el-proyecto)
11. [Trampas conocidas](#11-trampas-conocidas)

---

## 1. Lo esencial en un minuto

| | |
|---|---|
| **Frontend** | React 19 + TypeScript 6, construido con Vite 8 |
| **Datos remotos** | TanStack Query (caché, reintentos, invalidación) |
| **Backend** | Supabase: PostgreSQL 17, Auth, Storage, Realtime, Edge Functions (Deno 2) |
| **Tareas en la base** | pg_net (llamadas HTTP asíncronas) y pg_cron (tareas programadas) |
| **Ruteo** | react-router-dom 7, todo del lado del cliente |
| **Formularios** | React Hook Form + Zod (mini) |
| **Estilos** | CSS plano con variables, sin framework de UI |
| **Multimedia** | MediaRecorder, WebCodecs vía Mediabunny, subidas reanudables TUS |
| **Push** | Web Push (VAPID) con service worker; app instalable (PWA) |
| **Correo** | Resend (dominio `reinventa.shop` verificado): avisos automáticos al cliente |
| **Portal del cliente** | Paquete aparte en `/r/<token>`, sin cuenta; datos por una edge function pública |
| **Presupuestos** | Estado por línea (borrador → pendiente → aprobado/rechazado); solo lo aprobado se cobra |
| **Pruebas** | Vitest (unitarias y componentes), pgTAP (base de datos), Playwright (e2e) |
| **Hosting** | Sitio estático en Hostinger (Apache), dominio `reinventa.shop` |

Unas 26 000 líneas de TypeScript (con pruebas), 5 000 de CSS, 34 migraciones y 22 tablas.
Cómo se llegó hasta aquí, etapa por etapa: [evolucion.md](evolucion.md).

---

## 2. La decisión que explica todo lo demás

**No hay servidor propio.** El navegador habla directamente con Supabase a
través de PostgREST. No existe una capa de API intermedia donde poner
validaciones, permisos ni reglas de negocio.

```
Navegador (React)  ──  supabase-js  ──►  https://<proyecto>.supabase.co
                                              │
            ┌─────────────────────────────────┼──────────────────────────────┐
            │                                 │                              │
       PostgREST ──► PostgreSQL          Storage (buckets)             Realtime
                      │  RLS               fotos, videos, firmas        avisos nuevos
                      │  triggers ──► pg_net ──► Edge Functions (Deno) ──► push / correo
                      │  pg_cron  ──────────────┘   (clave de servicio)
                      └─ funciones RPC
```

De esto se derivan tres consecuencias que hay que tener presentes **siempre**:

**1. La clave anónima y todas las tablas son públicas.** Viajan dentro del bundle
de JavaScript. Cualquiera con las herramientas de desarrollo abiertas puede
hacerle a la API las mismas peticiones que hace la aplicación, con su propio
token de sesión legítimo.

**2. Esconder un botón en React no es una restricción, es una sugerencia
visual.** Un `{isAdmin && <button/>}` mejora la experiencia; no protege nada. Lo
único que sostiene un límite de verdad son las políticas RLS y los triggers de
Postgres.

**3. La lógica que debe cumplirse siempre va en la base de datos.** Si una regla
solo existe en el frontend, se la salta cualquiera que llame la API directamente,
y también cualquier pantalla futura que olvide replicarla.

> Cuando agregues una restricción, la pregunta correcta no es «¿escondí el
> botón?» sino «¿qué pasa si alguien manda esta petición a mano?». La migración
> `20260908000000_destructive_action_hardening.sql` documenta el modelo de
> amenaza: un técnico con sesión válida que está por irse del taller.

Un ejemplo concreto de este principio: los montos de una orden (totales,
repuestos con precio, depósito) no están en `ordenes_trabajo` con columnas
escondidas, sino en tablas que un técnico **no puede leer** (`orden_montos`,
`orden_repuestos`). Esconder columnas habría dejado el dinero en la respuesta
de red, a un clic de las herramientas del navegador.

---

## 3. Mapa del repositorio

```
src/
  main.tsx                       entrada: /r/... carga portal/, lo demás appStart
  appStart.tsx                   app del taller: Sentry, service worker, <App />
  App.tsx                        proveedores + rutas + guardias de acceso

  portal/                        reporte web del cliente (paquete aparte, sin Supabase JS)
    start.tsx                    metas de privacidad, tema claro, render
    CustomerPortal.tsx           la página; strings.ts (es/en), portal.api.ts, portal.css

  pages/                         una pantalla por archivo
    Login.tsx, ResetPassword.tsx acceso y recuperación de contraseña
    Dashboard.tsx                panel principal
    Customers.tsx, Vehicles.tsx  clientes y vehículos (VIN, placa)
    WorkOrders.tsx               lista de órdenes + alta (delegada a features/)
    KanbanBoard.tsx              tablero por estado
    Finance.tsx                  movimientos e importación bancaria
      finance/ImportStatementModal.tsx
    Payroll.tsx                  comisiones y pagos (ruta /payroll)
    Settings.tsx                 perfil, push, sedes, personal

  features/                      módulos con estado propio, extraídos de las páginas
    workOrders/                  detalle de orden, alta, tablas de labor y repuestos,
                                 firma, bitácora de avances, reporte, comisión estimada,
                                 enlace del cliente (CustomerLinkCard), presupuesto
                                 (QuoteCard) e insignia de estado de línea
    media/                       captura, grabadores, galería, cola de subida, bandeja
    notifications/               campana, push del dispositivo
    vehicles/                    formulario de vehículo con VIN
    settings/                    tarjeta de usuarios

  components/
    layout/                      AppLayout (monta la cola de subidas), Sidebar, Header, BottomNav
    SchemaDriftBanner.tsx        avisa si la base está atrasada respecto al build
    Combobox, CustomerPicker, LazyModal, PasswordInput, ErrorBoundary

  context/                       estado global, uno por preocupación
    Auth, Language, Theme, Toast, UnsavedChanges
    (el contexto va en *.context.ts y el proveedor en *Context.tsx: Vite solo
     preserva el estado en recarga en caliente si un módulo exporta únicamente
     componentes)

  services/                      TODAS las consultas a Supabase, un módulo por dominio
    workOrders, customers, vehicles, finance, commissions, dashboard,
    media, notifications, customerPortal, quotes, reports, search, sedes, users
    supabaseService.ts           fachada que re-exporta los anteriores (compatibilidad)

  lib/                           lógica sin React
    media/                       compresión, formatos, cola de subida, video de galería
    push.ts                      soporte y suscripción Web Push
    dates.ts                     fechas del taller (zona horaria local)
    errors.ts                    traduce errores de Postgres y Auth
    vin.ts, bankStatementParser.ts, categorizationRules.ts, workOrderPdf.ts,
    signature.ts, branding.ts, schemaVersion.ts, queryClient.ts, siteUrl.ts,
    phone.ts (WhatsApp y tel:), email.ts (formato de correo),
    reportMedia.ts (qué fotos lleva el PDF: solo las publicadas)

  types/                         database.ts reexporta domain/*.types.ts
  i18n/translations.ts           español e inglés
  styles/                        index.css (variables, temas) + components.css
  test/                          utilidades de prueba (proveedores, matchMedia)

public/
  sw.js                          service worker: solo push, sin caché
  manifest.webmanifest, icons/   app instalable (PWA)
  .htaccess                      reescritura SPA + tipos PWA para Apache

supabase/
  migrations/                    34 migraciones, en orden cronológico (historia en evolucion.md)
  functions/                     edge functions (Deno)
    create-employee, update-employee, delete-employee   con clave de servicio
    process-outbox, cleanup-storage                     internas, llamadas por la base
    portal                                              pública: el reporte del cliente
    _shared/internal.ts                                 autenticación de las internas
    _shared/email/templates.ts                          plantillas de correo (TS puro)
  tests/database/                pruebas pgTAP
  config.toml

e2e/                             pruebas Playwright
scripts/                         check-migrations, copy-pdf-worker, generate-pwa-icons
docs/                            esta documentación
```

### Reglas de organización

**Ninguna pantalla llama a Supabase directamente.** Todo pasa por un módulo de
`services/`. Mantiene las consultas en un solo lugar y permite probar pantallas
simulando un solo módulo. Código nuevo importa el servicio del dominio
(`workOrdersService`), no la fachada `supabaseService`.

**`lib/` no sabe que existe React** (salvo `useMediaQuery`). Entra un dato, sale
otro. Por eso está bien cubierto por pruebas rápidas.

**Una página que crece se parte en `features/`.** `WorkOrders.tsx` tenía más de
2 000 líneas; hoy la página es la lista, y el detalle, el alta y cada tarjeta
viven en `features/workOrders/` con sus propios hooks.

---

## 4. Modelo de datos

22 tablas. El eje es la **sede**: casi todo cuelga de ella y no se mezcla entre
talleres.

```
sedes ──┬── perfiles                  usuarios; rol: admin | mecanico | pintor
        ├── clientes ── vehiculos     vehiculos.sede_id derivado por trigger
        ├── ordenes_trabajo ─┬── orden_montos          1:1 · totales y depósito · SOLO ADMIN
        │                    ├── orden_labor ────┐     mano de obra (la sede la lee) · estado por línea
        │                    ├── orden_repuestos ─┤     con precio · SOLO ADMIN · estado por línea
        │                    ├── presupuestos ◄───┘     evidencia de cada autorización · SOLO ADMIN
        │                    ├── orden_asignaciones ── perfiles
        │                    ├── orden_avances ─┐      bitácora del técnico
        │                    ├── orden_media ◄──┘      fotos, videos, audio (bucket privado)
        │                    ├── orden_enlaces         enlace del cliente (token) · SOLO ADMIN
        │                    └── comisiones ── comision_pagos
        ├── finanzas_movimientos ──┬── ordenes_trabajo      referencia_orden_id
        │                          ├── finanzas_importaciones
        │                          └── comision_pagos       comision_pago_id (FK en cascada)
        └── notificaciones ── perfiles

push_suscripciones ── perfiles       teléfonos con push
cola_envios                          outbox de push y de correos al cliente
finanzas_reglas_categorizacion       configuración global
numero_orden_contadores              folios; solo lo tocan triggers
```

### Detalles que no son obvios

**El dinero de una orden está repartido a propósito.** `ordenes_trabajo.total_labor`
es visible para la sede, porque es la base de la comisión del técnico.
`orden_montos` (total de repuestos, total general, depósito) y `orden_repuestos`
son admin-only por RLS. PostgREST devuelve `null` en un embed bloqueado por RLS,
así que `select('*, montos:orden_montos(*)')` sirve para los dos roles.

**Los repuestos son de traspaso.** Se captura solo el precio; el trigger copia el
precio al costo (`costo_unitario`). Por eso la base de la comisión (total general
menos repuestos) es igual a la mano de obra. Ver [comisiones.md](comisiones.md).

**`vehiculos.sede_id` es redundante a propósito.** Hace la frontera de sede
explícita e indexable para RLS. Lo llena `trg_vehiculo_sede`; el cliente nunca lo
envía. **`vehiculos.placa` acepta NULL**: las unidades de subasta no tienen placa.

**La multimedia no son URLs.** `orden_media` guarda la **ruta** en el bucket
privado `orden_media` (`{sede}/{orden}/{uuid}.{ext}`), tipo, duración, tamaño y
si es visible para el cliente. La firma también es una ruta (`firma_ruta`). Para
ver cualquier archivo se pide una URL firmada de vida corta.

**El enlace del cliente guarda el token tal cual.** El admin tiene que poder copiarlo
de nuevo; lo protege RLS (solo admin). Uno activo por orden (índice único parcial).
`clientes.acepta_correos` guarda la baja del cliente; `sedes.email_contacto` y
`sedes.whatsapp`, el contacto que usan los correos y el portal.

**Cada línea tiene estado** (`borrador`, `pendiente`, `aprobado`, `rechazado`) y
**solo lo aprobado entra en los totales** — y por lo tanto en el cobro, el costo de
repuestos y las comisiones. El estado lo cambian únicamente las funciones de
presupuesto (bandera `restorify.presupuesto`); cada cambio deja una fila en
`presupuestos` con quién, cómo y cuándo. Ver [presupuestos.md](presupuestos.md).

**Las eliminaciones tienen intenciones distintas.** Borrar un cliente se lleva
sus vehículos (`CASCADE`); una orden bloquea el borrado del cliente y del vehículo
(`RESTRICT`): el historial de trabajo no se pierde por accidente. Borrar una
orden se lleva sus hijos, y el servicio borra además sus archivos de Storage.

---

## 5. Dónde vive la lógica de negocio

**En triggers y funciones de PostgreSQL**, no en el frontend. Cambiar el estatus
de una orden desde cualquier pantalla —o desde la API a mano— mueve dinero,
devenga comisiones y genera avisos automáticamente. Las reglas, en lenguaje de
negocio, están en [reglas-de-negocio.md](reglas-de-negocio.md). Aquí va el mapa
técnico.

### Triggers por tabla

| Tabla | Trigger | Qué hace |
|---|---|---|
| `ordenes_trabajo` | `trg_numero_orden` | Genera `ORD-AAAA-###` de forma atómica |
| | `trg_orden_sede_coherente` | Rechaza órdenes que mezclan sedes |
| | `trg_order_money_guard` | Técnico: no entrega, no cambia sede/número, no escribe `total_labor` |
| | `trg_order_technician_guard` | Técnico: solo asignado, orden sin entregar, y solo estado, avance y firma. Firma en la carpeta de su orden (para todos) |
| | `trg_order_quote_delivery_guard` | No se entrega con un presupuesto esperando respuesta |
| | `trg_order_portal` | Firma → enlace del cliente y correo de recepción; estatus → correo con espera y vencimiento del enlace |
| | `trg_order_quote_signature` | La firma de recepción aprueba los borradores |
| | `trg_order_montos_create` | Crea la fila de `orden_montos` |
| | `trg_progress_on_status` | Avance a 100 % al finalizar o entregar |
| | `trg_order_delivery_payment` | Al entregar: cobra el saldo pendiente |
| | `trg_order_parts_expense` | Al entregar: asienta el costo de repuestos |
| | `trg_order_delivery_reversal` | Al sacar de entregado: revierte cobro final y costo de repuestos |
| | `trg_order_commissions` | Recalcula comisiones al cambiar el estatus |
| | `trg_order_created_notify`, `trg_order_finished_notify` | Avisos a admins |
| | `trg_cleanup_order_finance` | Al borrar la orden: borra sus movimientos automáticos |
| `orden_montos` | `trg_order_montos_guard` | Totales solo por recálculo; depósito fijo tras entregar |
| | `trg_order_montos_deposit` | Asienta el depósito (o su ajuste) |
| | `trg_order_montos_delivered_adjustment` | Si cambia el total de una orden entregada, asienta la diferencia |
| | `trg_order_montos_commissions` | Recalcula comisiones al cambiar totales |
| `orden_labor` | `trg_labor_totals`, `trg_labor_delivered_guard` | Recalcula totales (solo aprobado); técnico no toca orden entregada |
| | `trg_labor_quote_guard` | Línea nueva = borrador; pendiente no se edita; el estado solo lo cambia un presupuesto; corregir una rechazada la vuelve a borrador |
| `orden_repuestos` | `trg_parts_subtotal`, `trg_part_cost_passthrough` | Subtotal y costo = precio |
| | `trg_parts_quote_guard` | Igual que en mano de obra |
| | `trg_parts_totals`, `trg_parts_expense_sync` | Totales y ajuste de egreso en orden entregada |
| `orden_asignaciones` | `trg_assignment_commissions` | Re-reparte la bolsa |
| | `trg_assignment_owner_immutable` | Una asignación no cambia de orden ni de persona |
| | `trg_assignment_notify` | Aviso al técnico asignado / quitado |
| `orden_avances` | `trg_progress_notify` | Aviso a admins cuando un técnico documenta |
| | `trg_avance_owner_immutable` | Un avance no cambia de orden ni de autor |
| `orden_media` | `trg_orden_media_prepare`, `trg_orden_media_guard` | Sede, ruta válida, visibilidad inicial; inmutable salvo visibilidad |
| `comisiones` | `trg_commission_notify` | Aviso "comisión generada" |
| `comision_pagos` | `trg_commission_payment_finance` | Egreso en Finanzas ligado al pago |
| `sedes` | `trg_sede_commission_rate` | Re-precia comisiones pendientes al cambiar el % |
| `perfiles` | `trg_perfil_privilegios` | Nadie cambia su propio rol o sede |
| `vehiculos` | `trg_vehiculo_sede` | Deriva la sede del cliente |
| `notificaciones` | `trg_notificacion_guard` | Solo se puede marcar leída |

Casi todos son `SECURITY DEFINER`: corren con los permisos de su dueño, para que
un técnico que finaliza una orden dispare efectos en tablas que él no puede
escribir. Por eso **los guards validan explícitamente quién llama** con
`is_admin()` y `auth.role()`.

### El recálculo de totales se identifica

`recalculate_order_totals` escribe los totales con la bandera de transacción
`restorify.recalc = on`. Los guards de `ordenes_trabajo` y `orden_montos` solo
permiten cambiar totales con esa bandera: un `PATCH` directo a la API no la tiene.

### Funciones RPC que llama el frontend

| Función | Quién | Para qué |
|---|---|---|
| `create_work_order` | todos | Alta transaccional de orden, labor, repuestos y asignaciones. Ignora depósito/labor/repuestos si no es admin |
| `repuestos_de_orden` | todos | Repuestos sin precio (lo que ve un técnico) |
| `pay_commissions` | admin | Paga comisiones; el monto lo suma el servidor |
| `sede_delete_impact`, `delete_sede_cascade` | admin | Borrado de sede con vista previa |
| `registrar_push`, `eliminar_push`, `probar_push` | todos | Push del dispositivo |
| `usuarios_con_push` | admin | Quién tiene push activo |
| `app_schema_version` | todos | Detección de desfase entre build y base |
| `crear_enlace_cliente`, `regenerar_enlace_cliente`, `revocar_enlace_cliente` | admin | Tarjeta del enlace del cliente |
| `notificar_cliente_avance` | admin | "Avisar novedades" por correo |
| `enviar_reporte_cliente` | admin | "Enviar reporte → Enviar por correo" (asegura el enlace) |
| `enviar_presupuesto`, `registrar_autorizacion`, `cancelar_presupuesto` | admin | Tarjeta de presupuesto |
| `ordenes_esperando_autorizacion` | todos | Marca "Esperando autorización" en lista y tablero, sin montos |

> **Antes de calcular algo en el frontend, revisa si un trigger ya lo hace.** Los
> totales de una orden no se calculan a mano en React: se releen de la base
> después de guardar.

---

## 6. Seguridad y permisos

### Row Level Security

RLS está activo en todas las tablas. Las políticas se apoyan en funciones
`SECURITY DEFINER` que evitan recursión al consultar `perfiles`:
`is_admin()`, `current_user_role()`, `current_user_sede_id()` e
`is_assigned_to_order(orden_id)` (esta última evita la recursión entre las
políticas de `ordenes_trabajo` y `orden_asignaciones`).

El patrón general es `is_admin() OR sede_id = current_user_sede_id()`. Sobre él:

- **Solo admin:** `orden_montos`, `orden_repuestos`, `finanzas_*`, escritura de
  `comisiones` y `comision_pagos`, escritura de `orden_labor`, borrado de
  clientes, vehículos y órdenes, publicar multimedia al cliente.
- **Propio:** `notificaciones` y `push_suscripciones` (cada quien las suyas);
  `comisiones` las lee el técnico dueño; avances y archivos se borran por su autor.
- **Asignado:** modificar una orden (estado, avance, firma), escribir avances y
  subir multimedia exige estar asignado y que la orden no esté entregada. Un
  técnico solo se asigna a sí mismo. La regla de la orden vive en un trigger y no
  en la política de UPDATE, para responder con un 42501 y un motivo en vez de un
  "0 filas" silencioso.

La matriz completa por rol, en lenguaje de negocio, está en
[reglas-de-negocio.md](reglas-de-negocio.md#3-qué-puede-hacer-cada-rol).

**Un `DELETE` o `UPDATE` que RLS rechaza no es un error**: PostgREST informa éxito
con cero filas. Los borrados sensibles usan `.select('id')` y `assertDeleted()`
para convertir ese silencio en un error visible.

### Storage

| Bucket | Público | Contenido | Escritura |
|---|---|---|---|
| `orden_media` | **no** | fotos, videos, audio y firmas de órdenes | admin, o asignado a la orden sin entregar; borrar: admin o dueño |
| `comprobantes` | **no** | fotos de cheques | admin |
| `reportes` | **no** | PDF compartidos antes de la fase 6; lectura y borrado solo admin | nadie (el reporte es el enlace del portal) |
| `estados_cuenta_bancarios` | no | PDF del banco | admin |
| `sede_logos`, `avatares` | sí | logos e imágenes de perfil | admin / cada usuario |
| `vehiculos_fotos`, `firmas` | **no** (cerrados en septiembre de 2026) | **en desuso** desde la fase 2; lectura solo admin | nadie |

Lo privado se ve con URLs firmadas (1 hora para galerías, 10 minutos para el PDF).

### Edge functions

- `create-employee`, `update-employee`, `delete-employee` — usan la API de
  administración de Auth; verifican que quien llama sea admin.
- `process-outbox`, `cleanup-storage` — **internas**: se despliegan sin
  verificación de JWT y exigen el secreto compartido `x-restorify-secret`.
- `portal` — **pública** (sin JWT): la protege el token de 64 hexadecimales. Solo
  llama `datos_portal` y `preferencia_correos_portal`, que están concedidas
  únicamente a `service_role` y arman la respuesta campo por campo.

Todas corren con la clave de servicio y **saltan RLS**: cada una valida permisos
por su cuenta.

---

## 7. Servidor: edge functions, cola de envíos y tareas programadas

```
trigger ─► notificar() ─► notificaciones        (la campana lo ve por Realtime)
                     └─► cola_envios (push) ─► invoke_edge_function() ─pg_net─► process-outbox ─► Web Push
trg_order_portal ─► encolar_correo_cliente() ─► cola_envios (email, con espera) ────────┘      └─► Resend
                                                     ▲
pg_cron "restorify-outbox" (cada minuto) ────────────┘  reintento si quedó algo pendiente
pg_cron "restorify-maintenance" (09:00 UTC) ─► purge_old_notifications() + cleanup-storage
pg_cron "restorify-quote-reminders" (15:00 UTC) ─► recordar_presupuestos_sin_respuesta()
```

- **La cola (`cola_envios`) es el único camino de salida.** Lleva push al equipo y
  correos al cliente. Deja registro de cada envío y reintenta con espera
  creciente (1, 4, 16, 64 minutos; error al quinto intento).
- `claim_outbox` toma filas con `FOR UPDATE SKIP LOCKED`: el aviso inmediato y el
  cron no envían dos veces lo mismo.
- La URL del proyecto y el secreto viven en **Vault**, no en migraciones. Sin
  ellos los avisos se guardan igual y la cola espera.

Detalle completo y diagnóstico en
[multimedia-y-notificaciones.md](multimedia-y-notificaciones.md) (push) y
[portal-y-correos.md](portal-y-correos.md) (correos y portal).

---

## 8. El frontend por dentro

### Proveedores

```
ErrorBoundary → QueryClientProvider → BrowserRouter → Theme → Language → Toast
  → UnsavedChanges → Auth → Rutas
       └─ AppLayout → MediaUploadsProvider (cola de subidas de la sesión)
```

`AuthContext` expone sesión, perfil, sede activa y `passwordRecovery`, que gana
sobre todas las rutas (el enlace de recuperación inicia sesión).

`MediaUploadsProvider` vive en el layout y no en una pantalla: un técnico que
graba un video y se va al Kanban no debe cortar la subida.

### Datos remotos: TanStack Query

Cada lectura es un `useQuery` con clave en `lib/queryClient.ts`. Las mutaciones
invalidan las claves afectadas en vez de parchear a mano, porque la base recalcula
totales y dispara efectos que el cliente no puede predecir. Los errores se guardan
crudos y se traducen al pintar: cambiar de idioma no vuelve a consultar nada.

### Guardias de ruta

`ProtectedRoute` redirige sin sesión y con `adminOnly` saca a quien no es admin.
**Es comodidad, no seguridad.**

### Manejo de errores

`lib/errors.ts` traduce códigos de Postgres (`23503`, `23505`, `42501`…) y de Auth
a texto en los dos idiomas. `lib/media/errors.ts` hace lo mismo con los errores
de cámara, micrófono y conversión de video. **Nunca muestres el mensaje crudo del
backend.**

### Fechas

`lib/dates.ts`. Una columna `DATE` llega como `'2026-09-01'`, y
`new Date('2026-09-01')` es medianoche **UTC**: en EE. UU. eso es el 31 de agosto.
Usa `isSameMonth` y `todayLocal`, nunca `toISOString().split('T')[0]`.

### Estilos

CSS plano en dos archivos. `index.css` define variables y los dos temas;
`components.css` las usa. **Nunca escribas un color literal** en un componente.

Capas: `--z-dropdown 100`, `--z-sticky 200`, `--z-overlay 300`, `--z-modal 400`,
`--z-toast 500`. Los toasts van sobre los modales: es la única forma de avisar
algo con un diálogo abierto.

### Móvil

- `cards-on-mobile` en `.table-container` + `data-label` en cada `<td>`: la tabla
  se vuelve tarjetas.
- `.mobile-only` (bloque) y `.mobile-flex` (contenedor flex): no uses `.mobile-only`
  en algo que tiene que seguir siendo flex, el `!important` le quita el `gap`.
- `useIsMobile()` cuando conviene renderizar una sola versión en vez de esconder
  la otra.
- Inputs a 16 px bajo 768 px: Safari de iOS hace zoom en cualquier campo menor.
- `100dvh` junto a `100vh`, y `env(safe-area-inset-*)` con `viewport-fit=cover`.

### PWA y service worker

`public/sw.js` **solo** maneja push y el toque en la notificación. No tiene
manejador de `fetch` y no cachea la app: un despliegue nuevo llega siempre, sin
versiones viejas atrapadas en caché.

---

## 9. Migraciones: el flujo de trabajo

Las migraciones son **la única forma** de cambiar el esquema. Nunca edites tablas
desde el panel de Supabase.

```bash
npm run db:check                          # qué falta aplicar en el proyecto enlazado
npx supabase db push --dry-run            # simulacro
npx supabase db push --linked             # aplicar
```

Nombre: `AAAAMMDDHHMMSS_descripcion_en_ingles.sql`. El build estampa la migración
más nueva (`__SCHEMA_VERSION__`) y la app la compara con `app_schema_version()`:
si la base está atrasada, `SchemaDriftBanner` lo dice en pantalla.

### Cómo escribirlas

- **Idempotentes**: `IF EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT`.
- **Explica el porqué.** Las migraciones de este proyecto son la mejor
  documentación de sus decisiones; léelas en orden si quieres entender cómo llegó
  el sistema a donde está.
- **Revoca lo interno.** Una función en `public` queda expuesta como RPC a `anon` y
  `authenticated` por defecto: `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.
- **Prueba con pgTAP** lo que toque permisos o dinero (`supabase/tests/database/`).
- **Coordina con el frontend**: si una migración elimina columnas, la base y el
  `dist` se despliegan juntos (ver [deployment.md](deployment.md)).

---

## 10. Levantar el proyecto

```bash
npm install          # el postinstall copia el worker de pdfjs a public/
npm run dev          # http://localhost:5173
```

`.env.local`:

```
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<clave anónima>
VITE_PUBLIC_SITE_URL=https://reinventa.shop
VITE_VAPID_PUBLIC_KEY=<llave pública VAPID>      # opcional: sin ella no hay push
VITE_SENTRY_DSN=<dsn>                            # opcional
```

Vite **incrusta** estas variables en el build: cambiarlas exige recompilar.

```bash
npm run build     # tsc -b && vite build → dist/
npm run lint      # oxlint
npm test          # Vitest
npm run test:db   # pgTAP (requiere `npx supabase start`, con Docker)
npm run test:e2e  # Playwright
```

Hoy se trabaja contra el proyecto alojado; Supabase local requiere Docker. Ver
[pruebas.md](pruebas.md) para cuándo conviene cada uno.

---

## 11. Trampas conocidas

**El cuerpo de una función plpgsql no se valida al crearla.** Una migración con un
error dentro de una función se aplica sin quejarse y falla la primera vez que el
trigger corre de verdad. Pasó con `create_work_order` y `pay_commissions`. Las
pruebas pgTAP existen para esto.

**Un `CASE` sin cast no entra en una columna enum.** `CASE ... THEN 'egreso' END`
resuelve a `text`. Escribe `(CASE ... END)::transaction_type`.

**`str.replace` en un script de parche reemplaza todas las ocurrencias.** Si el
mismo bloque aparece en dos interfaces, cambias las dos.

**Un `return` mudo en un diálogo se ve igual que un botón roto.** El modal (capa
400) tapa el recuadro de error de la página. Usa un error propio del diálogo o un
toast (capa 500).

**Un `<select>` controlado no vuelve atrás si cancelas un `confirm`.** Sin cambio
de estado no hay render. Se remonta con una `key` que cambia al cancelar
(`statusEpoch` en el detalle, `moveEpoch` en el Kanban).

**Un `DELETE` que RLS rechaza informa éxito.** Ver sección 6.

**Un admin puede borrar cualquier movimiento de Finanzas, incluso los
automáticos.** Borrar un "Pago final" descuadra la orden: una re-entrega o una
reversión posterior calculan contra un libro incompleto. Hasta que se decida
restringirlo, corrige con un movimiento de ajuste en vez de borrar.

**Importar dos veces el mismo estado de cuenta duplica el mes.** Hay tres defensas
y una salida: revertir la importación.

**En iPhone no existe push fuera de la app instalada.** Safari solo lo ofrece a una
web agregada a la pantalla de inicio (iOS 16.4+).

**Chrome viejo y Firefox graban video en WebM**, que un iPhone antiguo puede no
reproducir. Chrome ≥ 126 y Safari graban MP4.

**Borrar una sede deja sus archivos en Storage** hasta la limpieza nocturna
(`cleanup-storage`): la base no puede borrar objetos de Storage.

---

*Última revisión: septiembre de 2026 (fases 1–6).*
