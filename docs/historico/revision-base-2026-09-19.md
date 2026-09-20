# Revisión de la base de datos — 2026-09-19

Hecha contra el proyecto real (`lendsiqkxhvbxxkaadrt`, 43 migraciones) con los avisores
oficiales de Supabase (`supabase db advisors`), las estadísticas del motor
(`supabase inspect db`) y consultas de solo lectura al catálogo.

---

## El veredicto

**La estructura está bien.** No hay nada que rehacer:

- Las **22 tablas tienen RLS activada**. Ninguna quedó abierta.
- Las **22 tienen clave primaria**.
- **No hay índices duplicados**, ni tablas sin dueño claro, ni columnas huérfanas.
- La normalización es correcta: el dinero vive aparte (`orden_montos`) de lo que ve el
  taller (`ordenes_trabajo.total_labor`), que es justo lo que hace posible el modelo de
  permisos.

Lo que hay son **ajustes de rendimiento**, no errores de diseño. Y este es el momento de
hacerlos: con 5 órdenes cambiar una política cuesta nada; con 5.000, cada cambio hay que
pensarlo dos veces.

Dicho claro: **hoy nada va lento**. Todo lo de abajo es lo que se nota cuando el taller
lleve un año trabajando.

---

## 1. La RLS se evalúa una vez por fila — el único cambio que de verdad importa

`supabase db advisors` marca **16 políticas** con *Auth RLS Initialization Plan*: llaman a
`auth.uid()` dentro del filtro, así que Postgres las ejecuta **por cada fila examinada** en
vez de una sola vez.

La prueba está en las estadísticas del motor:

> `public.perfiles` — 5 filas, **149.654 recorridos secuenciales**

`perfiles` tiene cinco filas y se ha recorrido entero ciento cincuenta mil veces. Cada
llamada a `is_admin()`, `current_user_role()` o `current_user_sede_id()` hace un
`SELECT … FROM perfiles WHERE id = auth.uid()`, y esas funciones están dentro de **52
políticas repartidas en 21 tablas**.

Con 5 órdenes eso es gratis. Con 2.000 órdenes, listar el tablero pasa a ser 2.000
evaluaciones de `is_admin()` por consulta, cada una con su recorrido de `perfiles`.

**El arreglo es mecánico y no cambia la semántica:** envolver la llamada en una subconsulta
escalar, `(SELECT public.is_admin())` en vez de `public.is_admin()`. Postgres la resuelve
como *InitPlan*, una sola vez por consulta. Mismos permisos, mismo resultado.

Es el patrón que recomienda Supabase, y en su propia medición la diferencia a escala es de
uno a cien.

---

## 2. Catorce claves foráneas sin índice

Postgres no indexa automáticamente el lado hijo de una clave foránea. Sin ese índice, borrar
una fila del padre obliga a recorrer entera la tabla hija para comprobar que nadie la
referencia.

| Tabla | Columna |
|---|---|
| `comision_pagos` | `pagado_por` |
| `finanzas_importaciones` | `importado_por` |
| `finanzas_movimientos` | `registrado_por` |
| `notificaciones` | `sede_id` |
| `orden_avances` | `usuario_id` |
| `orden_enlaces` | `creado_por`, `sede_id` |
| `orden_labor` | `completado_por` |
| `orden_media` | `subido_por`, `sede_id` |
| `ordenes_trabajo` | `creado_por` |
| `presupuestos` | `enviado_por`, `respondido_por_perfil`, `sede_id` |

Dónde se va a notar: **borrar un empleado**. Hoy `delete-employee` ya comprueba órdenes
asignadas y pagos de comisiones, pero la base igual tiene que recorrer
`finanzas_movimientos`, `orden_media`, `orden_avances` y `presupuestos` enteras para validar
cada `ON DELETE SET NULL`. Con el histórico de un año, eso deja de ser instantáneo.

`orden_labor.completado_por` es mía, de la función de tachar trabajos; las demás vienen de
antes.

---

## 3. Veinticuatro casos de políticas permisivas múltiples

Cuando una tabla tiene dos políticas `PERMISSIVE` para la misma acción, Postgres **evalúa las
dos** y las une con OR — no puede parar en la primera que da verdadero. El caso más claro es
`cola_envios`, con `cola_envios_admin_select` y `cola_envios_admin_select_email` a la vez.

Unificar cada par en una política con un `OR` dentro hace el mismo trabajo con la mitad de
evaluaciones. Es seguro porque el resultado lógico es idéntico.

---

## 4. Seis restricciones sin validar

Se crearon como `NOT VALID`, que era lo correcto entonces: así no fallaba la migración por
filas viejas que no cumplían. Se aplican a todo lo que entra desde entonces, pero **el
planificador no confía en ellas** y las filas anteriores nunca se comprobaron.

```
clientes.clientes_email_formato
orden_labor.orden_labor_costo_no_negativo
orden_repuestos.orden_repuestos_cantidad_positiva
orden_repuestos.orden_repuestos_precio_no_negativo
ordenes_trabajo.ordenes_trabajo_porcentaje_avance_rango
sedes.sedes_email_contacto_formato
```

Con las tablas de hoy, `VALIDATE CONSTRAINT` tarda milisegundos y no bloquea escrituras. Si
alguna falla, mejor enterarse ahora: significaría que hay una fila con un correo mal formado
o un costo negativo.

---

## 5. Permisos sobrantes en 34 funciones

El avisor de seguridad marca 87 avisos de *SECURITY DEFINER ejecutable*. **Lo comprobé uno a
uno llamándolas con la clave anónima, y ninguno es explotable:**

- **30 son funciones de trigger.** PostgREST ni las publica: devuelven **404**. Una función
  de trigger llamada directamente falla siempre.
- `is_admin()` → `false` y `current_user_role()` → `null` para quien no tiene sesión. No
  filtran nada.
- Las 19 restantes son las RPC de la app, concedidas a `authenticated` a propósito, y todas
  comprueban el rol por dentro. Eso es el diseño, no un fallo.

La única con algo que decir es **`app_schema_version()`**: devuelve `"20261001000000"` a
cualquiera con la clave pública. Es un dato menor, pero le dice a un curioso exactamente qué
versión está desplegada.

Aun así conviene limpiarlo, por dos razones: la regla del propio proyecto
([ai-context.md](../ai-context.md) §2.2) dice que toda función en `public` se revoca, y
**87 avisos de mentira esconden el aviso de verdad del día que aparezca**.

---

## 6. Un dato que conviene leer bien

El avisor marca 10 *índices sin usar*, entre ellos los que se crearon esta semana. **No hay
que borrarlos.** Con 5 órdenes, Postgres prefiere recorrer la tabla entera aunque exista el
índice, porque es más barato. "Sin usar" aquí significa "la base es demasiado pequeña para
que haga falta", no "sobra". Esa métrica solo dice algo con meses de uso real.

---

## Qué falta fuera de la base

De [salida-a-produccion.md](../salida-a-produccion.md) §2, comprobado hoy contra el proyecto:

| | Estado |
|---|---|
| **PRD-01** Registro público apagado | ✅ Hecho (`disable_signup: true`) |
| **PRD-02** Plan Pro | ⬜ **El más importante que queda.** En Free no hay respaldos diarios y el proyecto se pausa tras una semana sin uso |
| **PRD-03** Rotar la llave de Resend | ⬜ Se compartió en una conversación |
| **PRD-05** SMTP de Auth con Resend | ⬜ El correo de recuperación que recibiste venía de Supabase: ese servidor entrega ~2 por hora y, por política de Supabase, solo a correos del equipo. **Un técnico podría no recibir nunca su recuperación de contraseña** |
| **PRD-06** Sentry | ⬜ `VITE_SENTRY_DSN` sigue vacía: un error en el teléfono de un técnico no llega a nadie |
| **PRD-07** Contraseñas de 8 en Auth | ⬜ La app exige 8; el panel sigue en 6 y la recuperación aceptaría una de 6 |
| **PRD-08** Vaciar buckets viejos | ⬜ `vehiculos_fotos` tiene **69 archivos y 78 MB** de antes de las fases de multimedia; `firmas` 7 y `reportes` 3 |
| **Nuevo** Protección de contraseñas filtradas | ⬜ Apagada. Es un interruptor en Authentication: compara contra HaveIBeenPwned |

---

## Recomendación

Por orden de provecho:

1. **Las cuatro de la base** (§1 a §4) en una migración, con las pruebas pgTAP y
   `qa:security` como red. §1 es la que de verdad cambia algo a futuro.
2. **La limpieza de permisos** (§5) en otra migración aparte, para que el avisor quede en
   cero y el próximo aviso signifique algo.
3. **PRD-02 y PRD-05** antes de atender clientes reales. Sin respaldos diarios y sin un SMTP
   propio, el primer problema serio no tiene vuelta atrás y los técnicos no pueden recuperar
   su contraseña.

---

## Aplicado el mismo día

Dos migraciones, `20261002000000_afinado_rls_e_indices` y
`20261002000001_revocar_funciones_internas`. **45 migraciones aplicadas**, 8 suites pgTAP en
verde y `qa:security` en **59 PASS · 0 FAIL**.

| Aviso del linter | Antes | Después |
|---|---|---|
| RLS evaluada por fila | 16 | **0** |
| Políticas permisivas múltiples | 24 | **0** |
| Claves foráneas sin índice | 14 | **0** |
| `SECURITY DEFINER` expuesta | 87 | 26 (todas intencionales, ver abajo) |
| **Total** | **152** | **52** |

Las 52 políticas se regeneraron **desde el catálogo**, no a mano: el cuerpo de cada una es
exactamente el que tenía, con las llamadas de cero argumentos envueltas en `(SELECT …)`.
`is_assigned_to_order(orden_id)` se dejó sin envolver porque recibe la fila como argumento.

La prueba de que sirvió está en el plan de ejecución de una consulta real como técnico:

```
Seq Scan on ordenes_trabajo
  Filter: ((InitPlan 1).col1 OR (sede_id = (InitPlan 2).col1))
  InitPlan 1 -> Result
  InitPlan 2 -> Result
```

`is_admin()` y `current_user_sede_id()` son ahora **InitPlan**: se resuelven una vez por
consulta. Antes aparecían dentro del filtro, una vez por fila.

### Lo que NO se revocó, y por qué

`is_admin()`, `current_user_role()`, `current_user_sede_id()` e `is_assigned_to_order()`
**conservan** su permiso para `authenticated`, en contra de lo que diría la regla general.
No es un descuido: las expresiones de una política de RLS se evalúan con los permisos de
**quien consulta**. Comprobado en la base local antes de decidirlo:

```sql
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM authenticated;
SET ROLE authenticated;  SELECT count(*) FROM clientes;
--> ERROR: permission denied for function is_admin
```

Revocarlas "por seguir la regla" dejaría la aplicación entera sin poder leer nada. El avisor
las seguirá marcando; es un falso positivo conocido y la migración lleva esta nota dentro.

### Dos avisos que quedan y no son problemas

- **`numero_orden_contadores` con RLS y sin políticas.** Es lo correcto: solo la toca su
  trigger, que corre como el dueño de la tabla. Sin políticas, nadie más puede leerla ni
  escribirla.
- **24 "índices sin usar"**, que subieron de 10 porque acabamos de crear 14. Con 5 órdenes
  Postgres prefiere recorrer la tabla entera. Esa métrica solo dice algo con meses de uso.

### Sigue pendiente, y es tuyo

Nada de esto toca el frontend, así que no hace falta un `dist` nuevo por esta parte. Lo que
queda es de panel y de plan: **PRD-02 (plan Pro)** y **PRD-05 (SMTP propio para Auth)** son
los dos que de verdad conviene cerrar antes de atender clientes reales, más la protección de
contraseñas filtradas, los 8 caracteres en Auth, Sentry y los 78 MB del bucket viejo.
