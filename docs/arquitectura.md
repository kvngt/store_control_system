# Arquitectura y Planos de Restorify

Guía para quien llega nuevo al código y necesita entender cómo está armado el sistema antes de tocarlo. Esto combina la arquitectura general y los "planos" visuales de cómo se conectan las piezas. Para *qué* hace y *por qué* (reglas de dinero, roles, avisos), el complemento es [reglas-de-negocio.md](reglas-de-negocio.md). Para el detalle de archivos por sección, [mapa-de-secciones.md](mapa-de-secciones.md).

---

## Índice

1. [Lo esencial en un minuto](#1-lo-esencial-en-un-minuto)
2. [Las capas de la casa y la decisión principal](#2-las-capas-de-la-casa-y-la-decisión-principal)
3. [Mapa del repositorio y de pantallas](#3-mapa-del-repositorio-y-de-pantallas)
4. [Modelo de datos y tablas](#4-modelo-de-datos-y-tablas)
5. [El ciclo de vida de una orden](#5-el-ciclo-de-vida-de-una-orden)
6. [Dónde vive la lógica de negocio y cómo viaja un dato](#6-dónde-vive-la-lógica-de-negocio-y-cómo-viaja-un-dato)
7. [El camino del dinero y comisiones](#7-el-camino-del-dinero-y-comisiones)
8. [Seguridad, permisos y roles](#8-seguridad-permisos-y-roles)
9. [Servidor: edge functions, portal y correos](#9-servidor-edge-functions-portal-y-correos)
10. [El frontend por dentro](#10-el-frontend-por-dentro)
11. [Migraciones, flujo de trabajo y cómo sale un cambio](#11-migraciones-flujo-de-trabajo-y-cómo-sale-un-cambio)
12. [Levantar el proyecto](#12-levantar-el-proyecto)
13. [Solución de problemas y trampas conocidas](#13-solución-de-problemas-y-trampas-conocidas)

---

## 1. Lo esencial en un minuto

| | |
|---|---|
| **Frontend** | React 19 + TypeScript 6, construido con Vite 8 |
| **Datos remotos** | TanStack Query (caché, reintentos, invalidación) |
| **Backend** | Supabase: PostgreSQL 17, Auth, Storage, Realtime, Edge Functions (Deno 2). Proyecto `dbstores` en `ca-central-1`; inventario en [supabase.md](supabase.md) |
| **Tareas en la base** | pg_net (llamadas HTTP asíncronas) y pg_cron (tareas programadas) |
| **Ruteo** | react-router-dom 7, todo del lado del cliente |
| **Formularios** | React Hook Form + Zod (mini) |
| **Estilos** | CSS plano con variables, sin framework de UI |
| **Multimedia** | MediaRecorder, WebCodecs vía Mediabunny, subidas reanudables TUS |
| **Push** | Web Push (VAPID) con service worker; app instalable (PWA) |
| **Correo** | Resend (dominio `restorifyauto.net` verificado): avisos automáticos al cliente |
| **Portal del cliente** | Paquete aparte en `/r/<token>`, sin cuenta; datos por una edge function pública |
| **Presupuestos** | Estado por línea (borrador → pendiente → aprobado/rechazado); solo lo aprobado se cobra |
| **Pruebas** | Vitest (unitarias y componentes), pgTAP (base de datos), Playwright (e2e) |
| **Hosting** | Sitio estático en Hostinger, dominio `restorifyauto.net`; Hostinger compila y publica desde GitHub en cada push. El diseño es la rama `produccion`; hoy publica `main` ([evaluacion-2026-10.md](historico/evaluacion-2026-10.md#5-operación-y-despliegue)) |

Unas 33 600 líneas de TypeScript (con pruebas), 5 600 de CSS, 54 migraciones y 26 tablas (1/10/2026).
Cómo se llegó hasta aquí, etapa por etapa: [evolucion.md](evolucion.md). Estado de la estructura y deuda técnica: [mantenimiento.md](mantenimiento.md).

---

## 2. Las capas de la casa y la decisión principal

La idea que explica todo lo demás: **no hay servidor propio.** El navegador habla directamente con Supabase a través de PostgREST. No existe una capa de API intermedia (Node, Python) donde poner validaciones, permisos ni reglas de negocio.

```mermaid
flowchart TB
  subgraph Navegador["Navegador / teléfono (React)"]
    P["pages/ — las pantallas"]
    F["features/ — piezas de cada sección"]
    S["services/ — único lugar que habla con Supabase"]
    Q["TanStack Query — caché de lecturas"]
    I["i18n — todo texto, español e inglés"]
    P --> F --> S
    F --> Q --> S
    P --> I
  end

  subgraph Portal["Portal del cliente (src/portal/ — paquete aparte)"]
    PO["CustomerPortal.tsx"]
  end

  subgraph Supabase["Supabase (todo el 'backend')"]
    API["API REST/RPC + Realtime"]
    RLS["RLS: quién ve qué fila"]
    TR["Triggers: calculan dinero y reglas"]
    RPC["RPC: operaciones completas (entregar, cobrar…)"]
    DB[("Postgres: 26 tablas")]
    ST[("Storage: fotos, firmas, comprobantes")]
    EF["Edge functions (Deno)"]
    API --> RLS --> DB
    API --> RPC --> DB
    DB --> TR --> DB
    API --> ST
  end

  S -->|"clave pública + sesión"| API
  PO -->|"fetch, sin sesión"| EF
  EF --> RPC

  subgraph Fuera["Servicios externos"]
    RES["Resend (correos)"]
    GEM["Google Gemini (traducción)"]
    NHT["NHTSA (decodifica VIN)"]
    SEN["Sentry (errores)"]
    HOS["Hostinger (publica el sitio)"]
  end
  EF --> RES
  EF --> GEM
  Navegador -.-> NHT
  Navegador -.-> SEN
```

De esto se derivan tres consecuencias que hay que tener presentes **siempre**:

**1. La clave anónima y todas las tablas son públicas.** Viajan dentro del bundle de JavaScript. Cualquiera con las herramientas de desarrollo abiertas puede hacerle a la API las mismas peticiones que hace la aplicación, con su propio token de sesión legítimo.

**2. Esconder un botón en React no es una restricción, es una sugerencia visual.** Un `{isAdmin && <button/>}` mejora la experiencia; no protege nada. Lo único que sostiene un límite de verdad son las políticas RLS y los triggers de Postgres.

**3. La lógica que debe cumplirse siempre va en la base de datos.** Si una regla solo existe en el frontend, se la salta cualquiera que llame la API directamente, y también cualquier pantalla futura que olvide replicarla.

> Cuando agregues una restricción, la pregunta correcta no es «¿escondí el botón?» sino «¿qué pasa si alguien manda esta petición a mano?».

Un ejemplo concreto de este principio: los montos de una orden (totales, repuestos con precio, depósito) no están en `ordenes_trabajo` con columnas escondidas, sino en tablas que un técnico **no puede leer** (`orden_montos`, `orden_repuestos`). Esconder columnas habría dejado el dinero en la respuesta de red, a un clic de las herramientas del navegador.

---

## 3. Mapa del repositorio y de pantallas

### Mapa de carpetas

```
src/
  main.tsx                       entrada: /r/... carga portal/, lo demás appStart
  appStart.tsx                   app del taller: Sentry, service worker, <App />
  App.tsx                        proveedores + rutas + guardias de acceso

  portal/                        reporte web del cliente (paquete aparte, sin Supabase JS)
  pages/                         una pantalla por archivo
  features/                      módulos con estado propio, extraídos de las páginas
  components/                    componentes reutilizables y layout global
  context/                       estado global (Auth, Language, Theme, Toast, UnsavedChanges)
  services/                      TODAS las consultas a Supabase, un módulo por dominio
  lib/                           lógica sin React (pura, muy testeable)
  types/                         database.ts reexporta domain/*.types.ts
  i18n/translations.ts           español e inglés
  styles/                        index.css (variables, temas) + components.css
  test/                          utilidades de prueba

public/                          sw.js (service worker), iconos PWA, .htaccess
supabase/
  migrations/                    54 migraciones, en orden cronológico
  functions/                     edge functions (Deno)
  tests/database/                pruebas pgTAP
  config.toml
```

**Reglas de organización**
1. **Ninguna pantalla llama a Supabase directamente.** Todo pasa por un módulo de `services/`.
2. **`lib/` no sabe que existe React** (salvo `useMediaQuery`).
3. **Una página que crece se parte en `features/`.**

### El mapa de pantallas

```mermaid
flowchart LR
  L["/login"] --> D
  RP["/reset-password"]
  PV["/privacidad (pública)"]
  CL["/r/token — portal del cliente (público)"]

  subgraph App["Con sesión (Layout: barra lateral + encabezado)"]
    D["/ Panel principal"]
    C["/customers Clientes"]
    V["/vehicles Vehículos"]
    W["/work-orders Órdenes (lista | tablero)"]
    FI["/finance Finanzas (admin)"]
    PA["/payroll Comisiones (admin)"]
    E["/employees Empleados (admin)"]
    SE["/settings Configuración"]
  end

  D -->|"Requiere atención"| W
  C --> V --> W
  W -->|"abrir una orden"| DET["Detalle de la orden<br/>pestañas: Resumen · Trabajos · Fotos · Cobro · Historial"]
  FI -->|"movimiento vinculado"| DET
  PA -->|"cada comisión"| DET
```

---

## 4. Modelo de datos y tablas

El eje es la **sede**: casi todo cuelga de ella y no se mezcla entre talleres. Dentro de la sede, un técnico solo ve las órdenes que tiene asignadas.

```mermaid
erDiagram
  sedes ||--o{ perfiles : "tiene personal"
  sedes ||--o{ clientes : ""
  sedes ||--o{ ordenes_trabajo : ""
  clientes ||--o{ vehiculos : "tiene"
  clientes ||--o{ ordenes_trabajo : "pide"
  vehiculos ||--o{ ordenes_trabajo : "se repara en"

  ordenes_trabajo ||--|| orden_montos : "total, depósito, descuento"
  ordenes_trabajo ||--o{ orden_labor : "mano de obra (tareas)"
  ordenes_trabajo ||--o{ orden_repuestos : "piezas (precio y costo)"
  ordenes_trabajo ||--o{ orden_asignaciones : "técnicos"
  ordenes_trabajo ||--o{ orden_avances : "notas del técnico"
  ordenes_trabajo ||--o{ orden_media : "fotos, videos, voz"
  ordenes_trabajo ||--o{ presupuestos : "lo que el cliente autoriza"
  ordenes_trabajo ||--o{ orden_hallazgos : "trabajo adicional reportado"
  ordenes_trabajo ||--o{ orden_enlaces : "enlace del cliente"
  ordenes_trabajo ||--o{ historial_orden : "quién cambió qué"

  orden_labor }o--o| perfiles : "técnico de la tarea"
  orden_labor ||--o{ comisiones : "la paga"
  perfiles ||--o{ comisiones : "cobra"
  comisiones }o--o| comision_pagos : "se paga en"
  perfiles ||--o| perfiles_pago : "esquema de pago"

  ordenes_trabajo ||--o{ finanzas_movimientos : "cobros y costos"
  comision_pagos ||--o{ finanzas_movimientos : "un egreso por orden"
  finanzas_importaciones ||--o{ finanzas_movimientos : "contabilidad aparte"

  ordenes_trabajo ||--o{ cola_envios : "correos y traducciones"
  perfiles ||--o{ notificaciones : "campana"
  perfiles ||--o{ push_suscripciones : ""
```

### Detalles que no son obvios

- **El dinero está repartido a propósito:** `ordenes_trabajo.total_labor` es visible para el técnico (base de su comisión), pero `orden_montos` y `orden_repuestos` son admin-only por RLS.
- **Los repuestos son de traspaso:** Se captura precio; un trigger copia el precio al costo (`costo_unitario`).
- **`vehiculos.sede_id` es redundante:** Lo llena `trg_vehiculo_sede` explícitamente para RLS.
- **La multimedia no son URLs:** `orden_media` guarda la ruta. Se ven con URLs firmadas de vida corta.
- **El enlace del cliente guarda el token tal cual:** Lo protege RLS (solo admin).
- **Cada línea (labor/repuesto) tiene estado:** Solo lo `aprobado` entra en los totales, comisiones y costos.

---

## 5. El ciclo de vida de una orden

El corazón del programa. Cada flecha dice **quién** la mueve y **qué hace la base** solita.

```mermaid
stateDiagram-v2
  [*] --> Recepcion: Admin crea la orden (create_work_order)
  Recepcion --> EnProceso: Firma del cliente (autoriza lo cotizado) o admin/técnico lo mueve
  EnProceso --> EsperaAutorizacion: Técnico reporta trabajo adicional (reportar_hallazgo)
  EsperaAutorizacion --> EnProceso: Cliente responde / admin descarta / se cancela el presupuesto
  EnProceso --> Finalizado: Técnico o admin (avance 100 %, aviso a admin: "trabajo terminado")
  Finalizado --> ListoParaEntregar: SOLO admin (marcar_lista_para_entregar) — aquí sale el correo al cliente
  ListoParaEntregar --> Entregado: SOLO admin (entregar_orden: cobra el saldo)
  Finalizado --> Entregado: SOLO admin (entregar_orden)
  Finalizado --> EnProceso: SOLO admin reabre (el técnico no puede)
  Finalizado --> RetiradaSinReparar: SOLO admin (retirar_sin_reparar)
  EnProceso --> RetiradaSinReparar: SOLO admin
  Entregado --> EnProceso: Admin la saca de Entregado (se revierte el dinero)
  Entregado --> [*]
  RetiradaSinReparar --> [*]
```

Qué dispara cada paso (todo en la base, `supabase/migrations/`):

```mermaid
flowchart TD
  A["Alta: cliente → vehículo/recepción → depósito → tareas"] --> B["Orden en Recepción<br/>+ fila en orden_montos<br/>+ 'Depósito inicial' en Finanzas"]
  B --> C["Cliente firma"]
  C --> D["trg_quote_on_signature:<br/>lo cotizado pasa a APROBADO<br/>+ se crea el enlace del cliente<br/>+ correo de recepción"]
  D --> E["Trabajo: técnico marca tareas hechas<br/>(marcar_labor_completada)"]
  E --> F["trg_labor_avance: recalcula el avance<br/>(peso = precio de la tarea)"]
  E --> G{"¿Algo más que hacer?"}
  G -->|sí| H["reportar_hallazgo → orden en pausa<br/>→ admin cotiza → presupuesto → cliente autoriza"]
  H --> E
  G -->|no| I["Finalizado (técnico) → aviso a admin: trabajo terminado<br/>el cliente ve 'En revisión final' y NO recibe correo"]
  I --> I2["Admin revisa y presiona 'Marcar listo para entregar'<br/>→ correo 'Su vehículo está listo'"]
  I2 --> J["Entrega: diálogo con saldo y método de pago"]
  J --> K["entregar_orden (1 transacción)"]
  K --> K1["Ingreso 'Pago final' (con método)<br/>o egreso 'Devolución'"]
  K --> K2["Egreso 'Costo de repuestos'"]
  K --> K3["sync_order_commissions: comisiones SUGERIDAS"]
  K --> K4["Estado = Entregado, fecha del taller"]
```

---

## 6. Dónde vive la lógica de negocio y cómo viaja un dato

**En triggers y funciones de PostgreSQL**, no en el frontend.

### Cómo viaja un dato (de pantalla a base y de vuelta)

```mermaid
sequenceDiagram
  actor U as Persona
  participant C as Componente (features/)
  participant H as Hook (use…)
  participant S as Servicio (services/)
  participant API as Supabase API
  participant DB as Postgres (RLS + triggers)

  U->>C: toca un botón
  C->>H: llama a la acción
  H->>S: workOrdersService.algo()
  S->>API: rpc() o from().insert()
  API->>DB: ¿tiene permiso? (RLS)
  DB->>DB: triggers recalculan totales, comisiones, historial
  DB-->>API: fila o error con código
  API-->>S: datos / error
  S-->>H: resultado (o lanza el error)
  H->>H: invalida la caché (la base cambia cosas que el cliente no predice)
  H-->>C: re-lee y vuelve a pintar
  C-->>U: aviso (toast) o error traducido
```

### Triggers principales (Resumen)
- **`ordenes_trabajo`**: guards para que el técnico no toque órdenes entregadas, generación atómica del número de orden, cálculo de `orden_montos`, recálculo de avance (`trg_progress_on_status`), asentar finanzas al entregar (`trg_order_delivery_payment`, `trg_order_parts_expense`), recalcular comisiones.
- **`orden_montos`**: recálculo de depósito, ajuste de totales post-entrega.
- **`orden_labor` y `orden_repuestos`**: recalculo de totales cuando cambia un precio aprobado, guards de presupuesto, cálculo de comisiones.
- **`orden_asignaciones`**: inmutabilidad del owner, re-reparto de bolsas heredadas.

Casi todos son `SECURITY DEFINER` (corren con permisos del dueño) y usan `is_admin()` o `auth.role()` para validar los guards.

### Funciones RPC que llama el frontend
- `create_work_order`, `entregar_orden`: Operaciones transaccionales grandes.
- `repuestos_de_orden`: Ve repuestos pero omite precios para técnicos.
- `comisiones_estimadas`, `resumen_empleado`, `balance_orden`, `margen_ordenes`: Vistas calculadas.
- `pay_commissions`: Asienta pagos de comisiones con total del servidor.
- `app_schema_version`: Detecta desfase entre build y base.
- `resumen_panel`: KPIs del dashboard.
- `importar_estado_cuenta`: Importación bancaria en una transacción.

---

## 7. El camino del dinero y comisiones

Lo único que **nadie escribe a mano**: lo asientan triggers y RPC, siempre con signo e idempotentes.

```mermaid
flowchart LR
  subgraph Entradas
    DEP["Depósito del alta"]
    ANT["Anticipo (registrar_anticipo)"]
    PF["Pago final al entregar"]
  end
  subgraph Salidas
    CR["Costo de repuestos<br/>(costo real, no precio)"]
    COM["Pago de comisiones<br/>(un egreso por orden)"]
    DEV["Devolución al cliente"]
  end
  FM[("finanzas_movimientos<br/>(sin importacion_id)")]
  DEP --> FM
  ANT --> FM
  PF --> FM
  CR --> FM
  COM --> FM
  DEV --> FM

  FM --> KPI["resumen_panel → panel y Finanzas"]
  FM --> SAL["_saldo_orden → saldo, entrega, enlace del cliente"]
  FM --> BAL["_balance_orden → margen por orden"]

  BAN["Estado de cuenta del banco<br/>(importar_estado_cuenta)"] --> FM2[("finanzas_movimientos<br/>(CON importacion_id)")]
  FM2 --> CSV["Vista 'Estados de cuenta' + CSV para el contador"]
```

### Comisiones

```mermaid
flowchart TD
  T["Cada tarea (orden_labor) tiene su técnico"] --> E["Entrega de la orden"]
  E --> R["_reparto_comisiones:<br/>costo de la tarea × % del técnico (perfiles_pago o el de la sede)"]
  R --> SUG["Comisión SUGERIDA<br/>(el técnico NO ve el monto)"]
  SUG --> ACE["Admin acepta<br/>(Aceptar todas, o edita % / $ de una)"]
  ACE --> VE["Aviso al técnico: 'Comisión aprobada'"]
  ACE --> PAG["pay_commissions: SOLO lo aceptado<br/>→ comision_pagos + un egreso por orden"]
  PAG --> BL["Lo pagado bloquea la línea:<br/>no cambia de técnico ni se borra"]
```

- **Retirada sin reparar**: Modifica qué tareas se cobran/pagan comisión dependiendo del estado.

---

## 8. Seguridad, permisos y roles

### Quién puede hacer qué

```mermaid
flowchart TD
  U["Persona con sesión"] --> R{"Rol"}
  R -->|admin| A["Todo en su(s) sede(s):<br/>abre órdenes, asigna, cotiza, cobra, entrega,<br/>acepta y paga comisiones, finanzas, empleados"]
  R -->|"mecánico / pintor"| T["Solo órdenes donde está ASIGNADO"]
  T --> T1["Ve: tareas, mano de obra, piezas sin precio,<br/>avances, fotos, a sus compañeros"]
  T --> T2["Hace: marcar sus tareas hechas, avance, estado<br/>(En proceso / Finalizado), fotos, reportar hallazgo"]
  T --> T3["NO hace: abrir órdenes, asignar, ver precios o totales,<br/>entregar, firmar, publicar al cliente, ver comisiones sugeridas"]
```

La impone **la base** (RLS y triggers), no la pantalla. Las políticas RLS de Postgres usan funciones `SECURITY DEFINER` para evitar recursiones.
- **Datos de la sede**: `is_admin() OR sede_id = current_user_sede_id()`.
- **Datos de una orden**: un técnico ve **solo sus órdenes asignadas**. Una orden ajena le devuelve cero filas, no error 42501.

Un borrado que RLS rechaza no da error directo; por eso PostgREST usa `.select('id')` con `assertDeleted()`.

### Storage
- `orden_media`: Privado. Lectura de técnico solo de sus órdenes. Escritura solo asignado de orden sin entregar.
- `comprobantes`, `reportes`: Privado. Solo admin.
- `sede_logos`, `avatares`: Público.

---

## 9. Servidor: edge functions, portal y correos

Las **Edge Functions (Deno)**, **pg_net**, y **pg_cron** manejan el trabajo en segundo plano.

### Lo que ve el cliente (El Portal)

```mermaid
flowchart LR
  F["Firma de recepción"] --> L["orden_enlaces:<br/>token de 64 hex"]
  L --> URL["restorifyauto.net/r/<token>"]
  URL --> EF["Edge function 'portal'<br/>(sin sesión, verify_jwt = false)"]
  EF --> DP["datos_portal(token)<br/>arma el JSON a mano, campo por campo"]
  DP --> UI["src/portal/CustomerPortal.tsx"]
  UI -->|"responder presupuesto"| EF
```

- Todo dato nuevo se agrega a mano en la función `datos_portal` que corre con privilegios elevados, ignorando RLS.

### Avisos, correos y traducciones

```mermaid
flowchart TD
  EV["Algo pasa en la base<br/>(trigger trg_*_notify)"] --> N["notificar()"]
  N --> NO[("notificaciones → la campana")]
  N --> CE[("cola_envios")]
  EV2["Cambia un texto que ve el cliente<br/>(trg_encolar_traduccion)"] --> CE
  EV3["Cambio de estado / presupuesto<br/>(trg_order_portal)"] --> CE
  CRON["Tarea programada (pg_cron)"] --> OUT["process-outbox (edge function)"]
  CE --> OUT
  OUT -->|"correo"| RES["Resend"]
  OUT -->|"traducir al inglés"| GEM["Gemini"]
  OUT -->|"push"| PUSH["Notificaciones del teléfono"]
  GEM --> TR[("traducciones")]
  TR --> POR["portal y PDF en inglés"]
```

- La cola (`cola_envios`) es el único camino de salida. Trata correos, traducciones y push.

---

## 10. El frontend por dentro

- **Proveedores**: `ErrorBoundary → QueryClientProvider → BrowserRouter → Theme...`. La caché (`QueryClient`) es de quien inició sesión.
- **Datos remotos**: Todo pasa por TanStack Query. Listas completas usan `fetchAll` con paginación explícita (la API corta en 1000 filas por defecto).
- **Manejo de errores**: `lib/errors.ts` traduce errores crudos de Postgres a texto en el idioma del usuario. Jamás se muestra el mensaje crudo.
- **Estilos**: CSS plano (`index.css`, `components.css`). Capas z-index muy controladas (`--z-toast 500`).
- **Móvil**: Tarjetas responsivas, pliegues condicionales, e integraciones PWA (service worker para push, PWA instalable sin caché).
- **Fechas**: Usar `lib/dates.ts` para manejar fechas UTC de medianoche como fechas locales del taller.

---

## 11. Migraciones, flujo de trabajo y cómo sale un cambio

Las migraciones son **la única forma** de cambiar el esquema.

```bash
npm run db:check                          # qué falta aplicar en el proyecto enlazado
npm run db:donde -- sync_order_commissions  # en qué migración está la versión vigente
npx supabase db push --dry-run            # simulacro
npx supabase db push --linked             # aplicar
```

### Cómo sale un cambio a producción

```mermaid
flowchart LR
  DEV["Cambio en tu máquina"] --> V["npm run lint · npx tsc -b · npm test · npm run build<br/>+ npm run test:db si tocaste SQL (Docker)"]
  V --> CM["git commit (solo cuando se pide)"]
  CM --> DB{"¿Hay migración nueva?"}
  DB -->|sí| PUSH1["1º npx supabase db push<br/>(con permiso de la persona responsable)"]
  DB -->|no| PUSH2
  PUSH1 --> PUSH2["2º git push a main"]
  PUSH2 --> HOS["Hostinger compila y publica en 1–2 min<br/>(no espera al CI)"]
  PUSH2 --> CI["GitHub Actions: lint, tipos, pruebas, base de datos"]
  HOS --> SEC["3º npm run qa:security (si tocaste permisos)"]
```

- La base va **antes** que el sitio web, sino la app nueva rompe contra la base vieja.
- Las migraciones nuevas se nombran cronológicamente después de la última conocida.

---

## 12. Levantar el proyecto

```bash
npm install          # el postinstall copia el worker de pdfjs a public/
npm run dev          # http://localhost:5173
```

`.env.local` requiere:
```
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<clave anónima>
VITE_PUBLIC_SITE_URL=https://restorifyauto.net
```
*Opcionales*: VAPID para push, Sentry DSN. (Estas variables se incrustan en Vite en tiempo de build).

---

## 13. Solución de problemas y trampas conocidas

| Síntoma | Mira primero |
|---|---|
| Un número de dinero está mal | La función SQL que lo calcula (`npm run db:donde -- <nombre>`), no la pantalla. |
| "Algo salió mal" tras publicar | Archivos viejos atrapados (`lib/staleChunk.ts`); recargar limpia esto. |
| Una pantalla muestra clave `x.algo` | Falta la traducción en `src/i18n/translations.ts`. |
| Técnico no ve algo / ve de más | Políticas RLS de la tabla en `supabase/migrations/`. |
| Un correo no llegó | `cola_envios` (estado, error); logs de la edge function `process-outbox`. |
| Cliente ve algo raro en su enlace | `datos_portal` y `src/portal/`. |
| Una lista parece cortada en 1000 | ¿Usa `fetchAll`? PostgREST tiene un hard cap por defecto. |
| Fechas corridas un día | ¿Usa `hoy_taller()` / `lib/dates.ts`? Nunca uses `toISOString()`. |
| Un cambio no aparece en pantalla | `ORDER_TABLES` y la configuración de Realtime de esa tabla. |

### Otras trampas comunes
- **El cuerpo de funciones plpgsql no se valida al crear.** Una migración errónea pasa y luego crashea en uso real.
- **Un `DELETE` o `UPDATE` sin RLS informa éxito.** Cero filas afectadas no tira error por defecto; usar `.select('id')` con asserts.
- **`supabase storage rm -r` borra todo el bucket.** Para vaciar un bucket usar panel.
- **Dos peticiones HTTP en JS no son transaccionales.** Si algo debe ir atómico, crear una RPC.

---

*Última revisión: (Actualizado recientemente con la fusión de planos y arquitectura. Fases 1–6.)*
