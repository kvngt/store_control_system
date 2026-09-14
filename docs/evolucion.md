# Cómo evolucionó la plataforma

Restorify empezó como una demo de administración de talleres y, en unas seis semanas
(agosto–septiembre de 2026), se convirtió en un sistema con reglas de dinero en la base
de datos, multimedia, notificaciones, portal para el cliente y presupuestos con
autorización.

Este documento cuenta **por qué** el sistema es como es: qué se construyó en cada
etapa, qué problema resolvía y qué decisiones se reemplazaron después. Para saber
cómo funciona hoy, lee [arquitectura.md](arquitectura.md) y
[reglas-de-negocio.md](reglas-de-negocio.md).

> Las migraciones llevan fechas correlativas en el nombre (`AAAAMMDD…`) para fijar su
> orden; no siempre coinciden con el día real en que se escribieron o aplicaron.

---

## Índice

1. [Línea de tiempo](#1-línea-de-tiempo)
2. [Etapa 0 — La demo](#2-etapa-0--la-demo-agosto-2026)
3. [Etapa 1 — Reglas por sede y dinero automático](#3-etapa-1--reglas-por-sede-y-dinero-automático)
4. [Etapa 2 — Operación diaria del taller](#4-etapa-2--operación-diaria-del-taller)
5. [Etapa 3 — Auditorías: seguridad, finanzas y refactorización](#5-etapa-3--auditorías-seguridad-finanzas-y-refactorización)
6. [Etapa 4 — Comisiones y transacciones](#6-etapa-4--comisiones-y-transacciones)
7. [Etapa 5 — Auditoría del ciclo de vida y móvil](#7-etapa-5--auditoría-del-ciclo-de-vida-y-móvil)
8. [Etapa 6 — Los pedidos del cliente, fases 1 a 5](#8-etapa-6--los-pedidos-del-cliente-fases-1-a-5)
9. [Decisiones que cambiaron de rumbo](#9-decisiones-que-cambiaron-de-rumbo)
10. [Todas las migraciones](#10-todas-las-migraciones)
11. [Cómo creció la red de pruebas](#11-cómo-creció-la-red-de-pruebas)
12. [Lo que viene](#12-lo-que-viene)

---

## 1. Línea de tiempo

```
ago 2026  ── Etapa 0  Demo: esquema inicial, fotos públicas, despliegue en Hostinger
          ── Etapa 1  RLS por sede y rol, dinero automático de la orden, folios atómicos,
                      importación de estados de cuenta
sep 1–3   ── Etapa 2  Avances de trabajo, marca por sede, firma del cliente, QA con Playwright
sep 4–10  ── Etapa 3  Integridad financiera, ataques de privilegios cerrados, reglas de
                      categorización, refactorización por dominios + TanStack Query
sep 11–16 ── Etapa 4  Alta de orden transaccional, nómina → comisiones, borrar sedes,
                      detección de desfase de esquema
sep 17    ── Etapa 5  Revertir entregas, candados de dinero, optimización móvil
sep 18–24 ── Etapa 6  Pedidos del cliente:
                      F1 técnicos sin dinero · F2 fotos/video/voz · F3 notificaciones y push
                      F4 portal del cliente y correos · F5 presupuestos por línea
                      F6 el reporte es el enlace web
                      (+ permisos del técnico en la base, buckets viejos cerrados)
```

---

## 2. Etapa 0 — La demo (agosto 2026)

**Migraciones:** `20240101000000_initial_schema`, `…000001_storage`, `…000002_seed`.

El punto de partida: un esquema completo para un taller — sedes, perfiles con rol
(admin, mecánico, pintor), clientes, vehículos, órdenes de trabajo con mano de obra,
repuestos y asignaciones, movimientos financieros y nómina por salario. React + Vite en
el navegador hablando directo con Supabase.

Cómo era:

- **RLS permisiva**: "cualquier usuario autenticado puede todo".
- **Fotos en un bucket público** (`vehiculos_fotos`), guardadas como arreglos de URLs
  dentro de la orden.
- **Totales y dinero calculados en el frontend.**
- Una sola página de órdenes de más de 2 000 líneas.
- Primer despliegue en Hostinger con errores de configuración (variables de entorno
  que Vite incrusta al compilar; de ahí la pantalla "Configuración incompleta").

---

## 3. Etapa 1 — Reglas por sede y dinero automático

**Migraciones:** `20260828000000_rls_refinement` → `20260831000000_fix_numero_orden_counter_desync`.

| Problema | Solución |
|---|---|
| Un usuario de una sede veía todo | RLS por sede y rol; capacidad del taller configurable |
| El dinero de una orden dependía de que alguien lo registrara | **Triggers del ciclo de vida**: el depósito y el pago final se asientan solos en Finanzas |
| Dos órdenes simultáneas podían repetir número | Folios atómicos por sede y año (`numero_orden_contadores`) |
| Capturar el estado de cuenta a mano | **Importación de PDF de Wells Fargo** leída en el navegador, con reglas de categorización |
| Un despliegue a medias desincronizó el contador | Corrección del contador |

Aquí nace el principio que guía todo lo demás: **el dinero lo asienta la base, no la
pantalla**.

---

## 4. Etapa 2 — Operación diaria del taller

**Migraciones:** `20260901000000_order_progress_updates` → `20260903000000_sede_isolation_signature_check`.

- **Avances de trabajo** ("Agregar avance"): la bitácora del técnico.
- **Marca por sede** (logo y color de acento) y fotos de perfil.
- **Aislamiento estricto por sede**: los vehículos llevan su propia sede; **firma del
  cliente** en la orden; número de cheque en los pagos.
- Primera revisión de QA con 65 pruebas e2e (hoy en
  [historico/revision-qa-2026-09-03.md](historico/revision-qa-2026-09-03.md)).

---

## 5. Etapa 3 — Auditorías: seguridad, finanzas y refactorización

**Migraciones:** `20260904000000_finance_integrity` → `20260910000000_import_fingerprint`.

**Base de datos:**

- **Integridad financiera** alrededor del ciclo de la orden (auditando datos reales).
- **Cobertura y prioridad de las reglas de categorización**, medidas con estados de
  cuenta reales de junio y julio.
- **Estado emisor de la placa** del vehículo.
- **Endurecimiento de acciones destructivas**: se cerraron dos caminos de escalada de
  privilegios (un técnico podía ascenderse a admin editando su perfil; el registro
  público podía crear un admin). Borrar clientes, vehículos y órdenes pasó a ser solo
  de admin **en la base**.
- **El costo de los repuestos como egreso real** al entregar; vehículos **sin placa**
  con `NULL` en vez de "SIN PLACA".
- **Huella de cada importación**: importar dos veces el mismo PDF ya no duplica el mes.

**Frontend** (ver [historico/ARCHITECTURE_AUDIT.md](historico/ARCHITECTURE_AUDIT.md) y
[historico/REFACTOR_2026-09.md](historico/REFACTOR_2026-09.md)):

- `supabaseService` monolítico → **un servicio por dominio** (`src/services/*.service.ts`).
- Estado remoto a mano → **TanStack Query** con claves centralizadas.
- La página de órdenes de 2 000 líneas → `src/features/workOrders/` con hooks propios.
- Formularios con **react-hook-form + Zod**.
- Vitest para componentes (101 → 123 pruebas).

---

## 6. Etapa 4 — Comisiones y transacciones

**Migraciones:** `20260911000000_create_work_order_rpc` → `20260916000000_fix_pay_commissions_sede`.

| Cambio | Por qué |
|---|---|
| `create_work_order` en **una transacción** | La orden, sus líneas y asignaciones eran cuatro escrituras; una falla a la mitad dejaba órdenes a medias |
| **Nómina por salario → comisiones** | "Nadie en el taller cobra salario": cada técnico cobra un porcentaje de la mano de obra de lo que entrega. Se borraron la tabla y el historial de nómina (acordado) |
| **Borrar una sede** con vista previa del impacto | Todas las tablas la referenciaban con RESTRICT |
| **Repuestos de traspaso** (costo = precio) | La columna de costo nunca se llenaba; el taller gana en la mano de obra |
| **Versión de esquema** en el build y banner de desfase | Tres "errores" de un mismo día eran una app nueva contra una base vieja |
| Dos correcciones (`enum` en `create_work_order`, sede en `pay_commissions`) | Cuerpos plpgsql rotos que se aplicaron sin error y fallaban al usarse — el origen de las pruebas pgTAP |

---

## 7. Etapa 5 — Auditoría del ciclo de vida y móvil

**Migración:** `20260917000000_delivery_reversal_and_money_guards`.

Una auditoría de la lógica de negocio (11 hallazgos) y del uso en teléfono (10
hallazgos), todo corregido:

- **Sacar una orden de Entregado revierte** el cobro y el costo de repuestos (antes el
  ingreso se quedaba asentado).
- **Deshacer un pago de comisiones** borra solo **su** egreso (antes dos pagos iguales el
  mismo día se borraban juntos).
- **Candados de dinero**: solo un admin entrega; nadie escribe totales a mano;
  negativos rechazados; reparto de comisiones en centavos exactos.
- Fechas locales (el día 1 contaba en el mes anterior), "finalizadas del mes",
  selector de estado que no volvía atrás al cancelar.
- **Móvil**: tarjetas con separación, sin zoom en iPhone, menú con "Cerrar sesión"
  visible, búsqueda en el teléfono, barra inferior, modales a pantalla completa.

---

## 8. Etapa 6 — Los pedidos del cliente, fases 1 a 5

En una reunión, el dueño del taller pidió cinco cosas. Se planificaron en seis fases;
cinco están hechas.

### Fase 1 — El dinero sale del alcance del técnico

**Migración:** `20260918000000_money_admin_only`.

> "Los mecánicos no deben ver costos de repuestos ni agregar repuestos o mano de obra;
> solo ver la mano de obra, que es la base de su comisión."

- Totales y depósito a una tabla aparte, **`orden_montos`, solo admin**. Repuestos con
  precio, solo admin; el técnico ve las piezas **sin precio** (`repuestos_de_orden`).
- Solo admin cotiza; el técnico registra la recepción y queda asignado.
- Tarjeta **"Tu comisión estimada"** para el técnico.
- Ocultar en React no bastaba: con la clave anónima un técnico podía leer la tabla.

### Fase 2 — Fotos, videos y notas de voz

**Migraciones:** `20260919000000_order_media`, `20260921000000_media_upload_limit_50mb`.

- Tabla **`orden_media`** y bucket **privado** con URLs firmadas; adiós al bucket
  público y a las URLs en arreglos.
- **Compresión en el teléfono**: fotos a 1920 px sin GPS, video grabado a 720p (tope de 2
  minutos), videos de galería convertidos con WebCodecs, notas de voz.
- **Subidas reanudables** (TUS) con cola persistente en IndexedDB.
- Lo del técnico nace **interno**; el admin decide qué ve el cliente.
- El tope pasó de 100 MB (con un ajuste manual imposible en el plan Free) a **50 MB**.

### Fase 3 — Notificaciones útiles

**Migración:** `20260920000000_notifications_and_push`.

- Avisos **persistentes** (asignación, recepción de un técnico, avance, lista para
  entregar, comisión) con **Realtime** en la campana; adiós al sondeo cada 60 s.
- **Push al teléfono** con la app cerrada (VAPID, service worker, app instalable; en
  iPhone, desde la pantalla de inicio).
- **Cola de envíos** (`cola_envios`) con reintentos, **pg_net** para llamar a la edge
  function y **pg_cron** como red de seguridad; secretos en **Vault**.
- Limpieza diaria de avisos viejos y archivos huérfanos.

### Entre fases — Lo que la pantalla prohibía, ahora lo prohíbe la base

**Migraciones:** `20260922000000_technician_assignment_enforcement`,
`20260922000001_close_legacy_signatures_bucket`.

- Un técnico solo modifica una orden **asignada y no entregada**, y solo estado,
  avance y firma. Se descubrió que podía **sacar una orden de Entregado** por la API
  (revirtiendo cobro y comisiones): cerrado.
- Los buckets del modelo anterior (`vehiculos_fotos`, `firmas`) eran públicos: cerrados.

### Fase 4 — Portal del cliente y correos

**Migración:** `20260923000000_customer_portal_and_emails`.

> "Que el cliente esté informado constantemente, sin necesariamente crearle una cuenta."

- **Enlace personal** por orden (`reinventa.shop/r/<token>`), revocable, vence 90 días
  después de entregar.
- **Portal** en un paquete aparte y liviano: estado, recepción, avances publicados,
  cuenta, contacto.
- **Correos automáticos con Resend**: recepción, cambios de estado (agrupados, sin
  repetir), novedades; baja del cliente con confirmación.

### Fase 5 — Presupuestos y autorización

**Migración:** `20260924000000_quotes_and_authorization`.

> "Presupuestos que el cliente autorice o rechace; un botón de 'trabajos autorizados por
> el cliente'; que el mecánico se entere."

- Cada línea con **estado**; **solo lo aprobado se cobra**.
- Tres formas de autorizar: **firma de recepción**, **desde el enlace** (por línea, con
  nombre, IP y navegador) o **registrada por el admin** (teléfono, en persona, WhatsApp).
- Los técnicos reciben "Autorizado: … No realizar: …"; los admins, las respuestas y los
  presupuestos sin respuesta.

Detalle: [presupuestos.md](presupuestos.md).

### Fase 6 — El reporte es el enlace web

**Migración:** `20260925000000_web_report`.

> "Que el reporte deje de ser un PDF que manda el mecánico: un link web, enviado solo por
> el admin o por el sistema."

- **Enviar reporte** ya no genera ni sube un PDF: comparte el **enlace del portal**, que
  siempre está al día (videos incluidos). Se manda por **correo desde el sistema**
  (RPC `enviar_reporte_cliente`, plantilla `reporte`), por **WhatsApp** o copiándolo.
- El bucket `reportes` **ya no acepta archivos**: se acabaron los PDFs con enlaces
  firmados de 30 días circulando por WhatsApp.
- **Descargar PDF** queda para imprimir o archivar, y muestra lo mismo que el portal:
  solo fotos publicadas (miniaturas), solo líneas autorizadas, sin notas internas ni
  nombres de técnicos, con el enlace del portal y el saldo en cero si ya se entregó.

Detalle: [portal-y-correos.md](portal-y-correos.md#10-el-reporte-web).

---

## 9. Decisiones que cambiaron de rumbo

| Antes | Después | Cuándo y por qué |
|---|---|---|
| RLS "todo autenticado puede todo" | RLS por sede y rol; lo sensible solo admin | Etapa 1 y 3: con la clave anónima, esconder un botón no protege |
| Totales calculados en React | Triggers en la base | Etapa 1: el dinero no puede depender de la pantalla que se use |
| Nómina por salario | Comisiones sobre la mano de obra entregada | Etapa 4: así se paga en el taller |
| Costo y precio del repuesto por separado | Repuestos de traspaso | Etapa 4: nadie llenaba el costo |
| Técnicos veían y cotizaban dinero | `orden_montos` solo admin; técnicos sin precios | Fase 1: pedido del cliente |
| Fotos en bucket público, URLs en arreglos | `orden_media` privada, URLs firmadas, compresión | Fase 2: privacidad y video |
| Firma como URL pública | Ruta en bucket privado; buckets viejos cerrados | Fase 2 y "entre fases" |
| Tope de 100 MB con ajuste manual | 50 MB en app y bucket | Fase 2: el plan Free no permite más, y la app no lo necesita |
| Campana que re-descargaba órdenes cada 60 s | Avisos persistentes + Realtime + push | Fase 3 |
| Algunos permisos del técnico solo en la interfaz | Impuestos en la base | "Entre fases" |
| Reporte PDF enviado a mano por WhatsApp o correo ("sin proveedor de correo") | Enlace del portal + correos automáticos con Resend | Fase 4 (portal y correos) y fase 6 (el botón comparte el enlace) |
| PDF subido a `reportes` con enlace de 30 días; mostraba bitácora interna y técnicos | PDF solo de descarga con lo mismo que ve el cliente | Fase 6: un PDF compartido no se puede retirar ni corregir |
| Toda línea cotizada se cobraba | Solo lo autorizado | Fase 5 |
| Todo en un solo paquete JS | La app del taller y el portal del cliente por separado | Fase 4: el cliente abre desde datos móviles |
| Supuesto de despliegue en Vercel/Netlify | Hostinger (Apache) + Supabase | Desde la etapa 0 |

---

## 10. Todas las migraciones

| # | Migración | Qué hizo |
|---|---|---|
| 1 | `20240101000000_initial_schema` | Esquema inicial: sedes, perfiles, clientes, vehículos, órdenes, labor, repuestos, asignaciones, finanzas, nómina |
| 2 | `20240101000001_storage` | Buckets (fotos públicas) |
| 3 | `20240101000002_seed` | Datos de ejemplo |
| 4 | `20260828000000_rls_refinement` | RLS por sede y rol; capacidad del taller |
| 5 | `20260829000000_order_lifecycle_and_editing` | Dinero automático del ciclo de la orden |
| 6 | `20260830000000_order_number_and_payroll_expense` | Folios atómicos; egreso automático de nómina |
| 7 | `20260830000001_bank_statement_import` | Importación de estados de cuenta |
| 8 | `20260831000000_fix_numero_orden_counter_desync` | Corrección del contador de folios |
| 9 | `20260901000000_order_progress_updates` | Avances de trabajo |
| 10 | `20260902000000_sede_branding_and_avatars` | Logo y color por sede; avatares |
| 11 | `20260903000000_sede_isolation_signature_check` | Aislamiento por sede, firma, número de cheque |
| 12 | `20260904000000_finance_integrity` | Integridad financiera del ciclo |
| 13 | `20260905000000_categorization_rules_coverage` | Más reglas de categorización |
| 14 | `20260906000000_rule_priority` | Prioridad de reglas |
| 15 | `20260907000000_vehicle_plate_state` | Estado emisor de la placa |
| 16 | `20260908000000_destructive_action_hardening` | Borrados solo admin; escaladas de privilegio cerradas |
| 17 | `20260909000000_parts_expense_and_optional_plate` | Costo de repuestos como egreso; placa opcional |
| 18 | `20260910000000_import_fingerprint` | Huella de importaciones |
| 19 | `20260911000000_create_work_order_rpc` | Alta de orden en una transacción |
| 20 | `20260912000000_commission_payroll` | Comisiones en lugar de nómina |
| 21 | `20260913000000_sede_cascade_delete` | Borrar sedes; repuestos de traspaso |
| 22 | `20260914000000_schema_version` | Versión de esquema para detectar desfase |
| 23 | `20260915000000_fix_create_work_order_enum_cast` | Corrección de `create_work_order` |
| 24 | `20260916000000_fix_pay_commissions_sede` | Corrección de `pay_commissions` |
| 25 | `20260917000000_delivery_reversal_and_money_guards` | Revertir entregas; candados de dinero |
| 26 | `20260918000000_money_admin_only` | **F1** Dinero solo admin |
| 27 | `20260919000000_order_media` | **F2** Multimedia privada |
| 28 | `20260920000000_notifications_and_push` | **F3** Avisos, push, cola, cron |
| 29 | `20260921000000_media_upload_limit_50mb` | **F2** Tope de 50 MB |
| 30 | `20260922000000_technician_assignment_enforcement` | Permisos del técnico en la base; buckets viejos |
| 31 | `20260922000001_close_legacy_signatures_bucket` | Bucket de firmas privado |
| 32 | `20260923000000_customer_portal_and_emails` | **F4** Enlace, portal, correos |
| 33 | `20260924000000_quotes_and_authorization` | **F5** Presupuestos por línea |
| 34 | `20260925000000_web_report` | **F6** Reporte por correo desde el sistema; bucket de PDFs cerrado |

Las migraciones son la mejor documentación de cada decisión: cada una empieza con un
comentario que explica el problema. Léelas en orden si quieres el detalle.

---

## 11. Cómo creció la red de pruebas

| Momento | Vitest | pgTAP | Playwright |
|---|---|---|---|
| Revisión de QA (3 sep) | — | — | 65 |
| Refactorización (etapa 3) | 101 → 123 | — | 8 archivos |
| Fase 1 | 151 | — | se reemplazan las pruebas de nómina |
| Fase 2 | 185 | 01 (dinero y permisos) | |
| Fase 3 | 210 | 02 (multimedia y avisos) | |
| Permisos del técnico | 211 | 03 | |
| Fase 4 | 241 | 04 (portal y correos) | |
| Fase 5 | 257 (34 archivos) | 05 → 126 aserciones en 5 archivos | |
| Fase 6 | **265** (36 archivos) | 06 → **133 aserciones** en 6 archivos | |

Las pruebas pgTAP están escritas y validadas con el parser de Postgres, pero **todavía
no se han ejecutado** con Docker (ver [pruebas.md](pruebas.md#24-para-qué-hace-falta-docker)).
Las fases 4, 5 y 6 se probaron además **de punta a punta contra Supabase real** con datos
temporales que luego se borraron.

---

## 12. Lo que viene

- **Probar en teléfonos reales** con el `dist` nuevo publicado: portal, presupuestos,
  reporte, video y push ([pruebas.md](pruebas.md)).
- **Pendientes de datos**: correo de contacto y WhatsApp de cada sede.
- **Pendientes de decisión** (ver [reglas-de-negocio.md](reglas-de-negocio.md#10-riesgos-conocidos-y-decisiones-abiertas)):
  borrar movimientos automáticos de Finanzas, correos en inglés, pasar a Supabase Pro
  antes de atender clientes reales, un proyecto de staging.
