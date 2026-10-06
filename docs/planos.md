# Los planos de Restorify

Esto es lo más parecido a los planos de una casa: **qué piezas hay, cómo se conectan y dónde
buscar para cambiar cada cosa**. Los diagramas están escritos en Mermaid: GitHub y VS Code
(con la extensión "Markdown Preview Mermaid Support") los dibujan solos.

Cómo usarlo: busca en el **índice** lo que quieres cambiar, ve al diagrama de esa parte y de
ahí al archivo indicado. Para el detalle de reglas, [reglas-de-negocio.md](reglas-de-negocio.md);
para el detalle de archivos por sección, [mapa-de-secciones.md](mapa-de-secciones.md); para lo
que **no se puede romper**, [ai-context.md](ai-context.md).

| Quiero cambiar… | Diagrama | Dónde empezar |
|---|---|---|
| Una pantalla o su texto | [1](#1-las-capas-de-la-casa) y [2](#2-el-mapa-de-pantallas) | `src/pages/`, `src/features/`, `src/i18n/translations.ts` |
| Una regla de dinero o de permisos | [1](#1-las-capas-de-la-casa) y [6](#6-el-camino-del-dinero) | `supabase/migrations/` (siempre una migración nueva) |
| Qué pasa al abrir, trabajar o entregar una orden | [3](#3-el-ciclo-de-vida-de-una-orden) | `useWorkOrderDetail.ts`, `entregar_orden` |
| Comisiones | [7](#7-comisiones) | `_reparto_comisiones`, `pages/Payroll.tsx` |
| Lo que ve el cliente | [8](#8-lo-que-ve-el-cliente) | `datos_portal`, `src/portal/` |
| Correos, avisos, traducciones | [9](#9-avisos-correos-y-traducciones) | `process-outbox`, `notificar()` |
| Quién puede hacer qué | [10](#10-quién-puede-hacer-qué) | políticas RLS y triggers `trg_*_guard` |
| Una tabla | [4](#4-las-tablas-y-cómo-se-relacionan) | `npm run db:donde -- <nombre>` |
| Publicar un cambio | [11](#11-cómo-sale-un-cambio) | [deployment.md](deployment.md) |

---

## 1. Las capas de la casa

La idea que explica todo: **no hay servidor propio**. El navegador habla directo con Supabase,
así que **la seguridad y el dinero viven en la base de datos**, no en la pantalla. Esconder un
botón no es un permiso.

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

**Reglas de oro que salen de este plano**

- Una **lista** se lee con `fetchAll` (la API corta en 1.000 filas sin avisar); un **total de
  dinero** se pide a una RPC, nunca se suma en el navegador.
- Un cambio de **esquema o permisos** es una migración nueva en `supabase/migrations/`; nunca se
  edita una ya aplicada ni se cambia desde el panel de Supabase.
- Toda función SQL nueva se **revoca** a `PUBLIC, anon, authenticated` y se concede solo a quien
  la necesita.

---

## 2. El mapa de pantallas

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

| Pantalla | Archivo | Servicio que usa |
|---|---|---|
| Panel | `pages/Dashboard.tsx`, `features/dashboard/` | `dashboard.service.ts` (`resumen_panel`, `requiere_atencion`) |
| Clientes / Vehículos | `pages/Customers.tsx`, `pages/Vehicles.tsx` | `customers.service.ts`, `vehicles.service.ts` |
| Órdenes (lista y tablero) | `pages/WorkOrders.tsx`, `pages/KanbanBoard.tsx` | `workOrders.service.ts` |
| Detalle de una orden | `features/workOrders/WorkOrderDetail.tsx` + `useWorkOrderDetail.ts` | `workOrders.service.ts`, `quotes.service.ts`, `commissions.service.ts` |
| Alta de una orden | `features/workOrders/WorkOrderCreateModal.tsx` (4 pasos) | `workOrders.service.ts` → RPC `create_work_order` |
| Finanzas | `pages/Finance.tsx`, `pages/finance/ImportStatementModal.tsx` | `finance.service.ts` |
| Comisiones | `pages/Payroll.tsx` | `commissions.service.ts` |
| Empleados | `pages/Employees.tsx`, `features/employees/` | `employees.service.ts`, `users.service.ts` |

---

## 3. El ciclo de vida de una orden

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

**Dónde tocar:** el flujo de pantalla está en `features/workOrders/useWorkOrderDetail.ts`; el
cobro, en la función SQL `entregar_orden` (`npm run db:donde -- entregar_orden`).

---

## 4. Las tablas y cómo se relacionan

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

Otras tablas: `finanzas_reglas_categorizacion` (palabras clave de la importación bancaria),
`traducciones` (diccionario es↔en), `numero_orden_contadores` (el `ORD-AAAA-###`).

**Tres cosas que sorprenden:**

- El dinero está **separado**: `orden_montos` y `orden_repuestos` solo los lee un admin. El
  técnico asignado ve la mano de obra (de ahí sale su comisión) y las piezas **sin precio**.
- Solo lo **autorizado** cuenta: `orden_labor` y `orden_repuestos` tienen `estado`
  (`borrador | pendiente | aprobado | rechazado`) y los totales suman solo `aprobado`.
- Lo importado del banco (`importacion_id`) **no** cuenta en nada de la app.

---

## 5. Cómo viaja un dato (de pantalla a base y de vuelta)

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

- Los errores se guardan **crudos** y se traducen al pintar (`lib/errors.ts`).
- Un `UPDATE`/`DELETE` que la RLS rechaza **no da error**, devuelve cero filas: por eso los
  servicios piden `.select('id')` y usan `assertAffected` / `assertDeleted`.
- Lo que cambia en otra pantalla se entera por **Realtime** (`useOrderSync`): el evento es una
  señal, se vuelve a leer el dato.

---

## 6. El camino del dinero

Lo único que **nadie escribe a mano**: lo asientan triggers y RPC, siempre con signo e
idempotentes (comparan "lo que debería haber" con "lo que ya hay" y registran la diferencia).

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

Cuentas que hace la base (no las repitas en el navegador):

```
total de la orden  = mano de obra aprobada + repuestos aprobados − descuento
saldo              = total − (depósito + anticipos + pagos − devoluciones)
margen de la orden = cobrado − costo de repuestos − comisiones devengadas
fecha de un asiento automático = hoy_taller(sede)   ← hora de Maryland, no UTC
```

Descuento: lo absorbe el taller, **no baja las comisiones** (salen de la mano de obra).

**Retirada sin reparar** (`retirar_sin_reparar`):

```mermaid
flowchart TD
  R["Admin elige qué pasó"] --> A["Se canceló todo"]
  R --> B["Solo se cobra la revisión"]
  R --> C["Se hicieron algunos trabajos"]
  A --> X["No se cobra nada → se devuelve lo que dejó"]
  B --> Y["Línea 'Revisión' sin técnico → devuelve o cobra la diferencia"]
  C --> Z["Lo hecho se cobra y paga comisión a su técnico<br/>lo demás queda 'no realizado' y pendiente del vehículo"]
```

---

## 7. Comisiones

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

- Líneas anteriores a octubre de 2026 sin técnico: reparto por especialidad
  (`reparto_heredado`), solo entre los asignados a mano.
- Sacar la orden de Entregado borra lo **no pagado**; lo pagado se conserva.
- Detalle: [comisiones.md](comisiones.md). Pantalla: `pages/Payroll.tsx` y la tarjeta
  `features/workOrders/CommissionEstimateCard.tsx`.

---

## 8. Lo que ve el cliente

```mermaid
flowchart LR
  F["Firma de recepción"] --> L["orden_enlaces:<br/>token de 64 hex"]
  L --> URL["restorifyauto.net/r/<token>"]
  URL --> EF["Edge function 'portal'<br/>(sin sesión, verify_jwt = false)"]
  EF --> DP["datos_portal(token)<br/>arma el JSON a mano, campo por campo"]
  DP --> UI["src/portal/CustomerPortal.tsx"]
  UI -->|"responder presupuesto"| EF
```

- **Ve:** estado y avance, fotos/videos publicados, avances que el técnico marcó visibles,
  presupuesto línea por línea, su cuenta (depósito, otros pagos, descuento, saldo o saldo a su
  favor), piezas que se esperan, observaciones del taller.
- **No ve:** nombres de técnicos, comisiones, costos, notas internas, VIN completo.
- Todo dato nuevo para el cliente se agrega **a mano** en `datos_portal` (nunca `to_jsonb(fila)`).
- El portal es un **paquete aparte**: no importa `lib/supabase`, `services/` ni
  `i18n/translations.ts`; tiene sus textos en `portal/strings.ts`.

---

## 9. Avisos, correos y traducciones

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

- Un trigger auxiliar **nunca bloquea** una escritura: va en `BEGIN … EXCEPTION → WARNING`.
- Un correo que falla queda en `cola_envios` con su error; administración lo reintenta.
- Detalle: [portal-y-correos.md](portal-y-correos.md), [multimedia-y-notificaciones.md](multimedia-y-notificaciones.md).

---

## 10. Quién puede hacer qué

```mermaid
flowchart TD
  U["Persona con sesión"] --> R{"Rol"}
  R -->|admin| A["Todo en su(s) sede(s):<br/>abre órdenes, asigna, cotiza, cobra, entrega,<br/>acepta y paga comisiones, finanzas, empleados"]
  R -->|"mecánico / pintor"| T["Solo órdenes donde está ASIGNADO"]
  T --> T1["Ve: tareas, mano de obra, piezas sin precio,<br/>avances, fotos, a sus compañeros"]
  T --> T2["Hace: marcar sus tareas hechas, avance, estado<br/>(En proceso / Finalizado), fotos, reportar hallazgo"]
  T --> T3["NO hace: abrir órdenes, asignar, ver precios o totales,<br/>entregar, firmar, publicar al cliente, ver comisiones sugeridas"]
```

La impone **la base** (RLS y triggers), no la pantalla: `mis_ordenes_asignadas()`,
`is_admin()`, `trg_order_technician_guard`. Tabla completa en
[reglas-de-negocio.md §3](reglas-de-negocio.md#3-qué-puede-hacer-cada-rol).

---

## 11. Cómo sale un cambio

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

- La base va **antes** que el sitio: una app nueva sobre una base vieja rompe funciones.
- Las migraciones se nombran **después de la última** (`20261010000018` hoy), no con la fecha
  de hoy.
- Si el CI falla con "job was not acquired by Runner", es un incidente de GitHub: se relanza
  con *Re-run all jobs*.

---

## 12. Dónde buscar cuando algo no funciona

| Síntoma | Mira primero |
|---|---|
| Un número de dinero está mal | La función SQL que lo calcula (`npm run db:donde -- <nombre>`), no la pantalla |
| "Algo salió mal" tras publicar | `lib/staleChunk.ts` (pestaña con archivos viejos); recarga |
| Una pantalla muestra una clave como `workOrders.algo` | Falta la traducción: `src/i18n/translations.ts` (es **y** en) |
| Un técnico no ve algo / ve de más | Políticas RLS de esa tabla en `supabase/migrations/` |
| Un correo no llegó | `cola_envios` (estado y último error); `process-outbox`; llave de Resend |
| El cliente ve algo raro en su enlace | `datos_portal` y `src/portal/` |
| Una lista parece cortada | ¿Usa `fetchAll`? La API corta en 1.000 filas |
| Fechas corridas un día | ¿Usa `hoy_taller()` / `lib/dates.ts`? Nunca `CURRENT_DATE` ni `toISOString()` |
| Un cambio no aparece en la otra pantalla | `ORDER_TABLES` y la publicación de Realtime |

---

*Última revisión: 5 de octubre de 2026 (migraciones hasta `20261010000018`). Si cambias la
estructura —una tabla, un estado, una pantalla, un flujo de dinero— actualiza el diagrama
correspondiente en el mismo cambio.*
