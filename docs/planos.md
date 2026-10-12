# Los planos de Restorify

> **Restaurado el 11/10/2026.** Este documento (con sus diagramas) se perdió en la limpieza automática del 06/10/2026
> (commit `1955f30`, que fusionó la arquitectura y los planos en uno más corto, y `ec689da`, que
> lo reemplazó por [radiografia.md](radiografia.md)). Puesto al día el 11/10/2026 con lo posterior (historial, comisión por tarea, hallazgos, pago mixto, listo para entregar, idioma del cliente, teléfonos por sede, seguro y parqueo). Donde no coincida, mandan [ai-context.md](ai-context.md) y
> [mapa-de-secciones.md](mapa-de-secciones.md); lo pendiente de actualizar está en la
> [bitácora](bitacora.md#bitácora-de-traspaso-entre-agentes).


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
    DB[("Postgres (tablas)")]
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
- Las cifras al día (migraciones, tablas, funciones, pruebas) están en
  [radiografia.md §1](radiografia.md#1-cifras-actuales-del-proyecto).

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
    W["/work-orders Órdenes (?vista=lista|tablero)"]
    FI["/finance Finanzas (admin)"]
    PA["/payroll Comisiones (admin)"]
    MC["/mis-comisiones Mis comisiones (técnico)"]
    E["/employees Empleados (admin)"]
    SE["/settings Configuración"]
  end

  D -->|"Requiere atención"| W
  C --> V --> W
  W -->|"abrir una orden"| DET["Detalle de la orden<br/>pestañas: Resumen · Trabajos · Fotos · Cobro · Historial"]
  FI -->|"movimiento vinculado"| DET
  PA -->|"cada comisión"| DET
  MC -.->|"sus comisiones"| DET
```

| Pantalla | Archivo | Servicio que usa |
|---|---|---|
| Panel | `pages/Dashboard.tsx`, `features/dashboard/` | `dashboard.service.ts` (`resumen_panel`, `requiere_atencion` `20261010000012`; `MyTasksCard`) |
| Clientes / Vehículos | `pages/Customers.tsx`, `pages/Vehicles.tsx` | `customers.service.ts`, `vehicles.service.ts` |
| Órdenes (lista y tablero) | `pages/WorkOrders.tsx` (`?vista=lista\|tablero`), `pages/KanbanBoard.tsx` | `workOrders.service.ts` (`/kanban` redirige a la vista tablero) |
| Detalle de una orden | `features/workOrders/WorkOrderDetail.tsx` + `useWorkOrderDetail.ts` | `workOrders.service.ts`, `quotes.service.ts`, `commissions.service.ts`, `parking.service.ts` |
| Alta de una orden | `features/workOrders/WorkOrderCreateModal.tsx` (4 pasos) | `workOrders.service.ts` → RPC `create_work_order` (seguro, tareas, depósito) |
| Finanzas | `pages/Finance.tsx`, `pages/finance/ImportStatementModal.tsx` | `finance.service.ts` |
| Comisiones | `pages/Payroll.tsx` (admin), `pages/MyCommissions.tsx` (técnico) | `commissions.service.ts` (`resumen_mis_comisiones` `20261010000022`) |
| Empleados | `pages/Employees.tsx`, `features/employees/` | `employees.service.ts`, `users.service.ts` |
| Configuración | `pages/Settings.tsx` (teléfonos de sede, parqueo, push) | `sedes.service.ts`, `parking.service.ts`, `users.service.ts` |

---

## 3. El ciclo de vida de una orden

El corazón del programa. Cada flecha dice **quién** la mueve y **qué hace la base** solita.

```mermaid
stateDiagram-v2
  [*] --> Recepcion: Admin crea la orden (create_work_order)
  Recepcion --> EnProceso: Admin o técnico asignado inicia trabajo (la firma no autoriza cotizaciones)
  EnProceso --> EsperaAutorizacion: Técnico reporta hallazgo (reportar_hallazgo)
  EsperaAutorizacion --> EnProceso: Cliente responde / admin descarta / se cancela el presupuesto (_salir_de_espera)
  EnProceso --> Finalizado: Técnico o admin (avance 100 %, aviso a admin — trabajo terminado)
  Finalizado --> EnProceso: SOLO admin reabre (el técnico no puede)
  Finalizado --> Entregado: SOLO admin (entregar_orden — liquida saldo y congela parqueo)
  Finalizado --> RetiradaSinReparar: SOLO admin (retirar_sin_reparar)
  EnProceso --> RetiradaSinReparar: SOLO admin
  Entregado --> EnProceso: SOLO admin la saca de Entregado (se revierte el dinero)
  Entregado --> [*]
  RetiradaSinReparar --> [*]

  note right of Finalizado
    Listo para entregar (marcar_lista_para_entregar):
    Admin confirma y recién sale el correo al cliente.
    Es una marca (lista_para_entregar_en), no un estado nuevo.
  end note
```

Qué dispara cada paso (todo en la base, `supabase/migrations/`):

```mermaid
flowchart TD
  A["Alta (4 pasos): cliente → vehículo/recepción → trabajos (seguro, técnico por tarea) → depósito (con método)"] --> B["Orden en Recepción<br/>+ fila en orden_montos<br/>+ 'Depósito inicial' en Finanzas"]
  B --> C["Cliente firma recepción<br/>(acepta estado, fotos, millas; NO autoriza cotizado)"]
  C --> D["asegurar_enlace_orden + encolar_correo_cliente:<br/>token de 64 hex + correo de recepción<br/>(trg_quote_on_signature ya no existe)"]
  D --> E["Trabajo: técnico marca tareas hechas<br/>(marcar_labor_completada)"]
  E --> F["trg_labor_avance: recalcula el avance<br/>(peso = precio de la tarea)"]
  E --> G{"¿Algo más que hacer?"}
  G -->|sí| H["reportar_hallazgo → orden en espera<br/>→ admin cotiza → presupuesto → cliente autoriza<br/>→ _salir_de_espera vuelve a en_proceso"]
  H --> E
  G -->|no| I["Finalizado (técnico) → aviso a admin: trabajo terminado<br/>el cliente ve 'En revisión final' y NO recibe correo"]
  I --> I2["Admin revisa y marca 'Listo para entregar'<br/>(marcar_lista_para_entregar) → correo 'Su vehículo está listo'"]
  I2 --> J["Entrega: diálogo con saldo, método de pago y parqueo"]
  J --> K["entregar_orden (1 transacción)"]
  K --> K1["Ingreso 'Pago final' (con método)<br/>o egreso 'Devolución'"]
  K --> K2["Egreso 'Costo de repuestos'"]
  K --> K3["Congela parqueo (fin_congelado = hoy_taller)"]
  K --> K4["sync_order_commissions: comisiones SUGERIDAS<br/>(admin las acepta con aprobar_comision)"]
  K --> K5["Estado = Entregado, fecha del taller"]
```

**Dónde tocar:** el flujo de pantalla está en `features/workOrders/useWorkOrderDetail.ts`; el
cobro y entrega, en la función SQL `entregar_orden` (`npm run db:donde -- entregar_orden`); y la
confirmación de revisión, en `marcar_lista_para_entregar` (`20261010000021`).

La firma de recepción ya **no** autoriza lo cotizado (`20261010000022`; `trg_quote_on_signature` se
eliminó): firmar acredita el estado de recepción del vehículo; lo cotizado se autoriza solo mediante
presupuesto (`enviar_presupuesto`) o "Registrar autorización".

---

## 4. Las tablas y cómo se relacionan

```mermaid
erDiagram
  sedes ||--o{ perfiles : tiene_personal
  sedes ||--o{ clientes : registra
  sedes ||--o{ ordenes_trabajo : opera
  sedes ||--|| parqueo_config : configura_parqueo
  sedes ||--o{ parqueo_perfiles : perfiles_parqueo
  parqueo_perfiles ||--o{ parqueo_tramos : tramos_tarifa
  sedes ||--o{ traducciones : diccionario
  clientes ||--o{ vehiculos : tiene
  clientes ||--o{ ordenes_trabajo : pide
  vehiculos ||--o{ ordenes_trabajo : se_repara_en

  ordenes_trabajo ||--|| orden_montos : total_deposito_descuento
  ordenes_trabajo ||--o{ orden_labor : mano_de_obra_tareas
  ordenes_trabajo ||--o{ orden_repuestos : piezas_precio_costo
  ordenes_trabajo ||--o{ orden_asignaciones : tecnicos
  ordenes_trabajo ||--o{ orden_avances : notas_del_tecnico
  ordenes_trabajo ||--o{ orden_media : fotos_videos_voz
  ordenes_trabajo ||--o{ presupuestos : autorizaciones
  ordenes_trabajo ||--o{ orden_hallazgos : trabajo_adicional
  ordenes_trabajo ||--o{ orden_enlaces : enlace_cliente
  ordenes_trabajo ||--o{ historial_orden : rastro_cambios
  ordenes_trabajo ||--o| orden_parqueo : cobro_estancia

  orden_labor }o--o| perfiles : tecnico_tarea
  orden_labor ||--o{ comisiones : genera_pago
  perfiles ||--o{ comisiones : cobra
  comisiones }o--o| comision_pagos : se_paga_en
  perfiles ||--o| perfiles_pago : esquema_pago

  ordenes_trabajo ||--o{ finanzas_movimientos : cobros_costos
  comision_pagos ||--o{ finanzas_movimientos : egreso_por_orden
  finanzas_importaciones ||--o{ finanzas_movimientos : banco_aparte

  ordenes_trabajo ||--o{ cola_envios : envios
  perfiles ||--o{ notificaciones : campana
  perfiles ||--o{ push_suscripciones : push

  sedes {
    uuid id PK
    string nombre
    jsonb telefonos
  }
  clientes {
    uuid id PK
    string nombre
    string idioma
  }
  ordenes_trabajo {
    uuid id PK
    string estatus
    boolean con_seguro
    string aseguradora
    string numero_reclamo
    timestamptz lista_para_entregar_en
  }
  orden_labor {
    uuid id PK
    uuid asignado_a FK
    boolean reparto_heredado
  }
  comisiones {
    uuid id PK
    uuid labor_id FK
    string estado
  }
  perfiles_pago {
    uuid usuario_id PK
    string esquema
  }
  historial_orden {
    uuid id PK
    uuid orden_id FK
    string entidad
    string accion
    jsonb cambios
  }
  orden_hallazgos {
    uuid id PK
    uuid orden_id FK
    string descripcion
    string estado
  }
  parqueo_config {
    uuid sede_id PK
    boolean habilitado
    date vigente_desde
  }
  parqueo_perfiles {
    uuid id PK
    uuid sede_id FK
    string tipo
    string evento_inicio
  }
  parqueo_tramos {
    uuid id PK
    uuid perfil_id FK
    int desde_dia
    numeric tarifa_diaria
  }
  orden_parqueo {
    uuid id PK
    uuid orden_id FK
    string estado
    numeric monto
    date fin_congelado
  }
```

Otras tablas: `finanzas_reglas_categorizacion` (palabras clave de la importación bancaria),
`traducciones` (diccionario es↔en, `20261010000013` y `15`), `numero_orden_contadores` (el `ORD-AAAA-###`).

**Piezas clave del esquema:**

- **Historial de la orden (`20261010000004`):** la tabla `historial_orden` y el trigger genérico
  `trg_historial` auditan quién cambió qué en la orden, tareas, repuestos, asignaciones, depósito o parqueo.
- **Hallazgos (`20261010000010`):** tabla `orden_hallazgos` para el trabajo adicional reportado por el técnico.
- **Comisión por tarea (`20261010000006` y `08`):** `orden_labor.asignado_a` vincula la tarea a su técnico y genera
  `comisiones.labor_id`. Las líneas nacen con `reparto_heredado = false`. Administración acepta cada comisión
  (`comisiones.estado = 'sugerida' | 'aceptada' | 'pagada'`, `20261010000014`).
- **Pago mixto (`20261010000020`):** `perfiles_pago.esquema = 'mixto'` (salario informativo + comisión por tarea).
- **Listo para entregar (`20261010000021`):** `ordenes_trabajo.lista_para_entregar_en` y `lista_para_entregar_por`.
- **Trabajo con seguro (`20261010000027`):** `ordenes_trabajo.con_seguro`, `aseguradora`, `numero_reclamo`.
- **Teléfonos de la sede (`20261010000025` y `26`):** columna JSONB `sedes.telefonos` con `label`, `numero`, `tipo`
  ('oficina' | 'celular') y `whatsapp`; los normaliza `_telefonos_sede`. No existe una tabla `sede_telefonos`;
  `sedes.telefono` y `sedes.whatsapp` quedan como respaldos que sincroniza `sedesService`.
- **Idioma del cliente (`20261010000022`):** `clientes.idioma` ('en' por defecto).
- **Cobro por parqueo (`20261010000028`):** tablas `parqueo_config`, `parqueo_perfiles`, `parqueo_tramos` y
  `orden_parqueo`. Resumen y reglas en [parqueo.md](parqueo.md).

**Tres cosas que sorprenden:**

- El dinero está **separado**: `orden_montos` y `orden_repuestos` solo los lee un admin. El
  técnico asignado ve la mano de obra (de ahí sale su comisión) y las piezas **sin precio** (por la RPC `repuestos_de_orden`).
- Solo lo **autorizado** cuenta: `orden_labor` y `orden_repuestos` tienen `estado`
  (`borrador | pendiente | aprobado | rechazado`) y los totales suman solo `aprobado`.
- Lo importado del banco (`importacion_id`) **no** cuenta en nada de la app.

Las cifras exactas de tablas y migraciones están en [radiografia.md §1](radiografia.md#1-cifras-actuales-del-proyecto).

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
    DEP["Depósito del alta<br/>(con método registrado)"]
    ANT["Anticipo (registrar_anticipo)"]
    PF["Pago final al entregar<br/>(entregar_orden, incluye parqueo)"]
  end
  subgraph Salidas
    CR["Costo de repuestos<br/>(costo_unitario real, no precio)"]
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
total de la orden  = mano de obra aprobada + repuestos aprobados − descuento + parqueo
saldo              = total − (depósito + anticipos + pagos − devoluciones)
margen de la orden = cobrado − costo de repuestos − comisiones devengadas
fecha de un asiento automático = hoy_taller(sede)   ← hora local del taller, no UTC
```

- **Cobro por parqueo (`20261010000028`):** `orden_parqueo.monto` entra a `total_general`
  (`recalculate_order_totals`) y de ahí al saldo que liquida `entregar_orden`. Lo calcula la
  función pura `_parqueo_calculo` y se congela al entregar (`fin_congelado`). Ni genera
  comisiones ni recibe descuento. Detalle en [parqueo.md](parqueo.md).
- **Descuento (`aplicar_descuento`, `20261010000017`):** en `$` o en `%`
  (`orden_montos.descuento`). Lo absorbe el taller: **no baja las comisiones** (salen de la
  mano de obra autorizada) y **no toca el parqueo**.
- **Costo de repuestos (`costo_unitario`, `20261010000017`):** opcional en el alta y en la tabla;
  si no se indica, toma el precio de venta (`trg_part_cost_follows_price`). Finanzas registra el
  costo real del repuesto sin alterar las comisiones del técnico.
- **Anticipos (`registrar_anticipo`, `20261010000017`):** incrementan `orden_montos.deposito_inicial`
  guardando el método de pago utilizado.
- **Movimientos bancarios aislados (`20261010000016`, `20261010000017`):** los asientos con
  `importacion_id IS NOT NULL` son contabilidad aparte; la app los ignora al calcular saldos,
  márgenes y paneles. Categoría `comision_bancaria` para comisiones del banco y Clover.
- **Fecha del taller (`hoy_taller(sede)`, `20261010000017`):** todos los asientos automáticos y
  cálculos de parqueo usan la fecha en la zona horaria de la sede (`sedes.zona_horaria`), nunca
  `CURRENT_DATE` en UTC.

**Retirada sin reparar** (`retirar_sin_reparar`, `20261010000017`–`18`):

```mermaid
flowchart TD
  R["Admin elige qué pasó"] --> A["Se canceló todo"]
  R --> B["Solo se cobra la revisión"]
  R --> C["Se hicieron algunos trabajos"]
  A --> X["No se cobra nada → se devuelve lo que dejó"]
  B --> Y["Línea Revisión sin técnico → devuelve o cobra diferencia"]
  C --> Z["Lo hecho se cobra y paga comisión a su técnico<br/>lo demás queda no realizado y en trabajos_pendientes_vehiculo"]
```

`saldo_retiro` suma también el parqueo devengado al saldo de liquidación.

---

## 7. Comisiones

```mermaid
flowchart TD
  T["Cada tarea (orden_labor) tiene su técnico asignado_a"] --> E["Entrega de la orden (entregar_orden)"]
  E --> R["_reparto_comisiones:<br/>costo de la tarea × % del técnico (perfiles_pago o sede)"]
  R --> SUG["Comisión SUGERIDA (comisiones.estado = 'sugerida')<br/>El técnico NO ve el monto"]
  SUG --> ACE["Admin acepta (aprobar_comision / aprobar_comisiones)<br/>Aceptar todas, o edita % o $ de una"]
  ACE --> VE["Aviso al técnico: 'Comisión aprobada'"]
  ACE --> PAG["pay_commissions: SOLO lo aceptado<br/>→ comision_pagos + egreso en finanzas_movimientos"]
  PAG --> BL["Lo pagado bloquea la línea (trg_labor_tecnico_guard):<br/>no cambia de técnico ni se borra"]
```

- **Comisión por tarea (`20261010000006`, `20261010000008`):** cada línea autorizada de
  `orden_labor` tiene su técnico (`asignado_a`, administrado por admin) y su comisión le
  corresponde a él (`comisiones.labor_id`): costo de la línea × su porcentaje (`perfiles_pago`
  o el de la sede). Una tarea nueva sin técnico queda como `sin_asignar` en
  `comisiones_estimadas`: nadie cobra hasta que se le asigne uno.
- **Líneas anteriores (`reparto_heredado`):** las de antes de octubre de 2026 sin técnico
  (`reparto_heredado = true`) se reparten por especialidad entre los asignados
  a mano (`origen = 'manual'`). Asignar técnico a una heredada fija `reparto_heredado = false` y
  la saca de la bolsa para siempre.
- **Aprobación administrativa (`20261010000014`, `20261010000018`):** al entregar, la comisión
  nace como `sugerida`. La base oculta el monto al técnico (`comisiones_estimadas` devuelve nulo
  y la política RLS de `comisiones` no le permite leer filas sugeridas). Administración la
  aprueba en la tarjeta de la orden (`CommissionEstimateCard`) o en bloque en Comisiones
  (`pages/Payroll.tsx` vía `aprobar_comisiones`). Al aceptarse, el técnico recibe el aviso
  con el monto definitivo.
- **Solo se paga lo aceptado (`20261010000018`):** `pay_commissions` exige `estado = 'aceptada'`;
  rechaza pagar comisiones que sigan en estado sugerido.
- **Esquema mixto (`perfiles_pago.esquema = 'mixto'`, `20261010000020`):** combina salario
  informativo y comisión normal. En la base el filtro de comisiones es siempre
  `esquema <> 'salario'`, de modo que solo `salario` queda excluido del reparto.
- **Lo pagado bloquea la tarea (`trg_labor_tecnico_guard`):** no permite cambiar de técnico,
  especialidad ni borrar la línea (en pantalla se muestra un candado). Para cambiarla, primero
  debe revertirse el pago en Comisiones.
- **Pantalla del técnico:** en `/mis-comisiones` (`pages/MyCommissions.tsx`), el técnico consulta
  sus comisiones aprobadas y pagadas, respaldadas por la RPC `resumen_mis_comisiones` (`20261010000022`).
- **Descuentos y retiros:** el descuento no afecta las comisiones (se liquidan sobre la mano de
  obra autorizada); una retirada sin reparar solo comisiona las tareas autorizadas conservadas
  (`p_conservar`).
- Detalle completo en [comisiones.md](comisiones.md).

---

## 8. Lo que ve el cliente

```mermaid
flowchart LR
  F["Firma de recepción o Crear enlace"] --> L["orden_enlaces:<br/>token de 64 hex"]
  L --> URL["restorifyauto.net/r/<token>"]
  URL --> EF["Edge function 'portal'<br/>(sin sesión, verify_jwt = false)"]
  EF --> DP["datos_portal(token)<br/>arma el JSON a mano, campo por campo"]
  DP --> UI["src/portal/CustomerPortal.tsx"]
  UI -->|"responder presupuesto / preferencia idioma"| EF
```

- **Ve:**
  - **Estado:** 4 pasos (Recibido → En proceso → Listo → Entregado). Si el técnico finalizó pero
    administración aún no confirma la orden como lista, muestra **"En revisión final"**.
  - **Trabajos y presupuesto:** trabajos y repuestos autorizados a precio de venta; presupuestos
    pendientes para autorizar o rechazar línea por línea.
  - **Avances y fotos:** fotos y videos de avances publicados por el taller, y avances que el
    técnico marcó con `visible_cliente = true` (`orden_avances.visible_cliente`).
  - **Cuenta:** desglose de mano de obra y repuestos autorizados, depósito del alta, anticipos
    (`registrar_anticipo`), descuento (`aplicar_descuento`), saldo final o a favor, y cargo por
    parqueo si aplica (`20261010000028`: tramos, costo diario, días de gracia o exoneración).
  - **Observaciones del taller:** textos redactados por administración en hallazgos descartados
    con `en_reporte = true` (`orden_hallazgos.texto_cliente`, `20261010000010`/`11`).
  - **Contacto de la sede:** lista de teléfonos (`sedes.telefonos` JSONB, `20261010000025`/`26`)
    con tipo (oficina o celular), descripción, botón de llamada `tel:` y botón directo de
    WhatsApp (`wa.me`) con mensaje prellenado si el número atiende WhatsApp.
  - **Idioma y traducción:** español o inglés. El idioma del cliente se guarda en
    `clientes.idioma` ('en' por defecto, `20261010000022`) y se puede alternar desde el portal
    (`preferencia_idioma_portal`). Con el portal en inglés, `translateReport` traduce las notas
    de inspección, tareas, repuestos y avances mediante `datos_portal.traducciones`
    (`_diccionario_traducciones`).
- **No ve:** nombres de técnicos, comisiones, costos de repuestos, notas internas, fotos internas
  de hallazgos, ni VIN completo.
- Todo dato nuevo para el cliente se agrega **a mano** en `datos_portal` (nunca `to_jsonb(fila)`).
- El portal es un **paquete aparte**: no importa `lib/supabase`, `services/` ni
  `i18n/translations.ts`; tiene sus textos en `portal/strings.ts`. Detalle en
  [portal-y-correos.md](portal-y-correos.md).

---

## 9. Avisos, correos y traducciones

```mermaid
flowchart TD
  EV["Algo pasa en la base<br/>(trigger trg_*_notify)"] --> N["notificar()"]
  N --> NO[("notificaciones → la campana")]
  N --> CE[("cola_envios")]
  EV2["Texto visible cambia<br/>(trg_encolar_traduccion)"] --> CE
  EV3["Cambio de estado / presupuesto<br/>(trg_portal_on_order_change)"] --> CE
  CRON["Tarea programada (pg_cron)"] --> OUT["process-outbox (edge function)"]
  CE --> OUT
  OUT -->|"correo al cliente"| RES["Resend (idioma del cliente)"]
  OUT -->|"correo al técnico"| RES2["Resend (plantilla empleado)"]
  OUT -->|"traducir al inglés"| GEM["Gemini (GEMINI_MODEL)"]
  OUT -->|"push"| PUSH["Notificaciones del teléfono"]
  GEM --> TR[("traducciones (guardar_traducciones)")]
  TR --> POR["portal y PDF en inglés"]
```

- **Correos al cliente (`portal-y-correos.md`):** encolados por `trg_portal_on_order_change`.
  Finalizar por el técnico **no** envía correo; sale cuando administración confirma con
  `marcar_lista_para_entregar` (`20261010000021`). Se envían en el idioma del cliente
  (`clientes.idioma`, `'en'` por defecto, `20261010000022`). Si la sede cobra parqueo, el aviso
  de listo incluye la fecha límite antes de que empiece el cobro por día (`20261010000028`).
- **Correo al técnico (`20261010000023`):** `notificar()` encola correos al mecánico o pintor
  (plantilla `empleado`, `renderEmployeeEmail`) al asignarle orden, asignarle tarea o cuando el
  cliente responde un presupuesto. La fila en `cola_envios` va **sin `orden_id`** para que nunca
  se confunda con un correo al cliente.
- **Traducción automática (`20261010000013`, `20261010000015`):** al cambiar textos visibles
  (inspección 360, tareas, repuestos o avances públicos), `trg_encolar_traduccion` encola en
  `cola_envios` con canal `traduccion`. `process-outbox` lee textos con `_textos_cliente(orden_id)`,
  invoca la API de Gemini (`GEMINI_MODEL`, por defecto `gemini-3.8-flash`) y guarda el resultado
  en `traducciones` mediante `guardar_traducciones`. La lectura se realiza vía `traducciones_orden`
  (admin y técnico asignado), `traducciones_portal` y `_diccionario_traducciones`.
- **Resiliencia:** un trigger auxiliar **nunca bloquea** una escritura: va en
  `BEGIN … EXCEPTION → WARNING`. Si un correo falla, queda en `cola_envios` con su error para
  reintento administrativo.
- Detalle: [portal-y-correos.md](portal-y-correos.md), [multimedia-y-notificaciones.md](multimedia-y-notificaciones.md).

---

## 10. Quién puede hacer qué

```mermaid
flowchart TD
  U["Persona con sesión"] --> R{"Rol"}
  R -->|admin| A["Todo en su(s) sede(s):<br/>abre órdenes, asigna, cotiza, cobra, entrega,<br/>marca lista para entregar, seguro y parqueo,<br/>acepta y paga comisiones, finanzas, empleados"]
  R -->|"mecánico / pintor"| T["Solo órdenes donde está ASIGNADO (mis_ordenes_asignadas)"]
  T --> T1["Ve: tareas, mano de obra, piezas sin precio (repuestos_de_orden),<br/>avances, fotos, a sus compañeros, sus comisiones aprobadas en /mis-comisiones"]
  T --> T2["Hace: marcar sus tareas hechas (marcar_labor_completada), avance, estado<br/>(En proceso / Finalizado), fotos, reportar hallazgo (reportar_hallazgo)"]
  T --> T3["NO hace: abrir órdenes, asignar, ver precios o totales de orden,<br/>entregar, firmar, reabrir finalizada, despausar hallazgo, ver comisiones sugeridas"]
```

La impone **la base** (RLS y triggers), no la pantalla: `mis_ordenes_asignadas()`,
`is_admin()`, `trg_order_technician_guard`, `trg_labor_tecnico_guard`. Tabla completa en
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
- **Nombres de migraciones:** una migración nueva se nombra **después de la última que haya en
  `supabase/migrations/`** (hoy después de `20261010000028`, por ejemplo `20261010000029_...`),
  **nunca según la fecha de hoy**. Una fecha anterior a la última migración aplicada no se aplica
  con `supabase db push`.
- **Publicación:** Hostinger publica la rama `main` en 1–2 minutos directamente (verificado el
  30/09/2026). Commits solo cuando se piden.
- Si el CI falla con "job was not acquired by Runner", es un incidente de GitHub: se relanza con
  *Re-run all jobs*.

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
| El cobro por parqueo no se calcula o da $0 | `parqueo_config.habilitado`, perfil (`seguro` o `particular`), días de gracia, `vigente_desde` y que exista el evento detonador; [parqueo.md](parqueo.md) |
| Una orden finalizada no avisó al cliente | Normal: el técnico no avisa al cliente; el correo sale al marcar "Lista para entregar" (`marcar_lista_para_entregar`) |
| La firma de recepción no aprobó lo cotizado | Normal: la firma ya no autoriza trabajos (`20261010000022`); se autorizan por el portal o con "Registrar autorización" |
| El técnico ve su comisión vacía o en blanco | La comisión está en estado `sugerida`; hasta que administración la acepte (`aprobar_comision`) el monto permanece oculto |
| El texto en inglés en el portal o PDF sale en español | Cola en `cola_envios` canal `traduccion`, logs de `process-outbox`, y variable `GEMINI_API_KEY` |
| El técnico no recibió correo de asignación | `cola_envios` con plantilla `empleado` (va sin `orden_id`); revisar correo en `perfiles` |
| WhatsApp de la sede no abre desde el portal | `sedes.telefonos` JSONB (`_telefonos_sede`): número con 10+ dígitos y flag `whatsapp = true` |

---

*Última revisión: 11 de octubre de 2026 (migraciones hasta `20261010000028`). Si cambias la
estructura —una tabla, un estado, una pantalla, un flujo de dinero— actualiza el diagrama
correspondiente en el mismo cambio.*

