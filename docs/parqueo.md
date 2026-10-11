# Módulo de Cobro por Parqueo

> Implementado en octubre de 2026 (`20261010000028_modulo_parqueo.sql`).

## 1. Qué es

El módulo permite al taller cobrar por el almacenamiento o estancia prolongada de vehículos, diferenciando según si el trabajo se realiza con seguro o de forma particular.

Nace desactivado por defecto en cada sede (`parqueo_config.habilitado = false`) y solo un administrador puede habilitarlo o configurarlo desde **Configuración**.

---

## 2. Perfiles de Cobro

Cada sede cuenta con dos perfiles de cobro:

1. **Con seguro (`seguro`):**
   - Se activa cuando la orden tiene `con_seguro = true`.
   - Por defecto: empieza a contar desde la **llegada del vehículo** (`evento_inicio = 'ingreso'`), cobra el día del evento (`cobra_dia_evento = true`), y tiene 0 días de gracia.
   - Las aseguradoras suelen cubrir costos razonables de almacenamiento desde el ingreso.

2. **Sin seguro (`particular`):**
   - Se activa cuando la orden tiene `con_seguro = false`.
   - Por defecto: empieza a contar cuando la orden se marca **lista para entregar** (`evento_inicio = 'lista_para_entregar'`), **no** cobra el día del evento (`cobra_dia_evento = false`), y otorga **2 días de gracia** calendario.
   - Aplica cuando un cliente no recoge su vehículo terminado a tiempo.

Cada perfil configura:
- `habilitado`: si el perfil específico cobra o no.
- `evento_inicio`: `'ingreso'` o `'lista_para_entregar'`.
- `cobra_dia_evento`: booleano (si el día del evento cuenta como día 1).
- `dias_gracia`: días gratuitos antes de iniciar cobro (0 a 365).
- `gracia_dias_habiles`: si los días de gracia se cuentan únicamente de lunes a viernes.
- `tope_dias`: límite máximo de días a cobrar (opcional).
- `tope_monto`: límite máximo de dinero en dólares a cobrar (opcional).
- **Tramos (`parqueo_tramos`):** escalones de tarifa diaria `{ desde_dia, tarifa_diaria }`. El primer tramo siempre inicia en `desde_dia = 1`.

---

## 3. Estados del Parqueo de una Orden

La base de datos (`orden_parqueo.estado`) clasifica la orden en uno de siete estados:

| Estado | Cuándo | Monto |
|---|---|---|
| `inactivo` | El módulo general o el perfil correspondiente están deshabilitados. | $0.00 |
| `sin_cobro` | La orden tiene `cobrar = false` (ajuste administrativo manual). | $0.00 |
| `orden_previa` | La orden ingresó antes de la fecha `vigente_desde` de la sede y no se marcaron "incluir previas"; o se entregó antes de que existiera el módulo (entregada sin `fin_congelado`, ver §6). | $0.00 |
| `esperando` | Falta el evento detonador (particular sin marca de lista para entregar). | $0.00 |
| `por_empezar` | El evento ocurrió y se calculó la fecha de inicio, pero la fecha aún está en el futuro (gracia activa). | $0.00 |
| `acumulando` | Cobrando activamente, orden en taller sin entregar. | Monto calculado al día actual del taller. |
| `cerrado` | Orden entregada (`fin_congelado` fijado a la fecha de entrega). | Monto congelado al entregar. |

---

## 4. Cómo se Cuenta (`_parqueo_calculo`)

El cálculo reside exclusivamente en la función pura e inmutable `public._parqueo_calculo`:

1. **Inicio del cobro:**
   - Si la orden tiene `inicio_manual`, se usa esa fecha.
   - De lo contrario, `inicio = fecha_evento + (cobra_dia_evento ? 0 : 1)`.
   - Se suman los días de gracia:
     - En días calendario: `+ dias_gracia`.
     - En días hábiles: se avanzan días de lunes a viernes saltando fines de semana.
   - Si la sede tiene `vigente_desde`, `inicio = GREATEST(inicio, vigente_desde)`.
   - **`vigente_desde` nunca va hacia atrás** (`guardar_config_parqueo`): encender el cobro con
     una fecha pasada se rechaza, y con el cobro encendido la fecha se puede conservar o mover
     hacia adelante, nunca a una anterior. Existe para que encender el módulo no les cobre a las
     órdenes que ya están en el taller días que ya pasaron. Para cobrar días anteriores a **una**
     orden (p. ej. un trabajo con seguro que ya estaba en el taller) está su `inicio_manual`, que
     queda en el historial. La pantalla pasa la fecha a hoy al encender el cobro.
2. **Días cobrados:**
   - `dias = max(0, hasta - inicio + 1 - dias_exonerados)`.
   - Si hay `tope_dias`, `dias = min(dias, tope_dias)`.
3. **Monto acumulado:**
   - Suma acumulativa por tramos para los días 1..días (o `dias * tarifa_manual` si existe).
   - Si hay `tope_monto`, `monto = min(monto, tope_monto)`.
   - Siempre redondeado a 2 decimales (`round(..., 2)`).
4. **Hasta qué fecha:**
   - Si la orden está entregada: `fin_congelado`.
   - Si la orden sigue en taller: `hoy_taller(sede)` (usando `zona_horaria` de la sede, nunca `CURRENT_DATE` en UTC).

### Casos de Referencia y Verificación

| Caso | Datos | Resultado |
|---|---|---|
| Seguro estándar | Evento 10-01, cobra día del evento, gracia 0, tramo 1 a $40, hasta 10-10 | Inicio 10-01, 10 días, $400.00 |
| Particular estándar | Evento 10-09, no cobra día evento, gracia 2 cal., tramo $40, hasta 10-14 | Inicio 10-12, 3 días, $120.00 |
| Gracia en días hábiles | Evento 10-09 (vie), no cobra día, gracia 2 hábiles | Inicio 10-14 (mié) |
| Tramos escalonados | 1→$40, 8→$60, 10 días | 7×$40 + 3×$60 = $460.00 |
| Topes | Caso seguro con tope $300 / tope 5 días | $300.00 / 5 días = $200.00, `tope_aplicado = true` |
| Exonerados | Caso seguro con 2 días exonerados | 8 días, $320.00 |
| Tarifa manual | Caso seguro con tarifa manual de $25 | 10 días × $25 = $250.00 |
| Vigente desde | Caso seguro con vigente desde 10-05 (el cálculo puro; la configuración no deja poner una fecha pasada) | Inicio 10-05, 6 días, $240.00 |
| Sin evento | Particular sin marca de lista | Inicio NULL, 0 días, $0.00 |
| Inicio manual | Sin evento, inicio manual 10-08, hasta 10-10 | 3 días |

---

## 5. Dónde Entra el Dinero

- **Totales de la orden:** `recalculate_order_totals` suma `COALESCE(orden_parqueo.monto, 0)` al `total_general`.
- **Saldo y entregas:** `entregar_orden` y `saldo_orden` reflejan el total con parqueo automáticamente.
- **Retirada sin reparar:** `saldo_retiro` suma el parqueo guardado a la liquidación final y lo expone en el diálogo de retiro.
- **Márgenes:** `_balance_orden` considera el total general con parqueo en los ingresos de la orden.
- **Reglas intocables:**
  - El **descuento** se calcula únicamente sobre mano de obra + repuestos autorizados.
  - Las **comisiones** de los técnicos provienen exclusivamente de la mano de obra autorizada.

---

## 6. Cuándo se Recalcula

1. **Cada hora:** Tarea de `pg_cron` (`restorify-parqueo`, minuto 7 de cada hora) ejecutando `recalcular_parqueo_pendiente()`.
2. **Eventos de la orden:** Trigger `trg_parqueo_orden` tras cambios en `estatus`, `con_seguro`, `lista_para_entregar_en`, `fecha_ingreso` o inserción de orden.
3. **Al configurar la sede:** `guardar_config_parqueo` recalcula de inmediato todas las órdenes abiertas de la sede.
4. **Al ajustar una orden:** `ajustar_parqueo_orden` recalcula la orden modificada.
5. **Al entregar:** `entregar_orden` ejecuta `_recalcular_parqueo` antes de liquidar el saldo y fija `fin_congelado = hoy_taller(sede)` ella misma, antes de marcar la orden entregada (si algo falla, se deshace la entrega entera). `trg_parqueo_orden` lo fija también, de red, para otras vías.
6. **Al consultar:** `datos_portal` y la RPC `parqueo_de_orden` recalculan la orden **solo si no está entregada**. Consultar una entregada nunca escribe.

**Una orden entregada nunca se vuelve a contar sola.** Su parqueo queda fijo al entregarla; solo
`ajustar_parqueo_orden` lo cambia después (a propósito y con historial), y el cambio de total lo
asienta `handle_delivered_order_adjustment`. Las órdenes entregadas **antes** de este módulo no
tienen `fin_congelado`: `_parqueo_calcular` las deja con lo guardado (nada, si no tienen fila) y
quedan en `orden_previa`. Antes de la auditoría del 10/10/2026, abrir una de esas órdenes con el
módulo encendido contaba el parqueo hasta hoy y asentaba un "cargo adicional" que nadie pagó (lo
fija la prueba 30 de `33_parqueo.test.sql`).

*Nota de resiliencia:* Los triggers sobre la orden atrapan cualquier excepción y emiten un `WARNING` para garantizar que un fallo en el cálculo de parqueo **nunca** impida guardar o actualizar una orden de trabajo.

---

## 7. Permisos y Seguridad

- Tablas `parqueo_config`, `parqueo_perfiles`, `parqueo_tramos` y `orden_parqueo`: RLS habilitado con permiso `SELECT` únicamente para `is_admin()`. Sin políticas de escritura directa en tablas.
- Escritura restringida a RPCs `SECURITY DEFINER` que verifican `is_admin()`:
  - `parqueo_config_sede(UUID)`
  - `guardar_config_parqueo(UUID, JSONB)`
  - `vista_previa_parqueo(JSONB, DATE, DATE)`
  - `parqueo_de_orden(UUID)`
  - `ajustar_parqueo_orden(UUID, JSONB)`
- Funciones internas (`_parqueo_calculo`, `_parqueo_calcular`, `_recalcular_parqueo`, `recalcular_parqueo_pendiente`): `REVOKE ALL FROM PUBLIC, anon, authenticated`.

---

## 8. Consideraciones Legales (Maryland)

En el estado de Maryland (por ejemplo, regulaciones del condado de Montgomery y Prince George's), los talleres deben publicar y notificar claramente su política de cobro por estacionamiento antes de aplicar cargos. Además, se suele prohibir el cobro en las primeras 24 horas posteriores a la finalización de la reparación, salvo previo acuerdo.

Por esta razón, el sistema:
1. Desactiva por defecto el cobro el día del evento en el perfil particular.
2. Otorga días de gracia configurables.
3. Muestra la política escrita por el taller en el portal del cliente en su idioma seleccionado.
4. Advierte en el portal cuándo iniciará el cobro antes de que empiece a acumular.

*Aviso:* El taller debe verificar las ordenanzas locales vigentes en Prince George's County con su asesor legal.

---

## 9. Ideas y Extensiones Futuras

1. Tarifas diferenciadas por tipo de vehículo (sedán, SUV, comercial pesado) o por ubicación (patio exterior vs. taller techado).
2. Facturación y cobro independiente a aseguradoras para el rubro de parqueo.
3. Filtro o tarjeta de alerta en el tablero Kanban y en "Requiere atención" para órdenes "Listas sin recoger acumulando parqueo".
4. Notificaciones automáticas recurrentes por correo o SMS cada N días acumulados.
5. Gestión de impuestos específicos sobre almacenamiento vehicular.
