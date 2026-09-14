# Presupuestos y autorización por línea

La fase 5: **lo que el cliente no autoriza no se hace ni se cobra.** Cada línea de
mano de obra o repuesto tiene un estado, y solo lo autorizado entra en los totales,
el cobro, el costo de repuestos y las comisiones.

Reglas en lenguaje de negocio: [reglas-de-negocio.md](reglas-de-negocio.md#8-presupuestos-y-autorización).
Cómo probarlo: [pruebas.md](pruebas.md#414-presupuestos). Portal y correos en los que
se apoya: [portal-y-correos.md](portal-y-correos.md).

---

## Índice

1. [El estado de una línea](#1-el-estado-de-una-línea)
2. [Las tres formas de autorizar](#2-las-tres-formas-de-autorizar)
3. [El recorrido de un presupuesto](#3-el-recorrido-de-un-presupuesto)
4. [Qué cambia en el dinero](#4-qué-cambia-en-el-dinero)
5. [Qué ve cada quien](#5-qué-ve-cada-quien)
6. [Piezas](#6-piezas)
7. [Decisiones de diseño](#7-decisiones-de-diseño)
8. [Diagnóstico](#8-diagnóstico)
9. [Pendiente](#9-pendiente)

---

## 1. El estado de una línea

```
            firma de recepción ─────────────────────────┐
                                                        ▼
 (nueva) ─► borrador ──enviar presupuesto──► pendiente ──responde──► aprobado
               ▲    ╲                           │                    rechazado
               │     ╲── registrar autorización ─┼──────────────────►   │
               │                                 │                      │
               └────── cancelar presupuesto ◄────┘                      │
               └────── corregir una línea rechazada ◄───────────────────┘
```

| Estado | Significa | ¿Se cobra? | ¿Se edita? |
|---|---|---|---|
| `borrador` | Un admin la agregó; el cliente todavía no la vio | No | Sí |
| `pendiente` | Está en un presupuesto esperando respuesta | No | **No** (el cliente está viendo ese monto) |
| `aprobado` | El cliente la autorizó | **Sí** | Sí (un admin corrige; el cambio se asienta como ajuste si ya se entregó) |
| `rechazado` | El cliente no la autorizó: no se hace | No | Sí, y al corregirla **vuelve a borrador** para presentarla de nuevo |

- **Toda línea nueva nace en borrador**, la inserte quien la inserte (trigger
  `trg_guard_linea_presupuesto`).
- **El estado no se cambia con un UPDATE**, ni siquiera un admin por la API: solo lo
  cambian las funciones de presupuesto, que dejan evidencia.
- Las líneas que existían antes de la fase 5 quedaron `aprobado`.

---

## 2. Las tres formas de autorizar

| Forma | Quién | Cuándo se usa | Evidencia en `presupuestos` |
|---|---|---|---|
| **Firma de recepción** | El cliente, al firmar | El admin cotizó al crear la orden y el cliente firma al dejar el vehículo: "lo que firmó, lo aprobó" | `respondido_via = firma_recepcion`, nombre del cliente |
| **Desde su enlace** | El cliente | El admin pulsa **Enviar presupuesto**; el cliente marca línea por línea en el portal | `cliente_portal`, nombre escrito, comentario, IP, navegador |
| **Registrar autorización** | Un admin | El cliente respondió por teléfono, en persona o por WhatsApp | `admin_telefono` / `admin_presencial` / `admin_whatsapp`, quién autorizó, admin que lo registró, nota |

Si la firma ocurre con un presupuesto ya enviado por correo, la firma **no** decide
por él: esas líneas siguen esperando la respuesta del cliente.

---

## 3. El recorrido de un presupuesto

```
Admin agrega "Pintura $500"            → borrador
Admin pulsa "Enviar presupuesto"
  └─ enviar_presupuesto(orden)
       ├─ _crear_presupuesto()          presupuesto N, estado enviado
       ├─ borradores → pendiente
       ├─ asegurar_enlace_orden()       el enlace existe para compartirlo
       └─ encolar_correo_cliente('presupuesto', espera 1 min)

Cliente abre el correo → portal → sección "Presupuesto por autorizar"
  └─ marca, escribe su nombre, "Autorizar lo marcado"
       └─ POST portal {accion: responder_presupuesto, aprobadas, lineas, nombre}
            └─ responder_presupuesto_portal()   valida enlace, estado, nombre y que
                 │                              "lineas" sea exactamente lo pendiente
                 └─ _resolver_presupuesto()
                      ├─ marcadas → aprobado, resto → rechazado
                      ├─ presupuesto → respondido + evidencia
                      ├─ recalcular totales (triggers de siempre)
                      ├─ aviso a técnicos: "Autorizado: … No realizar: …"
                      ├─ aviso a admins: "El cliente respondió el presupuesto"
                      ├─ el correo del presupuesto que no salió → omitido
                      └─ encolar 'presupuesto_confirmacion' (constancia al cliente)
```

- **Uno abierto por orden.** Si el admin agrega más líneas y vuelve a enviar, se
  suman al presupuesto abierto y el cliente recibe un solo correo (agrupación de 1
  minuto).
- **Si el presupuesto cambió** mientras el cliente lo miraba (llegó otra línea), la
  respuesta vuelve con `presupuesto_cambio` y el portal le pide revisarlo de nuevo.
  Nunca se rechaza una línea que el cliente no vio.
- **Cancelar** devuelve las líneas pendientes a borrador y omite el correo que no
  alcanzó a salir.
- **Sin respuesta en 24 horas**: a las 15:00 UTC los admins de la sede reciben "Presupuesto
  sin respuesta", como mucho una vez al día por presupuesto (`restorify-quote-reminders`).
- **No se entrega** una orden con un presupuesto abierto
  (`trg_guard_entrega_con_presupuesto`).

---

## 4. Qué cambia en el dinero

Nada nuevo se calcula: se cambió **qué se suma**.

| Cálculo | Antes | Desde la fase 5 |
|---|---|---|
| `recalculate_order_totals` (total de mano de obra, repuestos, general) | Todas las líneas | Solo `aprobado` |
| `sync_order_parts_expense` (costo de repuestos al entregar y ajustes) | Todos los repuestos | Solo `aprobado` |
| Cobro al entregar, ajustes de orden entregada, comisiones | Leen los totales | Igual — heredan el cambio |
| PDF, portal, detalle de la orden | Todas las líneas | Solo lo aprobado en totales; lo demás aparte |

Autorizar algo **después de entregar** sube el total y asienta el "Ajuste por cargo
adicional" y el costo del repuesto, como cualquier corrección de una orden entregada.

---

## 5. Qué ve cada quien

| | Admin | Técnico | Cliente (portal) |
|---|---|---|---|
| Estado de cada línea | ✅ | ✅ insignia ("Sin autorizar", "Esperando al cliente", "No realizar") | Solo lo pendiente (para decidir) y lo no autorizado |
| Montos | ✅ | Mano de obra sí, repuestos no (como siempre) | Precio de venta |
| Tarjeta **Presupuesto** (enviar, registrar, cancelar, historial) | ✅ | ❌ | — |
| Marca "Esperando autorización" en lista y tablero | ✅ | ✅ | — |
| Evidencia (IP, navegador, nota) | ✅ (tabla `presupuestos`) | ❌ | Su historial: número, vía, fecha, nombre, conteos |
| Avisos | "El cliente respondió", "Sin respuesta" | "Trabajos autorizados / Presupuesto rechazado" | Correo del presupuesto y constancia |

---

## 6. Piezas

| Pieza | Dónde |
|---|---|
| Migración | `supabase/migrations/20260924000000_quotes_and_authorization.sql` |
| Respuesta del cliente | `supabase/functions/portal/index.ts` (`responder_presupuesto`) |
| Correos `presupuesto` y `presupuesto_confirmacion` | `supabase/functions/_shared/email/templates.ts`, `process-outbox` |
| Tarjeta del admin y diálogo "Trabajos autorizados por el cliente" | `src/features/workOrders/QuoteCard.tsx` |
| Insignia de estado | `src/features/workOrders/LineStateBadge.tsx`, `lineState.ts` |
| Tablas | `LaborTable.tsx`, `PartsTable.tsx`, `PartsSummaryCard.tsx` |
| Sección del portal | `src/portal/CustomerPortal.tsx` (`QuoteSection`) |
| Servicio | `src/services/quotes.service.ts` |
| Pruebas | `supabase/tests/database/05_presupuestos.test.sql` (31), `src/features/workOrders/QuoteCard.test.tsx`, `LaborTable.test.tsx`, `src/portal/CustomerPortal.test.tsx`, `src/lib/emailTemplates.test.ts` |

### Tabla y columnas

- **`presupuestos`**: `orden_id`, `sede_id`, `numero` (1, 2… por orden), `estado`
  (`enviado` | `respondido` | `cancelado`), `total_propuesto`, `total_aprobado`,
  `respondido_en`, `respondido_via`, `respondido_por_nombre`, `respondido_por_perfil`,
  `comentario_cliente`, `nota_admin`, `ip`, `user_agent`, `cancelado_en`,
  `recordado_en`. Índice único parcial: uno `enviado` por orden. RLS: solo admin lee.
- **`orden_labor` y `orden_repuestos`**: `estado`, `presupuesto_id`, `decidido_en`,
  `creado_en` (orden estable en presupuesto, portal y PDF).

### Funciones

| Función | Quién | Qué hace |
|---|---|---|
| `enviar_presupuesto(orden, notificar)` | Admin | Crea o amplía el presupuesto abierto; encola el correo. Devuelve `correo: encolado / sin_correo / no_solicitado` |
| `registrar_autorizacion(orden, aprobadas, lineas, via, nombre, nota)` | Admin | Cubre lo pendiente y los borradores; valida que `lineas` sea lo que el admin tenía a la vista |
| `cancelar_presupuesto(id)` | Admin | Pendientes → borrador |
| `ordenes_esperando_autorizacion()` | Todos (su sede) | Ids para la marca de lista y tablero, sin montos |
| `responder_presupuesto_portal(token, id, aprobadas, lineas, nombre, comentario, ip, ua)` | `service_role` | Respuesta del cliente; `{ok:false, motivo}` en vez de fallar |
| `_crear_presupuesto`, `_agregar_borradores`, `_lineas_pendientes`, `_resolver_presupuesto` | Internas | Revocadas para todos los roles |
| `recordar_presupuestos_sin_respuesta()` | pg_cron | Aviso diario a admins |
| `trg_quote_on_signature` | Trigger | La firma aprueba los borradores |

La bandera de transacción `restorify.presupuesto = on` es la llave: el guard de las
líneas solo deja cambiar `estado`, `presupuesto_id` y `decidido_en` con ella
encendida, y solo la encienden estas funciones.

---

## 7. Decisiones de diseño

**Estado por línea, no un estatus nuevo de la orden.** Una orden puede tener lo del
ingreso autorizado y un trabajo nuevo esperando al cliente al mismo tiempo. Un
estatus "esperando autorización" no cabe en el tablero sin romper sus columnas; una
marca sí.

**Solo cambiar qué se suma.** Totales, cobro, costo de repuestos, ajustes y
comisiones ya dependían de los totales. Filtrar dos consultas por `aprobado` hizo
que todo lo demás siguiera correcto sin tocarlo — y sin duplicar lógica de dinero.

**La firma aprueba lo que había.** Es lo que el taller hace hoy: cotiza al recibir el
vehículo y el cliente firma. Obligar a mandar un presupuesto por lo que el cliente
acaba de firmar en persona sería burocracia.

**Nada marcado en el portal; todo marcado en el diálogo del admin.** El cliente
decide explícitamente, línea por línea. El admin transcribe una llamada donde casi
siempre se autoriza todo: desmarcar lo que no se quiso es más rápido.

**`lineas` además de `aprobadas`.** Sin la lista de lo que se vio, una línea agregada
mientras el cliente leía quedaría rechazada sin que la viera. Con ella, la base
detecta el cambio y el portal vuelve a mostrar el presupuesto.

**Un componente por lado.** El plan preveía un diálogo compartido entre el portal y
la app. El portal es un paquete aparte que no carga los textos ni los proveedores de
la app, así que cada lado tiene el suyo; la regla (qué se manda y qué se valida)
vive en la base.

---

## 8. Diagnóstico

**"El total no incluye un trabajo."** Mira su insignia: si dice "Sin autorizar" o
"Esperando al cliente", no se cobra todavía. Envíalo o registra la autorización.

```sql
-- Estado de las líneas y de los presupuestos de una orden
SELECT 'labor' AS tipo, descripcion, costo AS monto, estado, presupuesto_id
FROM orden_labor WHERE orden_id = (SELECT id FROM ordenes_trabajo WHERE numero_orden = 'ORD-2026-014')
UNION ALL
SELECT 'repuesto', descripcion, subtotal, estado, presupuesto_id
FROM orden_repuestos WHERE orden_id = (SELECT id FROM ordenes_trabajo WHERE numero_orden = 'ORD-2026-014');

SELECT numero, estado, total_propuesto, total_aprobado, respondido_via, respondido_por_nombre,
       respondido_en, comentario_cliente, nota_admin, ip
FROM presupuestos WHERE orden_id = (SELECT id FROM ordenes_trabajo WHERE numero_orden = 'ORD-2026-014')
ORDER BY numero;
```

**"No me deja entregar."** Hay un presupuesto abierto: registra la autorización o
cancélalo.

**"No me deja editar una línea."** Está pendiente: el cliente la está viendo.
Cancela el presupuesto, corrige y vuelve a enviar.

**"El cliente dice que autorizó y no aparece."** Revisa en la tarjeta del enlace
si el correo del presupuesto salió y cuántas veces abrió el enlace; en Supabase →
Edge Functions → `portal` → Logs, busca `responder_presupuesto_portal`.

---

## 9. Pendiente

- **Correos en inglés** (el portal ya tiene inglés).
- **Firma dentro del portal** para la autorización (hoy es nombre escrito + IP +
  navegador, el estándar para este flujo).
