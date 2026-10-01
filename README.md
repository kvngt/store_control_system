# Restorify — Sistema de Administración de Talleres

Restorify administra talleres mecánicos y de pintura con varias sedes. Cubre:

- clientes y vehículos;
- órdenes de trabajo con tablero Kanban y fotos, videos y notas de voz;
- presupuestos que el cliente autoriza línea por línea;
- un enlace web para que el cliente siga su vehículo sin crear cuenta;
- correos automáticos y avisos push al teléfono;
- finanzas con importación de estados de cuenta;
- comisiones del personal.

**En producción en [restorifyauto.net](https://restorifyauto.net)** (antes `reinventa.shop`,
dado de baja). Se puede instalar como app en Android y en iPhone.
Estado y pendientes: [docs/evaluacion-2026-10.md](docs/evaluacion-2026-10.md).

---

## Cómo funciona

**No hay servidor propio.** El navegador habla directo con Supabase con una clave pública,
así que **los permisos y el dinero viven en la base de datos** (Row Level Security,
triggers y funciones), nunca solo en la interfaz. Esconder un botón no es un permiso.

```
 Teléfono / tablet / PC                                   Cliente final
 ┌──────────────────────────────┐                ┌───────────────────────────┐
 │ App del taller (React, PWA)  │                │ Portal /r/<token>         │
 │ restorifyauto.net            │                │ (sin cuenta, sin Supabase │
 └──────────────┬───────────────┘                │  JS: solo fetch)          │
                │ supabase-js (clave pública      └─────────────┬─────────────┘
                │ + sesión del empleado)                        │
                ▼                                               ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │ Supabase                                                                  │
 │  Postgres 17 ── RLS: cada fila se filtra por rol, sede y asignación       │
 │      │          Triggers: totales, cobros, comisiones, avisos, correos    │
 │      ▼                                                                    │
 │  cola_envios ──(pg_cron + pg_net)──► edge function process-outbox ──┬──► Web Push (teléfonos)
 │                                                                     └──► Resend (correos)
 │  Storage privado (fotos, videos, firmas) · Realtime · Auth            │
 │  Edge functions: portal (pública), create/update/delete-employee,     │
 │                  process-outbox y cleanup-storage (internas)          │
 └───────────────────────────────────────────────────────────────────────────┘
```

**Quién hace qué.** Hay tres roles: `admin`, `mecanico` y `pintor`; mecánico y pintor tienen
los mismos permisos.
- **Administración:** abre órdenes, asigna técnicos, cotiza, captura la firma, entrega y cobra.
- **Técnico:** ve **solo las órdenes que tiene asignadas**. Mueve su estado y avance,
  registra avances con fotos y pide autorización cuando encuentra algo que cotizar.
- **Precios:** un técnico nunca ve precios de repuestos ni totales; solo la mano de obra de
  sus órdenes, que es la base de su comisión.

**Vida de una orden:**

```
recepción ──► en proceso ──► espera de autorización ──► en proceso ──► finalizado ──► entregado
   (firma del cliente           (el técnico explica qué        (el cliente     (entregar_orden: cobra
    aprueba lo cotizado)         hay que cotizar)               autoriza)        el saldo con su método)
```

- **Solo lo autorizado se cobra.** Cada línea de mano de obra o repuesto es `borrador`,
  `pendiente`, `aprobado` o `rechazado`, y los totales suman solo lo `aprobado`.
- **Entregar** asienta el ingreso y devenga las comisiones. **Sacar una orden de "Entregado"**
  revierte las dos cosas.

Detalle completo en [docs/reglas-de-negocio.md](docs/reglas-de-negocio.md).

---

## Estructura del repositorio

```
src/
  main.tsx, appStart.tsx, App.tsx   entrada, arranque (Sentry, service worker) y rutas
  pages/          una pantalla por archivo: Dashboard, Customers, Vehicles, WorkOrders,
                  KanbanBoard, Finance, Payroll, Employees, Settings, Login
  features/       módulos con estado propio: workOrders (detalle, alta, líneas, firma,
                  presupuesto, entrega), media, notifications, finance, employees…
  services/       TODAS las consultas a Supabase, una por dominio (+ fetchAll en support.ts)
  lib/            lógica sin React: dinero, fechas, errores, teléfonos, PDF, multimedia, push
  components/     layout (menú, barra inferior) y piezas compartidas (MobileSection,
                  LazyModal, ErrorBoundary, PhoneInput…)
  context/        sesión, idioma, tema, avisos, cambios sin guardar
  portal/         reporte web del cliente: paquete aparte, no importa nada de la app
  i18n/           español e inglés
  styles/         CSS plano con variables (index.css) y componentes (components.css)
  types/          tipos de dominio

supabase/
  migrations/     54 migraciones: el esquema completo, RLS, triggers y funciones
  functions/      6 edge functions (Deno)
  tests/database/ 13 archivos pgTAP (330 aserciones)

public/           service worker (solo push), manifiesto e íconos de la PWA, .htaccess
e2e/              pruebas Playwright
scripts/          db:check, db:donde, qa:security, íconos de la PWA, SQL de administración
docs/             documentación (empieza por docs/README.md)
```

Unas 25 000 líneas de TypeScript (33 600 con pruebas) y 5 600 de CSS. Mapa detallado en
[docs/arquitectura.md §3](docs/arquitectura.md#3-mapa-del-repositorio); qué archivos, tablas y
pruebas tiene cada sección, en [docs/mapa-de-secciones.md](docs/mapa-de-secciones.md).

---

## Base de datos a grandes rasgos

23 tablas, todas con RLS. El eje es la **sede**: casi todo cuelga de ella.

| Dominio | Tablas |
|---|---|
| Sedes y personas | `sedes`, `perfiles`, `perfiles_pago` (pago de cada empleado, solo admin) |
| Clientes | `clientes`, `vehiculos` |
| Órdenes | `ordenes_trabajo`, `orden_montos` (totales, solo admin), `orden_labor`, `orden_repuestos` (solo admin), `orden_asignaciones`, `orden_avances`, `orden_media`, `orden_enlaces` (enlace del cliente), `presupuestos` |
| Personal | `comisiones` (una por orden, persona y especialidad), `comision_pagos` |
| Finanzas | `finanzas_movimientos`, `finanzas_importaciones`, `finanzas_reglas_categorizacion` |
| Avisos | `notificaciones`, `push_suscripciones`, `cola_envios` |

Además: 114 funciones, 55 triggers y 125 políticas. Diagrama y detalles en
[docs/arquitectura.md §4](docs/arquitectura.md#4-modelo-de-datos). Evaluación de su estado en
[docs/evaluacion-2026-10.md §4](docs/evaluacion-2026-10.md#4-base-de-datos).

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19, React Router 7, TypeScript 6, Vite 8, TanStack Query, react-hook-form + Zod |
| Backend | Supabase (plan Pro): Postgres 17 + RLS, Auth, Storage (TUS), Realtime, Edge Functions (Deno), pg_cron, pg_net, Vault |
| Multimedia | MediaRecorder, WebCodecs (Mediabunny), tus-js-client |
| Push | Web Push (VAPID) con service worker; app instalable (PWA) |
| Correo | Resend (dominio `restorifyauto.net`) |
| Estilos | CSS plano con variables, sin framework de UI |
| i18n | Español / Inglés |
| Calidad | oxlint, Vitest, pgTAP, Playwright, Sentry, CI en GitHub Actions |
| Hosting | Hostinger (Apache), compila desde GitHub en cada push |

---

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173
```

| Comando | Qué hace |
|---|---|
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run lint` | oxlint |
| `npm test` | Pruebas unitarias y de componentes (Vitest, 504) |
| `npm run test:db` | Pruebas de base de datos (pgTAP; requiere Docker y `npx supabase start`) |
| `npm run test:e2e` | Pruebas end-to-end (Playwright, contra `localhost`; cuentas en `.env.test.local`) |
| `npm run db:check` | Qué migraciones faltan en el proyecto enlazado |
| `npm run db:donde -- <nombre>` | En qué migración está la versión vigente de una función, trigger o política |
| `npm run qa:security` | Pruebas de seguridad contra la API desplegada |

Antes de entregar un cambio: `npm run lint && npx tsc -b && npm test && npm run build`. El CI
de GitHub corre eso y las pruebas pgTAP en cada push a `main`.

---

## Publicar

> **Hoy, un push a `main` es un despliegue.** Hostinger está configurado para compilar `main`
> (el diseño era la rama `produccion`). El sitio cambia uno o dos minutos después del push,
> **sin esperar al CI**. Ver [docs/evaluacion-2026-10.md](docs/evaluacion-2026-10.md#5-operación-y-despliegue).

- **Migraciones:** `npx supabase db push --linked`, siempre **antes** de publicar el frontend
  que las necesita.
- **Nombres de migraciones:** van después de la última (`20261010000000`), no con la fecha de
  hoy ([por qué](docs/evaluacion-2026-10.md#4-base-de-datos)).
- **Edge functions:** `npx supabase functions deploy <nombre>`.
- **Lo que no está en el código:** hay configuración fuera del repositorio (secretos, Vault,
  Auth, Storage, variables de Hostinger).
- **Antes de cualquier despliegue,** lee [docs/deployment.md](docs/deployment.md).

Una pestaña abierta durante una publicación se recarga sola la primera vez que pide una página
nueva (`src/lib/staleChunk.ts`).

---

## Reglas que no se rompen

- **Esquema y permisos:** todo cambio es una migración nueva. Nunca se edita una ya aplicada
  ni se cambia el esquema desde el panel.
- **Funciones en `public`:** toda función nueva se revoca de `PUBLIC`, `anon` y
  `authenticated` y se concede solo a quien la necesita.
- **Dinero y listas:** nunca se suma dinero en el navegador ni se lee una lista sin paginar
  (la API corta en 1.000 filas sin avisar). Las listas van con `fetchAll`; los totales, con
  una RPC.
- **Secretos:** nunca en el repositorio ni en la documentación.
- **Interfaz:** todo texto visible pasa por i18n; el dinero se formatea con `lib/money.ts`;
  las fechas, con `lib/dates.ts`.

La lista completa, con el porqué de cada una: [docs/ai-context.md](docs/ai-context.md).

---

## Documentación

Toda la documentación vigente está en **[docs/](docs/README.md)**:

| Si vas a… | Lee |
|---|---|
| **Hacerte cargo del proyecto** (persona o agente de IA) | [docs/traspaso.md](docs/traspaso.md) y [AGENTS.md](AGENTS.md) |
| Saber **qué tan sano está y qué hacer primero** | [docs/evaluacion-2026-10.md](docs/evaluacion-2026-10.md) |
| **Entender el sistema** | [docs/arquitectura.md](docs/arquitectura.md) → [docs/reglas-de-negocio.md](docs/reglas-de-negocio.md) |
| **Cambiar una sección** y no saber por dónde entrar | [docs/mapa-de-secciones.md](docs/mapa-de-secciones.md) |
| **Desplegar** o cambiar la base sin cortar el servicio | [docs/deployment.md](docs/deployment.md) y [docs/mantenimiento.md](docs/mantenimiento.md) |
| Saber qué hay en **Supabase** | [docs/supabase.md](docs/supabase.md) |
| **Probar** la plataforma | [docs/plan-de-pruebas.md](docs/plan-de-pruebas.md), [docs/pruebas.md](docs/pruebas.md) y [docs/manual-de-pruebas.md](docs/manual-de-pruebas.md) |
| **Usar** la aplicación o capacitar al taller | [docs/manual-usuario.md](docs/manual-usuario.md) |
| Entender **cómo evolucionó** y por qué | [docs/evolucion.md](docs/evolucion.md) |
| Modificar el código con un **agente de IA** | [docs/ai-context.md](docs/ai-context.md) |
