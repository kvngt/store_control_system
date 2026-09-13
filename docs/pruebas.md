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
| **Unitarias y componentes** | Vitest + Testing Library | Lógica pura y pantallas con la base simulada | 210 pruebas, 28 archivos | ~20 s | Nada |
| **Base de datos** | pgTAP (`supabase test db`) | RLS, triggers, dinero, comisiones, multimedia, avisos contra un Postgres real | 48 aserciones, 2 archivos | ~1 min | Docker |
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

> **Estado:** escritas y validadas con el parser de Postgres, pero **todavía no
> ejecutadas** contra una base (la máquina de desarrollo no tiene Docker). La
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
- [ ] No ve los botones "Reporte PDF" ni "Generar y enviar".
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
| 1 | Crear | +$200 "Depósito inicial" | — |
| 2 | Entregar | +$1,000 "Pago final", −$200 "Costo de repuestos" | 2 × $175.00 |
| 3 | Agregar mano de obra $100 (orden entregada) | +$100 "Ajuste por cargo adicional" | 2 × $192.50 |
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

- [ ] Subir un archivo de ~80 MB (video de galería que no se pueda convertir) → sube. Si falla con "too large", falta subir el límite global (deployment §4.3).

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

---

## 8. Antes de cada publicación

Mínimo, siempre:

- [ ] `npm run lint`, `npx tsc -b`, `npm test` en verde.
- [ ] `npm run test:db` en verde (si hay Docker; obligatorio si la versión trae migraciones).
- [ ] `npm run db:check`: sabes qué migraciones se van a aplicar.
- [ ] Si la versión toca órdenes, dinero o permisos: secciones 4.4, 4.5 y 5.
- [ ] Si toca multimedia o notificaciones: 4.7, 4.8 y al menos Android + iPhone de la matriz.
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
