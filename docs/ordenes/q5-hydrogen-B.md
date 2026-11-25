# Q5 — Informe Fase B (datos de ejemplo con un comando)

Implementación de `npm run demo:cargar` y `npm run demo:borrar` en `scripts/demo/` siguiendo `docs/ordenes/q5-un-dia-en-el-taller.md` (Fase B) y las reglas de `docs/ai-context.md`.

## Archivos tocados

- `scripts/lib/local-stack.mjs`: se añadió `ensureAccountsInFirstSede` (sin modificar `localStack` ni `ensureTestAccounts`).
- `scripts/demo/lib.mjs`: constante de marca (` · demo`), definición de las tres cuentas de demostración, helpers de paginación (`fetchAllRows`), autenticación (`signInClient`), formato de errores y catálogo de 12 clientes/vehículos ficticios (`+1410555xxxx`, `@example.test` y uno sin correo).
- `scripts/demo/cargar.mjs`: carga de las 3 cuentas, 12 clientes, 12 vehículos y 10 órdenes usando sesiones autenticadas (`signInWithPassword`) y las RPCs/políticas de la aplicación.
- `scripts/demo/borrar.mjs`: limpieza idempotente con sesión de `demo-admin@demo.restorify.test` vía API.
- `package.json`: scripts `"demo:cargar"` y `"demo:borrar"`.
- `docs/pruebas.md`: nueva sección 4 («Datos de ejemplo (`demo:cargar` / `demo:borrar`)»).
- No se creó `scripts/demo/lib.test.ts` porque `vitest.config.ts` solo recoge `src/**/*.test.{ts,tsx}`.

## Qué llamadas usa cada estado en `demo:cargar`

1. **Recepción sin firma** (`recepcion`): `create_work_order` como admin con `autorizado_en_recepcion: false` y `deposito_inicial: 0` (2 tareas de mecánica + 1 repuesto en `borrador`).
2. **Esperando autorización** (`espera_autorizacion` por presupuesto): `create_work_order` con 1 diagnóstico inicial (`autorizado_en_recepcion: true`, lo que la pasa a `en_proceso`), subida de firma a `orden_media` + `UPDATE ordenes_trabajo (firma_ruta, firma_fecha)`, `INSERT` en `orden_labor` y `orden_repuestos` como `borrador`, y `enviar_presupuesto(p_notificar: true)`.
3. **En proceso con avances** (`en_proceso`): `create_work_order` (`autorizado_en_recepcion: false`), firma de recepción, `registrar_autorizacion` (`admin_presencial`), `marcar_labor_completada` como mecánico sobre una tarea y dos `INSERT` en `orden_avances` (uno interno y uno `visible_cliente: true`).
4. **En proceso sin avances** (`en_proceso`, cliente sin correo): `create_work_order` (`autorizado_en_recepcion: true`) y firma de recepción.
5. **En espera por trabajo adicional** (`espera_autorizacion` por hallazgo): `create_work_order` (`autorizado_en_recepcion: true`), firma de recepción y `reportar_hallazgo` como mecánico asignado.
6. **Terminada pendiente de confirmar** (`finalizado`, `lista_para_entregar_en` nulo): `create_work_order` (`autorizado_en_recepcion: true`), firma de recepción, `marcar_labor_completada` como pintor, `INSERT` en `orden_avances` (`visible_cliente: true`) y `UPDATE ordenes_trabajo (estatus: 'finalizado', porcentaje_avance: 100)` como pintor.
7. **Lista para entregar** (`finalizado`, `lista_para_entregar_en` fijado): `create_work_order` (`autorizado_en_recepcion: true`), firma de recepción, `marcar_labor_completada` y `UPDATE estatus = 'finalizado'` como mecánico, y `marcar_lista_para_entregar` como admin.
8. **Entregada cobrada con `tarjeta`** (`entregado`): `create_work_order` (`tipo_trabajo: 'combinado'`, `deposito_inicial: 150` en `efectivo`, `autorizado_en_recepcion: true`), firma de recepción, `marcar_labor_completada` como mecánico y como pintor según tarea, cierre a `finalizado` como mecánico, `marcar_lista_para_entregar` y `entregar_orden(p_metodo: 'tarjeta')` como admin.
9. **Entregada cobrada con `zelle`** (`entregado`): `create_work_order` (`autorizado_en_recepcion: true`), firma de recepción, `marcar_labor_completada`, avance visible y cierre a `finalizado` como mecánico, `marcar_lista_para_entregar` y `entregar_orden(p_metodo: 'zelle')` como admin.
10. **Retirada sin reparar** (`entregado` + `retirada_sin_reparar = true`): `create_work_order` (`deposito_inicial: 200` en `efectivo`, `autorizado_en_recepcion: true`), firma de recepción, `marcar_labor_completada` del diagnóstico inicial como mecánico y `retirar_sin_reparar(p_cobro: 0, p_metodo: 'efectivo', p_conservar: [diagTask.id])` como admin (conserva la tarea hecha, rechaza el resto y asienta la devolución en Finanzas).

## Reglas de la base que obligaron a rodeos o cuidados

- **`enviar_presupuesto` solo mueve a `espera_autorizacion` desde `en_proceso`:** según `supabase/schema/actual.sql`, si la orden está en `recepcion`, `enviar_presupuesto` deja la orden en `recepcion`. Por eso la orden 2 parte con un diagnóstico autorizado en recepción (pasa a `en_proceso`) y luego agrega líneas en `borrador` para enviarlas con `enviar_presupuesto`.
- **Órdenes no entregadas con dinero no se pueden borrar (`trg_guard_order_delete_entregada`):** cualquier orden con movimientos no importados en `finanzas_movimientos` es rechazada al borrarse (`42501`), y además `ordenes_trabajo_archivada_solo_entregada` impide archivarla si no está en `entregado`. Por eso las órdenes 1 a 7 llevan `deposito_inicial: 0` (permitiendo que `demo:borrar` las borre limpiamente), mientras que los depósitos se concentran en las órdenes 8 (`entregado`) y 10 (`retirada_sin_reparar`, también `entregado`), que `demo:borrar` archiva con `archivada_en`. Si manualmente se agregara un anticipo a una orden abierta antes de `demo:borrar`, el script la conserva y explica el motivo en la salida.
- **Volver a cargar después de `demo:borrar`:** como las órdenes entregadas/retiradas no se borran y conservan sus clientes (` · demo`) y vehículos (con placa y VIN únicos), `demo:cargar` considera que hay datos activos solo cuando existen órdenes sin archivar o clientes marcados sin órdenes archivadas; tras un `demo:borrar`, reutiliza esos clientes y vehículos archivados para evitar colisiones de `uq_vehiculos_placa` / `uq_vehiculos_vin`.
- **Columna obligatoria `sedes.telefono`:** en `actual.sql`, `sedes.telefono` es `NOT NULL`; `ensureAccountsInFirstSede` la rellena si crea una sede desde cero.

## Qué no se pudo verificar sin ejecutar comandos

Por restricción de la orden (sin ejecución de comandos):

- Ejecución real de `npm run lint` (`oxlint`) sobre `scripts/demo/*.mjs` y `scripts/lib/local-stack.mjs`.
- Ejecución de `npm run demo:cargar` y `npm run demo:borrar` (en limpio, doble corrida y recarga tras borrar) contra el Supabase local en Docker.
- Comprobación visual de las pantallas (Panel, Órdenes lista/tablero, Finanzas y enlaces `/r/<token>` en inglés y español).
