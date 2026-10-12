# Documentación de Restorify

Restorify administra talleres mecánicos y de pintura con varias sedes: clientes,
vehículos, órdenes de trabajo con fotos, videos y notas de voz, finanzas,
comisiones del personal y avisos al teléfono de cada técnico.

Esta carpeta está pensada para que alguien que nunca vio el proyecto pueda
entenderlo, desplegarlo y probarlo completo sin tener que preguntarle a nadie.

---

## Por dónde empezar

| Si vas a… | Lee, en este orden |
|---|---|
| **Hacerte cargo del proyecto** sin poder preguntarle a quien lo hizo | [traspaso.md](traspaso.md) |
| **Salir a producción**: bloqueantes, plan del día y vuelta atrás | [salida-a-produccion.md](historico/salida-a-produccion.md) |
| **Entender el sistema** antes de tocar código | [radiografia.md](radiografia.md) (resumen y cifras) → [planos.md](planos.md) (diagramas) → [arquitectura.md](arquitectura.md) (a fondo) → [reglas-de-negocio.md](reglas-de-negocio.md) |
| Saber **qué está hecho, qué falta publicar y quién hizo qué** (o retomar el trabajo de otro agente) | [bitacora.md](bitacora.md) |
| **Cambiar una parte concreta** (Finanzas, la entrega, el portal…) y no saber a dónde ir | [mapa-de-secciones.md](mapa-de-secciones.md) |
| Saber **qué tan sano está el proyecto hoy**: estructura, base de datos, operación y qué hacer primero | [evaluacion-2026-10.md](historico/evaluacion-2026-10.md) |
| Ver **el plan de la reunión del 03/10/2026** (fases F0–F7, decisiones del taller; su estado está en la bitácora) | [plan-mejoras-2026-10.md](historico/plan-mejoras-2026-10.md) |
| Comparar con **los programas comerciales** y ver qué satura en la interfaz (11/10/2026) | [comparativa-comercial-y-ux-2026-10.md](historico/comparativa-comercial-y-ux-2026-10.md) |
| Saber si el **proceso del taller** (orden → trabajo → cobro → comisiones → ganancia) tiene fallas de lógica y qué agrega valor o solo complejidad (05/10/2026) | [analisis-del-proceso-2026-10.md](historico/analisis-del-proceso-2026-10.md) |
| Implementar los **pedidos del taller** (05/10/2026) listos para programar | [plan-pedidos-2026-10-05.md](historico/plan-pedidos-2026-10-05.md) |
| Preparar la **privacidad, el texto de la firma y la protección legal** (plan del 04/10/2026, pendiente de las decisiones del taller y de un abogado) | [plan-legal-y-privacidad.md](plan-legal-y-privacidad.md) |
| **Cambiar la base en producción** sin comprometer la operación, o saber qué deuda técnica queda | [mantenimiento.md](mantenimiento.md) |
| **Probar la plataforma a mano** como tester, sin programar | [manual-de-pruebas.md](manual-de-pruebas.md) |
| **Probar la plataforma** con casos técnicos (persona o agente de IA) | [plan-de-pruebas.md](plan-de-pruebas.md) |
| Saber **qué cubren las pruebas automatizadas** y cómo correrlas | [pruebas.md](pruebas.md) |
| Revisar **qué errores se encontraron** en la última auditoría y cómo se corrigieron | [auditoria-2026-09.md](historico/auditoria-2026-09.md) |
| Ver **la plataforma completa**: qué hay en Supabase, qué servicios externos se usan y quién habla con qué | [supabase.md](supabase.md) |
| **Desplegar o configurar un entorno** | [deployment.md](deployment.md) |
| **Usar la aplicación** o capacitar al taller | [manual-usuario.md](manual-usuario.md) |
| Trabajar con **multimedia o notificaciones** | [multimedia-y-notificaciones.md](multimedia-y-notificaciones.md) |
| Trabajar con el **portal del cliente o los correos** | [portal-y-correos.md](portal-y-correos.md) |
| Trabajar con **presupuestos** o entender por qué un total no incluye algo | [presupuestos.md](presupuestos.md) |
| Entender el **trabajo adicional** que reporta el técnico (hallazgos, la pausa de la orden, observaciones del taller) | [hallazgos.md](hallazgos.md) |
| Trabajar con el **cobro por parqueo** (o el trabajo con seguro, que decide su perfil) | [parqueo.md](parqueo.md) |
| Saber **cómo llegó el sistema a ser lo que es** y por qué se tomó cada decisión | [evolucion.md](evolucion.md) |
| Entender **cómo se paga al personal** | [comisiones.md](comisiones.md) (hoy) y [pagos-a-empleados.md](pagos-a-empleados.md) (propuesta pendiente) |
| Evaluar **un login y una dirección propios para otro taller** | [marca-por-dominio.md](marca-por-dominio.md) (propuesta pendiente) |
| Arreglar **correos de recuperación de contraseña** | [password-reset.md](password-reset.md) |
| Ser un **agente de IA** que va a modificar el código | [ai-context.md](ai-context.md) primero |

---

## Qué hay en cada documento

**[traspaso.md](traspaso.md)** — Para quien hereda el proyecto: cuentas y accesos, lo que
solo existe fuera del repositorio, cómo dejar una máquina lista, orden de lectura, cómo se
trabaja y se publica, qué hacer cuando algo se rompe, instrucciones para agentes de IA y los
patrones de error de un proyecto construido con IA que conviene seguir vigilando.

**[salida-a-produccion.md](historico/salida-a-produccion.md)** — La revisión con la premisa de atender
clientes reales al día siguiente: bloqueantes fuera del código (registro público abierto,
plan sin respaldos, llaves que rotar), los errores corregidos (totales cortados a 1.000 filas,
caché compartida en tablets, importación a medias, pagos dobles), el plan del día de la
salida, cómo volver atrás y qué vigilar la primera semana.

**[radiografia.md](radiografia.md)** — El resumen corto de cómo está construido: la decisión
central (no hay servidor propio: el navegador habla directo con Supabase, así que la seguridad
vive en la base de datos), las cifras, la estructura del repositorio, los módulos, la base, las
edge functions y el despliegue.

**[planos.md](planos.md)** — Los planos en diagramas: las capas, el mapa de pantallas, el ciclo de
vida de una orden, las tablas y cómo se relacionan, el camino del dinero y de las comisiones, lo
que ve el cliente, los avisos, quién puede hacer qué y cómo sale un cambio. Restaurado el
11/10/2026 tal como estaba el 05/10: le falta lo posterior.

**[arquitectura.md](arquitectura.md)** — La arquitectura a fondo, para quien va a tocar el código:
el mapa del repositorio, el modelo de datos, dónde vive la lógica de negocio (triggers y RPC),
seguridad y permisos, el servidor, el frontend por dentro, cómo se escriben migraciones, cómo
levantar el proyecto y las trampas que ya mordieron a alguien. Restaurado el 11/10/2026 tal como
estaba el 05/10: le falta lo posterior (donde no coincida, manda
[ai-context.md](ai-context.md)).

**[bitacora.md](bitacora.md)** — Documento vivo: la tabla de estado (qué está hecho y qué falta
publicar) y la bitácora de traspaso, donde cada agente (Claude Code, Gemini, Antigravity…)
anota qué hizo, qué verificó y cuál es el siguiente paso.

**[mapa-de-secciones.md](mapa-de-secciones.md)** — Cada sección de la app (órdenes, entrega,
presupuestos, comisiones y empleados, finanzas, portal, multimedia…) con su pantalla, sus
módulos, su servicio, sus tablas y funciones, sus pruebas y su documento. Para cuando hay que
cambiar una parte y no se sabe por dónde entrar.

**[evaluacion-2026-10.md](historico/evaluacion-2026-10.md)** — Evaluación del 1/10/2026, la noche antes de
la prueba en vivo: inventario y revisión de la base de datos (23 tablas, RLS, tipos, índices),
cifras y riesgos del código, hallazgos de operación (Hostinger publica `main`, Sentry inactivo,
sin cuentas de prueba, migraciones con fecha futura), secuelas del cambio de dominio y el plan
actualizado.

**[mantenimiento.md](mantenimiento.md)** — Revisión de la estructura antes de producción
(29/09/2026): el estado de la base y del código con evidencia, qué hace riesgosa una
migración, cómo cambiar la base sin cortar el servicio (en dos pasos, respaldo, staging,
orden de publicación, vuelta atrás) y un plan priorizado de mejoras.

**[reglas-de-negocio.md](reglas-de-negocio.md)** — Qué hace el sistema y por qué:
el ciclo de vida de una orden, qué dinero se asienta solo y cuándo, qué puede ver
y hacer cada rol, qué es visible para el cliente y quién recibe cada aviso. Es la
referencia para decidir si algo es un error o el comportamiento esperado.

**[multimedia-y-notificaciones.md](multimedia-y-notificaciones.md)** — Los dos
subsistemas con más piezas móviles: cómo se comprime, sube y reproduce la
multimedia de una orden, y cómo viaja un aviso desde un trigger hasta el
teléfono de un mecánico con la app cerrada. Incluye capacidad del plan y
diagnóstico.

**[portal-y-correos.md](portal-y-correos.md)** — El enlace personal del cliente, el
reporte web que abre sin cuenta y los correos automáticos: cuándo se crea y vence el
enlace, qué ve y qué nunca ve el cliente, cuándo sale cada correo, límites de Resend
y diagnóstico.

**[presupuestos.md](presupuestos.md)** — La autorización por línea: los estados de una
línea, las tres formas de autorizar (firma, enlace, registro del admin), qué cambia en
el dinero, qué ve cada quien y diagnóstico.

**[evolucion.md](evolucion.md)** — La historia del proyecto: de la demo a las fases del
cliente y los cambios de la reunión con el taller, las migraciones (con detalle hasta la 54; las siguientes, en la bitácora) con lo que hizo cada
una, las decisiones que se reemplazaron y cómo creció la red de pruebas.

**[manual-de-pruebas.md](manual-de-pruebas.md)** — Para la persona que prueba la
plataforma desde la pantalla: qué preparar, una orden de ejemplo con los montos que deben
salir, 142 casos en 13 sesiones (acceso y contraseñas, personal, órdenes como admin y como
técnico, presupuestos, enlace del cliente, dinero y comisiones, finanzas, teléfono, uso
real, borrados), cómo reportar un fallo y la hoja de resultados.

**[plan-de-pruebas.md](plan-de-pruebas.md)** — El plan de pruebas ejecutable: cada caso
con identificador, prioridad, pasos y resultado esperado, y si lo puede hacer un agente
de IA o necesita una persona con un teléfono. Niveles humo, publicación y completo;
seguridad contra la API, matriz de dispositivos, regresiones, lista antes de publicar y
plantilla del reporte.

**[pruebas.md](pruebas.md)** — Las pruebas automatizadas: Vitest, base de datos con pgTAP,
Playwright y `qa:security`; qué cubre cada una, qué no, cómo correrlas y para qué hace
falta Docker.

**[auditoria-2026-09.md](historico/auditoria-2026-09.md)** — La revisión de errores y seguridad de
septiembre de 2026: qué se encontró, qué tan grave era, cómo se corrigió, con qué prueba
se comprueba y los riesgos que quedan abiertos.

**[supabase.md](supabase.md)** — El inventario del proyecto de Supabase y de la plataforma
completa: el mapa de servicios (Hostinger, Supabase, Resend, push, NHTSA), quién habla
con qué y con qué llave, esquemas y tablas, las funciones agrupadas por quién puede
ejecutarlas, buckets y sus rutas, las 6 edge functions, nombres de secretos y de Vault,
Auth, Realtime, tareas programadas, dónde está cada cosa en el panel, el Supabase local y
lo que falta limpiar.

**[plan-mejoras-2026-10.md](historico/plan-mejoras-2026-10.md)** — El plan de los cambios que pidió el
taller después del primer día de pruebas (03/10/2026): historial de la orden y seguimiento de
errores, reintentar correos, detalle de la orden con pestañas, tareas con técnico y comisión
por tarea, nueva orden en 4 secciones, tareas por hacer del técnico, hallazgos y la nueva
"espera de autorización". Con las decisiones del taller y lo que hacen otros sistemas. Su
estado y su bitácora se mudaron a [bitacora.md](bitacora.md) el 11/10/2026.

**[comparativa-comercial-y-ux-2026-10.md](historico/comparativa-comercial-y-ux-2026-10.md)** —
Restorify frente a TallerAlpha, Tekmetric, Shopmonkey, Shop-Ware y AutoLeap (11/10/2026): qué
tiene y qué le falta, qué satura en la interfaz (sobre todo el detalle de la orden en el
teléfono), qué frena que el proyecto crezca y por dónde empezar.

**[analisis-del-proceso-2026-10.md](historico/analisis-del-proceso-2026-10.md)** — Una orden de punta a
punta (05/10/2026): qué aporta cada parte y qué solo agrega pasos, las fallas de lógica con su
evidencia (doble conteo al importar el banco, costo de repuestos igual al precio, sin tarjeta ni
impuesto de Maryland, el depósito dos veces en el enlace del cliente, correos sin salir, fechas
en UTC, avance a mano), las preguntas para el taller y el orden propuesto.

**[plan-de-mejora.md](historico/plan-de-mejora.md)** — Análisis de desempeño, deuda técnica y plan de
acción posterior a la auditoría. Es una foto anterior a la revisión previa a producción:
lo que se resolvió de ahí está marcado al principio del documento. Al final están las
**funciones propuestas que esperan la autorización del taller** (hoy: traducir en el portal lo
que escribe el taller).

**[deployment.md](deployment.md)** — Cómo se pone en producción: Supabase
(migraciones, secretos, Vault, edge functions, límites de Storage), Hostinger,
correo con Resend, variables de entorno, el orden en que tiene que hacerse todo y
qué revisar después.

**[manual-usuario.md](manual-usuario.md)** — La aplicación pantalla por pantalla,
escrita para el personal del taller. Base en texto para el manual con capturas.

**[parqueo.md](parqueo.md)** — El cobro por parqueo: perfiles con seguro y sin seguro, tramos,
gracia, topes, ajustes por orden, sus siete estados, cómo se cuenta, dónde entra al dinero, cuándo
se recalcula y por qué una orden entregada nunca se vuelve a contar.

**[comisiones.md](comisiones.md)** — El modelo de pago del personal como funciona hoy:
comisión por tarea (cada trabajo le paga a su técnico), el reparto por especialidad de las
líneas de antes, porcentaje de cada empleado, pagos con cheque y un egreso por orden en
Finanzas.

**[pagos-a-empleados.md](pagos-a-empleados.md)** — Propuesta para quitar la ambigüedad del
pago al personal (comisión congelada al devengarse, ajustes, períodos, salarios, adelantos),
cómo lo resuelven las plataformas grandes y las preguntas enviadas al taller. Pendiente de sus
respuestas.

**[marca-por-dominio.md](marca-por-dominio.md)** — Propuesta para que cada taller tenga su propio
login, su dominio, sus correos y su app instalada sin un segundo proyecto de Supabase: por qué no
hace falta otro proyecto (costos y operación), cómo funcionaría, qué cambia en la base, los
correos y el frontend, el orden de despliegue, las limitaciones y las alternativas descartadas.
Pendiente de evaluar.

**[password-reset.md](password-reset.md)** — Por qué los enlaces de recuperación
apuntaban a `localhost` y qué hay que configurar en Supabase para que no pase.

**[historico/](historico/)** — Auditorías y reportes de QA anteriores. Explican
decisiones pasadas; **no describen el estado actual**.

---

## Estado del proyecto

El estado al día —qué está hecho, qué falta publicar y quién hizo qué— vive en
**[bitacora.md](bitacora.md#estado)**, y cada agente lo actualiza al terminar un bloque de trabajo.
Las cifras del proyecto están en [radiografia.md §1](radiografia.md#1-cifras-actuales-del-proyecto).

En resumen, al 11/10/2026: el taller usa el sistema desde el 29/09/2026 (ese día la base se limpió
para la prueba); las seis fases del cliente, la auditoría, la revisión previa a producción, las
reuniones con el taller (29/09 y 03/10) y sus pedidos del 05/10 y del 06/10 están hechos y
publicados, igual que los teléfonos por sede, el trabajo con seguro y el cobro por parqueo. La
historia de cada etapa está en [evolucion.md](evolucion.md).

Pendiente fuera del código: un proyecto de staging, Sentry en producción, que Hostinger publique
la rama `produccion` (hoy publica `main`) y las decisiones del taller sobre el pago a empleados
([pagos-a-empleados.md](pagos-a-empleados.md)), el texto legal
([plan-legal-y-privacidad.md](plan-legal-y-privacidad.md)) y el impuesto. Antes de atender
clientes nuevos o de otro taller, revisa
[salida-a-produccion.md §2](historico/salida-a-produccion.md#2-bloqueantes-fuera-del-código).

> Para otro entorno hay configuración que no está en el código (secretos, Vault, llaves VAPID,
> Resend): paso a paso en [deployment.md](deployment.md#4-configuración-única-de-supabase).

---

## Vocabulario mínimo

| Término | Significado |
|---|---|
| **Sede** | Un taller físico. Casi todo pertenece a una sede y no se mezcla con otras. |
| **Admin** | Rol con acceso a todo, en todas las sedes, incluido el dinero. |
| **Técnico** | Mecánico o pintor. Mismos permisos; cambia el tipo de tarea. Solo ve las órdenes que tiene asignadas. |
| **Orden** | Un trabajo sobre un vehículo. Número `ORD-AAAA-###`. |
| **Recepción** | El ingreso del vehículo: fotos 360°, notas, firma del cliente. |
| **Avance** | Una entrada de la bitácora de trabajo, con nota y multimedia. |
| **Enlace del cliente** | `restorifyauto.net/r/<token>`: el reporte web de una orden, sin cuenta. |
| **Portal** | La página que abre ese enlace. |
| **Presupuesto** | Trabajos que se le presentan al cliente para que los autorice línea por línea. |
| **Línea autorizada** | Mano de obra o repuesto que el cliente aprobó. Solo eso se cobra. |
| **Montos** | Totales, repuestos con precio y depósito. Solo los ve un admin. |
| **Tarea** | Una línea de mano de obra con su tipo y su técnico. Su comisión es de ese técnico, a su porcentaje; sin técnico, no la cobra nadie (desde `20261010000006`). |
| **Bolsa de comisión** | La mano de obra autorizada **heredada** (líneas de antes de la comisión por tarea, sin técnico) de una especialidad, que se reparte entre quienes están asignados a mano con esa tarea, cada uno a su porcentaje. |
| **RLS** | Row Level Security de Postgres: la regla que decide qué filas ve cada quien. |
| **Trigger** | Función de la base que corre sola cuando cambia una fila. Aquí vive la lógica de dinero y avisos. |
| **Edge function** | Código en el servidor de Supabase (Deno) para lo que el navegador no debe hacer. |
