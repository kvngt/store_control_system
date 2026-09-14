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

1. [Resumen: las cuatro capas](#1-resumen-las-cuatro-capas)
2. [Pruebas automatizadas](#2-pruebas-automatizadas)
3. [Preparación para pruebas manuales](#3-preparación-para-pruebas-manuales)
4. [Plan de pruebas manual por módulo](#4-plan-de-pruebas-manual-por-módulo)
5. [Pruebas de seguridad contra la API](#5-pruebas-de-seguridad-contra-la-api)
6. [Matriz de dispositivos](#6-matriz-de-dispositivos)
7. [Regresiones: errores corregidos que no deben volver](#7-regresiones-errores-corregidos-que-no-deben-volver)
8. [Antes de cada publicación](#8-antes-de-cada-publicación)
9. [Cómo reportar un error](#9-cómo-reportar-un-error)

---

## 1. Resumen: las cuatro capas

| Capa | Herramienta | Qué prueba | Tamaño | Tiempo | Requiere |
|---|---|---|---|---|---|
| **Unitarias y componentes** | Vitest + Testing Library | Lógica pura y pantallas con la base simulada | 265 pruebas, 36 archivos | ~20 s | Nada |
| **Base de datos** | pgTAP (`supabase test db`) | RLS, triggers, dinero, comisiones, multimedia, avisos, permisos del técnico, portal, correos, presupuestos y reporte contra un Postgres real | 133 aserciones, 6 archivos | ~1 min | Docker |
| **End-to-end** | Playwright | Flujos en un navegador real contra Supabase | 8 archivos, ~73 casos | 2–5 min | Credenciales de prueba |
| **Manual** | Personas y dispositivos | Cámara, micrófono, push, subidas reales, iPhone, diseño móvil | Secciones 4–6 | 2–3 h completo | Teléfonos Android e iPhone |

Por qué hacen falta las cuatro: **Vitest simula la base**, así que no puede
detectar una política RLS equivocada o un trigger roto — eso lo detecta pgTAP.
Ninguna de las dos toca un navegador real; Playwright sí, pero no tiene cámara,
micrófono ni un teléfono que reciba push. Eso queda para la prueba manual.

```bash
npm test                 # Vitest
npm run test:db          # pgTAP  (antes: npx supabase start)
npm run test:e2e         # Playwright
npm run test:e2e:ui      # Playwright interactivo, para depurar
```

---

## 2. Pruebas automatizadas

### 2.1 Vitest (unitarias y componentes)

```bash
npm test            # una vez
npm run test:watch  # mientras desarrollas
```

Los archivos `*.test.ts` de `src/lib` corren en entorno `node`. Los `*.test.tsx`
declaran `// @vitest-environment jsdom` y renderizan con los proveedores reales
(`src/test/renderWithProviders.tsx`); se simulan `AuthContext` y los servicios.
`src/test/viewport.ts` simula `matchMedia` para probar la vista móvil.

| Área | Archivos | Qué fija |
|---|---|---|
| Fechas | `lib/dates.test.ts` | El día 1 cuenta en su mes. **Corre en zona `America/Chicago` a propósito**: en UTC el error original es invisible |
| Errores, VIN y vehículos | `lib/errors`, `lib/vin`, `pages/Vehicles.noplate` | Traducción de errores de Postgres/Auth; validación de VIN; vehículos sin placa guardan `null` y se muestran como "Sin placa" |
| Importación bancaria | `lib/bankStatementParser*`, `lib/categorizationRules`, `pages/finance/ImportStatementModal`, `pages/Finance.import` | Lectura del PDF de Wells Fargo, casos límite, categorización, carga diferida del importador |
| Finanzas | `pages/Finance.linkorder` | Vincular un movimiento a una orden; errores visibles en el diálogo |
| Multimedia | `lib/media/uploadQueue`, `lib/media/mime`, `services/media.service`, `features/media/MediaGallery` | Cola: no re-subir tras fallar la fila, no reintentar permisos, reanudar tras recarga solo para el mismo usuario, concurrencia, sin conexión; formatos MP4 primero; galería: miniaturas firmadas, publicar solo admin, borrar solo lo propio, progreso |
| Órdenes | `pages/WorkOrders.smoke`, `features/workOrders/*` (incluye `workOrderForm.schema`) | Lista (una sola versión según ancho), alta y validación, detalle; **técnico sin totales ni precios**, comisión estimada ($1,000 × 35 % ÷ 2 = $175), alta de técnico sin depósito/labor/repuestos; fotos de recepción comprimidas y su ciclo de memoria; avance solo con nota de voz |
| Kanban | `pages/KanbanBoard` | Mover tarjetas, confirmación al entregar |
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

Las pruebas 01 y 02 firman la recepción antes de entregar: desde la fase 5, sin
autorización no hay nada que cobrar ni comisión que generar.

> **Estado:** escritas y validadas con el parser de Postgres, pero **todavía no
> ejecutadas** con pgTAP (la máquina de desarrollo no tiene Docker). Las reglas de
> las fases 4, 5 y 6 sí se probaron de punta a punta contra el proyecto enlazado (correo real
> a `delivered@resend.dev`, portal, agrupación, baja, presupuestos, reporte) con datos que luego se borraron. La
> primera corrida puede requerir ajustes de sintaxis de pgTAP. Córrelas antes de
> confiar en ellas.

Al agregar una migración que toque permisos o dinero, agrega aquí la prueba.

### 2.3 End-to-end (Playwright)

```bash
cp .env.test.example .env.test.local     # y completa credenciales
npm run test:e2e
```

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
| **Correr las pruebas de base de datos** (las 133 aserciones pgTAP) | `npm run test:db` | Necesitan un Postgres real donde crear datos y deshacerlos |
| **Probar que las migraciones aplican desde cero** | `npx supabase db reset` | Recrea la base local aplicando las 34 migraciones en orden: detecta una migración que solo funciona sobre la base actual |
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
npm run test:db          # 6 archivos pgTAP
npx supabase db reset    # opcional: recrear la base local desde cero
npx supabase stop        # al terminar
```

La primera corrida de pgTAP puede pedir ajustes pequeños: las pruebas se escribieron y
se validaron con el parser de Postgres, pero nunca se han ejecutado.

**Alternativas si no se instala Docker:**

- **Un proyecto de staging en Supabase** (el plan gratuito permite dos proyectos): las
  pruebas corren contra él sin tocar el proyecto real.
- **Permitir que las pruebas corran contra el proyecto enlazado** dentro de una
  transacción que se deshace al final (no deja datos). Hoy esa ejecución está
  bloqueada por permisos de la herramienta.
---

## 3. Preparación para pruebas manuales

### Cuentas

Crea en Configuración → Personal, **en un entorno de prueba** si existe:

| Cuenta | Rol | Sede |
|---|---|---|
| `admin-prueba` | admin | Sede A |
| `mecanico-a` | mecánico | Sede A |
| `pintor-a` | pintor | Sede A |
| `mecanico-a2` | mecánico | Sede A (para "técnico no asignado") |
| `mecanico-b` | mecánico | Sede B (para aislamiento entre sedes) |

### Dispositivos

- **Android** con Chrome actualizado.
- **iPhone** con iOS 16.4 o posterior, Safari. Agrega la app a la pantalla de
  inicio para las pruebas de push.
- **Computadora** con Chrome (y Safari o Firefox si se puede).

### Datos

- Dos clientes con un vehículo cada uno por sede. Un VIN válido de prueba:
  `1HGCM82633A004352`.
- Un video de galería de más de 2 minutos y uno de ~30 s grabado con la cámara
  nativa del iPhone (HEVC).
- Un estado de cuenta real de Wells Fargo en PDF (para Finanzas).
- Todo lo que crees, con el prefijo `PRUEBA` en el nombre, para limpiarlo después.
- Para correos: un cliente con **tu** correo (para ver el correo de verdad) y otro
  con `delivered@resend.dev` (Resend lo acepta y no lo entrega a nadie).

### Mientras pruebas

Deja abiertas DevTools → Console en la computadora. Cualquier error rojo durante
una prueba que "pasó" es un hallazgo.

---

## 4. Plan de pruebas manual por módulo

Formato: **acción → resultado esperado**. Marca cada casilla. Quién ejecuta:
**A** admin, **M** mecánico asignado, **N** técnico no asignado.

### 4.1 Acceso y sesión

- [ ] Credenciales inválidas → mensaje de error, se queda en login.
- [ ] **A** entra → ve Finanzas, Comisiones y Configuración completa.
- [ ] **M** entra → no ve Finanzas ni Comisiones; `/finance` y `/payroll` en la URL lo regresan al panel.
- [ ] "¿Olvidaste tu contraseña?" → llega el correo; el enlace abre `reinventa.shop/reset-password` (no `localhost`); la nueva contraseña funciona.
- [ ] Recargar la página → sigue con sesión.
- [ ] Cerrar sesión → vuelve a login; con push activo, ese dispositivo deja de recibir avisos de esa cuenta (ver 4.8).

### 4.2 Sedes

- [ ] **A** cambia de sede → panel, clientes, órdenes, Kanban y Finanzas muestran solo esa sede.
- [ ] **mecanico-b** no ve clientes, vehículos ni órdenes de la Sede A (tampoco en la búsqueda global).
- [ ] **A** cambia el porcentaje de comisión de la sede → las comisiones pendientes se recalculan; las pagadas no.
- [ ] Borrar una sede de prueba → muestra el impacto antes de confirmar; el personal se mueve a otra sede.

### 4.3 Clientes y vehículos

- [ ] Crear cliente sin nombre o teléfono → bloqueado con mensaje en el campo.
- [ ] VIN de 17 caracteres → marca, modelo y año se llenan solos.
- [ ] VIN con I, O o Q → aviso.
- [ ] "Sin placa" → campos de placa desactivados; la lista muestra "Sin placa".
- [ ] **M** no ve botón de eliminar en clientes ni vehículos.
- [ ] Eliminar un cliente con órdenes (**A**) → mensaje claro de que no se puede.

### 4.4 Órdenes de trabajo

**Alta por admin**

- [ ] Cliente nuevo + vehículo nuevo + 6 fotos de recepción + depósito $200 + mano de obra $1,000 + repuesto 2 × $100 + dos técnicos → se crea sin esperar a que suban las fotos; la bandeja muestra el progreso.
- [ ] El número es consecutivo (`ORD-AAAA-###`).
- [ ] Mientras una foto se comprime, el botón dice "Procesando…" y no deja crear.
- [ ] Millas negativas → rechazado.

**Alta por técnico**

- [ ] **M** abre Nueva orden → no aparecen depósito, mano de obra ni repuestos.
- [ ] **M** crea la orden → queda asignado a sí mismo; **A** recibe "Recepción registrada · Falta cotizar".

**Detalle como técnico asignado (M)**

- [ ] No ve la tarjeta de totales, el depósito ni la tabla de repuestos con precios.
- [ ] Ve "Descripción de repuestos" con piezas y cantidades, sin ningún `$`.
- [ ] Ve la mano de obra, sin botones para editarla, con el aviso "la cotiza administración".
- [ ] Ve **Tu comisión estimada** con la cuenta: mano de obra × % ÷ técnicos.
- [ ] No ve los botones "Descargar PDF" ni "Enviar reporte".
- [ ] El selector de estado no ofrece "Entregado".
- [ ] Mueve el avance en cualquier estado no cerrado.
- [ ] Captura la firma del cliente; se ve al recargar.

**Detalle como técnico no asignado (N)**

- [ ] Aviso de solo lectura y botón "Unirme a la orden".
- [ ] Al unirse, **A** no recibe aviso (no hay evento para eso) y **N** pasa a ver la orden como asignado.
- [ ] En una orden **entregada** el botón de unirse no aparece.

**Estados (A)**

- [ ] Elegir "Entregado" y cancelar el aviso → el selector vuelve al estado real.
- [ ] Entregar → pide confirmación; Finanzas cambia (ver 4.5).
- [ ] Sacar de Entregado → pide confirmación advirtiendo la reversión.
- [ ] Reabrir una orden finalizada → se borra la fecha de finalización.

**Kanban**

- [ ] Computadora: arrastrar entre columnas.
- [ ] Teléfono: selector "Mover a"; cancelar la confirmación deja el selector como estaba.
- [ ] **M** en su tarjeta: el selector no ofrece "Entregado". En tarjetas ajenas no hay selector.

### 4.5 Dinero automático

Con la orden de 4.4 (depósito $200, mano de obra $1,000, repuestos 2 × $100) y
dos técnicos asignados. En Finanzas, filtra por la orden:

| Paso | Acción (A) | Movimientos esperados | Comisiones |
|---|---|---|---|
| 1 | Crear y **firmar la recepción** (la firma autoriza la mano de obra y los repuestos) | +$200 "Depósito inicial" | — |
| 2 | Entregar | +$1,000 "Pago final", −$200 "Costo de repuestos" | 2 × $175.00 |
| 3 | Agregar mano de obra $100 (orden entregada): queda **sin autorizar**, nada cambia. Luego **Registrar autorización** → en persona | +$100 "Ajuste por cargo adicional" (al autorizar) | 2 × $192.50 |
| 4 | Sacar de Entregado | −$1,100 "Reversión de entrega", +$200 "Reversión de costo de repuestos" | ninguna |
| 5 | Volver a entregar | +$1,100 "Pago final", −$200 "Costo de repuestos" | 2 × $192.50 |

- [ ] Tras el paso 5, la suma de `pago_cliente` de la orden es **$1,300**.
- [ ] Intentar cambiar el depósito de la orden entregada → rechazado.
- [ ] Un movimiento manual con fecha del **día 1** del mes → cuenta en ese mes en el panel (no en el anterior).
- [ ] Un movimiento capturado **después de las 7 p. m.** tiene la fecha de hoy, no la de mañana.
- [ ] Borrar la orden (A) → desaparecen sus movimientos automáticos; los importados del banco se quedan.

### 4.6 Comisiones

- [ ] Tres técnicos en una orden de mano de obra $1,000 al 35 % → $116.67 + $116.67 + $116.66.
- [ ] **Pagar saldo** con cheque sin número ni foto → pide uno de los dos.
- [ ] Pagar a dos técnicos $192.50 el mismo día → dos egresos "Pago de comisiones".
- [ ] **Deshacer** el pago de uno → sus comisiones vuelven a pendientes y **solo su** egreso desaparece.
- [ ] La foto del cheque se abre con un enlace temporal.
- [ ] Porcentaje fuera de 0–100 → rechazado.

### 4.7 Multimedia

Ver la matriz de dispositivos (sección 6) para repetir en cada teléfono.

**Captura**

- [ ] **Foto** abre la cámara trasera; la foto aparece como miniatura.
- [ ] **Video**: la cámara abre a pantalla completa; el contador corre; en los últimos 15 s se pone rojo; a los 2:00 se detiene solo; "Repetir" y "Usar video" funcionan; cambiar de cámara funciona antes de grabar.
- [ ] **Nota de voz**: graba, se escucha antes de usarla, se detiene a los 2:00.
- [ ] **Galería** con un video de iPhone de 30 s → "Convirtiendo video N %" y luego la miniatura. Peso final ~5–6 MB.
- [ ] Galería con un video de más de 2 min → mensaje "dura más de 2 minutos".
- [ ] Negar el permiso de cámara → mensaje que explica cómo activarlo.

**Avances**

- [ ] Un avance con solo una nota de voz (sin texto) → se guarda.
- [ ] Un avance con texto, 3 fotos y un video → aparece de inmediato con los archivos "subiendo".

**Subida**

- [ ] Bandeja: "N de M archivos subidos", progreso por archivo.
- [ ] Modo avión a mitad de un video → la bandeja dice "Sin conexión"; al volver la red sigue sola.
- [ ] Recargar la página a mitad de un video → al volver, la subida continúa (no empieza de cero en videos > 6 MB).
- [ ] Cerrar la pestaña con subidas pendientes → el navegador pregunta si salir.

**Visibilidad y borrado**

- [ ] Fotos de recepción muestran "Visible al cliente"; archivos de avance, "Interno".
- [ ] **A** alterna la visibilidad; **M** solo ve la etiqueta.
- [ ] **M** borra un archivo suyo; no puede borrar uno de otra persona.
- [ ] En una orden entregada **M** no puede subir archivos.

**Reproducción**

- [ ] Abrir un video → se reproduce en el visor; flechas para pasar al siguiente.
- [ ] Un video grabado en Android se reproduce en iPhone y viceversa.
- [ ] Una orden con varios videos abre rápido (en la cuadrícula solo cargan miniaturas).

**Límite de Storage**

- [ ] Un video de 2 minutos grabado con el botón **Video** → sube completo (pesa ~24 MB).
- [ ] Elegir de la galería un video de más de 50 MB que el teléfono no pueda convertir → mensaje "pesa más de 50 MB", no se intenta subir.

### 4.8 Notificaciones y push

**Campana (app abierta)**

- [ ] **A** asigna a **M** → en el navegador de **M**, sin recargar: el contador sube y aparece un toast.
- [ ] Tocar el aviso → abre la orden y lo marca leído.
- [ ] "Marcar todo leído" → contador en cero.
- [ ] Cambiar el idioma a inglés → los avisos se leen en inglés.

**Eventos** (verifica quién recibe y quién no)

- [ ] Asignar → técnico. Quitar → técnico ("Ya no estás asignado").
- [ ] **M** registra una recepción → admins.
- [ ] **M** agrega un avance → admins, un solo aviso aunque traiga varios archivos.
- [ ] **M** finaliza → admins ("Lista para entregar").
- [ ] **A** entrega → cada técnico ("Comisión generada" con su monto).
- [ ] Quien hace la acción **nunca** recibe su propio aviso.

**Push — Android**

- [ ] Configuración → "Activar en este dispositivo" → permiso → "Activas en este dispositivo".
- [ ] "Enviar prueba" → llega en segundos.
- [ ] Con Chrome **cerrado**, asignar una orden → llega; tocarla abre la orden.
- [ ] En Configuración → Usuarios (**A**), el técnico muestra la campana con "1".

**Push — iPhone**

- [ ] En Safari (sin instalar) la tarjeta explica los 3 pasos para agregar a inicio.
- [ ] Agregar a inicio, abrir desde el ícono → la tarjeta ofrece activar.
- [ ] Activar, "Enviar prueba", y con la app cerrada asignar una orden → llega.

**Tablet compartida**

- [ ] **M** activa push en un dispositivo, cierra sesión; entra **pintor-a** en el mismo → la asignación de **M** ya no llega a ese dispositivo; la de **pintor-a** sí.

**Sin configuración**

- [ ] Build sin `VITE_VAPID_PUBLIC_KEY` → la tarjeta dice "no están configuradas en este servidor"; la campana funciona igual.

### 4.9 Finanzas

- [ ] Movimiento manual de ingreso y de egreso; monto negativo rechazado.
- [ ] Vincular un movimiento a una orden → la columna lleva a esa orden.
- [ ] Exportar CSV → montos y fechas correctas.
- [ ] Importar un estado de cuenta de Wells Fargo → las sumas coinciden con el PDF; transferencias internas y posibles duplicados llegan desmarcados.
- [ ] Importar **el mismo** archivo otra vez (aunque tenga otro nombre) → aviso rojo con la fecha anterior.
- [ ] Revertir la importación → desaparecen solo sus movimientos.
- [ ] PDF escaneado u otro banco → mensaje que lo explica.

### 4.10 Configuración

- [ ] Perfil: foto, nombre, teléfono; idioma y tema persisten tras recargar.
- [ ] Alta de empleado: sin nombre, contraseña < 6 o correo repetido → error visible dentro del diálogo.
- [ ] **M** en Configuración: perfil, idioma, tema y notificaciones; nada de sedes ni personal.
- [ ] Un técnico no puede cambiarse de rol ni de sede (ver sección 5).

### 4.11 Diseño móvil (teléfono)

- [ ] Tocar cualquier campo de texto **no hace zoom** (iPhone).
- [ ] Lista de órdenes en tarjetas **con separación** entre ellas.
- [ ] Barra inferior no tapa la última tarjeta y no queda bajo el indicador de inicio del iPhone.
- [ ] Menú ☰: se abre, la página de atrás no se desplaza, Escape/tocar fuera lo cierra, "Cerrar sesión" visible sin desplazar.
- [ ] Lupa del encabezado → búsqueda a pantalla completa; Escape la cierra.
- [ ] Tablas de mano de obra, repuestos, historial del cliente y comisiones → tarjetas, sin desplazamiento horizontal.
- [ ] Kanban: deslizar columnas encaja una por pantalla; "Mover a" en fila con su etiqueta.
- [ ] Modales (nueva orden) a pantalla completa con Guardar/Cancelar visibles.
- [ ] Bandeja de subidas por encima de la barra inferior.
- [ ] Campana: la lista ocupa el ancho de la pantalla.
- [ ] Selector de sede en el menú (admin): ícono y campo en la misma fila.

### 4.12 App instalable (PWA)

- [ ] Android: Chrome ofrece "Instalar app"; abre sin barra de navegador, con el ícono dorado.
- [ ] iPhone: "Agregar a inicio" usa el ícono y el nombre "Restorify"; el encabezado no queda bajo la barra de estado.
- [ ] Tras publicar una versión nueva, la app instalada muestra la versión nueva al reabrir (no hay caché).

### 4.13 Portal del cliente y correos

Detalle de reglas en [portal-y-correos.md](portal-y-correos.md). Cliente de prueba
con **tu correo**.

**Enlace**

- [ ] Orden sin firma: la tarjeta **Enlace del cliente** (admin) dice que se crea al firmar y ofrece **Crear enlace**.
- [ ] **M** firma la recepción → la tarjeta muestra el enlace sin recargar.
- [ ] **M** no ve la tarjeta.
- [ ] **Copiar** → pegar en otro navegador (sin sesión) abre el reporte.
- [ ] **Enviar por WhatsApp** abre WhatsApp al teléfono del cliente con el mensaje y el enlace.
- [ ] Tras abrirlo, la tarjeta dice "Abierto 1 veces · última vez hace …".
- [ ] **Cambiar enlace** → confirmar → el enlace viejo muestra "Este enlace ya no está activo" con botón para llamar.
- [ ] **Desactivar** → el enlace muestra lo mismo; **Crear enlace** vuelve a generar uno.
- [ ] Entregar la orden → la tarjeta dice "Disponible hasta el …" (90 días).

**Correos**

- [ ] ~2 minutos después de firmar llega "Recibimos su …" con el nombre del taller como remitente; el botón abre el reporte.
- [ ] En la tarjeta, el correo pasa de **Programado** a **Enviado**.
- [ ] Mover la orden a En proceso → a los ~3 min llega "Estamos trabajando en su …".
- [ ] Mover a Espera de repuestos y de vuelta a En proceso en menos de 3 min → no llega nada nuevo; la tarjeta dice **No enviado** "ya recibió el aviso de este estado".
- [ ] Finalizado → "Su … está listo"; Entregado → "Gracias por su visita".
- [ ] Publicar una foto de avance y **Avisar novedades** → al minuto llega "Novedades de su …".
- [ ] Responder el correo → llega al correo de contacto de la sede (si está configurado); sin él, el pie no ofrece responder.
- [ ] Cliente sin correo: la tarjeta sugiere WhatsApp y no hay botón de avisar; no se generan correos.
- [ ] Correo mal escrito en el formulario de cliente (`marta@`) → mensaje dentro del diálogo, no se guarda.
- [ ] El correo se ve bien en Gmail (teléfono y web) y en Outlook; no cae en spam.

**Portal (en un teléfono, sin sesión)**

- [ ] Carga rápido con datos móviles; DevTools → Network: no se descargan `appStart-*.js` ni Sentry.
- [ ] Muestra estado con los cuatro pasos, avance, fecha estimada, vehículo con últimos 6 del VIN.
- [ ] Solo aparecen las fotos y videos **publicados**; un archivo interno no aparece. Publicarlo y recargar → aparece.
- [ ] Un video se reproduce en el visor; una nota de voz se reproduce.
- [ ] La cuenta coincide con la orden: mano de obra, repuestos a precio de venta, depósito, pagado, saldo.
- [ ] No aparecen nombres de técnicos, comisiones ni el texto de los avances.
- [ ] **Llamar** marca al taller; **WhatsApp** aparece solo si la sede tiene WhatsApp.
- [ ] Botón de idioma → inglés; al recargar sigue en inglés.
- [ ] Pie del correo "No quiero recibir estos correos" → la página resalta la sección y **no** da de baja hasta tocar el botón.
- [ ] **Dejar de recibir correos** → la ficha del cliente muestra la casilla desmarcada; un cambio de estado ya no genera correo. **Volver a recibir** lo reactiva.
- [ ] `/r/abc` → "Enlace no válido".
- [ ] Ver el código fuente de la página: `<meta name="robots" content="noindex, nofollow">` y `referrer` en `no-referrer`.

### 4.14 Presupuestos

Detalle en [presupuestos.md](presupuestos.md). Orden con cliente de prueba con **tu
correo** y un técnico asignado (**M**).

**Borradores y firma**

- [ ] Alta con mano de obra $1,000 → antes de firmar, la línea dice **Sin autorizar** y el total de la orden es $0.
- [ ] Firmar la recepción → la insignia desaparece (autorizada), el total pasa a $1,000; la tarjeta **Presupuesto** muestra "Presupuesto 1 · con la firma de recepción".
- [ ] Agregar "Pintura $500" → **Sin autorizar**; el total no cambia; la tabla muestra "Sin autorizar $500" aparte.

**Enviar y responder desde el enlace**

- [ ] **Enviar presupuesto al cliente** → confirmar → la línea pasa a **Esperando al cliente** y no tiene lápiz ni papelera; la orden muestra **Esperando autorización** en la lista y el tablero (también para **M**).
- [ ] Llega el correo "Presupuesto para su …" con la lista y el total; el botón abre el portal con la sección **Presupuesto por autorizar** arriba.
- [ ] En el portal nada viene marcado; "Autorizar lo marcado" está apagado hasta marcar algo y escribir el nombre.
- [ ] Mientras el cliente tiene el portal abierto, el admin agrega otra línea y **Agregar al presupuesto y reenviar**; el cliente responde con la página vieja → "El taller actualizó el presupuesto…" y ve la línea nueva.
- [ ] Autorizar una línea y dejar otra sin marcar, con comentario → "Gracias. Guardamos su respuesta…"; la sección desaparece; en la cuenta aparece lo no autorizado tachado y "Sus autorizaciones".
- [ ] Llega el correo "Recibimos su respuesta" con lo autorizado y el total.
- [ ] **M** recibe "Trabajos autorizados · ORD-… Autorizado: … No realizar: …" (campana y push); en su detalle la línea rechazada dice **No realizar**.
- [ ] El admin recibe "El cliente respondió el presupuesto · … Autorizó 1 de 2 ($…)" con el comentario.
- [ ] La tarjeta **Presupuesto** muestra la respuesta: vía "desde su enlace", nombre, conteos y comentario.
- [ ] El total de la orden suma solo lo autorizado.

**Registrar por teléfono, cancelar, entregar**

- [ ] Agregar dos líneas → **Registrar autorización** → todo viene marcado; desmarcar una, elegir "Por teléfono" → **Registrar** → una autorizada, otra **No realizar**; al cliente le llega "Registramos su autorización · … por teléfono".
- [ ] Editar la línea rechazada (otro precio) → vuelve a **Sin autorizar**.
- [ ] Enviar presupuesto y luego **Cancelar presupuesto** → la línea vuelve a **Sin autorizar**; el portal ya no pide autorización.
- [ ] Con un presupuesto enviado, intentar **Entregar** → mensaje "tiene un presupuesto esperando respuesta"; la orden no cambia.
- [ ] Entregar con un repuesto **sin autorizar** → Finanzas no registra su costo.
- [ ] Al día siguiente (15:00 UTC) de un presupuesto enviado sin respuesta, los admins reciben "Presupuesto sin respuesta".

### 4.15 Reporte

Detalle en [portal-y-correos.md](portal-y-correos.md#10-el-reporte-web). Orden con cliente
de prueba con **tu correo**, fotos de recepción, un avance con una foto publicada y otra
interna, y una nota en el avance.

**Enviar reporte (A)**

- [ ] En el detalle están **Descargar PDF** y **Enviar reporte**; **M** no ve ninguno.
- [ ] **Enviar reporte** en una orden sin firma → la ventana muestra el enlace (se creó en ese momento) y la tarjeta **Enlace del cliente** lo muestra sin recargar.
- [ ] La ventana dice cuándo vence el enlace (90 días después de entregar).
- [ ] **Enviar por correo** → aviso "Reporte enviado", la ventana se cierra; en la tarjeta aparece el correo **Programado** y al minuto **Enviado**.
- [ ] Llega el correo con el botón que abre el portal; el remitente es el nombre del taller.
- [ ] Pulsar **Enviar por correo** dos veces seguidas en menos de un minuto (reabriendo la ventana) → llega **un** correo.
- [ ] **Enviar por WhatsApp** abre WhatsApp al teléfono del cliente con el mensaje y el enlace.
- [ ] **Copiar enlace** → pegar en otro navegador sin sesión abre el reporte; **Abrir** abre el portal en otra pestaña.
- [ ] Cliente sin correo, o que se dio de baja → **Enviar por correo** está apagado con el motivo; WhatsApp sigue disponible.

**Descargar PDF (A)**

- [ ] Se descarga sin subir nada (DevTools → Network: ninguna petición a `storage/v1/object/reportes`).
- [ ] Lleva las fotos de recepción **publicadas** y la foto de avance publicada, agrupada por día; **no** lleva la foto interna, videos, el texto del avance ni los técnicos asignados.
- [ ] Los montos coinciden con el portal (solo lo autorizado); en una orden entregada el saldo es $0 con "Pagado al entregar".
- [ ] El enlace del reporte aparece en el PDF y se puede tocar.
- [ ] Con 20+ fotos publicadas el PDF sigue pesando pocos MB (usa miniaturas).

---

## 5. Pruebas de seguridad contra la API

La interfaz esconde botones; la base es la que protege. Estas pruebas hacen lo
que haría un técnico con conocimientos técnicos: llamar la API con su propia
sesión.

**Obtener el token de un técnico:** inicia sesión como **M** en Chrome → DevTools →
Application → Local Storage → `sb-<ref>-auth-token` → copia `access_token`.

```bash
SB=https://<ref>.supabase.co
ANON=<clave anónima>
TOKEN=<access_token del técnico>
ORDEN=<id de una orden de su sede>
H=(-H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
```

| # | Petición | Esperado |
|---|---|---|
| 1 | `curl "$SB/rest/v1/orden_montos?select=*" "${H[@]}"` | `[]` |
| 2 | `curl "$SB/rest/v1/orden_repuestos?select=*" "${H[@]}"` | `[]` |
| 3 | `curl "$SB/rest/v1/finanzas_movimientos?select=*" "${H[@]}"` | `[]` |
| 4 | `curl -X POST "$SB/rest/v1/orden_labor" "${H[@]}" -d "{\"orden_id\":\"$ORDEN\",\"descripcion\":\"x\",\"costo\":9999}"` | Error `42501` |
| 5 | `curl -X PATCH "$SB/rest/v1/ordenes_trabajo?id=eq.$ORDEN" "${H[@]}" -d '{"estatus":"entregado"}'` | Error `42501` "Sólo un administrador puede marcar…" |
| 6 | `curl -X PATCH "$SB/rest/v1/ordenes_trabajo?id=eq.$ORDEN" "${H[@]}" -d '{"total_labor":99999}'` | Error `42501` "Los totales … los calcula el sistema" |
| 7 | `curl -X PATCH "$SB/rest/v1/perfiles?id=eq.<su id>" "${H[@]}" -d '{"rol":"admin"}'` | Error `42501` |
| 8 | `curl -X POST "$SB/rest/v1/orden_asignaciones" "${H[@]}" -d "{\"orden_id\":\"$ORDEN\",\"usuario_id\":\"<otro técnico>\",\"tipo_tarea\":\"mecanica\"}"` | Error `42501` |
| 9 | `curl -X PATCH "$SB/rest/v1/orden_media?orden_id=eq.$ORDEN" "${H[@]}" -H "Prefer: return=representation" -d '{"visible_cliente":true}'` | `[]` (ninguna fila cambiada) |
| 10 | `curl -X POST "$SB/rest/v1/rpc/claim_outbox" "${H[@]}" -d '{}'` | Error de permiso o función no encontrada |
| 11 | `curl -X POST "$SB/rest/v1/notificaciones" "${H[@]}" -d '{"usuario_id":"<otro>","tipo":"x","titulo":"x"}'` | Error `42501` |
| 12 | `curl "$SB/rest/v1/notificaciones?select=*" "${H[@]}"` | Solo avisos del propio técnico |
| 13 | `curl "$SB/rest/v1/ordenes_trabajo?select=id&sede_id=neq.<su sede>" "${H[@]}"` | `[]` |
| 14 | Con la clave anónima **sin** token: `curl "$SB/rest/v1/clientes?select=*" -H "apikey: $ANON"` | `[]` |
| 15 | `curl -X POST "$SB/functions/v1/process-outbox"` sin cabecera secreta | `401` |
| 16 | Token de un técnico **no asignado** a `$ORDEN`: `curl -X PATCH "$SB/rest/v1/ordenes_trabajo?id=eq.$ORDEN" "${H[@]}" -d '{"porcentaje_avance":50}'` | Error `42501` "Solo el personal asignado…" |
| 17 | Orden **entregada**, token del técnico asignado: `curl -X PATCH "$SB/rest/v1/ordenes_trabajo?id=eq.$ORDEN" "${H[@]}" -d '{"estatus":"finalizado"}'` | Error `42501` "La orden ya fue entregada…" |
| 18 | Técnico asignado: `curl -X PATCH "$SB/rest/v1/ordenes_trabajo?id=eq.$ORDEN" "${H[@]}" -d '{"millas_ingreso":1}'` | Error `42501` "Solo un administrador puede cambiar los datos de recepción…" |
| 19 | Sin sesión: `curl -o /dev/null -w '%{http_code}' "$SB/storage/v1/object/public/firmas/<archivo>"` | `400` (el bucket ya no es público) |
| 20 | Técnico: `curl "$SB/rest/v1/orden_enlaces?select=token" "${H[@]}"` | `[]` |
| 21 | Técnico: `curl -X POST "$SB/rest/v1/rpc/crear_enlace_cliente" "${H[@]}" -d "{\"p_orden_id\":\"$ORDEN\"}"` | Error `42501` |
| 22 | Técnico o sin sesión: `curl -X POST "$SB/rest/v1/rpc/datos_portal" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"p_token":"x"}'` | Error de permiso |
| 23 | `curl "$SB/rest/v1/cola_envios?select=destinatario" "${H[@]}"` (técnico) | `[]` |
| 24 | Sin sesión: `curl "$SB/functions/v1/portal?token=$(printf '0%.0s' {1..64})"` | `404` `{"estado_enlace":"no_encontrado"}` |
| 25 | Técnico: `curl -X POST "$SB/rest/v1/rpc/enviar_presupuesto" "${H[@]}" -d "{\"p_orden_id\":\"$ORDEN\"}"` | Error `42501` |
| 26 | **Admin** (su token): `curl -X PATCH "$SB/rest/v1/orden_labor?orden_id=eq.$ORDEN" "${H[@]}" -d '{"estado":"aprobado"}'` | Error `42501` "El estado de una línea lo cambian el presupuesto…" |
| 27 | Técnico: `curl "$SB/rest/v1/presupuestos?select=*" "${H[@]}"` | `[]` |
| 28 | Sin sesión: `curl -X POST "$SB/rest/v1/rpc/responder_presupuesto_portal" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{}'` | Error de permiso |
| 29 | Sin sesión: POST a `$SB/functions/v1/portal` con `accion: responder_presupuesto` y `lineas` incompletas | `{"ok":false,"motivo":"presupuesto_cambio"}` |
| 30 | Técnico: `curl -X POST "$SB/rest/v1/rpc/enviar_reporte_cliente" "${H[@]}" -d "{\"p_orden_id\":\"$ORDEN\"}"` | Error `42501` |
| 31 | **Admin**: `curl -X POST "$SB/storage/v1/object/reportes/prueba.pdf" -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/pdf" --data-binary @algo.pdf` | Error de permiso (`new row violates row-level security policy`): el bucket ya no acepta archivos |

Cualquier resultado distinto es un problema de seguridad: repórtalo como prioridad.

---

## 6. Matriz de dispositivos

Marca ✅ / ❌ y anota versión de sistema y navegador.

| Prueba | Android · Chrome | iPhone · Safari | iPhone · app instalada | Computadora · Chrome | Computadora · Safari/Firefox |
|---|:---:|:---:|:---:|:---:|:---:|
| Foto con cámara | | | | n/a | n/a |
| Video grabado en la app (2 min, corte automático) | | | | | |
| Video de galería convertido | | | | | |
| Video > 2 min rechazado | | | | | |
| Nota de voz | | | | | |
| Reproduce video grabado en la otra plataforma | | | | | |
| Subida sigue tras modo avión | | | | | |
| Subida sigue tras recargar | | | | | |
| Campana en tiempo real | | | | | |
| Push con app cerrada | | ❌ esperado | | | |
| Instalar como app | | n/a | | | |
| Portal del cliente: abre, reproduce video, llamar/WhatsApp | | | n/a | | |
| Enviar reporte por WhatsApp abre la app con el mensaje | | | | n/a | n/a |
| Descargar PDF: se guarda y se abre | | | | | |
| Correo de recepción se ve bien (app de correo del teléfono) | | | n/a | | |
| Campos sin zoom al tocar | | | | n/a | n/a |

---

## 7. Regresiones: errores corregidos que no deben volver

Cada uno se corrigió en septiembre de 2026. Si alguno reaparece, es una regresión.

| Error original | Cómo comprobarlo |
|---|---|
| Un movimiento del día 1 contaba en el mes anterior | 4.5, movimiento del día 1 (y `lib/dates.test.ts`) |
| Después de las 7 p. m. se guardaba la fecha de mañana | 4.5 |
| Des-entregar dejaba el cobro asentado | 4.5 pasos 4–5 (y pgTAP 01) |
| Re-entregar no volvía a cobrar el saldo | 4.5 paso 5 |
| Deshacer un pago de comisiones borraba el egreso de otro técnico | 4.6 (y pgTAP 01) |
| Un técnico podía entregar, cotizar o escribir totales | Sección 5, peticiones 4–6 |
| Un técnico podía sacar una orden de Entregado por la API (revertía cobro y comisiones) | Sección 5, petición 17 (y pgTAP 03) |
| Un técnico no asignado podía cambiar estado, avance y firma por la API | Sección 5, petición 16 (y pgTAP 03) |
| Las firmas y fotos viejas se descargaban sin sesión | Sección 5, petición 19 |
| Tres técnicos cobraban $0.01 de más | 4.6 |
| Mano de obra negativa aceptada | Alta de orden con costo −100 → rechazado |
| Fallar la subida de fotos duplicaba la orden al reintentar | Crear orden con fotos en modo avión: una sola orden |
| "Finalizadas del mes" bajaba al entregar | Panel antes y después de entregar una orden finalizada |
| Reabrir una orden dejaba la fecha de finalización | 4.4 Estados |
| Tarjetas de órdenes pegadas en el teléfono | 4.11 |
| iPhone hacía zoom al tocar un campo | 4.11 |
| "Cerrar sesión" fuera de pantalla en el menú del teléfono | 4.11 |
| Sin búsqueda global en el teléfono | 4.11 |
| Cancelar "Entregado" dejaba el selector mostrando "Entregado" | 4.4 Estados y Kanban |
| La campana re-descargaba todas las órdenes cada 60 s | DevTools → Network en el panel: sin peticiones periódicas a `ordenes_trabajo` |
| El PDF compartido mostraba notas internas, técnicos y fotos no publicadas | 4.15 Descargar PDF (y `lib/reportMedia.test.ts`) |

---

## 8. Antes de cada publicación

Mínimo, siempre:

- [ ] `npm run lint`, `npx tsc -b`, `npm test` en verde.
- [ ] `npm run test:db` en verde (si hay Docker; obligatorio si la versión trae migraciones).
- [ ] `npm run db:check`: sabes qué migraciones se van a aplicar.
- [ ] Si la versión toca órdenes, dinero o permisos: secciones 4.4, 4.5 y 5.
- [ ] Si toca multimedia o notificaciones: 4.7, 4.8 y al menos Android + iPhone de la matriz.
- [ ] Si toca el portal, los correos o `datos_portal`: 4.13 y peticiones 20–24 de la sección 5.
- [ ] Si toca líneas, totales o presupuestos: 4.5, 4.14 y peticiones 25–29.
- [ ] Si toca el reporte o el PDF: 4.15 y peticiones 30–31.
- [ ] Si toca estilos: 4.11 en un teléfono real.
- [ ] Después de publicar: [deployment.md §6](deployment.md#6-verificación-después-de-publicar).

---

## 9. Cómo reportar un error

```
Qué hice:        (pasos exactos, desde qué pantalla)
Qué esperaba:    (según reglas-de-negocio.md o este documento)
Qué pasó:        (texto exacto del mensaje; captura)
Quién:           (rol y sede de la cuenta; número de orden)
Dónde:           (dispositivo, sistema, navegador y versión; app instalada o pestaña)
Cuándo:          (fecha y hora, para buscar en los registros)
Consola:         (errores rojos de DevTools, si es computadora)
```

Para subidas: el motivo que muestra la bandeja al expandirla. Para push: el
resultado de los pasos de diagnóstico en
[multimedia-y-notificaciones.md](multimedia-y-notificaciones.md#diagnóstico-1).
