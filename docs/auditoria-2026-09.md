# Auditoría de errores y seguridad — septiembre 2026

Revisión completa de Restorify después de las seis fases del cliente: base de datos,
edge functions y frontend. Este documento dice **qué se encontró, qué tan grave era,
cómo se corrigió y con qué prueba se comprueba**. Lo que no se corrigió está al final,
con la razón.

Para ejecutar las pruebas: [plan-de-pruebas.md](plan-de-pruebas.md). Para las pruebas
automatizadas: [pruebas.md](pruebas.md).

> Después de esta auditoría se hizo una **revisión previa a producción** con hallazgos
> nuevos (PRD-01 a PRD-28), entre ellos dos bloqueantes: [salida-a-produccion.md](salida-a-produccion.md).

---

## Índice

1. [Resumen](#1-resumen)
2. [Cómo se revisó](#2-cómo-se-revisó)
3. [Hallazgos corregidos](#3-hallazgos-corregidos)
4. [Riesgos y decisiones abiertas](#4-riesgos-y-decisiones-abiertas)
5. [Qué hay que desplegar](#5-qué-hay-que-desplegar)
6. [Lo que se revisó y estaba bien](#6-lo-que-se-revisó-y-estaba-bien)

---

## 1. Resumen

| Severidad | Corregidos | Abiertos |
|---|---|---|
| **Alta** | 1 | 0 |
| **Media** | 7 | 1 |
| **Baja** | 7 | 4 |

El hallazgo más grave: **cuatro funciones internas de dinero se podían llamar por la
API sin iniciar sesión**. Una de ellas, `reverse_order_delivery_finance`, asienta la
reversión del cobro y del costo de repuestos de una orden entregada. Se comprobó contra
el proyecto enlazado con un id inexistente: respondió `204` (ejecutada), mientras las
funciones protegidas responden `401`.

Correcciones:

- Migración `20260926000000_audit_hardening.sql` (base de datos).
- Cambios en el frontend: `workOrders.service.ts`, `useWorkOrderDetail.ts`,
  `WorkOrderDetail.tsx`, `AuthContext.tsx`, `errors.ts`, `dates.ts`, `WorkOrders.tsx`.
- Edge function `delete-employee`.

Pruebas nuevas:

- pgTAP `07_auditoria.test.sql` (25 aserciones).
- Vitest: `AuthContext.test.tsx`, casos nuevos en `WorkOrders.smoke`, `errors` y `dates`
  (274 pruebas en total).
- `npm run qa:security`: 51 verificaciones contra la API (52 desde SEC-17, que comprueba que las edge functions estén desplegadas).

> **Desplegado el 15 de septiembre de 2026**: migración aplicada en el proyecto enlazado,
> `delete-employee` actualizada y el build nuevo publicado en Hostinger. Comprobado con
> `npm run qa:security` (0 FAIL; SEC-05 a SEC-08 en PASS) y 158 aserciones pgTAP en verde.
> Pasos en la [sección 5](#5-qué-hay-que-desplegar), para otro entorno.

---

## 2. Cómo se revisó

1. **Verificaciones automáticas**: `tsc -b`, `oxlint`, Vitest, `npm run build`,
   `npm run db:check`, `npm audit --omit=dev` (0 vulnerabilidades). Todo en verde antes
   de empezar: los errores de este documento no los detecta ninguna de esas herramientas.
2. **La base tal como está, no las migraciones**: se extrajeron del proyecto enlazado
   (solo lectura) las 88 funciones vigentes con sus permisos, las 77 políticas de RLS y
   Storage, los 43 triggers, las columnas, restricciones y tareas programadas. Con 34
   migraciones que reemplazan funciones unas a otras, leerlas por separado no dice qué
   quedó.
3. **Inventario de permisos**: cada función `SECURITY DEFINER` que `anon` o
   `authenticated` pueden ejecutar, y si valida el rol por dentro.
4. **Lectura del frontend** en las rutas con dinero, permisos o datos del cliente:
   servicios, detalle de orden, sesión, errores, portal, edge functions.
5. **Confirmación**: cada hallazgo se reprodujo (contra la API con un id inexistente, o
   con una prueba que falla sin la corrección) antes de corregirlo.

---

## 3. Hallazgos corregidos

### AUD-01 · Alta · Funciones internas de dinero ejecutables por cualquiera

**Qué pasaba.** Postgres da `EXECUTE` a `PUBLIC` al crear una función y Supabase además
a `anon` y `authenticated`. Nadie lo revocó en `reverse_order_delivery_finance`,
`sync_order_commissions`, `sync_order_parts_expense` y `recalculate_order_totals`, que
solo deberían llamar los triggers.

**Escenario.** Con la clave pública de la app (va dentro del JavaScript) y el id de una
orden entregada, `POST /rest/v1/rpc/reverse_order_delivery_finance` registra en Finanzas
un egreso "Reversión de entrega" por lo cobrado y un ingreso por el costo de repuestos,
sin que la orden deje de estar entregada. Un técnico conoce los ids de todas las órdenes
de su sede. Las otras tres recalculan valores correctos (inofensivas hoy), pero son la
misma puerta abierta.

**Corrección.** `REVOKE` de las cuatro para `PUBLIC`, `anon` y `authenticated`: los
triggers corren como dueño de la función y no se ven afectados. Además, `anon` ya no
ejecuta `pay_commissions`, `delete_sede_cascade`, `sede_delete_impact` ni
`create_work_order`, que validan el rol por dentro pero no tenían por qué aceptar
llamadas sin sesión.

**Se comprueba con.** pgTAP 07 (aserciones 1–7) · `qa:security` SEC-05 a SEC-08, SEC-16,
SEC-27, SEC-62.

### AUD-02 · Media · Un técnico podía crear una orden "entregada" directo por la API

**Qué pasaba.** Los guardas de la orden solo miraban `UPDATE`. La app crea órdenes con
`create_work_order`, pero la política de `INSERT` deja a un técnico insertar en su sede
directamente, con cualquier valor.

**Escenario.** `POST /rest/v1/ordenes_trabajo` con `estatus: "entregado"`,
`porcentaje_avance: 90`, `total_labor: 5000`, `creado_por` de otra persona, una
`firma_ruta` de otra orden y `numero_orden: "ORD-2026-900"`. La orden aparecía entregada
sin cobro y con autor falso, la "comisión estimada" del técnico salía inflada, y el
contador de folios saltaba a 900.

**Corrección.** Trigger `trg_guard_order_insert`: para quien no es admin, la orden nace
en recepción, sin avance, sin mano de obra, sin firma, con el número generado por el
sistema y con el técnico como autor.

**Se comprueba con.** pgTAP 07 (8–12) · `qa:security` SEC-55.

> **Desde 20261004000000 el agujero está cerrado más arriba:** un técnico ya no inserta
> órdenes en absoluto (`ordenes_trabajo_insert` es `is_admin()`), así que el trigger que
> corregía la fila quedó como red y las pruebas comprueban el rechazo, no la corrección.

### AUD-03 · Media · Volver a firmar autorizaba trabajos que el cliente no vio

**Qué pasaba.** La regla es "lo que el cliente firmó al recibir el vehículo, lo
autorizó". El trigger la aplicaba a **cualquier** firma nueva, también a la que se
captura después de *Limpiar firma*.

**Escenario.** Se recibe el vehículo y se firma. Días después el admin agrega "Pintura
$500", que queda **sin autorizar**. Alguien limpia la firma y vuelve a firmar (un
técnico asignado puede hacerlo). La pintura pasaba a autorizada, entraba al total, se
cobraba al entregar y generaba comisión, sin presupuesto ni respuesta del cliente.

**Corrección.** Solo la primera firma de la orden autoriza. Se reconoce porque todavía no
existe un presupuesto "firma de recepción" y no hay otro archivo de firma en la carpeta
de la orden (limpiar la firma no borra su archivo). Si hay duda, no autoriza: el admin
registra la autorización.

**Se comprueba con.** pgTAP 07 (13–17) · plan PRE-15.

### AUD-04 · Media · Borrar una orden podía dejarla sin su dinero

**Qué pasaba.** El navegador borraba los movimientos de Finanzas de la orden en una
petición y la orden en otra.

**Escenario.** Si la segunda fallaba (sin red, o la base la rechazaba), la orden seguía
existiendo sin su depósito ni su pago. El trigger `cleanup_order_finance` ya borraba esos
movimientos dentro de la misma transacción que la orden.

**Corrección.** Se quitó el borrado del lado del navegador.

**Se comprueba con.** plan DIN-08 y DIN-09.

### AUD-05 · Media · Borrar una orden con comisiones pagadas dejaba un pago huérfano

**Qué pasaba.** Las comisiones se borran en cascada con la orden, las pagadas también. El
pago (el cheque) y su egreso en Finanzas quedaban sin el detalle de qué pagaban.

**Corrección.** Trigger `trg_order_delete_paid_guard`: no se borra una orden con
comisiones pagadas; el mensaje pide deshacer el pago primero. Borrar una sede entera
sigue funcionando, porque `delete_sede_cascade` borra antes los pagos.

**Se comprueba con.** pgTAP 07 (21–23) · plan DIN-09.

### AUD-06 · Media · Firmar no actualizaba la pantalla

**Qué pasaba.** La primera firma autoriza lo cotizado en la base (estados de línea,
totales, presupuesto "firma de recepción"). La pantalla solo guardaba la ruta de la firma.

**Escenario.** Después de firmar, las líneas seguían diciendo **Sin autorizar**, el total
seguía en $0 y la tarjeta de presupuesto no mostraba la constancia, hasta recargar. El
admin podía creer que la firma no había funcionado.

**Corrección.** Después de guardar la firma se vuelve a leer la orden y la tarjeta de
presupuesto.

**Se comprueba con.** Vitest `WorkOrders.smoke` ("re-reads the order after the customer
signs") · plan ORD-12.

### AUD-07 · Media · Con mala señal, la app sacaba al usuario a la pantalla de login

**Qué pasaba.** Al renovar el token (cada hora y al volver a la pestaña) la app volvía a
pedir el perfil. Si esa consulta fallaba por red, lo trataba como "esta cuenta no tiene
perfil" y cerraba la sesión en pantalla.

**Escenario.** Un técnico en el wifi del taller, a media recepción con fotos y datos
escritos, caía al login y perdía lo capturado.

**Corrección.** Renovar el token ya no vuelve a pedir el perfil. Una consulta que falla
conserva el usuario y las sedes cargadas. Solo "la fila no existe" (`PGRST116`) cierra.

**Se comprueba con.** Vitest `AuthContext.test.tsx` (4 casos) · plan SES-01.

### AUD-08 · Media · Una orden de otra sede usaba los datos de la sede elegida

**Qué pasaba.** Un admin puede abrir una orden de otra sede desde un aviso (los avisos
llegan a los admins de la sede de la orden). La pantalla usaba la sede elegida arriba,
no la de la orden, para:

- el logo, nombre y dirección del **PDF**;
- el nombre del taller en el **mensaje de WhatsApp** del reporte;
- el porcentaje de la **comisión estimada**;
- la lista de **técnicos para asignar**. Asignar a alguien de otro taller le repartía la
  comisión de esa orden.

**Corrección.** Se usa la sede de la orden, y la lista de asignación solo muestra personal
de esa sede.

**Se comprueba con.** Vitest `WorkOrders.smoke` ("only offers to assign staff from the
order own sede") · plan ORD-14.

### AUD-09 · Baja · Los mensajes de la base se escondían detrás de "No tienes permiso"

**Qué pasaba.** Cualquier error `42501` se mostraba como "No tienes permiso para realizar
esta acción", también los que la base escribe para el taller: "La orden ya fue entregada.
Sólo un administrador puede modificarla.", "Esta línea es parte de un presupuesto que
espera respuesta…". Una restricción `CHECK` violada salía en inglés técnico.

**Corrección.** `getErrorMessage` muestra la razón cuando es una oración del sistema (y la
interfaz está en español). Los de RLS siguen con el genérico. `23514` tiene mensaje propio.

**Se comprueba con.** Vitest `errors.test.ts`.

### AUD-10 · Baja · La base aceptaba montos negativos en las líneas

**Qué pasaba.** La pantalla corrige mano de obra negativa, cantidad 0 y precio negativo,
pero la base no los rechazaba. Un negativo sobre una orden entregada se asienta como
reembolso.

**Corrección.** `CHECK` en `orden_labor.costo >= 0`, `orden_repuestos.cantidad >= 1` y
`precio_venta_unitario >= 0` (`NOT VALID`: exige lo nuevo sin bloquear datos viejos).

**Se comprueba con.** pgTAP 07 (18–20).

### AUD-11 · Baja · Un técnico podía borrar archivos de una orden entregada

**Qué pasaba.** La fila de `orden_media` estaba protegida en órdenes entregadas, pero el
archivo en Storage no: la política dejaba al dueño borrarlo siempre.

**Escenario.** Con la API de Storage, un técnico borraba sus fotos de una orden cerrada.
La galería y el portal del cliente quedaban con imágenes rotas.

**Corrección.** Política `orden_media_delete`: fuera de un admin, solo mientras la orden no
esté entregada.

**Se comprueba con.** plan SEC-70 (manual, necesita la ruta de un archivo).

### AUD-12 · Baja · Un aviso que tumba la función se reintentaba sin fin

**Qué pasaba.** Si `process-outbox` moría a mitad de un envío (tiempo agotado), la fila
volvía a la cola a los 5 minutos sin contar ese intento como fallido: nunca llegaba a
**error**.

**Corrección.** Al quinto intento interrumpido, `claim_outbox` la deja en error con el
motivo "El envío se interrumpió 5 veces".

**Se comprueba con.** pgTAP 07 (24–25).

### AUD-13 · Baja · La fecha estimada de entrega por defecto salía un día después

**Qué pasaba.** Sin fecha elegida, la orden tomaba "hoy + 5" calculado en UTC. Capturada
después de las 7 p. m. en Texas, quedaba un día más tarde.

**Corrección.** `daysFromTodayLocal(5)`.

**Se comprueba con.** Vitest `dates.test.ts`.

### AUD-14 · Baja · Borrar un empleado con pagos de comisión mostraba un error técnico

**Qué pasaba.** Los pagos de comisión apuntan a la persona con `RESTRICT`. La edge function
intentaba borrar y devolvía el error crudo de la llave foránea.

**Corrección.** `delete-employee` revisa antes y responde 409 con un mensaje claro.

**Se comprueba con.** plan CFG-06.

### AUD-15 · Baja · Permisos de más para `anon` en funciones con validación interna

Incluido en AUD-01: `pay_commissions`, `delete_sede_cascade`, `sede_delete_impact` y
`create_work_order` ya no aceptan llamadas sin sesión. No era explotable (validan el rol),
pero no depender de una sola capa es la regla del proyecto.

---

## 4. Riesgos y decisiones abiertas

| ID | Severidad | Qué | Por qué no se corrigió | Recomendación |
|---|---|---|---|---|
| AUD-26 | Media | ~~La edge function `update-employee` no estaba desplegada (404): editar un empleado desde Configuración fallaba.~~ **Resuelto el 15 de septiembre de 2026**: desplegada y verificada (responde, rechaza sin sesión). | — | `qa:security` SEC-17 comprueba ahora que las 6 funciones estén desplegadas; plan CFG-04. |
| AUD-20 | Media | **Depósito mayor que lo autorizado**: si el cliente dejó $500 y solo autorizó $300, al entregar no se asienta un reembolso; el portal muestra saldo $0. | Es una decisión de negocio (¿se reembolsa, queda a favor?). | Decidirlo; si se reembolsa, asentar un egreso "Reembolso" al entregar. |
| AUD-21 | Baja | **La IP de la autorización desde el enlace** es la primera de `X-Forwarded-For`, que quien envía la petición puede escribir. | Es evidencia de apoyo, no una firma; cambiar la cabecera sin saber cuál agrega el proxy de Supabase puede dejarla vacía. | Registrar también `cf-connecting-ip` o la última IP de la cadena, y verificarlo en los logs. |
| AUD-22 | Baja | **La lista de órdenes no pagina**: carga todas las de la sede con cliente, vehículo y asignaciones. | A la escala actual (~120 órdenes/mes) no se nota. | Antes de ~2.000 órdenes por sede: filtrar entregadas antiguas o paginar. |
| AUD-23 | Baja | **Movimientos automáticos de Finanzas se pueden borrar a mano** (ya documentado). | Decisión pendiente del taller. | Ver [reglas-de-negocio.md](reglas-de-negocio.md#10-riesgos-conocidos-y-decisiones-abiertas). |
| AUD-24 | Baja | ~~Las 158 aserciones pgTAP nunca se habían ejecutado.~~ **Resuelto el 15 de septiembre de 2026**: 158 en verde con Docker. | — | Correrlas antes de aplicar cada migración ([pruebas.md §2.4](pruebas.md#24-para-qué-hace-falta-docker)). |
| AUD-25 | Baja | **Las pruebas e2e y `qa:security` corren contra el proyecto real** (no hay staging). | Plan gratuito; no hay clientes reales todavía. | Crear un proyecto de staging antes de atender clientes. |

---

## 5. Qué hay que desplegar

En este orden (el build nuevo espera la migración 35: sin ella muestra el aviso de
"esquema desactualizado"):

```bash
npm run db:check                                   # debe listar 20260926000000_audit_hardening
npx supabase db push --linked                      # la migración
npx supabase functions deploy delete-employee      # AUD-14
npm run build                                      # y subir dist/ a Hostinger
npm run qa:security                                # SEC-05 a SEC-08 deben pasar a PASS
```

---

## 6. Lo que se revisó y estaba bien

Para que nadie tenga que volver a revisarlo sin motivo:

- **RLS de dinero**: `orden_montos`, `orden_repuestos`, `finanzas_*`, `presupuestos`,
  `orden_enlaces`, `cola_envios` son solo admin; comisiones y pagos, cada quien los suyos.
- **Guardas de la orden** (`trg_guard_order_technician`, `trg_guard_order_money`,
  `trg_guard_order_montos`, `trg_guard_delivered_order_children`,
  `trg_guard_linea_presupuesto`): el técnico solo cambia estado, avance y firma en órdenes
  asignadas y no entregadas; nadie cambia totales ni estados de línea a mano.
- **Portal**: `datos_portal` arma el JSON campo por campo; token de 64 hexadecimales;
  respuesta a presupuestos con verificación de líneas vistas; baja con POST; URLs firmadas
  de 2 horas; `noindex` y `no-referrer`.
- **Edge functions de empleados**: verifican el JWT y el rol admin con la llave de
  servicio; no se degrada al último admin ni se borra uno mismo.
- **`process-outbox`**: secreto compartido en tiempo constante, `Idempotency-Key` en
  Resend, reintentos con espera creciente, suscripciones push vencidas se borran.
- **Buckets**: solo `avatares` y `sede_logos` son públicos; el tope de 50 MB coincide en
  la app y en el bucket.
- **Dependencias**: `npm audit --omit=dev` sin vulnerabilidades.
- **Fechas**: movimientos y pagos usan la fecha local (`todayLocal`).
