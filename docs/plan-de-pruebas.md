# Plan de pruebas de Restorify

Lo que hay que probar para confiar en una versión, escrito para que lo ejecute **una
persona o un agente de IA** sin conocer el proyecto. Cada caso tiene un identificador,
una prioridad, quién puede ejecutarlo, los pasos y el resultado esperado.

- Qué cubren las pruebas automatizadas y cómo correrlas: [pruebas.md](pruebas.md).
- Qué hace el sistema y por qué (para decidir si algo es un error):
  [reglas-de-negocio.md](reglas-de-negocio.md).
- Hallazgos de la última auditoría y qué caso comprueba cada uno:
  [auditoria-2026-09.md](auditoria-2026-09.md).

---

## Índice

1. [Cómo usar este plan](#1-cómo-usar-este-plan)
2. [Preparación](#2-preparación)
3. [Automatizadas (AUT)](#3-automatizadas-aut)
4. [Casos por módulo](#4-casos-por-módulo)
5. [Seguridad contra la API (SEC)](#5-seguridad-contra-la-api-sec)
6. [Matriz de dispositivos (DEV)](#6-matriz-de-dispositivos-dev)
7. [Regresiones](#7-regresiones)
8. [Antes de cada publicación](#8-antes-de-cada-publicación)
9. [Reporte de resultados](#9-reporte-de-resultados)

---

## 1. Cómo usar este plan

### 1.1 Niveles

| Nivel | Cuándo | Qué se ejecuta | Tiempo |
|---|---|---|---|
| **Humo** | Después de cada despliegue | AUT-01 a AUT-06, y los casos: ACC-01, ACC-02, ACC-03, ORD-01, ORD-05, ORD-06, ORD-12, DIN-01 a DIN-06, PRE-15, POR-02, POR-13, REP-03 | ~40 min |
| **Publicación** | Antes de publicar una versión con cambios | Humo + todos los **P0** + los **P1** de los módulos que tocó el cambio (sección 8) | 2–3 h |
| **Completa** | Antes de atender clientes reales, o cada 3 meses | Todo el plan, incluida la matriz de dispositivos | 1 día |

### 1.2 Cómo se lee un caso

| Columna | Significado |
|---|---|
| **ID** | `MÓDULO-NN`. Se cita tal cual en el reporte y en los errores. |
| **P** | **P0**: si falla, no se publica (dinero, permisos, pérdida de datos, datos de un cliente expuestos). **P1**: función principal. **P2**: secundario o visual. |
| **Ejecuta** | **IA**: lo puede hacer un agente con navegador automatizado, terminal y HTTP (y, desde luego, una persona). **H**: necesita una persona o un dispositivo real (cámara, micrófono, push, iPhone, una bandeja de correo, juicio visual). |
| **Pasos → Esperado** | Quién actúa va en negrita: **A** admin, **M** mecánico asignado a la orden, **N** técnico de la misma sede no asignado, **B** mecánico de otra sede, **C** el cliente (sin sesión). |

Resultado de cada caso: **PASS**, **FAIL**, **BLOQUEADO** (no se pudo ejecutar; di por
qué) o **N/A** (no aplica a esta versión).

### 1.3 Reglas para quien ejecuta

1. **Nunca contra datos de clientes reales.** Un entorno de prueba, o el proyecto
   enlazado mientras no haya clientes. Todo lo que crees lleva el prefijo **`PRUEBA`**.
2. **No borres ni cambies nada que no creaste.**
3. **Un caso P0 de seguridad que falla detiene la ejecución**: repórtalo de inmediato.
4. **No arregles durante la ejecución.** Anota el hallazgo y sigue con el siguiente caso
   que no dependa de él.
5. **Evidencia de cada FAIL**: captura de pantalla, texto exacto del mensaje, respuesta
   HTTP o resultado de `scripts/qa/estado-orden.sql`.
6. **Con DevTools abiertas** (computadora): un error rojo en la consola durante un caso
   que "pasó" es un hallazgo aparte.
7. **Al terminar**, limpia (sección 2.6).

### 1.4 Instrucciones para un agente de IA

**Qué puede usar:**

- **Navegador automatizado** (Playwright o equivalente) contra `npm run dev`
  (`http://localhost:5173`) o el sitio publicado. Para vista de teléfono: viewport
  390 × 844, `isMobile: true`, `hasTouch: true`.
- **Terminal**: `npm`, `node`, `npx supabase db query --linked -f <archivo>` **solo con
  consultas SELECT** (por ejemplo `scripts/qa/estado-orden.sql`).
- **HTTP** contra la API de Supabase con la clave anónima y el token de una cuenta de
  prueba (sección 2.5).

**Qué no debe hacer:**

- Usar la llave `service_role`, leer `supabase/.env.secrets.local` o secretos de Vault.
- Ejecutar `supabase db push`, `db reset`, desplegar funciones o escribir SQL que
  modifique datos.
- Ejecutar casos **H**: márcalos **BLOQUEADO — requiere persona/dispositivo**.
- Dar por buena una pantalla sin comprobar el dato: donde el esperado habla de dinero,
  estados o correos, verifica también con `scripts/qa/estado-orden.sql`.

**Correos:** usa un cliente con el correo `delivered@resend.dev` (Resend lo acepta y no lo
entrega a nadie). "Llega el correo" se verifica en `estado-orden.sql` → `correos`: la
plantilla aparece con `estado = enviado`. Que el correo **se vea bien** es un caso **H**.

**Esperas:** los correos salen con 1–3 minutos de espera más hasta 1 minuto del cron. Espera
4 minutos antes de declarar que un correo no salió.

**Entrega:** el reporte de la sección 9, y la salida de `npm run qa:security -- --json`.

---

## 2. Preparación

### 2.1 Entorno

```bash
npm ci
cp .env.test.example .env.test.local   # cuentas de prueba (sección 2.2)
npm run db:check                       # la base tiene todas las migraciones del código
npm run dev                            # http://localhost:5173
```

Si `db:check` dice que faltan migraciones, **no ejecutes el plan**: la app mostrará errores
que no son de la app (ver [deployment.md](deployment.md)).

### 2.2 Cuentas

Créalas en Configuración → Personal:

| Clave en el plan | Rol | Sede | Variables en `.env.test.local` |
|---|---|---|---|
| **A** `admin-prueba` | admin | Sede A | `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` |
| **M** `mecanico-a` | mecánico | Sede A | `E2E_MECHANIC_EMAIL`, `E2E_MECHANIC_PASSWORD` |
| **P** `pintor-a` | pintor | Sede A | — |
| **N** `mecanico-a2` | mecánico | Sede A | — |
| **B** `mecanico-b` | mecánico | Sede B | — |

### 2.3 Datos base

| ID | Qué | Cómo |
|---|---|---|
| D-01 | Dos sedes, **Sede A** y **Sede B**, con correo de contacto y WhatsApp en la Sede A | Configuración → Sedes |
| D-02 | Cliente **PRUEBA Marta** en Sede A, correo `delivered@resend.dev` (o **tu** correo para casos H), teléfono de 10 dígitos | Clientes |
| D-03 | Cliente **PRUEBA Pedro** en Sede A, **sin correo** | Clientes |
| D-04 | Un vehículo por cliente. VIN válido de prueba: `1HGCM82633A004352` | Vehículos |
| D-05 | Cliente y vehículo **PRUEBA Norte** en Sede B | Clientes |
| D-06 | Archivos: 8 fotos JPG de teléfono, un video de ~30 s, un video de más de 2 minutos, un archivo de más de 50 MB | En la computadora |
| D-07 | Un estado de cuenta de Wells Fargo en PDF (casos FIN) | Del banco |

### 2.4 Dispositivos (casos H)

- **Android** con Chrome actualizado.
- **iPhone** con iOS 16.4 o posterior, Safari. Para push: la app agregada a la pantalla de
  inicio.
- **Computadora** con Chrome (y Safari o Firefox si se puede).

### 2.5 Herramientas de verificación

**Estado completo de una orden** (dinero, líneas, presupuestos, comisiones, enlace,
correos, multimedia, avisos), solo lectura:

```bash
# Edita el número de orden en la línea marcada con <<<
npx supabase db query --linked -f scripts/qa/estado-orden.sql
```

**Token de una cuenta** (para llamar la API como esa persona):

```bash
SB_URL=https://<ref>.supabase.co      # VITE_SUPABASE_URL de .env.local
SB_ANON=<clave anónima>               # VITE_SUPABASE_ANON_KEY de .env.local
curl -s "$SB_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SB_ANON" -H "Content-Type: application/json" \
  -d '{"email":"<correo>","password":"<contraseña>"}'
# → copia "access_token"
```

En el navegador: DevTools → Application → Local Storage → `sb-<ref>-auth-token` →
`access_token`.

### 2.6 Limpieza

- Borra como **A** las órdenes, clientes y vehículos con `PRUEBA` (primero deshaz los pagos
  de comisiones de prueba: una orden con comisiones pagadas no se borra, DIN-09).
- Importaciones de prueba en Finanzas: **Revertir importación**.
- Empleados de prueba: Configuración → Personal.
- Si una prueba e2e falló a medias: busca y borra `PWTEST`.

---

## 3. Automatizadas (AUT)

| ID | P | Ejecuta | Comando | Esperado |
|---|---|---|---|---|
| AUT-01 | P0 | IA | `npm run lint` y `npx tsc -b` | Sin errores ni avisos |
| AUT-02 | P0 | IA | `npm test` | Todas en verde (303 al escribir esto) |
| AUT-03 | P0 | IA | `npm run build` | Termina sin errores |
| AUT-04 | P0 | IA | `npm run db:check` | "Base de datos al día" |
| AUT-05 | P0 | IA | `npx supabase start` y `npm run test:db` (requiere Docker) | 8 archivos pgTAP en verde. Sin Docker: **BLOQUEADO** |
| AUT-06 | P0 | IA | `npm run qa:security` | 0 FAIL. Los SKIP dicen qué falta (una cuenta o una orden) |
| AUT-07 | P1 | IA | `npm run qa:security` (con cuenta de técnico) | SEC-55 PASS. Ya no crea nada: desde que abrir una orden es solo de admin, el caso comprueba el rechazo |
| AUT-08 | P1 | IA | `npm run test:e2e` | Todas en verde o saltadas por falta de credenciales |

---

## 4. Casos por módulo

### 4.1 Acceso y sesión (ACC, SES)

| ID | P | Ejecuta | Pasos → Esperado |
|---|---|---|---|
| ACC-01 | P0 | IA | Entrar con una contraseña incorrecta → "Correo o contraseña incorrectos…", sigue en el login. |
| ACC-02 | P0 | IA | **A** entra → el menú tiene Panel Principal, Clientes, Vehículos, Órdenes de Trabajo, Tablero Kanban, Finanzas, Comisiones y Configuración. |
| ACC-03 | P0 | IA | **M** entra → no ve Finanzas ni Comisiones; escribir `/finance` o `/payroll` en la URL lo regresa al panel. |
| ACC-04 | P1 | H | "¿Olvidaste tu contraseña?" → llega el correo; el enlace abre `reinventa.shop/reset-password` (no `localhost`); la contraseña nueva funciona. |
| ACC-05 | P1 | IA | Recargar la página → sigue con sesión en la misma pantalla. |
| ACC-06 | P1 | IA | Cerrar sesión → login; el botón Atrás del navegador no muestra datos. |
| ACC-07 | P0 | IA | En el mismo navegador: **A** abre Panel, Órdenes (con totales) y Finanzas; cierra sesión; entra **M** → en ningún momento aparece un monto ni un total de **A** (tampoco un instante mientras carga). Repetir sin cerrar sesión, cambiando de cuenta desde otra pestaña. *(PRD-13; automatizado en `AuthContext.test.tsx`.)* |
| ACC-08 | P0 | IA | `curl -s "$SB_URL/auth/v1/settings" -H "apikey: $SB_ANON"` → `"disable_signup":true`. *(PRD-01; automatizado en SEC-18.)* |
| SES-01 | P2 | H | Dejar la app abierta más de una hora en un teléfono con señal intermitente (alternar modo avión), con **Nueva orden** a medio llenar → nunca aparece el login y lo escrito sigue ahí. *(Automatizado en `AuthContext.test.tsx`.)* |

### 4.2 Sedes (SED)

| ID | P | Ejecuta | Pasos → Esperado |
|---|---|---|---|
| SED-01 | P0 | IA | **A** cambia de sede en el selector → panel, clientes, órdenes, Kanban y Finanzas muestran solo esa sede. |
| SED-02 | P0 | IA | **B** no ve clientes, vehículos ni órdenes de la Sede A, tampoco en la búsqueda global. |
| SED-03 | P1 | IA | **A** cambia el porcentaje de comisión de la sede → las comisiones pendientes se recalculan; las pagadas no. |
| SED-04 | P1 | IA | **A** borra una sede de prueba → ve el impacto (órdenes, clientes, empleados) antes de confirmar; el personal pasa a otra sede. |
| SED-05 | P2 | IA | Correo de contacto de la sede mal escrito → rechazado con mensaje. |

### 4.3 Clientes y vehículos (CLI)

| ID | P | Ejecuta | Pasos → Esperado |
|---|---|---|---|
| CLI-01 | P1 | IA | Crear cliente sin nombre o sin teléfono → bloqueado con mensaje en el campo. |
| CLI-02 | P1 | IA | Correo `marta@` → mensaje dentro del diálogo; no se guarda. |
| CLI-03 | P1 | IA | VIN de 17 caracteres → marca, modelo y año se llenan solos. |
| CLI-04 | P2 | IA | VIN con I, O o Q → aviso. |
| CLI-05 | P2 | IA | "Sin placa" → campos de placa desactivados; la lista muestra "Sin placa". |
| CLI-06 | P0 | IA | **M** no ve el botón de eliminar en clientes ni vehículos. |
| CLI-07 | P1 | IA | **A** elimina un cliente con órdenes → mensaje claro de que no se puede. |
| CLI-08 | P2 | IA | Búsqueda global por nombre, teléfono, placa, VIN y número de orden → encuentra cada uno. |

### 4.4 Órdenes de trabajo (ORD)

| ID | P | Ejecuta | Pasos → Esperado |
|---|---|---|---|
| ORD-01 | P0 | IA | **A** crea una orden con cliente y vehículo nuevos, 6 fotos de recepción, depósito $200, mano de obra $1,000, repuesto 2 × $100 y dos técnicos (**M** y **P**) → se crea sin esperar a las fotos; la bandeja muestra el progreso; se abre el detalle. |
| ORD-02 | P1 | IA | El número es el siguiente consecutivo `ORD-AAAA-###`. |
| ORD-03 | P2 | IA | Mientras una foto se comprime, el botón dice "Procesando…" y no deja crear. |
| ORD-04 | P1 | IA | Millas negativas → rechazado (el campo no acepta el signo menos). |
| ORD-05 | P0 | IA | **M** no ve el botón **Nueva orden**; **A** sí. Un POST directo a `/rest/v1/ordenes_trabajo` con la sesión de **M** responde 42501 (lo cubre `qa:security` SEC-55). |
| ORD-06 | P0 | IA | **M** en el detalle de una orden asignada → no ve tarjeta de totales, depósito ni repuestos con precio; ve "Descripción de repuestos" sin ningún `$`; ve la mano de obra sin botones con "la cotiza administración"; ve **Tu comisión estimada** con la cuenta (mano de obra × % ÷ técnicos); no ve **Descargar PDF** ni **Enviar reporte**; el selector de estado no ofrece "Entregado". |
| ORD-07 | P1 | IA | **M** mueve el avance en un estado no cerrado y captura la firma → ambos se ven al recargar. |
| ORD-08 | P1 | IA | **N** abre una orden que no trabaja → aviso de solo lectura ("un administrador tiene que asignarte") y, donde estaba "Unirme a la orden", la frase "Administración asigna quién trabaja esta orden". El botón ya no existe para nadie: asignar se hace desde el selector de **A** en la tarjeta de técnicos. Un POST directo a `/rest/v1/orden_asignaciones` con su propio `usuario_id` responde 42501 (SEC-69 y SEC-70). |
| ORD-09 | P1 | IA | **A** elige "Entregado" y cancela la confirmación → el selector vuelve al estado real. |
| ORD-10 | P1 | IA | **A** reabre una orden finalizada → se borra la fecha de finalización. |
| ORD-11 | P1 | IA | Kanban: en computadora, arrastrar entre columnas; en teléfono, "Mover a" (cancelar la confirmación deja el selector como estaba). **M** en su tarjeta: sin "Entregado"; en tarjetas ajenas no hay selector. |
| ORD-12 | P0 | IA | **A** crea una orden con mano de obra $1,000 **sin firmar** → la línea dice **Sin autorizar** y el total es $0. Firmar → **sin recargar**, la insignia desaparece, el total pasa a $1,000 y la tarjeta Presupuesto muestra "con la firma de recepción". *(AUD-06)* |
| ORD-13 | P2 | IA | Crear una orden sin fecha estimada de entrega → la fecha es hoy + 5 días en la hora local, también si se crea después de las 7 p. m. *(AUD-13)* |
| ORD-14 | P1 | IA | **A** con la **Sede B** elegida abre una orden de la **Sede A** (desde un aviso o `/work-orders?open=<id>`) → **Descargar PDF** trae logo, nombre y dirección de la Sede A; el mensaje de **Enviar reporte → WhatsApp** nombra la Sede A; la lista para asignar técnicos solo muestra personal de la Sede A. *(AUD-08)* |

### 4.5 Dinero automático (DIN)

Con la orden de ORD-01 (depósito $200, mano de obra $1,000, repuestos 2 × $100, dos
técnicos). Verifica cada paso en Finanzas (filtrando por la orden) **y** con
`estado-orden.sql`.

| ID | P | Ejecuta | Acción (**A**) | Movimientos esperados | Comisiones |
|---|---|---|---|---|---|
| DIN-01 | P0 | IA | Crear y **firmar la recepción** | +$200 "Depósito inicial" | — |
| DIN-02 | P0 | IA | Entregar | +$1,000 "Pago final", −$200 "Costo de repuestos" | 2 × $175.00 |
| DIN-03 | P0 | IA | Agregar mano de obra $100 (queda **sin autorizar**, nada cambia) y **Registrar autorización** → en persona | +$100 "Ajuste por cargo adicional" | 2 × $192.50 |
| DIN-04 | P0 | IA | Sacar de Entregado (confirmar la advertencia) | −$1,100 "Reversión de entrega", +$200 "Reversión de costo de repuestos" | ninguna |
| DIN-05 | P0 | IA | Volver a entregar | +$1,100 "Pago final", −$200 "Costo de repuestos" | 2 × $192.50 |

| ID | P | Ejecuta | Pasos → Esperado |
|---|---|---|---|
| DIN-06 | P0 | IA | Después de DIN-05 → `cobrado_al_cliente` = **$1,300** y `costo_repuestos_asentado` = **$200**. |
| DIN-07 | P0 | IA | Cambiar el depósito de la orden entregada → rechazado con mensaje. |
| DIN-08 | P0 | IA | **A** borra una orden **sin** comisiones pagadas → desaparecen sus movimientos automáticos; los importados del banco se quedan. Repetir con DevTools → Network en **Offline** al confirmar → error visible; la orden **y** sus movimientos siguen. *(AUD-04)* |
| DIN-09 | P0 | IA | Pagar las comisiones de la orden de DIN-05 (COM-03) y **A** intenta borrarla → "tiene comisiones que ya se pagaron. Deshaz ese pago…"; la orden, sus movimientos y el pago siguen. Deshacer el pago y borrar → funciona. *(AUD-05)* |
| DIN-10 | P1 | IA | Movimiento manual con fecha del **día 1** del mes → el panel lo cuenta en ese mes. |
| DIN-11 | P1 | IA | Movimiento capturado **después de las 7 p. m.** → la fecha propuesta es la de hoy. |
| DIN-12 | P0 | IA | Con una sede de prueba con más de 1.000 movimientos (importar varios estados de cuenta): "Ingresos del mes" del panel y las tarjetas de Finanzas coinciden con `SELECT tipo, SUM(monto) FROM finanzas_movimientos WHERE sede_id = '<sede>' AND fecha >= date_trunc('month', CURRENT_DATE) GROUP BY tipo`, y la tabla de Finanzas muestra todos. *(PRD-10/11; automatizado en pgTAP 08.)* |

### 4.6 Comisiones (COM)

| ID | P | Ejecuta | Pasos → Esperado |
|---|---|---|---|
| COM-01 | P0 | IA | Tres técnicos en una orden de mano de obra $1,000 al 35 %, entregada → $116.67 + $116.67 + $116.66. |
| COM-02 | P1 | IA | **Pagar saldo** con cheque sin número ni foto → pide uno de los dos. |
| COM-03 | P0 | IA | Pagar a dos técnicos $192.50 el mismo día → dos egresos "Pago de comisiones". |
| COM-04 | P0 | IA | **Deshacer** el pago de uno → sus comisiones vuelven a pendientes y **solo su** egreso desaparece. |
| COM-05 | P2 | IA | La foto del cheque se abre con un enlace temporal. |
| COM-06 | P1 | IA | Porcentaje de comisión fuera de 0–100 → rechazado. |

### 4.7 Multimedia (MED)

| ID | P | Ejecuta | Pasos → Esperado |
|---|---|---|---|
| MED-01 | P1 | H | **Foto** abre la cámara trasera; la foto aparece como miniatura. |
| MED-02 | P1 | H | **Video**: cámara a pantalla completa; el contador corre y se pone rojo en los últimos 15 s; a los 2:00 se detiene solo; "Repetir", "Usar video" y cambiar de cámara funcionan. |
| MED-03 | P1 | H | **Nota de voz**: graba, se escucha antes de usarla, se detiene a los 2:00. |
| MED-04 | P1 | H | Elegir de la galería un video de iPhone de 30 s → "Convirtiendo video N %" y la miniatura; pesa ~5–6 MB. |
| MED-05 | P2 | IA | Elegir un video de más de 2 minutos → "dura más de 2 minutos". |
| MED-06 | P2 | H | Negar el permiso de cámara → mensaje que explica cómo activarlo. |
| MED-07 | P1 | H | Un avance con **solo** una nota de voz, sin texto → se guarda. |
| MED-08 | P1 | IA | Un avance con texto, 3 fotos y un video de galería → aparece de inmediato con los archivos "subiendo". |
| MED-09 | P1 | IA | La bandeja dice "N de M archivos subidos" con progreso por archivo. |
| MED-10 | P1 | IA | Red en **Offline** a mitad de un video → la bandeja dice "Sin conexión"; al volver la red sigue sola. |
| MED-11 | P1 | IA | Recargar a mitad de un video de más de 6 MB → la subida continúa, no empieza de cero. |
| MED-12 | P2 | IA | Cerrar la pestaña con subidas pendientes → el navegador pregunta si salir. |
| MED-13 | P0 | IA | Fotos de recepción muestran "Visible al cliente"; archivos de avance, "Interno". **A** alterna la visibilidad; **M** solo ve la etiqueta. |
| MED-14 | P0 | IA | **M** borra un archivo suyo; no puede borrar uno de otra persona; en una orden entregada no puede subir ni borrar. |
| MED-15 | P1 | H | Abrir un video → se reproduce en el visor; flechas al siguiente. Un video grabado en Android se reproduce en iPhone y al revés. |
| MED-16 | P1 | H | Un video de 2 minutos grabado con **Video** → sube completo (~24 MB). |
| MED-17 | P2 | IA | Elegir un archivo de más de 50 MB que no se pueda convertir → "pesa más de 50 MB"; no se intenta subir. |

### 4.8 Notificaciones y push (NOT)

| ID | P | Ejecuta | Pasos → Esperado |
|---|---|---|---|
| NOT-01 | P1 | IA | Con **A** y **M** en dos navegadores: **A** asigna a **M** → en el de **M**, sin recargar, el contador sube y aparece un aviso flotante. |
| NOT-02 | P1 | IA | **M** toca el aviso → abre la orden y lo marca leído. |
| NOT-03 | P2 | IA | "Marcar todo leído" → contador en cero. |
| NOT-04 | P2 | IA | Idioma inglés → los avisos se leen en inglés. |
| NOT-05 | P1 | IA | Quién recibe cada evento: asignar → técnico; quitar → técnico ("Ya no estás asignado"); **M** registra recepción → admins; **M** agrega un avance con varios archivos → admins, **un** aviso; **M** finaliza → admins ("Lista para entregar"); **A** entrega → cada técnico ("Comisión generada" con su monto). Quien hace la acción nunca recibe su propio aviso. |
| NOT-06 | P1 | H | Android: Configuración → activar en este dispositivo → "Enviar prueba" llega en segundos; con Chrome **cerrado**, asignar una orden → llega y abre la orden; en Configuración → Usuarios (**A**) el técnico muestra la campana con "1". |
| NOT-07 | P1 | H | iPhone: en Safari sin instalar, la tarjeta explica los 3 pasos; desde el ícono de inicio se activa; con la app cerrada, una asignación llega. |
| NOT-08 | P2 | H | Tablet compartida: **M** activa push y cierra sesión; entra **P** en el mismo dispositivo → los avisos de **M** ya no llegan ahí; los de **P** sí. |
| NOT-09 | P2 | IA | Build sin `VITE_VAPID_PUBLIC_KEY` → la tarjeta dice "no están configuradas en este servidor"; la campana funciona. |

### 4.9 Finanzas (FIN)

| ID | P | Ejecuta | Pasos → Esperado |
|---|---|---|---|
| FIN-01 | P1 | IA | Movimiento manual de ingreso y de egreso → aparecen; monto negativo rechazado. |
| FIN-02 | P1 | IA | Vincular un movimiento a una orden → la columna lleva a esa orden. |
| FIN-03 | P2 | IA | Exportar CSV → montos y fechas correctas. |
| FIN-04 | P1 | IA | Importar el estado de cuenta D-07 → las sumas coinciden con el PDF; transferencias internas y posibles duplicados llegan desmarcados. |
| FIN-05 | P1 | IA | Importar **el mismo** archivo otra vez (aunque tenga otro nombre) → aviso rojo con la fecha anterior. |
| FIN-06 | P1 | IA | Revertir la importación → desaparecen solo sus movimientos. |
| FIN-07 | P2 | IA | Un PDF escaneado o de otro banco → mensaje que lo explica. |
| FIN-08 | P0 | IA | Importar un estado de cuenta con DevTools → Network en **Offline** justo al confirmar → error visible; en Finanzas no aparece un lote vacío y el mismo archivo se puede volver a importar sin el aviso de "ya importado". *(PRD-14.)* |

### 4.10 Configuración y personal (CFG)

| ID | P | Ejecuta | Pasos → Esperado |
|---|---|---|---|
| CFG-01 | P2 | IA | Perfil: foto, nombre, teléfono; idioma y tema siguen igual tras recargar. |
| CFG-02 | P1 | IA | Alta de empleado sin nombre, con contraseña de menos de 6 o con un correo repetido → error visible dentro del diálogo. |
| CFG-03 | P1 | IA | **M** en Configuración → perfil, idioma, tema y notificaciones; nada de sedes ni personal. |
| CFG-04 | P1 | IA | **A** edita un empleado: cambia su correo → la persona entra con el nuevo. Quitar el rol admin al único admin → rechazado. |
| CFG-05 | P1 | IA | Eliminar un empleado con órdenes asignadas → "todavía tiene órdenes asignadas"; sigue en la lista. |
| CFG-06 | P2 | IA | Eliminar un empleado al que ya se le pagaron comisiones (y sin órdenes asignadas) → "tiene pagos de comisiones registrados"; sigue en la lista. *(AUD-14)* |
| CFG-07 | P2 | IA | **A** intenta eliminarse a sí mismo → rechazado. |

### 4.11 Diseño móvil (MOV)

| ID | P | Ejecuta | Pasos → Esperado |
|---|---|---|---|
| MOV-01 | P1 | H | iPhone: tocar cualquier campo de texto **no hace zoom**. |
| MOV-02 | P2 | IA | Lista de órdenes en tarjetas con separación entre ellas. |
| MOV-03 | P1 | H | La barra inferior no tapa la última tarjeta ni queda bajo el indicador de inicio del iPhone. |
| MOV-04 | P2 | IA | Menú ☰: se abre, la página de atrás no se desplaza, Escape o tocar fuera lo cierra, "Cerrar sesión" visible sin desplazar. |
| MOV-05 | P2 | IA | Lupa del encabezado → búsqueda a pantalla completa; Escape la cierra. |
| MOV-06 | P2 | IA | Tablas de mano de obra, repuestos, historial del cliente y comisiones → tarjetas, sin desplazamiento horizontal. |
| MOV-07 | P2 | IA | Kanban: deslizar encaja una columna por pantalla; "Mover a" en fila con su etiqueta. |
| MOV-08 | P2 | IA | Nueva orden a pantalla completa con Guardar y Cancelar visibles. |
| MOV-09 | P2 | IA | La bandeja de subidas queda por encima de la barra inferior. |

### 4.12 App instalable (PWA)

| ID | P | Ejecuta | Pasos → Esperado |
|---|---|---|---|
| PWA-01 | P2 | H | Android: Chrome ofrece "Instalar app"; abre sin barra de navegador, con el ícono dorado. |
| PWA-02 | P2 | H | iPhone: "Agregar a inicio" usa el ícono y el nombre "Restorify"; el encabezado no queda bajo la barra de estado. |
| PWA-03 | P2 | IA | `https://reinventa.shop/sw.js` responde con `Cache-Control: no-cache`; tras publicar, la app instalada muestra la versión nueva al reabrir. |

### 4.13 Portal del cliente y correos (POR)

Reglas: [portal-y-correos.md](portal-y-correos.md).

| ID | P | Ejecuta | Pasos → Esperado |
|---|---|---|---|
| POR-01 | P0 | IA | Orden sin firma: la tarjeta **Enlace del cliente** (**A**) dice que se crea al firmar y ofrece **Crear enlace**. **M** firma → la tarjeta de **A** muestra el enlace sin recargar. **M** no ve la tarjeta. |
| POR-02 | P0 | IA | **Copiar** el enlace → abrirlo en otro navegador sin sesión → abre el reporte. |
| POR-03 | P1 | IA | **Enviar por WhatsApp** → `wa.me/1<teléfono>` con el mensaje y el enlace. |
| POR-04 | P2 | IA | Tras abrir el enlace, la tarjeta dice "Abierto 1 veces · última vez hace …". |
| POR-05 | P1 | IA | **Cambiar enlace** → el viejo muestra "Este enlace ya no está activo" con botón para llamar. **Desactivar** → igual; **Crear enlace** genera otro. |
| POR-06 | P1 | IA | Entregar la orden → la tarjeta dice "Disponible hasta el …" (90 días). |
| POR-07 | P0 | IA | ~2 minutos después de la primera firma (cliente D-02) → correo `recepcion` **enviado**; la tarjeta pasa de **Programado** a **Enviado**. |
| POR-08 | P1 | IA | Mover a En proceso → ~3 min, correo `estatus`. Mover a Espera de repuestos y de vuelta a En proceso en menos de 3 min → **No enviado** "ya recibió el aviso de este estado". Finalizado y Entregado → un correo cada uno. |
| POR-09 | P1 | IA | Publicar una foto de avance y **Avisar novedades** → al minuto, correo `avance` enviado. |
| POR-10 | P2 | H | Responder un correo → llega al correo de contacto de la Sede A. |
| POR-11 | P1 | IA | Cliente D-03 (sin correo) → la tarjeta sugiere WhatsApp y no hay botón de avisar; no se generan correos. |
| POR-12 | P1 | H | Con **tu** correo: los correos se ven bien en Gmail (teléfono y web) y Outlook; el remitente es el nombre del taller; no caen en spam. |
| POR-13 | P0 | IA | Portal (viewport de teléfono, sin sesión): DevTools → Network no descarga `appStart-*.js` ni Sentry. Muestra estado con 4 pasos, avance, fecha estimada, vehículo con los últimos 6 del VIN. Solo aparecen fotos y videos **publicados** (publicar uno interno y recargar → aparece). La cuenta coincide con la orden. No aparecen técnicos, comisiones ni el texto de los avances. |
| POR-14 | P1 | H | En un teléfono, un video y una nota de voz del portal se reproducen. |
| POR-15 | P2 | IA | **Llamar** apunta al teléfono del taller; **WhatsApp** aparece solo si la sede tiene WhatsApp. Idioma inglés → sigue en inglés al recargar. |
| POR-16 | P0 | IA | Abrir `/r/<token>?correos=baja` → la sección se resalta y **no** da de baja hasta tocar el botón. **Dejar de recibir correos** → la ficha del cliente queda desmarcada y un cambio de estado ya no genera correo. **Volver a recibir** lo reactiva. |
| POR-17 | P1 | IA | `/r/abc` → "Enlace no válido". El HTML del portal tiene `<meta name="robots" content="noindex, nofollow">` y `referrer` en `no-referrer`. |

### 4.14 Presupuestos (PRE)

Reglas: [presupuestos.md](presupuestos.md). Orden de **A** con cliente D-02 y **M** asignado.

| ID | P | Ejecuta | Pasos → Esperado |
|---|---|---|---|
| PRE-01 | P0 | IA | Alta con mano de obra $1,000, sin firmar → **Sin autorizar**, total $0. |
| PRE-02 | P0 | IA | Firmar → autorizada, total $1,000; la tarjeta **Presupuesto** muestra "Presupuesto 1 · con la firma de recepción". |
| PRE-03 | P0 | IA | Agregar "Pintura $500" → **Sin autorizar**; el total no cambia; la tabla muestra "Sin autorizar $500" aparte. |
| PRE-04 | P0 | IA | **Enviar presupuesto al cliente** → la línea pasa a **Esperando al cliente** sin lápiz ni papelera; la orden muestra **Esperando autorización** en la lista y el tablero (también para **M**). |
| PRE-05 | P1 | IA | Correo `presupuesto` enviado; su botón abre el portal con **Presupuesto por autorizar** arriba. |
| PRE-06 | P1 | IA | En el portal nada viene marcado; "Autorizar lo marcado" está apagado hasta marcar algo y escribir el nombre. |
| PRE-07 | P1 | IA | Con el portal abierto, **A** agrega otra línea y **Agregar al presupuesto y reenviar**; **C** responde con la página vieja → "El taller actualizó el presupuesto…" y ve la línea nueva. |
| PRE-08 | P0 | IA | **C** autoriza una línea, deja otra sin marcar y comenta → "Gracias. Guardamos su respuesta…"; la sección desaparece; la cuenta muestra lo no autorizado tachado y "Sus autorizaciones". |
| PRE-09 | P1 | IA | Correo `presupuesto_confirmacion` enviado ("Recibimos su respuesta"). |
| PRE-10 | P1 | IA | **M** recibe "Trabajos autorizados · … Autorizado: … No realizar: …"; en su detalle la línea rechazada dice **No realizar**. |
| PRE-11 | P1 | IA | **A** recibe "El cliente respondió el presupuesto · … Autorizó 1 de 2" con el comentario; la tarjeta muestra vía, nombre y conteos. |
| PRE-12 | P0 | IA | Agregar dos líneas → **Registrar autorización** → todo viene marcado; desmarcar una, "Por teléfono" → una autorizada y otra **No realizar**; correo "Registramos su autorización". |
| PRE-13 | P1 | IA | Editar la línea rechazada (otro precio) → vuelve a **Sin autorizar**. |
| PRE-14 | P1 | IA | Enviar presupuesto y **Cancelar presupuesto** → la línea vuelve a **Sin autorizar**; el portal ya no pide autorización. |
| PRE-15 | P0 | IA | Orden firmada con $1,000 autorizados. Agregar "Pintura $500" (**Sin autorizar**). **Volver a firmar** (limpiar y firmar otra vez) → Pintura sigue **Sin autorizar** y el total sigue en $1,000. *(AUD-03)* |
| PRE-16 | P0 | IA | Con un presupuesto enviado, intentar **Entregar** → "tiene un presupuesto esperando respuesta"; la orden no cambia. |
| PRE-17 | P0 | IA | Entregar con un repuesto **sin autorizar** → Finanzas no registra su costo. |
| PRE-18 | P2 | IA | Un presupuesto enviado sin respuesta → al día siguiente, después de las 15:00 UTC, los admins reciben "Presupuesto sin respuesta". |

### 4.15 Reporte (REP)

Reglas: [portal-y-correos.md](portal-y-correos.md#10-el-reporte-web). Orden con cliente
D-02, fotos de recepción, un avance con una foto publicada, otra interna y una nota.

| ID | P | Ejecuta | Pasos → Esperado |
|---|---|---|---|
| REP-01 | P0 | IA | **A** ve **Descargar PDF** y **Enviar reporte**; **M** no ve ninguno. |
| REP-02 | P1 | IA | **Enviar reporte** en una orden sin firma → la ventana muestra el enlace (creado en ese momento) y dice que vence 90 días después de entregar; la tarjeta del enlace lo muestra sin recargar. |
| REP-03 | P0 | IA | **Enviar por correo** → "Reporte enviado", la ventana se cierra; en la tarjeta el correo pasa de **Programado** a **Enviado**. |
| REP-04 | P1 | H | El correo del reporte llega con el botón al portal y el nombre del taller como remitente. |
| REP-05 | P1 | IA | **Enviar por correo** dos veces en menos de un minuto (reabriendo la ventana) → un solo correo `reporte`. |
| REP-06 | P1 | IA | **Enviar por WhatsApp** → teléfono del cliente y enlace en el mensaje. **Copiar enlace** abre sin sesión; **Abrir** abre el portal en otra pestaña. |
| REP-07 | P1 | IA | Cliente sin correo, o dado de baja → **Enviar por correo** apagado con el motivo; WhatsApp disponible. |
| REP-08 | P0 | IA | **Descargar PDF** → Network sin peticiones a `storage/v1/object/reportes`. El PDF lleva las fotos de recepción publicadas y la foto de avance publicada, agrupada por día; **no** lleva la foto interna, videos, el texto del avance ni los técnicos. |
| REP-09 | P0 | IA | Los montos del PDF coinciden con el portal (solo lo autorizado); en una orden entregada el saldo es $0 con "Pagado al entregar"; el enlace del reporte se puede tocar. |
| REP-10 | P2 | IA | Con más de 20 fotos publicadas el PDF pesa pocos MB. |

---

## 5. Seguridad contra la API (SEC)

La interfaz esconde botones; lo que protege es la base. Estos casos hacen lo que haría
alguien con la clave pública de la app o un técnico con su propia sesión.

### 5.1 Automatizados: `npm run qa:security`

```bash
npm run qa:security             # tabla PASS / FAIL / SKIP
npm run qa:security -- --json   # para un agente
# Ya no hay `--alta`: el único caso que escribía (SEC-55) ahora comprueba un rechazo,
# así que la suite entera es de solo lectura.
```

Inicia sesión solo con las cuentas de `.env.test.local` (o `QA_TECH_EMAIL`/`QA_TECH_PASSWORD`,
`QA_ADMIN_EMAIL`/`QA_ADMIN_PASSWORD`) y busca por su cuenta una orden asignada, una ajena y
una entregada. Lo que no encuentra lo marca SKIP.

| Grupo | Casos | Qué se espera |
|---|---|---|
| Sin sesión | SEC-01 a SEC-18 | Registro público apagado (SEC-18); las 6 edge functions desplegadas (SEC-17); sin datos, sin funciones internas (`reverse_order_delivery_finance`, `sync_*`, `recalculate_order_totals`, `claim_outbox`, `datos_portal`, `responder_presupuesto_portal`, `pay_commissions`), `process-outbox` 401, portal 404 con token falso, buckets privados |
| Técnico: lectura | SEC-20 a SEC-35 | No ve montos, repuestos con precio, Finanzas, enlaces, presupuestos, cola de correos, pagos ni avisos ajenos, ni datos de otra sede |
| Técnico: escritura | SEC-40 a SEC-54 | No cotiza, no entrega, no escribe totales ni datos de recepción, no firma con archivos ajenos, no publica al cliente, no manda enlaces, presupuestos, reportes ni avisos, no asigna a otros; en órdenes ajenas o entregadas no toca nada |
| Técnico: alta y asignación | SEC-55, SEC-69, SEC-39 | No abre una orden por la API (42501) y no se asigna a ninguna — ni a una ajena ni a la que ya trabaja. Asignar reparte la comisión de la mano de obra |
| Sin sesión: alta | SEC-68 | Tampoco se abre una orden sin sesión |
| Importación bancaria | SEC-66, SEC-67 | Ni sin sesión ni un técnico deshacen una importación |
| Admin | SEC-60 a SEC-62 | Ni un admin aprueba una línea con un UPDATE, sube PDFs a `reportes` ni llama funciones internas |

**Cualquier FAIL es P0.**

### 5.2 Manuales

Con `TOKEN` de **M** (sección 2.5):

| ID | P | Ejecuta | Petición | Esperado |
|---|---|---|---|---|
| SEC-70 | P1 | IA | Un archivo **de prueba** subido por **M** a una orden que luego se entregó: `curl -X DELETE "$SB_URL/storage/v1/object/orden_media/<ruta>" -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN"` | Error; el archivo sigue (la galería lo muestra). *(AUD-11)* |
| SEC-71 | P0 | IA | Subir a la carpeta de una orden ajena: `curl -X POST "$SB_URL/storage/v1/object/orden_media/<sede>/<orden_ajena>/prueba.jpg" -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: image/jpeg" --data-binary @foto.jpg` | Error 400/403 |
| SEC-72 | P1 | IA | Editar el avance de otra persona: `curl -X PATCH "$SB_URL/rest/v1/orden_avances?id=eq.<avance_ajeno>" -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Prefer: return=representation" -d '{"descripcion":"x"}'` | `[]` |
| SEC-73 | P1 | IA | Con token de **A**: borrar por la API una orden con comisiones pagadas: `curl -X DELETE "$SB_URL/rest/v1/ordenes_trabajo?id=eq.<orden>" -H "apikey: $SB_ANON" -H "Authorization: Bearer $TOKEN_ADMIN"` | 400, código `P0001`; la orden sigue *(AUD-05)* |
| SEC-74 | P0 | IA | Con token de **B**: `curl "$SB_URL/rest/v1/orden_media?select=ruta&orden_id=eq.<orden_sede_A>" ...` | `[]` |

---

## 6. Matriz de dispositivos (DEV)

Marca ✅ / ❌ y anota versión de sistema y navegador.

| ID | Prueba | Android · Chrome | iPhone · Safari | iPhone · app instalada | Computadora · Chrome | Computadora · Safari/Firefox |
|---|---|:---:|:---:|:---:|:---:|:---:|
| DEV-01 | Foto con cámara (MED-01) | | | | n/a | n/a |
| DEV-02 | Video grabado en la app, corte a 2 min (MED-02) | | | | | |
| DEV-03 | Video de galería convertido (MED-04) | | | | | |
| DEV-04 | Video de más de 2 min rechazado (MED-05) | | | | | |
| DEV-05 | Nota de voz (MED-03) | | | | | |
| DEV-06 | Reproduce video grabado en la otra plataforma (MED-15) | | | | | |
| DEV-07 | Subida sigue tras modo avión (MED-10) | | | | | |
| DEV-08 | Subida sigue tras recargar (MED-11) | | | | | |
| DEV-09 | Campana en tiempo real (NOT-01) | | | | | |
| DEV-10 | Push con la app cerrada (NOT-06/07) | | ❌ esperado | | | |
| DEV-11 | Instalar como app (PWA-01/02) | | n/a | | | |
| DEV-12 | Portal: abre, reproduce video, llamar/WhatsApp (POR-13/14) | | | n/a | | |
| DEV-13 | Correo de recepción se ve bien en la app de correo (POR-12) | | | n/a | | |
| DEV-14 | Campos sin zoom al tocar (MOV-01) | | | | n/a | n/a |
| DEV-15 | Enviar reporte por WhatsApp abre la app (REP-06) | | | | n/a | n/a |
| DEV-16 | Descargar PDF: se guarda y se abre (REP-08) | | | | | |
| DEV-17 | Firmar con el dedo y ver totales actualizados (ORD-12) | | | | n/a | n/a |

---

## 7. Regresiones

Errores ya corregidos. Si alguno reaparece, es una regresión **P0**.

| Error original | Caso que lo comprueba | Además, automatizado en |
|---|---|---|
| Un movimiento del día 1 contaba en el mes anterior | DIN-10 | `lib/dates.test.ts` |
| Después de las 7 p. m. se guardaba la fecha de mañana | DIN-11, ORD-13 | `lib/dates.test.ts` |
| Des-entregar dejaba el cobro asentado | DIN-04 | pgTAP 01 |
| Re-entregar no volvía a cobrar el saldo | DIN-05 | pgTAP 01 |
| Deshacer un pago de comisiones borraba el egreso de otro técnico | COM-04 | pgTAP 01 |
| Un técnico podía entregar, cotizar o escribir totales | SEC-40 a SEC-42 | pgTAP 01 |
| Un técnico podía sacar una orden de Entregado por la API | SEC-53 | pgTAP 03 |
| Un técnico no asignado podía cambiar estado, avance y firma por la API | SEC-51 | pgTAP 03 |
| Las firmas y fotos viejas se descargaban sin sesión | SEC-14, SEC-15 | — |
| Tres técnicos cobraban $0.01 de más | COM-01 | pgTAP 01 |
| Mano de obra negativa aceptada | ORD-01 con costo −100 | pgTAP 07 |
| Fallar la subida de fotos duplicaba la orden al reintentar | ORD-01 en modo avión: una sola orden | — |
| "Finalizadas del mes" bajaba al entregar | Panel antes y después de DIN-02 | — |
| Reabrir una orden dejaba la fecha de finalización | ORD-10 | — |
| Tarjetas de órdenes pegadas, zoom en iPhone, "Cerrar sesión" fuera de pantalla, sin búsqueda en el teléfono | MOV-01 a MOV-05 | — |
| Cancelar "Entregado" dejaba el selector mostrando "Entregado" | ORD-09, ORD-11 | `KanbanBoard.test.tsx` |
| La campana re-descargaba todas las órdenes cada 60 s | DevTools → Network en el panel: sin peticiones periódicas a `ordenes_trabajo` | — |
| El PDF compartido mostraba notas internas, técnicos y fotos no publicadas | REP-08 | `lib/reportMedia.test.ts` |
| Funciones internas de dinero ejecutables por la API *(AUD-01)* | SEC-05 a SEC-08, SEC-27, SEC-62 | pgTAP 07 |
| Un técnico creaba órdenes "entregadas" por la API *(AUD-02)* | SEC-55 | pgTAP 07 |
| Un técnico se asignaba a una orden y con eso a su comisión | SEC-69, SEC-39 | pgTAP 07 |
| Volver a firmar autorizaba trabajos nuevos *(AUD-03)* | PRE-15 | pgTAP 07 |
| Borrar una orden podía dejarla sin su dinero *(AUD-04)* | DIN-08 | — |
| Borrar una orden con comisiones pagadas *(AUD-05)* | DIN-09, SEC-73 | pgTAP 07 |
| Firmar no actualizaba totales ni presupuesto *(AUD-06)* | ORD-12 | `WorkOrders.smoke.test.tsx` |
| Con mala señal la app mandaba al login *(AUD-07)* | SES-01 | `AuthContext.test.tsx` |
| Orden de otra sede con logo, WhatsApp y técnicos de la sede elegida *(AUD-08)* | ORD-14 | `WorkOrders.smoke.test.tsx` |
| Editar un empleado fallaba: `update-employee` no estaba desplegada *(AUD-26)* | CFG-04 | `qa:security` SEC-17 |
| Totales del panel y de Finanzas cortados a 1.000 filas *(PRD-10)* | DIN-12 | pgTAP 08, `dashboard.service.test.ts` |
| Listas cortadas a 1.000 filas; lista de clientes que no cargaba por largo de URL *(PRD-11/12)* | DIN-12 | `support.test.ts`, `customers.service.test.ts` |
| Montos del admin visibles para el siguiente usuario de la tablet *(PRD-13)* | ACC-07 | `AuthContext.test.tsx` |
| Importación bancaria que dejaba un lote vacío *(PRD-14)* | FIN-08 | pgTAP 08, `ImportStatementModal.test.tsx` |
| Registro público abierto *(PRD-01)* | ACC-08 | `qa:security` SEC-18 |

---

## 8. Antes de cada publicación

Siempre:

- [ ] AUT-01 a AUT-04 en verde.
- [ ] AUT-05 (pgTAP) si hay Docker; **obligatorio** si la versión trae migraciones.
- [ ] `npm run db:check` antes de desplegar: sabes qué migraciones se van a aplicar.
- [ ] AUT-06 (`qa:security`) **después** de aplicar las migraciones: 0 FAIL.

Según lo que toca el cambio:

| Si toca… | Ejecuta |
|---|---|
| Órdenes, dinero o permisos | ORD, DIN, COM y SEC completos |
| Multimedia o notificaciones | MED, NOT y al menos Android + iPhone de la matriz |
| Portal, correos o `datos_portal` | POR, REP y SEC-01 a SEC-26 |
| Líneas, totales o presupuestos | DIN, PRE y SEC-40, SEC-60 |
| La firma | ORD-07, ORD-12, PRE-02, PRE-15, POR-07 |
| Sesión o sedes | ACC, SES, SED |
| Estilos | MOV en un teléfono real |
| Listas, totales o servicios de datos | DIN-12 y la lista afectada con más de 1.000 filas |
| Sesión o caché de datos | ACC-07 |
| Edge functions o secretos | SEC-17 y los casos del módulo que usa la función (CFG para empleados, POR para `portal`, NOT/POR para `process-outbox`) |

Después de publicar: [deployment.md §6](deployment.md#6-verificación-después-de-publicar).

---

## 9. Reporte de resultados

### 9.1 Plantilla de la ejecución

```markdown
# Ejecución del plan de pruebas — AAAA-MM-DD

- Entorno: <URL del sitio> · Supabase <ref>
- Versión: <commit> · Última migración: <versión de db:check>
- Nivel: Humo | Publicación | Completa
- Ejecutó: <persona o agente>

## Resumen
PASS: n · FAIL: n · BLOQUEADO: n · N/A: n

## Resultados
| ID | Resultado | Evidencia / nota |
|---|---|---|
| AUT-06 | PASS | 52 casos: 45 PASS, 0 FAIL, 7 SKIP (sin ORDEN_ENTREGADA) |
| ORD-12 | FAIL | Ver H-1 |
| MED-02 | BLOQUEADO | Requiere dispositivo |

## Hallazgos
(uno por FAIL, con el formato de 9.2)
```

### 9.2 Cómo reportar un error

```
H-<n> · Caso: <ID>
Qué hice:        (pasos exactos, desde qué pantalla)
Qué esperaba:    (el "Esperado" del caso, o la regla de reglas-de-negocio.md)
Qué pasó:        (texto exacto del mensaje; captura)
Quién:           (rol y sede de la cuenta; número de orden)
Dónde:           (dispositivo, sistema, navegador y versión; app instalada o pestaña)
Cuándo:          (fecha y hora, para buscar en los registros)
Consola / red:   (errores rojos de DevTools; respuesta HTTP)
Estado en base:  (salida de scripts/qa/estado-orden.sql, si aplica)
```

Para subidas: el motivo que muestra la bandeja al expandirla. Para push: los pasos de
diagnóstico en [multimedia-y-notificaciones.md](multimedia-y-notificaciones.md#diagnóstico-1).
