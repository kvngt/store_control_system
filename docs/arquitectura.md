# Arquitectura de Restorify

Guía para alguien que llega nuevo al código y necesita entender cómo está armado
el sistema antes de tocarlo.

Para *usar* la aplicación, el documento es [manual-usuario.md](manual-usuario.md).
Este otro explica cómo está construida.

---

## Índice

1. [Lo esencial en un minuto](#1-lo-esencial-en-un-minuto)
2. [La decisión que explica todo lo demás](#2-la-decisión-que-explica-todo-lo-demás)
3. [Mapa del repositorio](#3-mapa-del-repositorio)
4. [Modelo de datos](#4-modelo-de-datos)
5. [Dónde vive la lógica de negocio](#5-dónde-vive-la-lógica-de-negocio)
6. [Seguridad y permisos](#6-seguridad-y-permisos)
7. [El frontend por dentro](#7-el-frontend-por-dentro)
8. [Migraciones: el flujo de trabajo](#8-migraciones-el-flujo-de-trabajo)
9. [Pruebas](#9-pruebas)
10. [Levantar el proyecto](#10-levantar-el-proyecto)
11. [Trampas conocidas](#11-trampas-conocidas)

---

## 1. Lo esencial en un minuto

Restorify administra talleres mecánicos y de pintura: clientes, vehículos,
órdenes de trabajo, finanzas y nómina, con soporte para varias sedes.

| | |
|---|---|
| **Frontend** | React 19 + TypeScript, construido con Vite |
| **Backend** | Supabase (PostgreSQL + Auth + Storage) |
| **Ruteo** | react-router-dom 7, todo del lado del cliente |
| **Estilos** | CSS plano con variables, sin framework |
| **Estado** | Contextos de React, sin Redux ni similares |
| **Pruebas** | Vitest (unitarias y de componente) + Playwright (end-to-end) |
| **Despliegue** | Sitio estático. Hoy en `reinventa.shop` (dominio temporal) |

Unas 11 000 líneas de TypeScript, 3 200 de CSS y 18 migraciones SQL.

---

## 2. La decisión que explica todo lo demás

**No hay servidor propio.** El navegador habla directamente con Supabase a
través de PostgREST. No existe una capa de API intermedia donde poner
validaciones, permisos ni reglas de negocio.

```
Navegador (React)
      │
      │  supabase-js  →  https://<proyecto>.supabase.co
      │
      ├── PostgREST ──→ PostgreSQL  ← aquí viven RLS y los triggers
      ├── Auth (GoTrue)
      ├── Storage (fotos, firmas, PDF)
      └── Edge Functions ← lo único que corre con clave de servicio
```

De esto se derivan tres consecuencias que hay que tener presentes **siempre**:

**1. La clave anónima y todas las tablas son públicas.** Viajan dentro del
bundle de JavaScript. Cualquiera con las herramientas de desarrollo abiertas
puede hacerle a la API las mismas peticiones que hace la aplicación, con su
propio token de sesión legítimo.

**2. Esconder un botón en React no es una restricción, es una sugerencia
visual.** Un `{isAdmin && <button/>}` mejora la experiencia; no protege nada.
Lo único que sostiene un límite de verdad son las políticas RLS de Postgres.

**3. La lógica que debe cumplirse siempre va en la base de datos.** Si una regla
solo existe en el frontend, se la salta cualquiera que llame la API directamente,
y también cualquier pantalla futura que olvide replicarla.

> Cuando agregues una restricción, la pregunta correcta no es «¿escondí el
> botón?» sino «¿qué pasa si alguien manda esta petición a mano?».

---

## 3. Mapa del repositorio

```
src/
  main.tsx                    punto de entrada
  App.tsx                     rutas + proveedores + guardias de acceso

  pages/                      una pantalla por archivo
    Login.tsx                 acceso y solicitud de recuperación
    ResetPassword.tsx         elegir contraseña nueva tras el enlace
    Dashboard.tsx             panel principal
    Customers.tsx             clientes
    Vehicles.tsx              vehículos (VIN, placa)
    WorkOrders.tsx            órdenes de trabajo  ← el módulo grande (2 084 líneas)
    KanbanBoard.tsx           tablero por estado
    Finance.tsx               movimientos, importaciones
    finance/
      ImportStatementModal.tsx   lectura y revisión del PDF bancario
    Payroll.tsx               nómina
    Settings.tsx              perfil, sedes, empleados

  components/
    layout/
      AppLayout.tsx           armazón: barra lateral + encabezado + contenido
      Sidebar.tsx             menú principal
      Header.tsx              búsqueda global, sede, idioma, notificaciones
      BottomNav.tsx           barra inferior en móvil
    Combobox.tsx              lista desplegable con texto libre
    CustomerPicker.tsx        selector de cliente con alta en línea
    LazyModal.tsx             envoltorio para modales con carga diferida
    ErrorBoundary.tsx         pantalla de error de último recurso

  context/                    estado global, uno por preocupación
    AuthContext.tsx           sesión, perfil, sede activa, recuperación
    LanguageContext.tsx       idioma (es / en)
    ThemeContext.tsx          tema (oscuro / claro)
    ToastContext.tsx          avisos flotantes
    UnsavedChangesContext.tsx guardia de navegación con cambios sin guardar

  services/
    supabaseService.ts        TODAS las consultas a Supabase (867 líneas)

  lib/                        lógica pura, sin React
    supabase.ts               cliente configurado
    errors.ts                 traduce errores de Postgres y de Auth
    vin.ts                    validación y decodificación de VIN, placas por estado
    bankStatementParser.ts    lee el PDF de Wells Fargo
    categorizationRules.ts    sugiere categoría por palabras clave
    workOrderPdf.ts           genera el reporte PDF de la orden
    signature.ts              recorta la firma capturada
    branding.ts               aplica color y logo de la sede

  types/database.ts           tipos que reflejan el esquema
  i18n/translations.ts        textos en español e inglés
  styles/                     index.css (variables) + components.css
  test/                       utilidades compartidas de prueba

supabase/
  migrations/                 18 archivos, en orden cronológico
  functions/                  Edge Functions (Deno)
    create-employee/
    delete-employee/
  config.toml                 configuración del proyecto

e2e/                          pruebas Playwright
docs/                         este documento y el manual de usuario
scripts/                      utilidades (copiar worker de PDF, reset de datos)
```

### Las tres reglas de organización

**Una pantalla = un archivo en `pages/`.** No hay subcarpetas por pantalla salvo
`finance/`, donde el modal de importación se separó porque arrastra `pdfjs-dist`
(~1 MB) y se carga de forma diferida.

**Ninguna pantalla llama a Supabase directamente.** Todo pasa por
`services/supabaseService.ts`. Si necesitas un dato nuevo, agregas un método ahí.
Esto mantiene las consultas en un solo lugar y hace que las pantallas se puedan
probar simulando un único módulo.

**`lib/` no sabe que existe React.** Son funciones puras: entra un dato, sale
otro. Por eso están bien cubiertas por pruebas unitarias rápidas.

---

## 4. Modelo de datos

14 tablas. El eje es la **sede**: casi todo cuelga de ella y no se mezcla entre
talleres.

```
sedes ──┬── perfiles          (usuarios; rol: admin | mecanico | pintor)
        ├── clientes ──── vehiculos          (vehiculos.sede_id se deriva por trigger)
        ├── ordenes_trabajo ─┬── orden_labor
        │                    ├── orden_repuestos
        │                    ├── orden_asignaciones ── perfiles
        │                    └── orden_avances
        ├── finanzas_movimientos ──┬── ordenes_trabajo   (referencia_orden_id)
        │                          └── finanzas_importaciones
        └── nomina_pagos ── perfiles

finanzas_reglas_categorizacion    configuración global (no por sede)
numero_orden_contadores           contador de folios; solo lo tocan los triggers
```

### Detalles que no son obvios

**`vehiculos.sede_id` es redundante a propósito.** Un vehículo pertenece a una
sede a través de su cliente, pero guardarlo en la fila hace la frontera
explícita, indexable y verificable por RLS sin un JOIN. Lo llena el trigger
`trg_vehiculo_sede`; el cliente nunca lo envía.

**`vehiculos.placa` acepta NULL.** Las unidades de subasta no tienen placa. NULL
significa «no tiene»; nunca se guarda `''` ni un texto de relleno.

**Los repuestos tienen dos precios.** `costo_unitario` es lo que pagó el taller
(se registra como egreso al entregar); `precio_venta_unitario` es lo que se le
cobra al cliente (forma el total de la orden). Confundirlos falsea el margen.

**Las eliminaciones tienen intenciones distintas.** `vehiculos.cliente_id` es
`ON DELETE CASCADE` — borrar un cliente se lleva sus vehículos. En cambio
`ordenes_trabajo.cliente_id` y `.vehiculo_id` son `ON DELETE RESTRICT` — una
orden bloquea el borrado. Es deliberado: el historial de trabajo no se pierde
por accidente.

---

## 5. Dónde vive la lógica de negocio

**En triggers de PostgreSQL**, no en el frontend. Esta es la parte que más
sorprende a quien llega: cambiar el estatus de una orden desde cualquier pantalla
—o desde la API a mano— dispara movimientos financieros automáticamente.

### Triggers por tabla

| Tabla | Trigger | Qué hace |
|---|---|---|
| `ordenes_trabajo` | `trg_numero_orden` | Genera `ORD-<año>-###` de forma atómica |
| | `trg_orden_sede_coherente` | Rechaza órdenes que mezclan sedes |
| | `trg_order_deposit` | Registra el depósito inicial como ingreso |
| | `trg_order_delivery_payment` | Al entregar, cobra el saldo pendiente |
| | `trg_order_parts_expense` | Al entregar, registra el costo de repuestos como egreso |
| | `trg_delivered_order_adjustment` | Si cambia el total de una orden ya entregada, registra la diferencia |
| | `trg_progress_on_status` | Pone el avance en 100 % al finalizar o entregar |
| | `trg_cleanup_order_finance` | Al borrar la orden, borra sus movimientos automáticos |
| `orden_repuestos` | `trg_parts_subtotal` | Calcula el subtotal antes de guardar |
| | `trg_parts_totals` | Recalcula los totales de la orden |
| | `trg_parts_expense_sync` | Ajusta el egreso si cambian los repuestos de una orden entregada |
| `orden_labor` | `trg_labor_totals` | Recalcula los totales de la orden |
| `vehiculos` | `trg_vehiculo_sede` | Deriva `sede_id` del cliente |
| `perfiles` | `trg_perfil_privilegios` | Impide que alguien cambie su propio rol o sede |
| `nomina_pagos` | `trg_payroll_expense` | Genera el egreso de cada pago |

Todos son `SECURITY DEFINER`: corren con los permisos de quien los definió, para
que un mecánico pueda mover una orden aunque no tenga acceso directo a
`finanzas_movimientos`.

> **Antes de calcular algo en el frontend, revisa si un trigger ya lo hace.**
> Los totales de una orden, por ejemplo, no se calculan nunca a mano en React:
> se leen de la fila después de guardar.

---

## 6. Seguridad y permisos

### Row Level Security

RLS está **activo en las 14 tablas**, sin excepción. Las políticas se apoyan en
tres funciones `SECURITY DEFINER` que evitan la recursión al consultar `perfiles`
desde políticas sobre `perfiles`:

```sql
public.current_user_role()      -- rol del usuario actual
public.current_user_sede_id()   -- su sede
public.is_admin()               -- atajo booleano
```

El patrón general es `public.is_admin() OR sede_id = public.current_user_sede_id()`:
el administrador ve todas las sedes, el resto solo la suya.

**Las operaciones destructivas están separadas.** Donde antes había una sola
política `FOR ALL`, hoy hay cuatro: leer, crear y editar quedan abiertas a la
sede, pero `DELETE` es exclusivo de administradores en `clientes`, `vehiculos` y
`ordenes_trabajo`. La razón es concreta: un colaborador molesto con sesión activa
podía vaciar el tablero con una sola petición.

Finanzas y nómina son admin-only completas, en todas las operaciones.

### Edge Functions

Lo único que corre con la clave de servicio, porque necesita la API de
administración de Auth y no es seguro exponerla al navegador:

- **`create-employee`** — crea el usuario en Auth y su perfil. Verifica que quien
  llama sea administrador consultando su propio `perfiles.rol`.
- **`delete-employee`** — borra perfil y acceso. Se niega si el empleado todavía
  tiene órdenes asignadas, y si el administrador intenta borrarse a sí mismo.

Como corren con clave de servicio, **saltan RLS por completo**. Es la razón por
la que `perfiles_insert` puede estar restringida a administradores sin romper el
alta de empleados.

### Storage

Cinco buckets: `vehiculos_fotos`, `firmas`, `estados_cuenta_bancarios`,
`sede_logos`, `avatares`. Subir está abierto a personal autenticado —es el
trabajo diario— pero **borrar y sobrescribir son admin-only** en fotos y firmas:
son la evidencia del taller ante un reclamo.

---

## 7. El frontend por dentro

### Composición de proveedores

`App.tsx` los anida en este orden, de fuera hacia dentro:

```
ErrorBoundary → BrowserRouter → Theme → Language → Toast → UnsavedChanges → Auth → Rutas
```

`AuthContext` va al final porque consume los demás. Guarda sesión, perfil, sede
activa y la lista de sedes, y expone `passwordRecovery`, que gana sobre todas
las rutas: el enlace de recuperación inicia sesión, así que sin esa bandera el
usuario caería en el panel sin haber cambiado nunca su contraseña.

### Guardias de ruta

`ProtectedRoute` redirige a `/login` sin sesión, y con `adminOnly` saca del paso
a quien no sea administrador. **Es comodidad, no seguridad** — lo que protege
Finanzas de verdad es la política RLS.

### Capa de servicio

`supabaseService.ts` es un objeto plano de funciones `async`. Convenciones:

- Devuelve datos ya listos para la pantalla, no respuestas crudas de Supabase.
- Lanza el error tal cual; la pantalla decide cómo mostrarlo.
- **Los borrados sensibles usan `.select('id')` y verifican que volvió una fila.**
  Un `DELETE` que RLS rechaza no es un error en PostgREST: informa éxito habiendo
  borrado cero filas. Sin esa comprobación la interfaz diría «eliminado» y
  volvería a dibujar el registro intacto.

### Manejo de errores

`lib/errors.ts` traduce dos familias:

- `getErrorMessage()` — códigos de Postgres (`23503` clave foránea, `23505`
  duplicado, `42501` permiso denegado…) a texto legible en los dos idiomas.
- `getAuthErrorMessage()` — errores de Supabase Auth, por código y, para
  versiones del SDK que no lo traen, por el texto en inglés.

**Nunca muestres el mensaje crudo del backend al usuario.** Son cadenas en inglés
escritas para desarrolladores.

### Internacionalización

`i18n/translations.ts` es un objeto anidado con `es` y `en`. Se accede con
`t('workOrders.newOrder')`. El idioma vive en `localStorage` y se lee al montar.

No hay detección automática ni carga diferida: son dos idiomas y un archivo.

### Estilos

CSS plano en dos archivos. `index.css` define las variables (colores,
espaciados, tipografía, capas) y los dos temas; `components.css` las usa.

**Nunca escribas un color literal en un componente.** Usa `var(--color-…)` o el
tema claro se rompe.

Las capas están numeradas y el orden importa:

```
--z-dropdown: 100    --z-overlay: 300    --z-toast: 500
--z-sticky:   200    --z-modal:   400
```

Los toasts están por encima de los modales a propósito: es la única forma de
avisar algo mientras un diálogo está abierto.

### Patrones de interfaz que se repiten

- **Modales** — `.modal-overlay` + `.modal`, con `stopPropagation` en el interior.
- **Tablas que se vuelven tarjetas** — la clase `cards-on-mobile` sobre
  `.table-container`, y `data-label` en cada `<td>` para el encabezado en móvil.
- **`desktop-only` / `mobile-only`** — para lo que cambia de forma entre tamaños.
- **Carga diferida de modales pesados** — `React.lazy` envuelto en `LazyModal`,
  que aporta indicador de carga y contiene el fallo si el archivo no descarga.

---

## 8. Migraciones: el flujo de trabajo

Las migraciones son **la única forma** de cambiar el esquema. Nunca edites tablas
desde el panel de Supabase: el siguiente `db push` no lo sabría y el repositorio
dejaría de describir la base real.

```bash
# Ver qué está aplicado y qué falta
npx supabase migration list --linked

# Simulacro: dice qué aplicaría, sin escribir
npx supabase db push --dry-run

# Aplicar
npx supabase db push
```

Convención de nombres: `AAAAMMDDHHMMSS_descripcion_en_ingles.sql`. Se aplican en
orden alfabético, que con ese formato es orden cronológico.

### Cómo escribirlas

**Idempotentes siempre.** `DROP ... IF EXISTS` antes de crear, `CREATE OR REPLACE`
en funciones, `ADD COLUMN IF NOT EXISTS`. Una migración que falla a medias se
reintenta sin dolor.

**Explica el porqué, no el qué.** El SQL ya dice qué hace. El comentario debe
decir qué problema resuelve y qué pasaba antes. Las migraciones de este proyecto
son la mejor documentación de sus decisiones; léelas en orden si quieres entender
cómo llegó el sistema a donde está.

**Consulta antes de escribir.** `npx supabase db query --linked "SELECT …"`
ejecuta consultas de lectura contra la base real. Sirve para verificar supuestos
antes de dar por buena una migración.

---

## 9. Pruebas

```bash
npm test           # unitarias y de componente (~20 s, sin navegador)
npm run test:watch # las mismas, en modo vigilancia
npm run test:e2e   # Playwright contra un navegador real
```

Tres niveles:

**Unitarias** (`src/lib/*.test.ts`) — lógica pura en entorno `node`. Rápidas y
sin simulaciones: el parser de PDF, las reglas de categorización, la validación
de VIN, la traducción de errores.

**De componente** (`*.test.tsx`) — renderizan una pantalla real con
`@testing-library/react`. Cada archivo declara `// @vitest-environment jsdom` en
la primera línea; `src/test/renderWithProviders.tsx` monta los proveedores
verdaderos de idioma, tema, avisos y ruteo, y se simulan `AuthContext` y
`supabaseService`.

**End-to-end** (`e2e/`) — Playwright contra la aplicación levantada. Las que
necesitan sesión se saltan solas si no hay credenciales en `.env.test.local`.

> Las pruebas de componente existen sobre todo por una clase de error que se
> repitió cuatro veces: **diálogos que fallan en silencio**. Si agregas un
> formulario, escribe la prueba de que explica sus fallos.

---

## 10. Levantar el proyecto

```bash
npm install          # el postinstall copia el worker de pdfjs a public/
npm run dev          # http://localhost:5173
```

`.env.local` necesita:

```
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_ANON_KEY=<clave anónima>
```

Vite **incrusta** estas variables en el build; no se leen en tiempo de ejecución.
Cambiarlas exige recompilar. Si faltan, `App.tsx` muestra una pantalla de
configuración incompleta en lugar de fallar en blanco.

Otros comandos:

```bash
npm run build    # tsc -b && vite build  →  dist/
npm run lint     # oxlint
npm run preview  # sirve dist/ localmente
```

**No hay Supabase local en uso** (requiere Docker). Se trabaja contra el proyecto
alojado, así que ten cuidado con lo que ejecutas.

---

## 11. Trampas conocidas

Cosas que ya mordieron a alguien. Vale más leerlas ahora que redescubrirlas.

**Un `return` mudo en un diálogo se ve igual que un botón roto.** Pasó en cuatro
pantallas. El modal cubre el recuadro de error de la página (capa 400 sobre el
contenido), así que un `setError` de la pantalla es invisible mientras el diálogo
está abierto. Usa un estado de error propio del diálogo, o un toast (capa 500).

**Un botón deshabilitado necesita decir por qué, junto al botón.** Misma familia.
En el importador el motivo estaba arriba de una tabla larga con scroll: desde
abajo, donde está el botón, no se veía.

**`required` no valida si el formulario no es un `<form>`.** Varios diálogos usan
un `onClick` en el botón en vez de `onSubmit`; ahí el atributo es decorativo y la
validación hay que escribirla.

**Un `CASE` sin cast explícito no entra en una columna enum.** Postgres resuelve
`CASE WHEN … THEN 'egreso' ELSE 'ingreso' END` a `text`, y no hay conversión
implícita a enum. Un literal suelto sí se convierte; un `CASE` no. Escribe
`(CASE … END)::transaction_type`.

**El cuerpo de una función plpgsql no se valida al crearla.** Una migración con
un error de tipos dentro de una función se aplica sin quejarse y falla meses
después, la primera vez que el trigger se ejecuta de verdad.

**Un `DELETE` que RLS rechaza informa éxito.** Ver la sección de la capa de
servicio.

**`vehiculos_fotos` y `firmas` se suben con ruta con timestamp.** Por eso
sobrescribir es admin-only sin romper nada: dos subidas nunca chocan.

**Importar dos veces el mismo estado de cuenta duplica el mes entero.** Hay tres
defensas (huella del archivo, filas marcadas como duplicadas, «seleccionar todas»
que las excluye) y una salida: revertir la importación desde Finanzas.

**El tablero Kanban no se arrastra en móvil.** Los eventos de arrastre de HTML5
no existen en pantallas táctiles; por eso cada tarjeta tiene un selector «Mover
a» visible solo en móvil.

---

*Última revisión: septiembre de 2026.*
