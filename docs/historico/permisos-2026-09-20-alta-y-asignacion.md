# Abrir órdenes y asignar pasan a ser solo de administración — 2026-09-20

Cambio pedido por Kevin: *"dejemos la creación de órdenes de trabajo solo para
administradores, los mecánicos y pintores ya no pueden generar órdenes de trabajo ni
asignarse a una orden de trabajo, ya que si se pudieran asignar a una orden de trabajo
podrían asignarse comisiones sin que se haya autorizado previamente"*.

Migración `20261004000000_crear_y_asignar_solo_admin`, **47 aplicadas**.

---

## El agujero, medido antes de taparlo

Las dos políticas decían esto:

| Política | Antes | Ahora |
|---|---|---|
| `ordenes_trabajo_insert` | `is_admin() OR sede_id = current_user_sede_id()` | `is_admin()` |
| `orden_asignaciones_insert` | `is_admin() OR (usuario_id = auth.uid() AND la orden es de su sede)` | `is_admin()` |

El diagnóstico de Kevin sobre la comisión es exacto, y la cadena es corta:
`orden_asignaciones` tiene el trigger `trg_assignment_commissions`, que llama a
`sync_order_commissions(orden_id)`, que reparte la mano de obra **entre quienes estén
asignados** (cuenta asignaciones; no mira `tipo_tarea` ni el rol). Auto-asignarse era
concederse una parte y bajarle la suya a quien estaba haciendo el trabajo.

**Se comprobó contra el proyecto real antes de aplicar la migración.** Con la sesión de un
mecánico de prueba, llamando la API directo:

```
FAIL SEC-55  Un técnico no abre una orden de trabajo          → HTTP 201, creó ORD-2026-008
FAIL SEC-69  Un técnico no se asigna a una orden              → HTTP 201, en una orden AJENA
FAIL SEC-39  Un técnico tampoco se asigna a la que ya trabaja → HTTP 201
```

Las tres filas que creó esa comprobación se borraron por id. No llegaron a generar
comisiones porque esas órdenes no están entregadas, pero la asignación ya estaba puesta y
habría cobrado al entregar. Después de la migración las tres pasan, y la suite quedó en
**65 PASS · 0 FAIL · 0 SKIP**.

---

## Lo que cambió, por capa

### Base

Las dos políticas, reescritas enteras (DROP + CREATE) con la llamada envuelta en
`(SELECT …)` para que siga resolviéndose como InitPlan.

No hizo falta tocar `create_work_order`: es `SECURITY INVOKER`, así que su INSERT pasa por
la política nueva. Ninguna edge function escribe en esas dos tablas.

**Dos triggers quedaron sin caso y se dejan puestos como red:**

- `trg_guard_order_insert`, que bajaba a recepción la orden de un no-admin. Su cuerpo ya no
  es alcanzable desde la API.
- `trg_order_created_notify`, que avisaba a los admins *"Recepción registrada · Falta
  cotizar"*. Solo actuaba cuando `auth.uid() IS NOT NULL AND NOT is_admin()`, así que **ese
  aviso ya no se emite**. Los que estén guardados se siguen leyendo, por eso la clave de
  i18n `recepcion_tecnico` no se borró.

**Lo que a propósito NO cambió:** un técnico sigue viendo las órdenes de su sede, moviendo
estado, avance y firma donde está asignado, y actualizando el `estatus_tarea` de su propia
asignación — eso no toca el reparto, y `trg_assignment_owner_immutable` le impide repuntar
la fila a otra orden u otra persona. `orden_asignaciones_delete` ya era solo admin, así que
tampoco puede quitarse de una orden.

### Interfaz

- **El botón "Nueva Orden" solo para admin**, y el diálogo tampoco se monta sin el rol
  (`isAdmin && showCreateModal`), para que un disparador nuevo no lo reabra por descuido.
- **Se quitó "Unirme a la orden"**, y con él `canJoin` y `joinOrder` del hook. No bastaba
  con gatearlo: el botón vivía **dentro de la rama no-admin** (`isAdmin ? selector :
  canJoin && botón`), así que ponerle `isAdmin &&` delante lo dejaba muerto para todos sin
  decirlo. En su lugar, la tarjeta dice *"Administración asigna quién trabaja esta orden"*:
  una lista de nombres sin explicación se lee como un botón que falta.
- **Se borró la rama del alta que auto-asignaba al creador.** Era, literalmente, el camino
  que Kevin describe.
- Textos reescritos: el aviso de solo lectura, la pista de "Otras órdenes" (invitaba a
  unirse), el vacío de "Mis órdenes" (era un callejón sin salida) y el manual de usuario.
  Cuatro claves de i18n quedaron sin uso (`joinOrder`, `joinedOrder`, `joinError`,
  `joinDeliveredBlocked`, más `autoAssigned`) y se borraron en los dos idiomas — la prueba
  de paridad añadida ayer impide borrar solo la mitad.
- `operatorsQuery` pasa a `enabled: isAdmin`: solo la consume interfaz de administración, y
  en el teléfono de un mecánico era una descarga que nadie mira.

### Pruebas

| Suite | Antes | Ahora |
|---|---|---|
| pgTAP | 212 (8/8) | 212 (8/8) — la sección 2 de `07_auditoria` afirmaba lo contrario y se dio la vuelta |
| Unitarias | 385 | 386 |
| Seguridad de la API | 62 casos, 1 SKIP | **65 casos, 0 SKIP** |
| e2e | 74 | 77 |

Los identificadores **SEC-70 en adelante ya estaban tomados** por los casos manuales de
`plan-de-pruebas.md` §5, así que el tercer caso nuevo es SEC-39 (un hueco libre) y el script
lleva una nota para que nadie repita la colisión.

La sección 2 de `07_auditoria` comprobaba que la orden de un técnico **se corrigiera** al
entrar; ahora comprueba que **no entre**, que no se quede asignado y que no se le conceda
comisión. Dos de sus aserciones se habían vuelto vacías al caer la primera (`isnt(NULL, …)`
pasa siempre), así que se reemplazaron en vez de dejarlas.

**`qa:security` ya no escribe nada.** SEC-55 era el único caso que creaba datos y por eso
existía la bandera `--alta`; ahora comprueba un rechazo, así que la bandera desapareció y
la suite entera es de solo lectura. Eso también quita la advertencia de no correrla contra
producción.

---

## Cómo se encontró todo

Cuatro barridos en paralelo sobre superficies distintas (crear, asignarse, pruebas, base y
documentación) y un quinto agente buscando lo que a los otros se les escapó. Dos hallazgos
no habrían salido de una lectura lineal:

1. **El botón "Unirme" vivía solo en la rama no-admin**, así que mi primer arreglo — ponerle
   `isAdmin &&` — lo dejaba muerto para todos en silencio. Comprobado en el código antes de
   seguir.
2. **`trg_order_created_notify` quedó sin caso**, con el aviso "Recepción registrada" que
   tres documentos seguían prometiendo.

---

## Pendiente, y es tuyo

**Hay que subir el `dist/`, y esta vez el orden importa.** Este cambio **quita** un permiso,
así que el sitio publicado — que es de antes — le sigue mostrando a un mecánico el botón
"Nueva Orden" y el de "Unirme a la orden", y ahora los dos terminan en un error de permiso.
Peor en el de alta: `submitOrder` crea el cliente y el vehículo **antes** que la orden, así
que un intento fallido deja las dos filas huérfanas en la base.

Además, el `dist` publicado se compara con la versión de esquema (`__SCHEMA_VERSION__`
contra `app_schema_version()`), así que hasta que subas el nuevo la app muestra el aviso de
`SchemaDriftBanner` en estado "app-behind".

**Aparte, y anterior a este cambio:** que `submitOrder` cree cliente y vehículo antes que la
orden es deuda de la regla 8b — tres escrituras que pueden quedar a medias. No se tocó aquí
para no mezclar, pero conviene meterlas en `create_work_order` o limpiar los huérfanos al
fallar.
