# Ejecución del plan de pruebas — 2026-09-17

- Entorno: `http://localhost:5173` (código del repositorio) · Supabase `lendsiqkxhvbxxkaadrt`
- Versión: `32ce09d` · Última migración: 36 aplicadas, base al día
- Nivel: **Humo, parcial** — automatizadas (AUT) completas, casos de acceso y sesión, y
  los casos por módulo que cubre la suite e2e. Los casos de dinero (DIN), creación de
  órdenes (ORD-01/05/06/12), presupuestos, portal y reporte **no se ejecutaron**: escriben
  datos y movimientos de dinero en el proyecto real y no hay entorno de staging.
- Ejecutó: agente de IA (Claude), sin intervención humana

## Resumen

**PASS: 47 · FAIL: 2 · BLOQUEADO: 4 · No ejecutado: los módulos de escritura (ver arriba)**

Los dos FAIL son de distinta naturaleza: uno es **un agujero de seguridad real en el
proyecto de producción (H-1)** y el otro es deuda de la propia suite e2e (H-3 a H-7).
Ninguno de los 10 fallos de Playwright corresponde a un defecto del producto.

## Resultados

### Automatizadas

| ID | Resultado | Evidencia / nota |
|---|---|---|
| AUT-01 | PASS | `npm run lint` y `npx tsc -b` sin errores ni avisos |
| AUT-02 | PASS | `npm test` → 43 archivos, **303/303** pruebas en verde |
| AUT-03 | PASS | `npm run build` termina sin errores (1 m 9 s) |
| AUT-04 | PASS | `npm run db:check` → "Base de datos al día — 36 migraciones aplicadas" |
| AUT-05 | BLOQUEADO | Docker Desktop no está corriendo; sin él no hay `supabase start` ni `npm run test:db`. **Las 8 suites pgTAP no se ejecutaron**, y son las que prueban dinero y permisos en la base |
| AUT-06 | **FAIL** | 53 casos: **35 PASS · 1 FAIL · 17 SKIP**. El FAIL es SEC-18 → **H-1**. Salida completa en `ejecucion-pruebas-2026-09-17-qa-security.json` |
| AUT-07 | BLOQUEADO | `--alta` crea una orden en el proyecto real; no se ejecutó sin autorización de la persona responsable |
| AUT-08 | **FAIL** | 60 PASS · 10 FAIL · 3 SKIP. Los 10 fallos son defectos de las pruebas, no del producto → **H-3 a H-7** |

### Acceso y sesión

| ID | Resultado | Evidencia / nota |
|---|---|---|
| ACC-01 | PASS | Contraseña incorrecta → error y sigue en `/login` (AUTH-01) |
| ACC-02 | PASS | El admin ve el menú completo, con Finanzas y Comisiones (AUTH-10, RBAC-01) |
| ACC-03 | PASS | El técnico no ve Finanzas ni Comisiones; `/finance` y `/payroll` lo devuelven al panel (RBAC-10, RBAC-11, RBAC-50, y comprobado aparte a mano) |
| ACC-04 | BLOQUEADO | Requiere una bandeja de correo — caso **H** |
| ACC-05 | PASS | Recarga en `/work-orders` → sigue con sesión en la misma pantalla |
| ACC-06 | PASS | Tras cerrar sesión, el botón Atrás deja `/login` y no muestra ningún monto |
| ACC-07 | PASS | Muestreo del DOM cada 150 ms durante 6 s después de entrar el técnico: **ningún monto**, tampoco un instante mientras carga |
| ACC-08 | **FAIL** | `disable_signup=false` → **H-1** |
| SES-01 | BLOQUEADO | Requiere un teléfono real — caso **H** |

### Permisos, sedes, clientes y vehículos

| ID | Resultado | Evidencia / nota |
|---|---|---|
| SED-02 | PASS | Un técnico no ve órdenes ni clientes de otra sede (SEC-34, SEC-35) |
| CLI-01 | PASS | Cliente sin nombre y sin teléfono → bloqueado (CUST-02) |
| CLI-05 | PASS | "Sin placa" desactiva los campos de placa (VEH-02) |
| CLI-06 | PASS | El técnico no ve botón de eliminar en clientes ni vehículos (RBAC-12) |
| CLI-08 | PASS (parcial) | La búsqueda global responde; no se probó cada criterio por separado |
| ORD-04 | PASS | Verificado a mano por las dos vías: tecleando `-250` el campo queda en `250`; pegando `-250`, el esquema lo rechaza con "no pueden ser negativas" y no crea la orden |

### Seguridad contra la API (SEC)

35 PASS, 1 FAIL (SEC-18 → H-1). Los 17 SKIP restantes necesitan una orden asignada al
técnico de prueba (**H-2**): SEC-40 a SEC-55 y SEC-60 **no se comprobaron**, e incluyen
que un técnico no pueda entregar una orden, escribir totales ni agregar mano de obra.

Sí se comprobó, entre otras cosas, que sin sesión no se listan clientes ni órdenes, no se
revierte un cobro ni se pagan comisiones; que un técnico no ve `orden_montos`, repuestos
con precio, Finanzas, presupuestos ni la cola de correos, y no se cambia a admin; que ni
un admin aprueba una línea con un `UPDATE` ni sube PDFs al bucket de reportes; y que las
6 edge functions están desplegadas.

---

## Hallazgos

```
H-1 · Caso: SEC-18 / ACC-08 — P0, SEGURIDAD
Qué hice:        npm run qa:security, y GET /auth/v1/settings con la clave anónima.
Qué esperaba:    "disable_signup": true — el registro público apagado (regla PRD-01).
Qué pasó:        HTTP 200 con "disable_signup": false.
Quién:           Cualquiera, sin sesión. La clave anónima viaja dentro del bundle
                 publicado en reinventa.shop, así que está al alcance de cualquiera.
Dónde:           Proyecto Supabase lendsiqkxhvbxxkaadrt (producción).
Cuándo:          2026-09-17.
Consola / red:   GET /auth/v1/settings → 200.
Impacto:         Cualquier persona puede crearse una cuenta en el sistema. Las políticas
                 RLS limitan lo que esa cuenta ve, pero deja de ser cierto que el acceso
                 lo controla quien administra.
Arreglo:         Panel de Supabase → Authentication → Sign In / Providers → apagar
                 "Allow new users to sign up". Es un cambio de panel, no una migración;
                 no lo apliqué porque toca el proyecto real.
```

```
H-2 · Caso: entorno de pruebas — impide ejecutar 17 casos SEC
Qué hice:        Probar las 4 cuentas de .env.test.local contra /auth/v1/token.
Qué esperaba:    Las 4 entran.
Qué pasó:        admin, pintor y admin de sede B entran (HTTP 200); el mecánico
                 (E2E_MECHANIC_*) devuelve HTTP 400 invalid_credentials.
Efecto:          Sin cuenta de técnico, qa:security salta 33 casos y la suite e2e falla
                 17 pruebas por timeout en el login. Ambos lo reportan como SKIP o como
                 fallo de la prueba, no como "falta una cuenta": es fácil creer que la
                 suite está sana cuando media suite no se está ejecutando.
Cómo seguí:      Repetí todo con la cuenta de pintor, que por diseño tiene exactamente
                 los mismos permisos que un mecánico. Los 33 SKIP pasaron a 35 PASS y
                 16 de los 17 fallos e2e desaparecieron.
Pendiente:       Recrear el mecánico de prueba (o corregir su contraseña) y asignarle una
                 orden, una ajena y una entregada, para que corran SEC-40 a SEC-55 y
                 SEC-60 — los casos que prueban que un técnico no toca el dinero.
Aparte:          E2E_BASE_URL apunta a https://reinventa.shop, el sitio en producción, así
                 que `npm run test:e2e` sin más golpea el sitio publicado. Esta ejecución
                 fue contra localhost. Conviene que el valor por defecto sea localhost.
```

```
H-3 · Caso: AUT-08 / RBAC-02 — deuda de pruebas, no es un error del producto
Qué pasó:        La prueba espera un botón "Nuevo Pago" (#new-payroll-btn) en /payroll.
Realidad:        Comisiones ya no tiene un botón global de pago: se paga por saldo de
                 técnico, con "Pagar saldo" dentro de cada tarjeta (Payroll.tsx:315).
                 Con cero saldos pendientes no hay ningún botón, que es lo correcto.
Arreglo:         Actualizar la prueba al flujo actual.
```

```
H-4 · Caso: AUT-08 / RBAC-40 y CFG-11 (4 pruebas) — deuda de pruebas
Qué pasó:        Las pruebas buscan un botón "Nuevo Empleado" en /settings.
Realidad:        El botón es #new-user-btn con el texto t('settings.newUser')
                 (UsersCard.tsx:210). La clave settings.newEmployee sigue en
                 translations.ts (línea 673) pero ya no la usa nadie en src/.
Arreglo:         Apuntar las pruebas a #new-user-btn y quitar la clave i18n muerta.
```

```
H-5 · Caso: AUT-08 / login.spec.ts:73 — deuda de pruebas
Qué pasó:        expect(page.locator('#new-customer-btn, .page-title')).toBeVisible()
                 → strict mode violation: el selector resuelve a 2 elementos.
Efecto:          La prueba muere antes de comprobar lo que le importa (que el técnico no
                 tenga botón de eliminar). Ese control sí se verifica en RBAC-12, que pasa.
Arreglo:         Añadir .first() o separar las dos aserciones.
```

```
H-6 · Caso: AUT-08 / WORK-02 y login.spec.ts:81 — deuda de pruebas
Qué pasó:        Las pruebas hacen miles.fill('-250') y esperan que el campo quede en '250'.
Realidad:        fill() escribe el valor de golpe y nunca dispara keydown, así que el
                 guardia de teclado (blockNegativeKeys) no interviene — igual que un
                 pegado. La segunda defensa sí actúa: al enviar, el esquema rechaza con
                 "Las millas de ingreso no pueden ser negativas" y no crea la orden.
                 Comprobado a mano: con pressSequentially('-250') el campo queda en '250'.
Arreglo:         Usar pressSequentially para probar el teclado, y dejar fill() para probar
                 el mensaje del esquema al enviar.
```

```
H-7 · Caso: AUT-08 / WORK-06 — intermitente
Qué pasó:        "las tarjetas de otros no tienen selector Mover a" falló en una corrida
                 completa (6 workers en paralelo, todos entrando con la misma cuenta) y
                 pasó en otra corrida completa y en aislado.
Arreglo:         Probable contención de sesión entre workers; conviene un storageState
                 por rol en vez de entrar en cada prueba.
```

```
H-8 · Caso: AUT-05 — cobertura que falta
Qué pasó:        Docker Desktop apagado; no se ejecutaron las 8 suites pgTAP.
Por qué importa: Son las pruebas que cubren los triggers de dinero y las políticas RLS,
                 justo lo que este plan considera P0 y lo que la ejecución de hoy dejó
                 menos cubierto.
Arreglo:         Levantar Docker y correr `npx supabase start && npm run test:db`.
```

---

## Qué falta por probar

Todo lo que escribe en el proyecto real, que es el corazón del nivel Humo:

- **ORD-01, ORD-05, ORD-06, ORD-12** — crear órdenes y ver la orden como técnico.
- **DIN-01 a DIN-06** — depósito, entrega, ajustes, reversión y comisiones.
- **PRE-15, POR-02, POR-13, REP-03** — presupuestos, portal del cliente y reporte.
- **SEC-40 a SEC-55, SEC-60** — los límites del técnico sobre una orden real.

Requieren crear una orden de prueba (y, para DIN, entregarla y generar comisiones) en
`lendsiqkxhvbxxkaadrt`, que es el proyecto de producción. Hoy contiene 2 sedes, 1 cliente
y 1 orden, así que el riesgo es bajo, pero es una decisión de quien administra.

---

## Corrección de los defectos de la prueba manual (misma fecha)

Ocho defectos reportados a mano por Kevin, más dos encontrados al arreglarlos. Las
funciones nuevas (estado "en espera de autorización", labores completables, avances
visibles al cliente, archivado) quedaron fuera por decisión suya y están registradas
en el plan.

| # | Defecto | Estado |
|---|---|---|
| D1 | "No autorizado" intermitente al crear o eliminar usuarios | Arreglado (falta desplegar 3 edge functions) |
| D2 | El error del diálogo no se ve en el teléfono sin subir | Arreglado |
| D3 | El aviso de recepción al cliente tardaba 2 minutos | Arreglado (migración sin aplicar) |
| D4 | "Volver a firmar": visible al técnico, sin cancelar, borraba la firma | Arreglado (migración sin aplicar) |
| D5 | Botones de grabar tapados en el teléfono | Arreglado |
| D6 | Salir de un avance a medias lo descartaba sin preguntar | Arreglado |
| D7 | Recuperar contraseña llevaba a `localhost:3000` | Arreglado en el repo; falta el panel de Supabase |
| D8 | 10 fallos de la suite e2e, ninguno del producto | Arreglado |
| D9 | **Nuevo:** un diálogo dentro de una tarjeta quedaba fuera de la pantalla | Arreglado |
| D10 | **Nuevo:** las cuentas de prueba fueron borradas del proyecto | Pendiente: recrearlas |

### D1 — por qué fallaba y por qué luego funcionaba

Dos causas independientes, y juntas explican la intermitencia.

1. **La petición salía sin credencial.** `invokeAdminFunction` dejaba que el SDK
   resolviera el token en cada llamada. `getSession()` devuelve `null` dentro del margen
   de 90 s previo al vencimiento cuando el refresco automático falló y su enfriamiento de
   60 s sigue corriendo; y como la clave pública es del formato nuevo (`sb_publishable_…`),
   la librería ya no usa la clave anónima como respaldo. La llamada salía **sin cabecera
   `Authorization`** y la función respondía 401 "No autorizado." a un administrador con la
   sesión abierta. Ahora el token se resuelve antes, con un `refreshSession()` de rescate,
   y se manda explícito; sin token, no se llama a la función y el mensaje dice que la
   sesión expiró.
2. **Las funciones se tragaban los errores de red.** `create-employee`, `update-employee`
   y `delete-employee` descartaban el `error` de `getUser()` y el de la consulta a
   `perfiles`. Un 429 o un 5xx pasajero dejaba al llamante en null → 401, o sin perfil →
   403. Por eso minutos después la misma acción funcionaba. El módulo compartido
   `supabase/functions/_shared/caller.ts` ahora separa **no se pudo comprobar** (503,
   reintentable) de **no eres admin** (403) y de **sesión vencida** (401), y cada respuesta
   lleva un `code` que el frontend traduce.

### D9 — un diálogo preso de su tarjeta (nuevo)

Encontrado al investigar por qué una prueba no lograba pulsar Guardar. `.card`
transiciona `all` y se levanta 2 px al pasar el ratón; mientras esa transición corre, su
`transform` computado es una matriz en vez de `none`, y **un elemento con transform es el
bloque contenedor de cualquier `position: fixed` que tenga dentro**. El `.modal-overlay`
dejaba de medirse contra la pantalla y se dibujaba dentro de la tarjeta: el diálogo
aparecía desplazado y sus botones caían fuera de la vista, sin forma de llegar a ellos.

Medido en el navegador: el overlay salía en `285,567 970x545` en vez de `0,0 1280x720`, y
el botón Guardar en `y = 1065` con una ventana de 720 px de alto. Ocurría en 2 de cada 4
aperturas, y afecta a los diálogos de Configuración, Clientes, Finanzas y Comisiones. En
el teléfono es peor, porque un toque deja el `:hover` pegado. Es muy probablemente la
misma causa del "no podía presionar el botón para agregar el video".

Se arregla con una regla: mientras una tarjeta contenga un diálogo, no se transforma.

### D10 — las cuentas de prueba ya no existen

`E2E_MECHANIC_*` y `E2E_PAINTER_*` de `.env.test.local` devuelven `invalid_credentials`, y
esos correos ya no están en `perfiles`: fueron borrados durante las pruebas manuales de
crear y eliminar empleados. No es una regresión del código. Mientras no se recreen, **22
pruebas e2e fallan en el login** y 17 casos SEC se saltan, que es la mitad de la
comprobación de que un técnico no toca el dinero.

### Qué falta para cerrar

1. Aplicar las dos migraciones (`npx supabase db push --linked`) y correr
   `npm run qa:security`.
2. Desplegar `create-employee`, `update-employee` y `delete-employee`.
3. Correr las pruebas pgTAP con Docker encendido (`npx supabase start && npm run test:db`).
4. En el panel de Supabase: apagar el registro público (H-1), y arreglar Site URL y
   Redirect URLs (D7).
5. Recrear las cuentas de prueba y anotarlas en `.env.test.local` (D10).

---

## Estado final tras aplicar todo (misma fecha, con autorización explícita)

| Comprobación | Resultado |
|---|---|
| `npx tsc -b` y `npm run lint` | Sin errores ni avisos |
| `npm test` | **328/328** (eran 303) |
| `npm run build` | Correcto |
| `npm run db:check` | **38 migraciones aplicadas**, base al día |
| `npm run test:db` (pgTAP, 8 suites) | **182 pruebas · PASS** |
| `npm run qa:security -- --alta` | **52 PASS · 1 FAIL · 0 SKIP** (eran 19 PASS y 33 SKIP) |
| `npm run test:e2e` (contra localhost) | **74/74** |

El único FAIL que queda es SEC-18, el registro público de cuentas, que solo se cambia en el
panel.

### Lo que se aplicó al proyecto real

- Las dos migraciones (`20260928000000`, `20260928000001`).
- Las tres edge functions de empleados, redesplegadas con `_shared/caller.ts`.
- **Un defecto propio, encontrado al probar contra el proyecto real:** el refactor de las
  funciones se llevó por delante la constante `VALID_ROLES`, que estaba entre los dos
  bloques que se quitaron, y crear un empleado devolvía 500 "VALID_ROLES is not defined".
  Ahora vive una sola vez en el módulo compartido. Lo detectó el primer intento de crear una
  cuenta de prueba — no lo habría visto ninguna prueba del repo, porque no hay harness de
  Deno.

### Entorno de pruebas reconstruido

Las cuentas borradas se recrearon **con la propia función `create-employee`**, que de paso
comprueba el arreglo de D1 de extremo a extremo contra el proyecto real:

| Clave | Rol | Sede |
|---|---|---|
| `E2E_ADMIN` | admin | Restorify |
| `E2E_MECHANIC` | mecánico | Restorify |
| `E2E_PAINTER` | pintor | Restorify |
| `E2E_MECHANIC2` | mecánico (sin asignar) | Restorify |
| `E2E_BRANCH_MECHANIC` | mecánico | PRUEBA Sede Norte |

Se creó la sede **PRUEBA Sede Norte** (no había segunda sede, hacía falta para los casos de
aislamiento entre sedes) y tres órdenes de prueba: una asignada, una ajena y una entregada,
cuyos ids quedan en `.env.test.local` como `ORDEN`, `ORDEN_AJENA` y `ORDEN_ENTREGADA`. Con
eso, los 17 casos SEC que se saltaban ahora corren. La orden que crea `--alta` se borró.

### Dos trampas que costaron tiempo y conviene recordar

1. **`String.replace` trata `$$` como un `$` escapado.** Editar archivos pgTAP con un script
   de Node rompió las comillas de dólar (`$$ ... $$` quedó en `$ ... $`) y psql falló con
   "syntax error at or near $". Se arregla usando una función de reemplazo.
2. **`supabase test db` no aplica migraciones nuevas sobre un volumen existente.** Las
   pruebas corrían contra las funciones viejas y fallaban donde el código nuevo ya era
   correcto. Hace falta `npx supabase db reset` antes.

### Lo único que queda, y solo se hace en el panel

`supabase config push` **no** es el camino: su diff traía 18 cambios, y además de los tres
que se quieren, apagaría MFA (TOTP de enrolar y verificar), bajaría el OTP de 8 a 6 dígitos,
pondría `max_frequency` de correos en 1 segundo, apagaría las confirmaciones por correo y
cambiaría el pooler. Los tres ajustes, a mano en **Authentication → URL Configuration** y
**Sign In / Providers**:

1. Apagar "Allow new users to sign up" (H-1, P0).
2. Site URL = `https://reinventa.shop`.
3. Redirect URLs: `https://reinventa.shop/reset-password`, `https://reinventa.shop/**`,
   `http://localhost:5173/reset-password`.
