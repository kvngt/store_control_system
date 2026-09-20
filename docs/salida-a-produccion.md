# Salida a producción

Revisión completa de Restorify con la premisa de **atender clientes reales mañana**:
qué podía fallar con datos reales, qué se corrigió, qué falta hacer fuera del código y
cómo publicar sin romper nada. Complementa la [auditoría de septiembre](auditoria-2026-09.md).

> Revisión del **15 de septiembre de 2026**. Todo lo marcado "corregido" está en el código
> y probado. **Desplegado el mismo día:** la migración 36 y las funciones `create-employee` (v4)
> y `update-employee` (v2). **Falta subir el build nuevo** a Hostinger
> ([sección 4](#4-el-día-de-la-salida)): hasta entonces el sitio publicado sigue sumando los
> totales en el navegador.

---

## Índice

1. [Resumen](#1-resumen)
2. [Bloqueantes fuera del código](#2-bloqueantes-fuera-del-código)
3. [Errores corregidos en el código](#3-errores-corregidos-en-el-código)
4. [El día de la salida](#4-el-día-de-la-salida)
5. [Volver atrás](#5-volver-atrás)
6. [La primera semana](#6-la-primera-semana)
7. [Cómo se revisó](#7-cómo-se-revisó)
8. [Lo que se revisó y estaba bien](#8-lo-que-se-revisó-y-estaba-bien)
9. [Deuda conocida](#9-deuda-conocida)

---

## 1. Resumen

**No salir a producción sin completar la sección 2.** Hay dos bloqueantes que no se
arreglan con código: el registro público de cuentas está **abierto** en el proyecto real, y
el plan gratuito de Supabase **no tiene respaldos**.

| | Críticos | Altos | Medios | Bajos |
|---|---|---|---|---|
| Fuera del código (acción de quien administra) | 2 | 2 | 3 | 1 |
| En el código (corregidos) | 1 | 4 | 4 | 5 |

Lo más grave del código: **los totales de dinero del panel y de Finanzas se calculaban en el
navegador sobre listas que la API recorta a 1.000 filas sin avisar.** Con la importación
bancaria eso se pasa en pocos meses y los ingresos del mes salían mal, sin ningún error.

Resultado de las verificaciones después de corregir:

| Verificación | Resultado |
|---|---|
| Vitest | 303 pruebas, 43 archivos, en verde |
| Recorrido del login en el navegador contra Supabase local (cuenta inexistente, sin perfil, primer admin, alta/edición/baja de empleados, recuperación, enlace usado, base sin usuarios) | 33 pasos; 5 fallos encontrados y corregidos (PRD-26 a PRD-28) |
| pgTAP (Supabase local, 36 migraciones desde cero) | 176 aserciones, 8 archivos, en verde |
| Integración contra la API local (RPC nuevas, conteos, paginación, cuenta sin perfil) | 7 de 7 |
| `tsc -b`, `oxlint`, `npm run build`, `deno check` de las funciones cambiadas | Sin errores |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| `npm run qa:security` contra el proyecto real | 1 FAIL esperado: **SEC-18, registro público abierto** |

---

## 2. Bloqueantes fuera del código

Nadie más que quien administra las cuentas puede hacer esto. Marca cada uno.

| ID | Severidad | Qué | Por qué | Cómo |
|---|---|---|---|---|
| **PRD-01** | **Crítica** | **Apagar el registro público** | El proyecto real tiene `disable_signup: false` (comprobado en `/auth/v1/settings`). Cualquiera se crea una cuenta por la API. Sin perfil no ve datos (la migración 36 lo asegura), pero gasta el cupo de correos de Auth —el mismo que usan los técnicos para recuperar la contraseña— y llena `auth.users` | Panel → Authentication → Sign In / Providers → **Allow new users to sign up: apagado**. Las cuentas se siguen creando desde Configuración → Personal. Comprobar: `npm run qa:security` → SEC-18 en PASS |
| **PRD-02** | **Crítica** | **Plan Pro** | Free no hace respaldos diarios y pausa el proyecto tras una semana sin uso. Un error humano o un borrado en cascada no tendría vuelta atrás | Organization → Billing → Pro. Después, Database → Backups muestra los respaldos diarios |
| **PRD-03** | Alta | **Rotar la llave de Resend** | La llave de envío se compartió en una conversación con una IA. La de acceso total que se usó para verificar el dominio puede seguir viva | Resend → API Keys: crear una de solo envío para `reinventa.shop`, `npx supabase secrets set RESEND_API_KEY=<nueva>`, borrar las anteriores. Comprobar con un correo de prueba (plan de pruebas POR-07) |
| **PRD-04** | Alta | **Cuentas y datos de prueba** | Hay 5 cuentas (2 nunca iniciaron sesión, varias con dominio `restorify.com`), las credenciales de una admin están en `.env.test.local` y las pruebas e2e escriben datos `PWTEST` en este mismo proyecto | Configuración → Personal: dejar solo personal real, cambiar la contraseña de toda cuenta cuyas credenciales estén en un archivo. No correr `test:e2e` contra producción (`qa:security` ya no escribe nada) |
| **PRD-05** | **Alta** | **SMTP de Auth con Resend** | El correo propio de Supabase permite unos 2 por hora y, según la política de Supabase para ese servidor de fábrica, solo entrega a correos del equipo de la organización: el "¿Olvidaste tu contraseña?" de un técnico puede no llegarle nunca. Comprobar con un correo que no sea del equipo (manual-de-pruebas A-08, B-13) | [deployment.md §4.2](deployment.md#42-auth) |
| **PRD-06** | Media | **Sentry** | `VITE_SENTRY_DSN` está vacía: un error en el teléfono de un técnico no llega a nadie | Crear el proyecto en Sentry (org `restorify`, proyecto `restorify-frontend`, ya configurados en `vite.config.ts`), poner el DSN en `.env.local` y recompilar |
| **PRD-07** | Media | **Contraseñas de 8 caracteres en Auth** | La app y las funciones ya exigen 8; Auth en el panel sigue en 6 y aceptaría una de 6 desde la recuperación de contraseña | Authentication → Sign In / Providers → Email → Minimum password length: 8 |
| **PRD-08** | Baja | **Vaciar los buckets de prueba** | `vehiculos_fotos` (78 MB), `firmas` y `reportes` guardan datos de antes de las fases | [supabase.md §14](supabase.md#14-pendientes-y-limpieza) |

---

## 3. Errores corregidos en el código

Migración `20260927000000_production_hardening.sql`, prueba `08_produccion.test.sql` y los
archivos de frontend que se nombran.

### PRD-10 · Crítica · Totales de dinero cortados a 1.000 filas

**Qué pasaba.** `dashboard.service.ts` descargaba todas las órdenes y todos los movimientos
con `select('*')` y los sumaba en el navegador; la tarjeta de totales de Finanzas sumaba la
lista de movimientos. La API de Supabase devuelve como máximo 1.000 filas por consulta y no
avisa. La consulta de movimientos del panel ni siquiera tenía orden (las 1.000 que llegaban
eran cualesquiera) y además ignoraba su error.

**Escenario.** Una sede importa su estado de cuenta: 200–400 movimientos por mes más los
automáticos. Al tercer o cuarto mes, "Ingresos del mes" muestra una fracción del real y el
gráfico de seis meses también. El dueño toma decisiones con números falsos.

**Corrección.** RPC `resumen_panel(sede, hoy, zona)`: la base suma, con la zona horaria del
taller y respetando RLS (un técnico recibe ceros en dinero, como antes). Los totales de
Finanzas salen de la misma RPC.

**Se comprueba con.** pgTAP 08 (1.500 movimientos) · `dashboard.service.test.ts` · integración local.

### PRD-11 · Alta · Listas cortadas a 1.000 filas

**Qué pasaba.** Órdenes, clientes, vehículos, movimientos, comisiones y pagos se leían sin
paginar.

**Escenario.** Con más de 1.000 clientes, los más antiguos desaparecen del buscador de
"Nueva orden": el taller no encuentra al cliente y lo crea de nuevo. Con más de 1.000
órdenes, el tablero pierde las más viejas.

**Corrección.** `fetchAll` en `src/services/support.ts`: lee de a 1.000 con `.range()` y un
orden estable (terminado en `id`) hasta que una página llega incompleta. Lo usan todos los
servicios de listas.

**Se comprueba con.** `support.test.ts` (2.500 filas en tres páginas, error en una página).

### PRD-12 · Alta · Lista de clientes que dejaba de cargar

**Qué pasaba.** Los conteos de vehículos y órdenes se pedían con
`.in('cliente_id', [todos los ids])`: con unos cientos de clientes la URL pasa el largo que
acepta el servidor y la pantalla de Clientes falla entera. Esas dos consultas tampoco
paginaban.

**Corrección.** Conteo embebido en la misma consulta: `select('*, vehiculos(count),
ordenes_trabajo(count)')`.

**Se comprueba con.** `customers.service.test.ts` · integración local.

### PRD-13 · Alta · Datos de otra persona en la tablet compartida

**Qué pasaba.** Al cerrar sesión no se vaciaba la caché de TanStack Query. En la tablet del
taller, un técnico que entraba después de un admin veía por un momento las órdenes, montos
y KPIs que había cargado el admin, hasta que llegaba su propia consulta.

**Corrección.** `AuthContext` vacía la caché al cerrar sesión, cuando la sesión termina en
otra pestaña y cuando entra otra persona sin cerrar sesión.

**Se comprueba con.** `AuthContext.test.tsx` (dos casos nuevos) · plan ACC-07.

### PRD-14 · Alta · Importación bancaria a medias

**Qué pasaba.** Tres escrituras separadas: subir el PDF, crear el lote, insertar los
movimientos. Si fallaba la última (sin red, un valor inválido), quedaba un lote vacío que
además hacía creer que ese archivo ya se había importado.

**Corrección.** RPC `importar_estado_cuenta`: el lote y sus movimientos en una transacción;
si falla, se borra el PDF subido.

**Se comprueba con.** pgTAP 08 · `ImportStatementModal.test.tsx` · integración local · plan FIN-08.

### PRD-15 · Media · Pagar dos veces las mismas comisiones

**Qué pasaba.** `pay_commissions` sumaba las comisiones sin bloquearlas. Dos admins, o dos
pestañas, pagando a la vez registraban dos cheques y dos egresos.

**Corrección.** `SELECT … FOR UPDATE` antes de sumar: el segundo espera y termina con "no hay
comisiones pendientes".

**Se comprueba con.** pgTAP 08.

### PRD-16 · Media · Un `config push` habría dejado a todos sin poder entrar

**Qué pasaba.** `supabase/config.toml` tenía `[auth.email] enable_signup = false`. En la CLI
esa clave apaga el **proveedor de correo** entero, no solo el registro. La prueba de
integración lo reveló: el Supabase local respondía "Email logins are disabled". Si alguien
aplicaba ese archivo al proyecto real para cerrar el registro público (PRD-01), nadie podía
iniciar sesión.

**Corrección.** `[auth.email] enable_signup = true` con la explicación; el registro se cierra
con `[auth] enable_signup = false`. Mínimo de contraseña 8.

### PRD-17 · Media · Llaves foráneas sin índice

**Qué pasaba.** 27 llaves foráneas sin índice, entre ellas las que usan las políticas RLS
(`orden_asignaciones.orden_id`), las líneas de cada orden y los borrados en cascada. Con miles
de órdenes, cada consulta y cada borrado recorren tablas enteras.

**Corrección.** 14 índices en las rutas que se usan (listas por sede, líneas por orden,
asignaciones, movimientos por sede y fecha, cascadas). Las restantes son columnas de autoría
(`creado_por`, `pagado_por`) que nunca se filtran.

### PRD-18 · Media · Sitio sin cabeceras de seguridad

**Qué pasaba.** `reinventa.shop` no enviaba `X-Frame-Options` (la app se podía incrustar en
otro sitio para engañar clics), ni `Strict-Transport-Security`, ni `X-Content-Type-Options`.
`index.html` no tenía política de caché: tras publicar, un navegador podía quedarse con la
versión anterior.

**Corrección.** `public/.htaccess`: esas cabeceras, `Referrer-Policy`, `Permissions-Policy`
(cámara y micrófono solo para el propio sitio), `no-cache` en `index.html` y un año de caché
para los archivos con hash. Solo directivas que Hostinger acepta; comprobar tras publicar
(sección 4).

### PRD-19 · Baja · Una cuenta sin perfil leía sedes y subía archivos

**Qué pasaba.** Con el registro abierto (PRD-01), una cuenta nueva sin fila en `perfiles`
podía leer todas las sedes (dirección, teléfono, correo de contacto, porcentaje de comisión)
y subir archivos al bucket **público** `avatares`.

**Corrección.** `sedes_select` y las políticas de `avatares` exigen perfil.

**Se comprueba con.** pgTAP 08 · integración local.

### PRD-20 · Baja · Aviso push que abría cualquier sitio

**Corrección.** `public/sw.js` solo navega a rutas del propio sitio.

### PRD-21 · Baja · `search_path` sin fijar

**Corrección.** `create_work_order` y `es_correo_valido` con `search_path = public`.

### PRD-22 · Baja · Contraseñas de 6 caracteres

**Corrección.** Mínimo 8 en la app (`src/lib/password.ts`), `create-employee`,
`update-employee` y `config.toml`. Falta el panel (PRD-07).

### PRD-23 · Baja · Proyecto difícil de heredar

**Qué pasaba.** Sin integración continua, sin versión de Node fijada, sin instrucciones para
agentes de IA en la raíz y sin documento de traspaso.

**Corrección.** `.github/workflows/ci.yml` (lint, tipos, pruebas, build y pgTAP con las
migraciones desde cero), `.nvmrc` y `engines` (Node 22), `AGENTS.md` y `CLAUDE.md`,
[traspaso.md](traspaso.md).

### PRD-24 · Media · Borrar una línea o una asignación podía fingir éxito

**Qué pasaba.** Quitar mano de obra, un repuesto o una asignación no comprobaba que la base
hubiera borrado algo. Un DELETE que RLS rechaza no da error, borra cero filas: la pantalla
decía que se quitó y la línea volvía al recargar. Venía de
[plan-de-mejora.md](plan-de-mejora.md) (B-04, B-05).

**Corrección.** `removeLaborItem`, `removePart` y `removeAssignment` usan `assertDeleted`,
como ya lo hacían órdenes, clientes y vehículos. Prueba: `workOrders.service.test.ts`.

### PRD-25 · Baja · Avance de una orden fuera de 0–100 por la API

**Corrección.** Restricción `ordenes_trabajo_porcentaje_avance_rango` en la migración 36
(`NOT VALID`: no revisa filas viejas, exige el rango en cada escritura). Prueba: pgTAP 08.

De ese mismo documento se revisaron y **no eran errores**: B-03 (`fecha_finalizacion` es
`timestamptz`; guardar el instante en UTC es lo correcto y se muestra en hora local) y B-10
(`sw.js` ya se sirve sin caché). B-07 (capacidad por defecto repetida) quedó unificada en
`DEFAULT_CAPACITY`.

### PRD-26 · Alta · Los errores de las funciones de empleados llegaban en inglés técnico

**Qué pasaba.** Cuando `create-employee`, `update-employee` o `delete-employee` rechazaban algo
(correo repetido, quitar el rol al único admin, empleado con órdenes), el admin veía
"Edge Function returned a non-2xx status code". `functions.invoke` no entrega el cuerpo de
un 4xx; el motivo en español que escriben las funciones nunca llegaba a la pantalla.

**Corrección.** `invokeAdminFunction` (`src/services/users.service.ts`) lee el cuerpo de la
respuesta y convierte "already been registered" de Auth en "Ya existe una cuenta con ese
correo". No hace falta volver a desplegar las funciones. Prueba: `users.service.test.ts`.

### PRD-27 · Media · Una cuenta sin perfil "no hacía nada" al entrar

**Qué pasaba.** Una cuenta creada en Authentication → Users (sin fila en `perfiles`) iniciaba
sesión, la app la devolvía al login sin ningún mensaje y la sesión quedaba guardada en el
navegador. Parecía que el botón Entrar no funcionaba.

**Corrección.** `login` comprueba el perfil: sin él cierra la sesión y muestra "Esta cuenta no
tiene acceso al taller. Pide a un administrador que te dé de alta." Pruebas en
`AuthContext.test.tsx`.

### PRD-28 · Media · Recuperar la contraseña: dos callejones sin salida

**Qué pasaba.** (1) Después de guardar la contraseña nueva, **Entrar al sistema** dejaba a la
persona en `/reset-password` con el formulario otra vez, y **Cancelar** tampoco salía de ahí.
(2) Un enlace vencido o ya usado mostraba el formulario sin aviso, y al guardar decía
"Revisa tu conexión". Los mensajes de límite de correos también decían "revisa tu conexión".

**Corrección.** `ResetPassword` navega al panel o al login, y detecta el enlace inválido
(`#error_code=otp_expired` o sin sesión) con un mensaje y un botón para pedir otro. Nuevos
mensajes para `over_email_send_rate_limit`. Pruebas en `ResetPassword.test.tsx`; recorrido
completo en el navegador contra Supabase local con los correos de Mailpit.

### Sin usuarios en la base

Probado contra Supabase local con cero cuentas: la app muestra el login, cualquier intento
dice "Correo o contraseña incorrectos" y "¿Olvidaste tu contraseña?" responde lo mismo sin
enviar nada. Nadie puede crear el primer administrador desde la app (a propósito: el registro
está apagado y `create-employee` exige un admin). Se crea con
[scripts/admin/crear-primer-admin.sql](../scripts/admin/crear-primer-admin.sql), que también
crea una sede si no hay ninguna; con esa cuenta todas las pantallas cargan vacías sin errores
y se puede dar de alta al resto.

---

## 4. El día de la salida

En este orden. La migración 36 es **compatible con el sitio que está publicado hoy**, así que
se puede aplicar antes de subir el build nuevo; el build nuevo, en cambio, **necesita** la
migración.

**Antes (la víspera):**

- [ ] Sección 2 completa, sobre todo PRD-01 y PRD-02.
- [ ] `git pull`, `npm ci`, y todo en verde: `npm run lint && npx tsc -b && npm test && npm run build`.
- [ ] Con Docker: `npx supabase start && npm run test:db` (176 en verde).
- [ ] Guardar una copia del `public_html/` actual de Hostinger (para volver atrás).
- [ ] Respaldo manual: Database → Backups (Pro) o `npx supabase db dump --linked -f respaldo-antes-de-salida.sql` (contiene datos personales: no subirlo a git ni compartirlo).

**Publicar:**

```bash
# 1 y 2 hechos el 15 de septiembre de 2026 (migración 36, create-employee v4, update-employee v2)
npm run db:check                                   # ya no debe listar migraciones pendientes
npx supabase db push --linked                      # 1. la base
npx supabase functions deploy create-employee      # 2. contraseñas de 8
npx supabase functions deploy update-employee
npm run build                                      # 3. PENDIENTE: el frontend → subir dist/ (con .htaccess) a public_html/
```

**Comprobar (15 minutos):**

- [ ] `https://reinventa.shop` abre (si responde **500**, ver sección 5: es el `.htaccess`).
- [ ] `curl -sI https://reinventa.shop/ | grep -iE "x-frame|nosniff|strict-transport"` muestra las tres cabeceras.
- [ ] Sin el aviso de "esquema desactualizado".
- [ ] `npm run qa:security` → **0 FAIL** (SEC-18 en PASS si ya se hizo PRD-01).
- [ ] Panel: los ingresos del mes coinciden con `SELECT SUM(monto) FROM finanzas_movimientos WHERE tipo = 'ingreso' AND fecha >= date_trunc('month', CURRENT_DATE)` (por sede).
- [ ] Nivel "humo" de [plan-de-pruebas.md](plan-de-pruebas.md): login de admin y de técnico, crear una orden, firmar, entregar, correo de recepción, portal.
- [ ] En la tablet del taller: entrar como admin, cerrar sesión, entrar como técnico → no aparece ningún monto (ACC-07).

---

## 5. Volver atrás

| Síntoma | Qué hacer |
|---|---|
| El sitio responde **500** después de subir `dist/` | Casi seguro el `.htaccess`: restaurar el anterior desde la copia de la víspera (o borrar el bloque de cabeceras). El resto del `dist/` puede quedarse |
| La app nueva falla y la base está bien | Subir el `public_html/` de la víspera. Funciona con la migración 36 aplicada |
| Falla algo de la migración 36 | No tiene "down". Escribir una migración nueva que revierta lo necesario (cada punto de la 36 es independiente: RPC nuevas, un `CREATE OR REPLACE`, índices, tres políticas, una restricción). Con Pro, restaurar el respaldo de la víspera es el último recurso: se pierde lo registrado desde entonces |
| Nadie puede iniciar sesión | Revisar Authentication → Sign In / Providers → **Email** encendido (PRD-16: no confundir "registro" con "proveedor de correo") |
| `create-employee` rechaza contraseñas | Esperado si tienen menos de 8 caracteres |

---

## 6. La primera semana

Cada mañana, 10 minutos:

```sql
-- Correos y push con error en las últimas 24 h
SELECT canal, plantilla, estado, ultimo_error, COUNT(*)
FROM cola_envios WHERE creado_en > NOW() - INTERVAL '1 day' AND estado IN ('error', 'pendiente')
GROUP BY 1, 2, 3, 4;

-- Tareas programadas que fallaron
SELECT j.jobname, d.status, d.start_time, d.return_message
FROM cron.job_run_details d JOIN cron.job j USING (jobid)
WHERE d.status <> 'succeeded' AND d.start_time > NOW() - INTERVAL '1 day';
```

- Supabase → Logs & Analytics: errores 5xx de la API y de las Edge Functions.
- Supabase → Usage: Storage y egress (el video es lo que más crece).
- Resend → Emails: rebotes y quejas de spam.
- Sentry (si se hizo PRD-06): errores nuevos.
- Preguntar al taller: ¿alguien vio un total raro, una orden que no aparece, un correo que no llegó?

---

## 7. Cómo se revisó

1. **Configuración real, no la del repositorio.** `/auth/v1/settings` del proyecto (así
   apareció PRD-01), cabeceras de `reinventa.shop`, redirección a HTTPS.
2. **Historial de git** buscando llaves (JWT, Resend, VAPID, llaves privadas): solo hay
   ejemplos incompletos en `.env.example` y en un documento.
3. **Límites de la plataforma que no se ven en desarrollo**: 1.000 filas por consulta,
   largo de URL, `statement_timeout` de 8 s del rol de la API.
4. **Revisión tipo "advisor" de Supabase** (solo lectura): llaves foráneas sin índice,
   funciones sin `search_path`, tablas sin RLS, usuarios sin perfil.
5. **Problemas típicos del código generado con IA**: `catch` vacíos, `console.log`, pruebas
   `.only`/`.skip`, `TODO`, `any`, TypeScript sin `strict`, dominios escritos a mano,
   operaciones en varias peticiones que deberían ser una transacción, carreras en
   operaciones de dinero, cachés compartidas entre usuarios, configuración que dice una cosa
   y hace otra.
6. **Pruebas nuevas antes de dar algo por corregido**, y una prueba de integración real
   contra el Supabase local que llama la API como la app.

---

## 8. Lo que se revisó y estaba bien

- Sin secretos en el repositorio ni en su historial; `.gitignore` cubre `*.local`.
- La llave de servicio solo existe en las Edge Functions.
- RLS activo en las 22 tablas; ninguna cuenta de Auth sin perfil.
- TypeScript `strict`, `noUnusedLocals`; 2 `any` en todo el frontend; sin `console.log`,
  sin `TODO`, sin pruebas `.only`.
- Los `catch` vacíos que quedan son de "mejor esfuerzo" documentado (borrar archivos
  huérfanos, sincronizar push).
- `npm audit --omit=dev`: 0 vulnerabilidades.
- HTTP redirige a HTTPS.
- Todo lo de la [auditoría de septiembre](auditoria-2026-09.md#6-lo-que-se-revisó-y-estaba-bien).

---

## 9. Deuda conocida

No bloquea la salida, pero conviene planearla:

| Qué | Cuándo importa | Idea |
|---|---|---|
| El tablero y la lista de órdenes cargan **todas** las órdenes de la sede, entregadas incluidas | Con miles de órdenes, la carga en teléfono se vuelve lenta (ahora completa, pero pesada) | Mostrar activas + entregadas de los últimos 90 días; buscar las demás |
| Finanzas carga todos los movimientos para la tabla | Igual que arriba | Paginar la tabla por mes |
| No hay Content-Security-Policy | Mitigaría un XSS | Definirla probando en navegador (Supabase, Google Fonts, Sentry, `blob:` para video, workers de PDF) |
| No hay staging | Cada migración se prueba en local y va directo a producción | Segundo proyecto de Supabase |
| Pruebas e2e contra producción | Con staging | Apuntarlas a staging |
| Depósito mayor que lo autorizado sin reembolso | Primer caso real | Decisión de negocio (AUD-20) |
