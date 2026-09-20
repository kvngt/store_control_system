# Pruebas

Cómo probar Restorify completo: qué cubren las pruebas automatizadas, cómo
correrlas, y el plan manual para lo que ninguna prueba automatizada puede
comprobar (una cámara real, un push que llega a un teléfono, un video subido con
mala señal).

Las reglas que se prueban están en [reglas-de-negocio.md](reglas-de-negocio.md).
Si una prueba y ese documento no coinciden, uno de los dos está mal: hay que
decidir cuál y corregirlo.

---

## Índice

1. [Resumen: las capas](#1-resumen-las-capas)
2. [Pruebas automatizadas](#2-pruebas-automatizadas)
3. [Pruebas manuales y de seguridad](#3-pruebas-manuales-y-de-seguridad)

---

## 1. Resumen: las capas

| Capa | Herramienta | Qué prueba | Tamaño | Tiempo | Requiere |
|---|---|---|---|---|---|
| **Unitarias y componentes** | Vitest + Testing Library | Lógica pura y pantallas con la base simulada | 385 pruebas, 55 archivos | ~25 s | Nada |
| **Base de datos** | pgTAP (`supabase test db`) | RLS, triggers, dinero, comisiones, multimedia, avisos, permisos del técnico, portal, correos, presupuestos, reporte y hallazgos de la auditoría y de la revisión previa a producción contra un Postgres real | 212 aserciones, 8 archivos | ~1 min | Docker |
| **End-to-end** | Playwright | Flujos en un navegador real contra Supabase | 8 archivos, 74 casos (72 pasan, 2 se saltan) | 2–5 min | Credenciales de prueba |
| **Seguridad de la API** | `npm run qa:security` (Node) | Lo que haría alguien con la clave pública o un técnico con su sesión llamando la API directo | 65 casos con las cuentas de prueba (65 PASS · 0 SKIP), todos de solo lectura | ~15 s | Nada; con cuentas de prueba cubre más |
| **Plan manual** | Personas, dispositivos o un agente de IA | Flujos completos por rol, cámara, micrófono, push, iPhone, correos, diseño móvil | [plan-de-pruebas.md](plan-de-pruebas.md) | 40 min (humo) a 1 día (completo) | Cuentas de prueba; teléfonos para los casos H |

Por qué hacen falta todas: **Vitest simula la base**, así que no puede detectar una
política RLS equivocada o un trigger roto — eso lo detecta pgTAP. pgTAP prueba la base
por dentro, pero no lo que expone la API tal como está desplegada (permisos de las
funciones, buckets, edge functions) — eso lo hace `qa:security`. Ninguna toca un
navegador real; Playwright sí, pero no tiene cámara, micrófono ni un teléfono que
reciba push. Eso queda para el plan manual.

```bash
npm test                 # Vitest
npm run test:db          # pgTAP  (antes: npx supabase start)
npm run test:e2e         # Playwright
npm run test:e2e:ui      # Playwright interactivo, para depurar
npm run qa:security      # seguridad contra la API del proyecto de .env.local
```

---

## 2. Pruebas automatizadas

### 2.1 Vitest (unitarias y componentes)

```bash
npm test            # una vez
npm run test:watch  # mientras desarrollas
```

> Con la máquina cargada (Docker levantado, un build en paralelo), alguna prueba que
> simula clics puede pasarse del tiempo límite de 5 s y fallar sin que haya nada roto.
> Vuelve a correrla sola: si pasa, era eso.

Los archivos `*.test.ts` de `src/lib` corren en entorno `node`. Los `*.test.tsx`
declaran `// @vitest-environment jsdom` y renderizan con los proveedores reales
(`src/test/renderWithProviders.tsx`); se simulan `AuthContext` y los servicios.
`src/test/viewport.ts` simula `matchMedia` para probar la vista móvil.

| Área | Archivos | Qué fija |
|---|---|---|
| Fechas | `lib/dates.test.ts` | El día 1 cuenta en su mes; hoy y hoy + N días en calendario local (fecha estimada de entrega por defecto). **Corre en zona `America/Chicago` a propósito**: en UTC el error original es invisible |
| Errores, VIN y vehículos | `lib/errors`, `lib/vin`, `pages/Vehicles.noplate` | Traducción de errores de Postgres/Auth; un 42501 escrito por la base muestra su razón y uno de RLS el genérico; CHECK violado con mensaje propio; validación de VIN; vehículos sin placa guardan `null` y se muestran como "Sin placa" |
| Sesión | `context/AuthContext` | Una falla de red al releer el perfil o las sedes no saca al usuario; renovar el token no vuelve a pedir el perfil; una cuenta sin perfil sí queda fuera, **con el mensaje "no tiene acceso al taller"** y sin sesión guardada; **cerrar sesión o entrar otra persona vacía la caché de datos** |
| Recuperar contraseña | `pages/ResetPassword` | Enlace vencido o ya usado (y la ruta abierta sin enlace) muestra el aviso en vez del formulario; después de guardar, "Entrar al sistema" lleva al panel |
| Funciones de empleados | `services/users.service` | El motivo del rechazo de la función llega a la pantalla (no "non-2xx status code"); correo repetido en español; sin cuerpo se conserva el error original |
| Importación bancaria | `lib/bankStatementParser*`, `lib/categorizationRules`, `pages/finance/ImportStatementModal`, `pages/Finance.import` | Lectura del PDF de Wells Fargo, casos límite, categorización, carga diferida del importador |
| Finanzas | `pages/Finance.linkorder` | Vincular un movimiento a una orden; errores visibles en el diálogo |
| Multimedia | `lib/media/uploadQueue`, `lib/media/mime`, `services/media.service`, `features/media/MediaGallery` | Cola: no re-subir tras fallar la fila, no reintentar permisos, reanudar tras recarga solo para el mismo usuario, concurrencia, sin conexión; formatos MP4 primero; galería: miniaturas firmadas, publicar solo admin, borrar solo lo propio, progreso |
| Órdenes | `pages/WorkOrders.smoke`, `features/workOrders/*` (incluye `workOrderForm.schema`) | Lista (una sola versión según ancho), alta y validación, detalle; **técnico sin totales ni precios**, comisión estimada ($1,000 × 35 % ÷ 2 = $175), alta de técnico sin depósito/labor/repuestos; fotos de recepción comprimidas y su ciclo de memoria; avance solo con nota de voz; **firmar vuelve a leer la orden** (la firma autoriza lo cotizado); la lista para asignar solo trae personal de la sede de la orden |
| Kanban | `pages/KanbanBoard` | Mover tarjetas, confirmación al entregar |
| Clientes | `services/customers.service` | Conteos embebidos de vehículos y órdenes (`vehiculos(count)`), con cero para quien no tiene; los arreglos de conteo no quedan en el cliente |
| Listas completas | `services/support` | `fetchAll`: 2.500 filas en tres páginas, una sola consulta si caben en una, una página más si la anterior llegó llena, error de cualquier página |
| Panel y Finanzas | `services/dashboard.service` | Llama `resumen_panel` con el día y la zona del navegador, arma tarjetas y ocupación, capacidad cero sin dividir entre cero, un error de la base no se vuelve ceros, etiqueta del mes sin correrla por UTC |
| Borrados en la orden | `services/workOrders.service` | Quitar mano de obra, un repuesto o una asignación falla con mensaje si la base no borró nada (RLS), en vez de fingir éxito |
| Importación bancaria | `pages/finance/ImportStatementModal` | El lote y sus movimientos viajan en una sola llamada; si falla se borra el PDF subido |
| Notificaciones | `features/notifications/*`, `lib/push` | Campana: conteo, marcar leído, navegar, aviso en tiempo real con toast; traducción de avisos; detección de iPhone sin instalar; tarjeta de push: activar, permiso negado, prueba, desactivar |
| Configuración | `pages/Settings.employee` | Alta de empleado: errores visibles |
| Portal del cliente | `portal/CustomerPortal`, `lib/emailTemplates`, `lib/phone` | Estado, vehículo, multimedia publicada y cuenta; visor de video; WhatsApp y llamar; "pagado en su totalidad"; enlace vencido con teléfono; ruta sin token no consulta; reintento; **la baja se confirma con botón, nunca al abrir**; inglés. Plantillas: asunto por estado, fecha DATE sin correrse un día, **HTML escapado**, logo solo https y color solo hexadecimal, Reply-To solo si hay correo de contacto |
| Presupuestos | `features/workOrders/QuoteCard`, `features/workOrders/LaborTable`, `portal/CustomerPortal` (sección presupuesto), `lib/emailTemplates` | Tarjeta: se oculta sin nada que autorizar; enviar tras confirmar; aviso si el cliente no tiene correo; registrar autorización (todo marcado, se desmarca lo rechazado, vía y nombre); cancelar con confirmación; historial con vía, conteos y comentario. Tabla: total solo autorizado, "sin autorizar" aparte, insignias, línea pendiente sin controles. Portal: nada marcado, exige nombre, manda lo marcado **y todas las líneas vistas**, confirmación que sobrevive a la recarga, "el taller actualizó el presupuesto", lo no autorizado aparte. Correos: presupuesto solo con lo pendiente, constancia con lo autorizado y la vía |
| Enlace del cliente (admin) | `features/workOrders/CustomerLinkCard` | Crear enlace; visitas; WhatsApp con el enlace; cambiar enlace pide confirmación; historial de correos con estado y motivo; avisar novedades; sin correo o con baja no ofrece avisar |
| Reporte (fase 6) | `features/workOrders/ShareReportModal`, `lib/reportMedia`, `lib/emailTemplates` (plantilla `reporte`) | Enviar por correo desde el sistema y cerrar; sin correo o con baja el botón está apagado; WhatsApp al teléfono del cliente con el enlace; Abrir; Descargar PDF. El PDF lleva **solo fotos publicadas** (miniaturas), sin videos ni archivos internos, y firma la ruta de la firma. Correo del reporte con el enlace |
| Layout | `components/layout/BottomNav`, `components/LazyModal` | Barra inferior; modales diferidos |
| Datos remotos | `lib/queryClient` | Reintentos y claves de caché |

**Límites:** no hay navegador ni base reales. No prueba cámara, micrófono,
WebCodecs, IndexedDB real, service worker, ni que una política RLS diga lo que
creemos.

### 2.2 Base de datos (pgTAP)

Las reglas más importantes del sistema viven en RLS y triggers. Estas pruebas las
ejecutan contra un Postgres real con todas las migraciones aplicadas.

```bash
npx supabase start        # Postgres local con las migraciones (Docker)
npm run test:db           # = supabase test db
```

Cada archivo corre en una transacción que se revierte: no deja datos. Para actuar
como un usuario cambia al rol `authenticated` y fija el `sub` del JWT, igual que
PostgREST en cada petición.

**`supabase/tests/database/01_dinero_y_permisos.test.sql`** (27)

- Admin crea orden completa; total $1,200; depósito asentado.
- Técnico asignado: no ve `orden_montos` ni `orden_repuestos`; sí ve repuestos sin
  precio y la mano de obra; no puede agregar labor, entregar ni asignar a otro;
  sí puede finalizar.
- Entregar: cobrado $1,200, costo de repuestos $200, bolsa $350 = 2 × $175.
- Des-entregar: cobrado vuelve al depósito, costo revertido, comisiones fuera.
- Re-entregar: cobrado vuelve al total.
- Dos pagos iguales el mismo día; deshacer uno deja el egreso del otro.
- Tres técnicos: $350.00 exactos con diferencia de un centavo.

**`supabase/tests/database/02_multimedia_y_avisos.test.sql`** (21)

- Asignación → aviso al técnico con el número de orden; nadie más lo ve; solo se
  marca leído; nadie crea avisos por la API; el actor no se avisa a sí mismo.
- Avance y finalizado del técnico → avisos al admin; entrega → "comisión generada".
- Tablet compartida: el endpoint pasa a la última persona; solo se encola push a
  quien tiene dispositivo.
- Multimedia: recepción nace visible, avance nace interno aunque lo pida; una fila
  no apunta a otra orden; un técnico no asignado no sube.

**`supabase/tests/database/03_permisos_tecnico.test.sql`** (23)

- Técnico no asignado: ve la orden, pero no cambia estado, avance ni firma, ni
  agrega avances.
- Técnico asignado: cambia estado, avance y firma; la firma no apunta a otra
  orden; no cambia cliente ni millas; no mueve un avance ni pasa su asignación a
  otra persona.
- Orden entregada: el técnico no la saca de Entregado (la orden y su comisión
  siguen intactas) y no agrega ni borra avances; el admin sí puede sacarla.
- Los buckets viejos `vehiculos_fotos` y `firmas` ya no son públicos.

**`supabase/tests/database/04_portal_y_correos.test.sql`** (24)

- Firmar crea el enlace (64 hexadecimales) y **un** correo de recepción con 2 min de
  espera; volver a firmar no programa otro.
- Un técnico no lee enlaces, no crea enlaces ni llama `datos_portal`.
- Dos cambios de estatus seguidos quedan en un aviso con el último estado y 3 min.
- Un cliente sin correo no genera correos.
- `datos_correo` lee correo, estatus, enlace y vehículo actuales.
- El portal: solo multimedia visible; total $400, pagado $100, saldo $300; sin
  costos, comisiones, técnicos ni VIN completo; cuenta el acceso.
- La baja cancela lo pendiente y evita correos nuevos.
- Cambiar el enlace deja el anterior como `revocado`; entregar fija 90 días y
  sacar de Entregado lo quita.

**`supabase/tests/database/05_presupuestos.test.sql`** (31)

- Lo cotizado nace en borrador y no suma; la firma de recepción lo aprueba y deja un
  presupuesto "firma de recepción" como evidencia.
- Una línea nueva nace en borrador aunque se pida "aprobado"; ni un admin la aprueba
  con un UPDATE; un técnico no envía presupuestos ni los lee.
- Enviar: líneas pendientes, presupuesto 2 por $880, correo programado; una línea
  pendiente no se edita; no se entrega con el presupuesto abierto.
- El cliente responde desde su enlace: rechazo si no vio todas las líneas, nombre
  obligatorio, respuesta parcial (frenos y pastillas sí, pintura no), total $480,
  evidencia (vía, nombre, IP, comentario, total), aviso al mecánico "Autorizado: …
  No realizar: …", aviso al admin, correo del presupuesto omitido y constancia
  programada, no se responde dos veces.
- Corregir lo rechazado lo vuelve a borrador; cancelar devuelve a borrador; registrar
  por teléfono aprueba; al entregar, el costo de repuestos cuenta solo lo aprobado.

**`supabase/tests/database/06_reporte_web.test.sql`** (7)

- Un técnico no manda el reporte (42501).
- El admin lo manda a un cliente con correo (`encolado`); pulsarlo dos veces programa
  **un** solo correo.
- Un cliente sin correo no genera nada (`sin_correo`), pero el enlace se crea igual
  para compartirlo por WhatsApp.
- El bucket `reportes` ya no tiene políticas de INSERT ni UPDATE.

**`supabase/tests/database/07_auditoria.test.sql`** (25)

- Nadie con sesión ni sin ella ejecuta `reverse_order_delivery_finance`,
  `sync_order_commissions`, `sync_order_parts_expense` ni `recalculate_order_totals`;
  `anon` no ejecuta `pay_commissions`.
- Un técnico que inserta directo una orden "entregada", con avance, total, firma ajena,
  otro autor y número propio → nace en recepción, en cero, sin firma, con él como autor
  y con número del sistema; el contador no salta.
- Solo la primera firma autoriza: volver a firmar no aprueba lo agregado después, ni
  cuando la primera firma no tenía nada que aprobar.
- Mano de obra negativa, cantidad cero y precio negativo → rechazados (23514).
- No se borra una orden con comisiones pagadas; deshecho el pago, sí.
- Un aviso interrumpido 5 veces no se vuelve a tomar y queda en error.

**`supabase/tests/database/08_produccion.test.sql`** (18)

- `resumen_panel` con 1.500 movimientos del mes: suma los 1.500 (no 1.000), total histórico,
  seis meses, órdenes activas y por estatus, clientes nuevos; un técnico recibe cero en dinero.
- `importar_estado_cuenta`: un técnico no importa; un movimiento inválido hace fallar todo y
  no queda lote vacío; uno válido deja lote y movimientos juntos.
- Pagar otra vez las mismas comisiones falla (P0001).
- Una cuenta de Auth sin perfil no lee sedes.
- Existen los índices de las llaves foráneas más usadas; `create_work_order` tiene
  `search_path` fijo.
- El avance de una orden no puede pasar de 100.

Las pruebas 01 y 02 firman la recepción antes de entregar: desde la fase 5, sin
autorización no hay nada que cobrar ni comisión que generar.

> **Estado:** **176 aserciones en verde** en los 8 archivos con las 36 migraciones
> aplicadas desde cero, localmente y en CI. La primera corrida (158 aserciones en 7 archivos,
> 15 de septiembre de 2026, 35 migraciones) fue la primera vez que se ejecutaron. Esa primera
> corrida encontró tres errores en los datos de prueba, no en la base: en 04, un video sin
> duración ni avance que las restricciones de `orden_media` rechazan; en 05, un aviso
> buscado por fecha cuando dos se crean en la misma transacción (`NOW()` es igual). Las
> reglas de las fases 4, 5 y 6 además se probaron de punta a punta contra el proyecto
> enlazado (correo real a `delivered@resend.dev`, portal, agrupación, baja, presupuestos,
> reporte) con datos que luego se borraron.

Al agregar una migración que toque permisos o dinero, agrega aquí la prueba.

### 2.3 End-to-end (Playwright)

```bash
cp .env.test.example .env.test.local     # y completa credenciales
npm run test:e2e
```

> **Siempre contra un servidor local.** La suite escribe en el proyecto de Supabase
> real (no hay staging todavía), así que apuntar además el navegador al sitio
> publicado significa manejar producción con una orden de `npm`. Desde ahora
> `playwright.config.ts` **rechaza** un `E2E_BASE_URL` que no sea `localhost`, salvo
> que se defina también `E2E_ALLOW_REMOTE=1`; y solo levanta `npm run dev` cuando es
> local. Antes, con `E2E_BASE_URL=https://reinventa.shop`, `reuseExistingServer` veía
> que el sitio respondía y nadie se enteraba.

> **Las cuentas de prueba son datos reales.** Si alguien borra un empleado desde
> Configuración, las credenciales de `.env.test.local` dejan de servir y la mitad de
> la suite falla en el login, lo que se lee como un fallo del producto. Comprueba las
> cuentas antes de creer en una tanda roja.
`playwright.config.ts` levanta `npm run dev` y corre en Chromium. Las pruebas que
necesitan sesión **se saltan solas** si faltan credenciales:
`E2E_ADMIN_EMAIL/PASSWORD`, `E2E_MECHANIC_EMAIL/PASSWORD`, `E2E_PAINTER_EMAIL/PASSWORD`.

| Archivo | Casos | Cubre |
|---|---|---|
| `login.spec.ts` | 8 | Login inválido, menú por rol, "mis órdenes", sin botón eliminar, millas negativas |
| `qa-auth.spec.ts` | AUTH-01…52 | Sesión, recarga, logout, recuperación, rutas protegidas |
| `qa-rbac.spec.ts` | RBAC-01…50 | Accesos por rol, botones de borrar, selector de sede, panel sin dinero |
| `qa-customers-vehicles.spec.ts` | CUST, VEH, SEARCH | CRUD autolimpiante, validaciones, VIN, sin placa, búsqueda |
| `qa-workorders.spec.ts` | WORK-01…06 | Modal nueva orden, millas, filtros, detalle, botón PDF, Kanban, "Mover a" |
| `qa-finance-payroll.spec.ts` | FIN-01…04, PAY-01…03 | Finanzas y validaciones; **Comisiones**: pestañas, % inválido rechazado, técnico sin acceso |
| `qa-settings.spec.ts` | CFG-01…12 | Perfil, idioma, tema, sedes, alta de empleado |
| `customer-crud.spec.ts` | 1 | Ejemplo de prueba que crea y borra datos (prefijo `PWTEST`) |

Los identificadores de esta tabla (AUTH-, RBAC-, WORK-, FIN-, CFG-…) son los del código
de las pruebas e2e; no son los casos de [plan-de-pruebas.md](plan-de-pruebas.md), aunque
algunos prefijos coincidan.

> **Cuidado: corren contra el proyecto de `.env.local`**, que hoy es producción.
> Las que crean datos usan el prefijo `PWTEST` y los borran; si una falla a medias,
> busca `PWTEST` y limpia a mano. No agregues pruebas que entreguen órdenes o paguen
> comisiones hasta que exista staging ([deployment.md](deployment.md#2-entornos)).

Las pruebas **PAY-01/02** anteriores probaban la nómina por salario, eliminada en
la migración `20260912000000`; fueron reemplazadas por las de comisiones.

**Pendiente de cubrir con e2e** (cuando haya staging): técnico sin precios en el
detalle, multimedia con archivos de prueba, campana en tiempo real.

### 2.4 ¿Para qué hace falta Docker?

**Docker solo hace falta para correr Supabase en la computadora.** `npx supabase start`
levanta en contenedores lo mismo que hay en la nube: Postgres 17 con todas las
migraciones, Auth, Storage, Realtime y las edge functions. Sin Docker, eso no
existe localmente.

Se necesita para:

| Tarea | Comando | Por qué no se puede sin Docker |
|---|---|---|
| **Correr las pruebas de base de datos** (las 176 aserciones pgTAP) | `npm run test:db` | Necesitan un Postgres real donde crear datos y deshacerlos |
| **Probar que las migraciones aplican desde cero** | `npx supabase db reset` | Recrea la base local aplicando las 36 migraciones en orden: detecta una migración que solo funciona sobre la base actual |
| **Probar una migración antes de producción** | `npx supabase start` y luego la app contra la base local | Hoy cada migración se aplica directo al proyecto enlazado |
| Probar edge functions localmente | `npx supabase functions serve` | Corren en el contenedor de Supabase |

**No** hace falta para: la app, Vitest, Playwright, desplegar ni aplicar migraciones al
proyecto enlazado.

**Qué instalar (Windows):**

1. **Docker Desktop** (docker.com) con el motor **WSL 2** — esta máquina ya tiene WSL 2.
2. Recursos: unos **4 GB de RAM libres** y **10 GB de disco** para las imágenes.
3. Abrir Docker Desktop y dejarlo corriendo.

```bash
npx supabase start       # la primera vez descarga las imágenes (varios minutos)
npm run test:db          # 8 archivos pgTAP
npx supabase db reset    # opcional: recrear la base local desde cero
npx supabase stop        # al terminar
```

La primera vez `supabase start` descarga las imágenes (varios GB, 10–15 min); después
arranca en segundos. Si `supabase start` dice `docker: command not found` con Docker
Desktop abierto, la terminal se abrió antes de instalarlo: cierra VS Code por completo y
vuelve a abrirlo.

**Alternativas si no se instala Docker:**

- **Un proyecto de staging en Supabase** (el plan gratuito permite dos proyectos): las
  pruebas corren contra él sin tocar el proyecto real.
- **Permitir que las pruebas corran contra el proyecto enlazado** dentro de una
  transacción que se deshace al final (no deja datos). Hoy esa ejecución está
  bloqueada por permisos de la herramienta.

### 2.5 Seguridad contra la API (`qa:security`)

```bash
npm run qa:security             # tabla PASS / FAIL / SKIP
npm run qa:security -- --json   # para un agente o un CI
# `--alta` ya no existe: SEC-55 comprobaba que la orden de un técnico naciera corregida y
# ahora comprueba que no entre, así que la suite no escribe nada.
```

`scripts/qa/api-security.mjs` llama la API **desplegada** (la de `.env.local`) como lo
haría alguien con la clave pública de la app, un técnico con su propia sesión o un admin.
Cada caso espera un rechazo o una lista vacía. Es la capa que atrapó el hallazgo más
grave de la auditoría: funciones internas de dinero que pgTAP no probaba porque nadie
había pensado en llamarlas desde fuera ([auditoria-2026-09.md](auditoria-2026-09.md)).

- **Sin cuentas** corre los 18 casos sin sesión, incluidos SEC-17 (las 6 edge functions responden, no 404) y SEC-18 (el registro público está apagado).
- **Con cuentas** (`E2E_ADMIN_*` y `E2E_MECHANIC_*` de `.env.test.local`, o `QA_TECH_*` /
  `QA_ADMIN_*`) inicia sesión, busca por su cuenta una orden asignada al técnico, una
  ajena y una entregada, y corre los 53.
- Lo que no puede preparar lo marca **SKIP**. Termina con código 1 si hay un **FAIL**.

> Solo contra datos de prueba: si la base tiene un hueco, la petición que lo demuestra
> sí escribe (por ejemplo, entrega la orden).

Lista de casos: [plan-de-pruebas.md §5](plan-de-pruebas.md#5-seguridad-contra-la-api-sec).

---

## 3. Pruebas manuales y de seguridad

El plan manual (por módulo y por rol), las pruebas de seguridad contra la API, la matriz
de dispositivos, las regresiones y la lista antes de publicar están en
**[plan-de-pruebas.md](plan-de-pruebas.md)**, con un identificador por caso, prioridad y
si lo puede ejecutar un agente de IA o necesita una persona.

Si buscas una sección de la versión anterior de este documento:

| Antes (pruebas.md) | Ahora (plan-de-pruebas.md) |
|---|---|
| 3. Preparación | [2. Preparación](plan-de-pruebas.md#2-preparación) |
| 4.1 Acceso · 4.2 Sedes · 4.3 Clientes | ACC · SED · CLI |
| 4.4 Órdenes · 4.5 Dinero · 4.6 Comisiones | ORD · DIN · COM |
| 4.7 Multimedia · 4.8 Notificaciones | MED · NOT |
| 4.9 Finanzas · 4.10 Configuración | FIN · CFG |
| 4.11 Móvil · 4.12 PWA | MOV · PWA |
| 4.13 Portal · 4.14 Presupuestos · 4.15 Reporte | POR · PRE · REP |
| 5. Seguridad contra la API (peticiones 1–31) | [5. SEC](plan-de-pruebas.md#5-seguridad-contra-la-api-sec), casi todo automatizado en `npm run qa:security` |
| 6. Matriz de dispositivos | [6. DEV](plan-de-pruebas.md#6-matriz-de-dispositivos-dev) |
| 7. Regresiones | [7. Regresiones](plan-de-pruebas.md#7-regresiones) |
| 8. Antes de cada publicación | [8. Antes de cada publicación](plan-de-pruebas.md#8-antes-de-cada-publicación) |
| 9. Cómo reportar un error | [9. Reporte de resultados](plan-de-pruebas.md#9-reporte-de-resultados) |
