# Restorify — Sistema de Administración de Talleres

Sistema de gestión para talleres mecánicos y de pintura (multi-sede): clientes, vehículos, órdenes de trabajo con tablero Kanban, finanzas, nómina y control de usuarios/roles. Frontend en React + Vite + TypeScript, backend en Supabase (Postgres + Auth + Storage + Row Level Security).

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | React 19, React Router 7, TypeScript, Vite |
| Backend | Supabase (Postgres, Auth, Storage, Edge Functions) |
| Estilos | CSS plano (`src/styles`), sin framework de UI |
| i18n | Español / Inglés (`src/i18n/translations.ts`) |
| Lint | oxlint |
| Pruebas unitarias | Vitest (`src/**/*.test.ts`) |
| Pruebas end-to-end | Playwright (`e2e/`) |

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev                  # servidor de desarrollo
npm run build                # build de producción (tsc -b && vite build)
npm run lint                 # oxlint
npm test                     # pruebas unitarias (Vitest)
npm run test:e2e             # pruebas end-to-end (Playwright)
```

El proyecto Supabase vive en `supabase/` (migraciones en `supabase/migrations/`, función edge en `supabase/functions/`). Para aplicar migraciones al proyecto vinculado: `npx supabase db push`. Para desplegar una función: `npx supabase functions deploy <nombre> --use-api`.

## Documentación

- **[docs/arquitectura.md](docs/arquitectura.md)** — cómo está construido el sistema: la decisión de no tener backend propio, el mapa del repositorio, dónde vive la lógica de negocio, el modelo de permisos y las trampas conocidas. Empieza por aquí si vas a tocar el código.
- **[docs/manual-usuario.md](docs/manual-usuario.md)** — cómo se usa la aplicación, pantalla por pantalla. Base en texto para el manual con imágenes.

## Roles y permisos

Hay tres roles (`perfiles.rol`): **admin**, **mecanico**, **pintor**. Todo usuario pertenece a una sola sede (`sede_id`), excepto el admin, que puede cambiar de sede activa desde el selector en el header y así ver los datos de cualquier sucursal.

| Módulo | admin | mecánico / pintor |
|---|:---:|:---:|
| Dashboard, Clientes, Vehículos, Órdenes de Trabajo, Kanban | ✅ | ✅ |
| Finanzas, Nómina | ✅ | ❌ (redirigidos a `/`) |
| Configuración: perfil propio, idioma, tema | ✅ | ✅ |
| Configuración: sedes, empleados, capacidad | ✅ | ❌ |

La restricción de Finanzas/Nómina está tanto en las rutas de React (`ProtectedRoute adminOnly` en `App.tsx`) como en las políticas RLS de la base de datos — un mecánico no puede ver esos datos ni aunque manipule la app.

### Acciones destructivas (solo admin)

Un colaborador con sesión activa puede llamar la API de Supabase directamente: la clave anónima y todos los endpoints viajan en el bundle del navegador, así que esconder un botón en React no protege nada. Lo único que realmente sostiene el límite son las políticas RLS. Estas operaciones están reservadas al rol admin **en la base de datos**, no solo en la interfaz:

| Acción | Política |
|---|---|
| Eliminar un cliente (arrastra sus vehículos en cascada) | `clientes_delete` |
| Eliminar un vehículo | `vehiculos_delete` |
| Eliminar una orden de trabajo | `ordenes_trabajo_delete` |
| Borrar o sobrescribir fotos de inspección y firmas | `vehiculos_fotos_admin_delete` / `..._admin_update`, `firmas_admin_update` |
| Crear un perfil, o cambiar el rol o la sede de alguien | `perfiles_insert`, trigger `trg_perfil_privilegios` |

Un mecánico/pintor sí puede borrar sus propios avances de trabajo (`orden_avances_delete`), pero no los de un compañero.

Ver `supabase/migrations/20260908000000_destructive_action_hardening.sql`, que además documenta los dos caminos de escalada de privilegios que estaban abiertos (auto-ascenso a admin editando el propio perfil, y registro público creando un perfil admin) y cómo se cerraron.

## Módulos

### Login (`/login`)
Correo + contraseña contra Supabase Auth. No hay registro público: los usuarios se crean desde **Configuración** (solo admin). Selector de idioma en la pantalla de login.

### Dashboard (`/`)
Resumen del mes: órdenes activas, órdenes finalizadas, ingresos/egresos del mes, clientes nuevos, tasa de ocupación del taller (según la capacidad configurada en Configuración), gráfico de ingresos/egresos de los últimos 6 meses, y las órdenes recientes.

### Clientes (`/customers`)
Alta/edición/eliminación de clientes. Vista de perfil por cliente con sus vehículos y su historial de órdenes. Eliminar pide confirmación (bloqueado por la base de datos si el cliente tiene vehículos u órdenes asociadas).

### Vehículos (`/vehicles`)
Alta/edición/eliminación de vehículos, ligados a un cliente. Igual que Clientes, eliminar pide confirmación.

### Vehículos (`/vehicles`)
Alta y edición de vehículos con decodificación de VIN y validación de placa por estado. Las unidades compradas en subasta suelen llegar **sin placa**: la casilla *Sin placa* desactiva los campos de placa y estado, y guarda `NULL` en la base de datos — nunca un texto de relleno como "SIN PLACA", que aparecería en las búsquedas y se imprimiría en la orden como si fuera una placa real.

### Órdenes de Trabajo (`/work-orders`)
Un mecánico/pintor abre esta pantalla en **Mis Órdenes de Trabajo** (las que tiene asignadas). Debajo hay una sección plegada, **Otras Órdenes de Trabajo**, con el resto del tablero de su sede: la puede abrir para consultar una orden de un compañero o unirse a ella, pero no es lo primero que ve. El admin sigue viendo una sola lista con todo.

El módulo más grande. Crear una orden incluye: elegir cliente/vehículo (existente o nuevo, todo en el mismo formulario), tipo de trabajo (mecánica/pintura/combinado), nivel de gasolina, millas de ingreso (solo enteros ≥ 0, con un `CHECK` en la base de datos que respalda la validación del formulario), depósito inicial, fecha estimada de entrega, notas de inspección 360°, **hasta 6 fotos de inspección** (frontal, trasera, izquierda, derecha, interior, tablero), técnicos asignados, mano de obra y repuestos (con costo y precio de venta).

En el detalle de una orden se puede: cambiar el estatus, mover el % de avance, agregar/quitar líneas de mano de obra y repuestos (piden confirmación al eliminar), y agregar/quitar técnicos asignados. Los totales (`total_labor`, `total_repuestos`, `total_general`) se recalculan solos en la base de datos cada vez que cambian las líneas — nunca se calculan a mano en el frontend.

**Al marcar una orden como "Entregado" pide confirmación explícita**, porque ese cambio dispara automáticamente el registro del saldo pendiente como ingreso pagado en Finanzas (ver [Automatizaciones](#automatizaciones-importantes-triggers)).

### Kanban (`/kanban`)
Las mismas órdenes que "Órdenes de Trabajo", en formato tablero: `Recepción → En Proceso → Espera de Repuestos → Finalizado → Entregado`. Arrastrar una tarjeta cambia el estatus (misma confirmación al soltar en "Entregado"). Muestra el % de ocupación del taller.

### Finanzas (`/finance`, solo admin)
Cada movimiento manual puede vincularse opcionalmente a una orden de trabajo, para que un pago o una compra registrada por fuera del ciclo de la orden siga siendo rastreable hasta el trabajo al que pertenece. La columna *Orden vinculada* de la tabla lleva directo al detalle de esa orden.

Ingresos/egresos manuales, KPIs (ingresos, egresos, balance), gráfico mensual, exportar a CSV, y **importar estado de cuenta bancario en PDF** (nuevo — ver abajo). Los pagos ligados a órdenes (depósito inicial, pago final) aparecen aquí automáticamente, generados por triggers — no hay que registrarlos a mano.

**Importar Estado de Cuenta:** sube un PDF de Wells Fargo, se lee y estructura completamente en el navegador (nada se envía a ningún servicio externo de IA), se sugiere una categoría por palabras clave (editable en la tabla `finanzas_reglas_categorizacion`), se marca lo que parece transferencia interna o un posible duplicado de algo ya registrado, y el admin revisa/edita/excluye filas antes de confirmar la importación. Cada importación queda trazada (tabla `finanzas_importaciones`) y es reversible en bloque.

### Nómina (`/payroll`, solo admin)
Registrar pagos a empleados (salario base + bonos − deducciones). Cada pago genera automáticamente un egreso categoría "planilla" en Finanzas.

### Configuración (`/settings`, solo admin)
Perfil propio, idioma, tema (claro/oscuro), lista de sedes con su capacidad (usada para calcular % de ocupación) y empleados por sede, y **alta de nuevos empleados** (nombre, correo, contraseña temporal, rol, sede) — crea el usuario en Supabase Auth y su perfil vía una Edge Function (`create-employee`), sin salir de la app.

### Header (en todas las pantallas)
Búsqueda global (clientes, vehículos, órdenes — mínimo 2 caracteres), selector de sede (solo admin), toggle de idioma, y notificaciones de "órdenes que necesitan atención" (esperando repuestos, o en proceso con menos del 20% de avance).

Las notificaciones de un mecánico/pintor solo cubren las órdenes que tiene asignadas; el admin sigue viendo las de toda la sede. Lo mismo aplica al panel de Alertas y a "Órdenes Recientes" del Dashboard.

## Automatizaciones importantes (triggers)

Estas corren en la base de datos, no en el frontend — pasan igual sin importar por cuál pantalla se dispare el cambio:

- **Depósito inicial** → al crear una orden con depósito > 0, se registra como ingreso en Finanzas.
- **Entrega de orden** → al pasar el estatus a "entregado", se calcula el saldo pendiente (total de la orden menos lo ya cobrado) y se registra como ingreso.
- **Costo de repuestos** → al entregar la orden se registra además el **egreso** por lo que el taller pagó por las piezas (`cantidad × costo_unitario`, categoría `compra_repuesto`). Antes solo se registraba el ingreso, así que toda orden entregada sobrestimaba la ganancia por el costo completo de sus repuestos. Si después se agrega o edita un repuesto en una orden ya entregada, se registra únicamente la diferencia.
- **Totales de orden** → cada vez que se agrega/edita/borra mano de obra o un repuesto, se recalculan `total_labor`, `total_repuestos` y `total_general` de la orden.
- **Número de orden** → se genera de forma atómica (`ORD-2026-001`, `ORD-2026-002`, ...) para que dos órdenes creadas al mismo tiempo nunca choquen.
- **Nómina → Finanzas** → cada pago de nómina genera su egreso correspondiente.

El costo de cada repuesto se captura en la orden (columna *Costo Unitario*, junto al precio de venta). Es lo que el taller pagó, no lo que le cobra al cliente; si se deja en blanco, el egreso queda en cero y el margen de esa orden aparece inflado.

## Guía de pruebas manuales por módulo

No hay suite de pruebas automatizadas todavía (ver [recomendación](#recomendación-para-pruebas-automatizadas) abajo). Esta checklist sirve para probar la app a mano, entrando con un usuario **admin** y, donde se indique, con un usuario **mecánico/pintor** para confirmar los permisos.

### 1. Login y sesión
- [ ] Entrar con credenciales inválidas → mensaje de error, no entra.
- [ ] Entrar con un admin → ve Finanzas/Nómina/Configuración en el menú.
- [ ] Entrar con un mecánico/pintor → **no** ve esas tres opciones; si escribe `/finance` directo en la URL, lo regresa al Dashboard.
- [ ] Cambiar idioma en el login y confirmar que persiste tras entrar.
- [ ] Cerrar sesión y confirmar que vuelve a pedir login.

### 2. Clientes
- [ ] Crear cliente con datos válidos.
- [ ] Intentar guardar sin nombre/teléfono → bloqueado.
- [ ] Editar un cliente existente.
- [ ] Abrir el perfil de un cliente con vehículos/órdenes → se ven listados correctamente.
- [ ] Eliminar un cliente sin vehículos/órdenes → se borra.
- [ ] Intentar eliminar un cliente que sí tiene una orden asociada → debe fallar con un mensaje claro (no un error crudo de base de datos).
- [ ] Buscar un cliente por nombre o teléfono en la búsqueda global del header.

### 3. Vehículos
- [ ] Crear vehículo ligado a un cliente existente.
- [ ] Editar / eliminar un vehículo (con confirmación).
- [ ] Buscar un vehículo por placa o VIN en la búsqueda global.

### 4. Órdenes de Trabajo
- [ ] Crear una orden completa: cliente nuevo + vehículo nuevo, tipo de trabajo, depósito, técnico asignado, mano de obra, repuestos, fotos de las 6 zonas.
- [ ] Crear una orden con cliente y vehículo ya existentes.
- [ ] Verificar que el número de orden generado sea consecutivo y único.
- [ ] Abrir el detalle: agregar una línea de mano de obra y un repuesto → el total se actualiza solo.
- [ ] Eliminar una línea de mano de obra o repuesto → pide confirmación antes de borrar.
- [ ] Mover el % de avance con el slider.
- [ ] Cambiar el estatus a algo distinto de "Entregado" → sin confirmación, cambia directo.
- [ ] Cambiar el estatus a "Entregado" → **debe pedir confirmación**; al confirmar, revisar en Finanzas que se registró el ingreso del saldo pendiente.
- [ ] Asignar y luego quitar un técnico de la orden.
- [ ] Con un usuario mecánico/pintor: confirmar que puede ver y trabajar sus órdenes asignadas, pero no puede entrar a Finanzas a ver el dinero que generó.

### 5. Kanban
- [ ] Arrastrar una orden de una columna a otra (que no sea "Entregado") → cambia sin confirmación.
- [ ] Arrastrar una orden a "Entregado" → pide confirmación; si se cancela, la tarjeta vuelve a su columna original.
- [ ] Verificar que el % de ocupación mostrado coincida con "órdenes activas / capacidad de la sede".

### 6. Finanzas (solo admin)
- [ ] Crear una transacción manual (ingreso y egreso).
- [ ] Exportar a CSV y abrir el archivo — verificar que los montos y fechas sean correctos.
- [ ] **Importar estado de cuenta:** subir uno de los PDFs de Wells Fargo, revisar que las transacciones extraídas coincidan con las del PDF (fecha, descripción, monto, si es ingreso o egreso), confirmar que las transferencias internas y los posibles duplicados salgan desmarcados por default, asignar categoría a las filas sin clasificar, e importar. Verificar que las filas importadas aparezcan en la tabla de transacciones con el prefijo "Importado:".
- [ ] Confirmar que el balance/gráfico mensual se actualiza tras la importación.

### 7. Nómina (solo admin)
- [ ] Registrar un pago de nómina a un empleado.
- [ ] Verificar que el total pagado (salario + bonos − deducciones) sea correcto.
- [ ] Ir a Finanzas y confirmar que apareció el egreso "Nómina - <empleado>" automáticamente.

### 8. Configuración (solo admin)
- [ ] Cambiar la capacidad de una sede y verificar que el % de ocupación en Dashboard/Kanban cambie.
- [ ] Crear un nuevo empleado (mecánico o pintor) con correo/contraseña temporal.
- [ ] Cerrar sesión, entrar con ese nuevo usuario, y confirmar que solo ve los módulos que le corresponden a su rol.

### 9. Multi-sede
- [ ] Como admin, cambiar de sede en el selector del header y confirmar que Dashboard/Clientes/Vehículos/Órdenes/Kanban/Finanzas muestran solo los datos de la sede seleccionada.
- [ ] Como mecánico/pintor, confirmar que no ve el selector de sede y que solo ve los datos de su propia sede.

## Pruebas automatizadas

### Vitest (lógica pura, sin navegador)

```bash
npm test          # corre una vez
npm run test:watch  # modo watch mientras desarrollas
```

Cubre la lógica que no depende de la UI: `src/lib/bankStatementParser.test.ts` (reconstrucción de transacciones a partir de las coordenadas del PDF — incluye los casos reales que rompían el parser: encabezado de tabla partido en dos líneas, el "resumen de actividad" de la página 2 con las mismas palabras "Deposits"/"Withdrawals" en otra posición, montos con saldo diario pegado al lado, etc.), `src/lib/categorizationRules.test.ts` y `src/lib/errors.test.ts`.

`src/lib/bankStatementParser.entry.test.ts` cubre aparte el punto de entrada, `parseWellsFargoStatement()` — la función que la pantalla llama de verdad. Simula pdfjs con una capa de texto fabricada, así que corre sin PDF ni worker, y fija los casos en los que el importador tiene que *explicarse* en vez de quedarse callado: un PDF de otro banco, un PDF escaneado (sin capa de texto), y una página cuyo encabezado de columnas cambió.

### Vitest + jsdom (componentes de React)

Los archivos `*.test.tsx` renderizan un componente de verdad con `@testing-library/react`, dentro de los proveedores reales de idioma/tema/toast (`src/test/renderWithProviders.tsx`); `AuthContext` y `supabaseService` se simulan. Cada archivo declara `// @vitest-environment jsdom` en la primera línea, de modo que los tests de `src/lib` siguen corriendo en el entorno `node`, que es más rápido.

Estos existen sobre todo para atrapar una clase concreta de error que ya se presentó dos veces en producción: **un diálogo que falla en silencio**. El patrón era siempre el mismo — el handler hacía `return` sin decir nada, y los errores se escribían en el recuadro de error de la página, que queda *debajo* del overlay del modal (z-index 400). El resultado para quien lo usa es un botón muerto. Los toasts, en cambio, están en z-index 500 y sí se ven encima.

- `src/pages/Settings.employee.test.tsx` — el diálogo "Nuevo Empleado" (el que no dejaba asignar sede).
- `src/pages/Payroll.test.tsx` — "Nuevo Pago", que tenía el mismo defecto sin haber sido reportado.
- `src/components/LazyModal.test.tsx` — que un modal con carga diferida muestre algo de inmediato y que, si su chunk no descarga, el error quede dentro del diálogo en vez de tumbar la app entera.
- `src/pages/Finance.import.test.tsx` — que Finanzas efectivamente use ese envoltorio al abrir el importador.

El parser también se validó por separado corriendo la lógica completa (sin navegador, con `pdfjs-dist/legacy/build/pdf.mjs`) contra los dos estados de cuenta reales que sirvieron de muestra: la suma de ingresos y egresos extraídos coincide exactamente ($0.00 de diferencia) con los totales que reporta cada PDF (259 transacciones en el de junio, 241 en el de julio). Ese script era temporal y no quedó en el repo — si se agregan más bancos/formatos, vale la pena rehacer esa verificación con estados de cuenta reales antes de confiar en el parser.

### Playwright (end-to-end, en navegador)

```bash
npm run test:e2e      # corre toda la suite en Chromium, headless
npm run test:e2e:ui   # modo interactivo (útil para depurar un test)
```

`playwright.config.ts` levanta `npm run dev` automáticamente y corre los tests contra `http://localhost:5173`. Los tests viven en `e2e/`.

**Credenciales:** los tests que necesitan sesión iniciada se saltan solos si no hay credenciales configuradas (correrán 0 de N tests hasta que las agregues). Copia `.env.test.example` a `.env.test.local` (ya está en `.gitignore`, nunca se sube) y completa `E2E_ADMIN_EMAIL`/`E2E_ADMIN_PASSWORD` (y opcionalmente `E2E_MECHANIC_EMAIL`/`E2E_MECHANIC_PASSWORD` para los tests de permisos por rol).

**Importante — no hay un proyecto de Supabase separado para pruebas todavía.** Los tests corren contra el mismo proyecto que usa la app de verdad. Por eso:
- `e2e/login.spec.ts` solo lee datos (login, verificar qué menú ve cada rol) — no crea nada.
- `e2e/customer-crud.spec.ts` es un ejemplo de test que sí escribe datos: crea un cliente con el prefijo `PWTEST` (ver `e2e/fixtures.ts`) y lo borra al final del mismo test. Si un test así falla a la mitad, busca `PWTEST` en Clientes para limpiar a mano.
- Antes de escribir tests que creen órdenes de trabajo, transacciones financieras, etc., considera si vale la pena crear un proyecto de Supabase de pruebas aparte — evita cualquier riesgo de ensuciar datos reales del taller.
