# Pagos a empleados: comisiones y salarios

Propuesta para quitar la ambigüedad del pago al personal antes de salir a producción.

> **Estado (4 de octubre de 2026):** propuesta. Las preguntas de la
> [sección 5](#5-preguntas-enviadas-al-taller) se enviaron al taller; la 5 se contestó el
> 03/10/2026 (comisión **por tarea**, ya hecha en local: migración `20261010000006`, fase F3
> del [plan de mejoras](plan-mejoras-2026-10.md)) y las demás esperan respuesta. Lo de la
> sección 4 no está implementado todavía. Cómo funciona **hoy**: [comisiones.md](comisiones.md).

---

## 1. Cómo funciona hoy

- La comisión se **devenga al entregar** la orden. Desde F3 (`20261010000006`) es **por
  tarea**: cada línea de mano de obra autorizada tiene su técnico y le paga a él, costo × su
  porcentaje (el suyo o el de la sede). Una tarea sin técnico no le paga a nadie (la orden lo
  avisa).
- Las líneas de **antes** de F3 conservan el reparto por especialidad (`20261009000000`):
  cada especialidad es una bolsa con su mano de obra autorizada, repartida **en partes
  iguales** entre los asignados **a mano** con esa tarea, al porcentaje de cada quien. Al
  darle técnico a una de esas líneas sale de la bolsa (ver la decisión pendiente abajo).
- Quien está **a salario** no cobra comisión. El monto del salario es solo informativo: no
  se paga ni se asienta en ningún lado.
- Quien está en **mixto** (desde `20261010000020`, 05/10/2026) tiene salario **y** comisión: su
  salario es informativo igual que arriba, y su comisión se calcula, acepta y paga como la de
  quien va por comisión.
- Un **pago** es una selección libre de comisiones pendientes de una persona. Deja un egreso
  por orden en Finanzas.
- **Lo pendiente sigue la configuración vigente.** Cambiar el porcentaje de la sede o de
  una persona recalcula sus comisiones pendientes, y pasar a alguien a salario las borra.
  Lo pagado no se toca.

## 2. Dónde está la ambigüedad

Por riesgo, de mayor a menor:

1. **Lo ganado se reescribe.** Un cambio de porcentaje antes de pagar cambia comisiones de
   trabajos ya entregados. Pasar a alguien a salario le **borra lo que se le debía**. Un
   empleado puede perder dinero ganado por un cambio de configuración.
2. **Las correcciones después de pagar no tienen dónde ir.** Si una orden pagada se reabre,
   cambia de mano de obra o vuelve por retrabajo, lo pagado se queda y lo pendiente se
   recalcula aparte: se puede pagar de más y no hay forma de descontarlo en el siguiente
   pago.
3. **Quien está asignado cobra, trabaje lo que trabaje.** Dos pintores asignados cobran igual
   aunque uno haya hecho el 80 %. Si nadie quita a alguien de la orden, cobra.
4. **El salario no existe en el dinero.** El resultado del mes no incluye la nómina y el
   margen por orden sale inflado en los trabajos de personal asalariado.
5. **No hay períodos ni recibos.** No hay corte semanal o quincenal, ni un recibo que el
   empleado pueda revisar, ni adelantos o descuentos.
6. **Casos sin regla:** un administrador asignado como técnico cobra comisión pero no aparece
   en Empleados; no está definido si la comisión se gana al entregar o al cobrar.
7. **Lo legal no lo cubre nadie.** En EE. UU., un técnico en planilla (W-2) que cobra solo
   comisión debe recibir al menos el salario mínimo **por cada hora trabajada**, y las horas
   extra se calculan sobre horas reales, no facturadas. La excepción de la sección 7(i) del
   FLSA tiene condiciones. Restorify no registra horas. **Esto lo decide el contador del
   taller, no el sistema.**

## 3. Cómo lo resuelven las plataformas grandes

- **El sistema del taller reporta, no paga.** Registra quién hizo qué y cuánto se facturó, y
  entrega un reporte por técnico y período que se exporta a la nómina (QuickBooks, Gusto,
  ADP), que se encarga de impuestos, retenciones y horas extra. Tekmetric, por ejemplo, tiene
  un reporte de horas facturadas por técnico y rango de fechas para exportarlo a la nómina.
- **Crédito por línea de trabajo.** En Shopmonkey se asigna un técnico a cada línea de mano de
  obra (o a toda la orden) y eso define su costo y su comisión.
- **El esquema de pago vive en el perfil:** por hora, tarifa fija por hora facturada, salario,
  comisión o combinaciones.
- **Horas de reloj y horas facturadas se registran por separado**, porque la ley mira las
  primeras.
- **Principio contable (de los sistemas de nómina en general):** lo ganado es un registro que
  no se edita. Cada comisión guarda el porcentaje con que se ganó; un cambio de porcentaje
  tiene fecha de vigencia y aplica hacia adelante; una corrección es una línea de ajuste
  nueva (+ o −); el pago cierra un período y deja un recibo.

Ni los grandes lo resuelven todo: el reporte por técnico de Shopmonkey muestra la tarifa
**actual** del técnico, no la que tenía cuando hizo el trabajo.

## 4. Propuesta

### Fase 1 — antes de que se acumule dinero real (1 a 2 días)

No depende de las respuestas del taller.

- **Congelar la comisión al devengarse.** Se guarda el porcentaje y el esquema del día de la
  entrega. Los cambios de porcentaje o de esquema (también el de la sede) aplican solo a
  entregas futuras. Pasar a alguien a salario ya no borra lo que se le debe.
- **Ajustes en vez de recálculos.** Si una orden cambia después de pagada, se genera un
  ajuste (+ o −) que se liquida en el siguiente pago. Nada devengado se borra ni se reescribe.
- **Pagar por período.** "Pagar hasta el día X" (semanal o quincenal) y un recibo imprimible
  por empleado con órdenes, montos y ajustes.

### Fase 2 (2 a 3 días)

- El salario como **pago real por período**: egreso de planilla en Finanzas.
- **Base más comisión.**
- **Adelantos y descuentos**, que se restan en el siguiente pago.

### Fase 3 — según lo que diga el taller

- **Crédito por línea de trabajo**: quién hizo cada línea, con porcentaje si se comparte, en
  vez del reparto en partes iguales.
- **Horas trabajadas** (reloj), si se paga por hora o si el contador las necesita.
- **Exportación CSV por período** para el contador o el programa de nómina.

### El límite

Restorify **no calcula impuestos ni retenciones**. Eso le toca al programa de nómina o al
contador.

### Mientras tanto

Durante la prueba con el cliente: no cambiar porcentajes ni pasar a nadie a salario después
de entregar órdenes, y pagar las comisiones pendientes antes de cualquier cambio de esquema.

## 5. Preguntas enviadas al taller

Enviadas el 29 de septiembre de 2026. Cambian el diseño de las fases 2 y 3:

1. ¿Los técnicos están en planilla (W-2) o son contratistas (1099)? ¿Quién hace hoy la
   nómina?
2. ¿Cada cuánto se paga: semanal o quincenal?
3. ¿La comisión se gana al entregar o cuando el cliente paga?
4. Si un trabajo vuelve por falla (retrabajo), ¿se le descuenta al técnico?
5. Si dos personas comparten una especialidad, ¿se reparte en partes iguales o según lo que
   hizo cada una?
6. ¿Dan adelantos? ¿Alguien tiene base más comisión? ¿El dueño o los administradores cobran
   comisión?

| Pregunta | Respuesta del taller | Fecha |
|---|---|---|
| 1 | | |
| 2 | | |
| 3 | | |
| 4 | | |
| 5 | **Por tarea**: cada línea de mano de obra tiene su técnico y su comisión es de esa persona, a su porcentaje. Una tarea sin técnico no le paga a nadie y se avisa. Las líneas que ya existen siguen con el reparto por especialidad hasta que se les asigne técnico. Asignar es de administración y se cambia en cualquier momento, salvo que la comisión ya esté pagada. | 03/10/2026 (reunión) |
| 6 | | |

**Pendiente de confirmar con el taller (F3):** darle técnico a una línea heredada la saca del
reparto por especialidad **para siempre**. Si después se le quita el técnico, queda "Sin
técnico" (nadie cobra) en vez de volver a la bolsa. Se hizo así para que una línea no cambie
de quién la cobra sin que nadie lo vea, pero el taller no lo decidió explícitamente.

## 6. Dónde se tocaría

| Qué | Dónde |
|---|---|
| Cálculo del reparto | `_reparto_comisiones` y `sync_order_commissions` (vigentes en `20261010000006`, comisión por tarea; el reparto por especialidad es de `20261009000000`) |
| Técnico de cada tarea y lo pagado | `trg_labor_tecnico_guard`, `trg_labor_tecnico_asignado`, `trg_assignment_tasks_guard` (`20261010000006`); pantalla `LaborTable.tsx`, `TaskEditor.tsx` |
| Pagos y egresos por orden | `pay_commissions` (migración `20261010000000`) |
| Esquema de cada persona | tabla `perfiles_pago`; pantalla `src/pages/Employees.tsx` y `src/features/employees/` |
| Pantalla de pagos | `src/pages/Payroll.tsx`, `src/services/commissions.service.ts` |
| Pruebas | `supabase/tests/database/12_comisiones_especialidad.test.sql`, `13_margen_por_orden.test.sql` y `19_comision_por_tarea.test.sql` |

## Fuentes

- [Tekmetric: Technician Hours Report](https://support.tekmetric.com/hc/en-us/articles/360059335793-Technician-Hours-Report)
- [Shopmonkey: Assign Technicians to Labor Items](https://support.shopmonkey.io/hc/en-us/articles/38743885537172-Assign-Technicians-to-Labor-Items)
- [Shopmonkey: Summary By Technician Report](https://support.shopmonkey.io/hc/en-us/articles/44632303277716-Summary-By-Technician-Report)
- [Netchex: 10 Auto Repair Shop Payroll Problems](https://netchex.com/blog/auto-repair-shop-payroll-technician-commission-overtime/)
- [U.S. Department of Labor: Automotive Service (FLSA)](https://www.dol.gov/sites/dolgov/files/WHD/compliance-assistance/Automotive-Service-2021.pdf)
- [NFIB: Overtime Pay for Auto Mechanics](https://www.nfib.com/wp-content/uploads/2024/10/FLSA-Auto-Mechanics.pdf)
