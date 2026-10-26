# Radiografía Técnica de Restorify

**Fecha de actualización:** 19 de octubre de 2026 (cifras y módulos de las migraciones `029` a `039`)
**Audiencia:** Desarrolladores y agentes de IA que toman el proyecto.

Restorify es un sistema B2B multi-sede para talleres mecánicos y de pintura. Administra la operación completa: vehículos, recepción con fotos/videos, presupuestos línea por línea, trabajos, finanzas y cálculo de comisiones.

La característica fundamental del sistema es que **no tiene backend propio**. El navegador del cliente habla directamente con Supabase (PostgreSQL + Auth + Storage) mediante la clave pública anónima. Toda la seguridad, reglas de negocio y cálculos de dinero viven en la base de datos a través de Row Level Security (RLS), triggers y funciones RPC.

---

## 1. Cifras Actuales del Proyecto

Contadas el **19/10/2026** (las demás guías remiten aquí en vez de repetir cifras que envejecen).

| Métrica | Valor | Detalle |
| :--- | :--- | :--- |
| **Archivos fuente (TypeScript)** | 196 | `src/` excluyendo pruebas |
| **Pruebas (Vitest)** | 140 archivos | 1.076 pruebas unitarias y de componentes (19/10/2026) |
| **Migraciones de base de datos** | 93 | En `supabase/migrations/`, hasta `20261010000039_vehiculos_vin_y_placa_unicos` (aplicada en producción el 19/10/2026; `npm run db:check`) |
| **Tablas de base de datos** | 30 al 11/10/2026 más las 9 tablas de las migraciones 029 a 039 | En `public` (`orden_proximo_servicio`, `catalogo_trabajos`, `catalogo_trabajo_lineas`, `orden_trabajos`, `inspeccion_plantillas`, `inspeccion_plantilla_puntos`, `orden_inspecciones`, `orden_inspeccion_puntos`, `orden_labor_tiempos`) |
| **Funciones SQL** | 161 al 11/10/2026 (más las de las migraciones 029 a 039) | En `public` (RPC, internas y de trigger); `npm run db:donde -- <nombre>` da la versión vigente de cada una |
| **Triggers en `ordenes_trabajo`** | 24 al 11/10/2026 (más los 2 de las migraciones 029 a 039) | La tabla con más lógica asociada (`trg_marcas_danos_firmadas` en `031` y `trg_order_link_on_create` en `032`) |
| **Tareas programadas** | 5 | `pg_cron`: `restorify-outbox`, `-maintenance`, `-due-reminders`, `-quote-reminders`, `-parqueo` |
| **Pruebas de base de datos** | 43 archivos | 1.053 pruebas (`supabase/tests/database/`, pgTAP, 19/10/2026) |
| **Casos de `qa:security`** | 202 | `scripts/qa/api-security.mjs`, contra la API (171 PASS + 31 SKIP al 19/10/2026) |
| **Edge Functions** | 7 | En `supabase/functions/` (Deno 2): `cleanup-storage`, `create-employee`, `delete-employee`, `portal`, `process-outbox`, `traducir-texto`, `update-employee` |
| **Pruebas e2e** | 8 | En `e2e/` (Playwright) |

---

## 2. Estructura del Repositorio

El proyecto utiliza **Vite 8**, **React 19**, **TypeScript 6**, y no utiliza ningún framework de UI complejo (ni Tailwind ni Material UI), empleando **CSS plano** con variables.

```text
restorify/
├── src/                      # Código fuente de React
│   ├── components/           # Componentes UI reutilizables (Botones, Modales, Inputs)
│   ├── context/              # Estado global (Auth, Toast, Idioma, Tema)
│   ├── features/             # Lógica de dominio particionada (órdenes, empleados, finanzas)
│   ├── i18n/                 # Diccionarios de traducción (translations.ts)
│   ├── lib/                  # Utilidades sin React (matemáticas, fechas, formateo)
│   ├── pages/                # Vistas principales (enrutadas vía React Router)
│   ├── portal/               # Paquete independiente: el portal del cliente sin sesión
│   ├── services/             # Capa de datos: TODO el acceso a Supabase pasa por aquí
│   ├── styles/               # CSS global (index.css, components.css)
│   └── types/                # Tipos TypeScript, incluyendo `database.ts` autogenerado
├── supabase/                 # El backend "Infrastructure as Code"
│   ├── functions/            # Edge Functions (Deno)
│   ├── migrations/           # Definición de tablas, RLS, triggers y RPCs en SQL
│   └── tests/                # Pruebas pgTAP para lógica en BD
├── public/                   # Service workers, iconos PWA y .htaccess
├── e2e/                      # Pruebas End-to-End (Playwright)
├── scripts/                  # Utilidades de mantenimiento (QA, migraciones, scripts en JS/Bash)
└── docs/                     # Documentación del proyecto (tú estás aquí)
```

### Reglas Estructurales Críticas
1. **Nada llama a Supabase directo desde un componente.** Todo pasa por `services/`.
2. **Las listas crecen indefinidamente.** Usa siempre `.fetchAll()` o paginación. La API nativa de Supabase corta a 1000 registros sin avisar.
3. **El estado de la UI es secundario.** La base de datos es la única fuente de verdad; TanStack Query maneja la caché. Ante la duda, invalida caché y recarga.

---

## 3. Módulos y Dominio

El sistema se divide en varios dominios funcionales, reflejados en `src/features/` y `src/services/`.

### 3.1 Órdenes de Trabajo (`workOrders`)
El núcleo del sistema. Administra el ciclo de vida del vehículo en el taller.
- **Creación:** Asistente de 4 pasos (Cliente, Vehículo y recepción, Trabajos, Depósito). Usa `create_work_order` (RPC transaccional). Guarda un borrador automático en `localStorage` (`intakeDraft`) por persona en este aparato y protege el botón «atrás» del teléfono (`useBackButtonTrap` y `ChoiceDialog`: *Seguir editando / Guardar borrador y salir / Descartar y salir*). En vehículos, el VIN y la placa por estado son únicos (`20261010000039`: `uq_vehiculos_vin` y `uq_vehiculos_placa`).
- **Trabajos agrupados y catálogo (`20261010000034`, `037`):** Plantillas reutilizables por sede (`catalogo_trabajos`, `catalogo_trabajo_lineas`) y trabajos agrupados en la orden (`orden_trabajos`, con `trabajo_id` opcional en `orden_labor` y `orden_repuestos`).En el portal el cliente autoriza cada trabajo completo con su total cerrado.
- **Inspección por puntos (`20261010000035`, `037`):** Lista multipunto por sede (`inspeccion_plantillas`, `orden_inspecciones`, `orden_inspeccion_puntos`) con estados `bien | atencion | urgente | no_aplica`, fotos por punto (`orden_media.inspeccion_punto_id`) y publicación al portal del cliente; los puntos marcados en atención o urgente alimentan `trabajos_pendientes_vehiculo`.
- **Horas, reloj e indicadores (`20261010000036`, `037`):** Horas facturadas en tareas (`orden_labor.horas`) y tarifa por hora en la sede (`sedes.tarifa_hora`), sesiones de reloj de tiempo real por tarea (`orden_labor_tiempos`: `iniciar_reloj`, `detener_reloj`, `corregir_tiempo`, `borrar_tiempo`, con cierre automático al completar la tarea y tope de 12 h) e indicadores del taller (`indicadores_taller`: ticket promedio, horas facturadas vs. reales, eficiencia e ingresos por hora).
- **Próximo servicio y sticker (`20261010000029`, `032`, `037`, `038`):** El técnico sugiere y administración programa el próximo servicio (`orden_proximo_servicio`) e imprime una etiqueta térmica de 62 × 50 mm con QR hacia `/s/<código>`; la nota se traduce con Gemini (`traducir-texto` o `cola_envios`).
- **Ejecución:** Los técnicos marcan sus tareas. `trg_labor_avance` recalcula el porcentaje de avance general.
- **Presupuestos:** Se envían cotizaciones por correo/SMS. El cliente aprueba/rechaza cada línea (repuesto/tarea) desde el portal.
- **Entrega:** La orden se marca como "Lista". El admin la entrega vía `entregar_orden`, que bloquea modificaciones futuras y asienta el ingreso del saldo en finanzas.
- **Archivado:** Una vez entregada, la orden desaparece de la vista principal si tiene más de 90 días, o puede ser ocultada manualmente por el administrador (esto graba la fecha en la columna `archivada_en`, la cual exige por regla de BD que la orden esté previamente `entregado`).

### 3.2 Finanzas (`finance`)
- **Contabilidad Automática:** Los cobros de entrega, depósitos, pagos de comisiones y costos de repuestos son insertados automáticamente por triggers. Desde `20261010000038`, `finanzas_movimientos.origen` (`'manual' | 'sistema'`, forzado por `trg_finanzas_origen`) distingue los movimientos del sistema: ni un admin puede editarlos ni borrarlos por la API (`finanzas_movimientos_update` y `finanzas_movimientos_delete` exigen `origen = 'manual'`).
- **Conciliación:** Los estados de cuenta bancarios se importan (`importar_estado_cuenta`) y se emparejan, para separar lo contable de lo operativo.

### 3.3 Empleados y Comisiones (`employees` / `payroll`)
- Un técnico tiene asignadas tareas específicas dentro de una orden.
- Al entregarse la orden, `_reparto_comisiones` calcula lo que se debe pagar.
- Las comisiones nacen como "Sugeridas". Un admin debe aceptarlas explícitamente (`aprobar_comision`) antes de pagarlas (`pay_commissions`).

### 3.4 Multimedia (`media`)
- Captura fotos, video (hasta 2 min) y notas de voz nativamente en la web.
- Sube a Storage usando TUS (cargas reanudables) a través del bucket `orden_media`.

---

## 4. Arquitectura de Base de Datos y Seguridad

### 4.1 Row Level Security (RLS)
La base de datos (PostgreSQL 17) filtra lo que el usuario puede ver y hacer:
- **Administradores:** Ven toda su sede.
- **Técnicos (Mecánicos/Pintores):** Ven **exclusivamente** las órdenes a las que están explícitamente asignados (`is_assigned_to_order`).
- **Secretos:** Tablas como `orden_montos` (dinero) o `finanzas_movimientos` tienen políticas estrictas; los técnicos no pueden leerlas. Para que un técnico vea una lista de repuestos sin precios, se usa una vista/RPC `SECURITY DEFINER` llamada `repuestos_de_orden`.

### 4.2 Lógica en Triggers y RPCs
Dado que no hay backend intermedio, PostgreSQL actúa como orquestador:
- **Dinero siempre en Triggers:** Nadie puede mandar `total_general = 100` desde la API. Si se agrega un repuesto de $50, el trigger recalcula el total de la orden.
- **Notificaciones (Event Sourcing):** Un trigger (`trg_*_notify`) detecta un evento (ej. "orden lista") e inserta un registro en `cola_envios`.

```mermaid
flowchart TD
  API["Supabase API (PostgREST)"] --> RLS["RLS (Filtros de acceso)"]
  RLS --> DB[("PostgreSQL (Tablas)")]
  DB --> TRG["Triggers (Cálculo de Totales, Auditoría)"]
  DB --> ENCOLAR["Inserción en cola_envios"]
```

---

## 5. Edge Functions y Servicios Externos

El trabajo en segundo plano, integraciones de terceros y accesos anónimos controlados suceden en Supabase Edge Functions (Deno).

```mermaid
flowchart LR
  CRON["pg_cron (BD)"] -->|Ejecuta cada min| OUT["process-outbox (Edge Function)"]
  OUT -->|"Envía Correo"| RES["Resend API"]
  OUT -->|"Traduce Textos"| GEM["Google Gemini API"]
  OUT -->|"Notificaciones Push"| VAP["Web Push Protocol"]
  
  CLIENTE["Cliente Anónimo"] -->|"Visita restorifyauto.net/r/token"| PORTAL["portal (Edge Function)"]
  PORTAL -->|"Genera JSON"| BD[("Base de Datos")]
```

### Funciones Principales
1. **`process-outbox`:** Lee `cola_envios` y despacha correos (Resend), notificaciones push, y traducciones al inglés (Gemini).
2. **`portal`:** El portal del cliente, que no usa la librería de Supabase, hace peticiones HTTP a esta función, la cual lee de la base de datos de forma segura (usando tokens de enlace) para servir la cotización.
3. **`cleanup-storage`:** Tarea de limpieza programada para purgar huérfanos.
4. **`traducir-texto`:** Traduce al instante la nota del sticker de próximo servicio con Gemini (solo admin; no toca la base).
5. **`create-employee`, `update-employee`, `delete-employee`:** Administración de cuentas de personal en Supabase Auth y `perfiles` (solo admin).

### Integraciones Externas
- **Resend:** Proveedor de emails transaccionales.
- **Google Gemini:** Traducción automática de la bitácora del técnico al inglés para clientes que prefieren ese idioma (recientemente migrado para omitir `temperature` y cumplir con la API v3.8 Flash).
- **NHTSA:** API pública del gobierno de EE. UU. usada en el frontend para decodificar VINs (Vehicle Identification Numbers).

---

## 6. Proceso de Despliegue

Hostinger publica la aplicación web de manera estática a partir del repositorio de GitHub. 
Supabase se gestiona vía CLI.

1. **Base de Datos Primero:** Las migraciones SQL deben aplicarse antes de desplegar el código frontend (`npx supabase db push`).
2. **Validación:** El código debe pasar `oxlint`, `tsc -b`, `vitest` y `qa:security` (script que asegura que no haya funciones RPC públicas sin RLS).
3. **Despliegue Frontend:** Un push a la rama principal detona el build en Hostinger.
