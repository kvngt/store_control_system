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
| **Salir a producción**: bloqueantes, plan del día y vuelta atrás | [salida-a-produccion.md](salida-a-produccion.md) |
| **Entender el sistema** antes de tocar código | [arquitectura.md](arquitectura.md) → [reglas-de-negocio.md](reglas-de-negocio.md) |
| **Probar la plataforma a mano** como tester, sin programar | [manual-de-pruebas.md](manual-de-pruebas.md) |
| **Probar la plataforma** con casos técnicos (persona o agente de IA) | [plan-de-pruebas.md](plan-de-pruebas.md) |
| Saber **qué cubren las pruebas automatizadas** y cómo correrlas | [pruebas.md](pruebas.md) |
| Revisar **qué errores se encontraron** en la última auditoría y cómo se corrigieron | [auditoria-2026-09.md](auditoria-2026-09.md) |
| Ver **la plataforma completa**: qué hay en Supabase, qué servicios externos se usan y quién habla con qué | [supabase.md](supabase.md) |
| **Desplegar o configurar un entorno** | [deployment.md](deployment.md) |
| **Usar la aplicación** o capacitar al taller | [manual-usuario.md](manual-usuario.md) |
| Trabajar con **multimedia o notificaciones** | [multimedia-y-notificaciones.md](multimedia-y-notificaciones.md) |
| Trabajar con el **portal del cliente o los correos** | [portal-y-correos.md](portal-y-correos.md) |
| Trabajar con **presupuestos** o entender por qué un total no incluye algo | [presupuestos.md](presupuestos.md) |
| Saber **cómo llegó el sistema a ser lo que es** y por qué se tomó cada decisión | [evolucion.md](evolucion.md) |
| Entender **cómo se paga al personal** | [comisiones.md](comisiones.md) |
| Arreglar **correos de recuperación de contraseña** | [password-reset.md](password-reset.md) |
| Ser un **agente de IA** que va a modificar el código | [ai-context.md](ai-context.md) primero |

---

## Qué hay en cada documento

**[traspaso.md](traspaso.md)** — Para quien hereda el proyecto: cuentas y accesos, lo que
solo existe fuera del repositorio, cómo dejar una máquina lista, orden de lectura, cómo se
trabaja y se publica, qué hacer cuando algo se rompe, instrucciones para agentes de IA y los
patrones de error de un proyecto construido con IA que conviene seguir vigilando.

**[salida-a-produccion.md](salida-a-produccion.md)** — La revisión con la premisa de atender
clientes reales al día siguiente: bloqueantes fuera del código (registro público abierto,
plan sin respaldos, llaves que rotar), los errores corregidos (totales cortados a 1.000 filas,
caché compartida en tablets, importación a medias, pagos dobles), el plan del día de la
salida, cómo volver atrás y qué vigilar la primera semana.

**[arquitectura.md](arquitectura.md)** — Cómo está construido. La decisión central
(no hay servidor propio: el navegador habla directo con Supabase, así que la
seguridad vive en la base de datos), el mapa del repositorio, el modelo de datos,
los triggers, el frontend por dentro, cómo se escriben migraciones y las trampas
que ya mordieron a alguien.

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
cliente, las 36 migraciones con lo que hizo cada una, las decisiones que se
reemplazaron y cómo creció la red de pruebas.

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

**[auditoria-2026-09.md](auditoria-2026-09.md)** — La revisión de errores y seguridad de
septiembre de 2026: qué se encontró, qué tan grave era, cómo se corrigió, con qué prueba
se comprueba y los riesgos que quedan abiertos.

**[supabase.md](supabase.md)** — El inventario del proyecto de Supabase y de la plataforma
completa: el mapa de servicios (Hostinger, Supabase, Resend, push, NHTSA), quién habla
con qué y con qué llave, esquemas y tablas, las 92 funciones agrupadas por quién puede
ejecutarlas, buckets y sus rutas, las 6 edge functions, nombres de secretos y de Vault,
Auth, Realtime, tareas programadas, dónde está cada cosa en el panel, el Supabase local y
lo que falta limpiar.

**[plan-de-mejora.md](plan-de-mejora.md)** — Análisis de desempeño, deuda técnica y plan de
acción posterior a la auditoría. Es una foto anterior a la revisión previa a producción:
lo que se resolvió de ahí está marcado al principio del documento.

**[deployment.md](deployment.md)** — Cómo se pone en producción: Supabase
(migraciones, secretos, Vault, edge functions, límites de Storage), Hostinger,
correo con Resend, variables de entorno, el orden en que tiene que hacerse todo y
qué revisar después.

**[manual-usuario.md](manual-usuario.md)** — La aplicación pantalla por pantalla,
escrita para el personal del taller. Base en texto para el manual con capturas.

**[comisiones.md](comisiones.md)** — El modelo de pago del personal: bolsa de
comisión sobre la mano de obra, reparto, pagos con cheque y cómo se refleja en
Finanzas.

**[password-reset.md](password-reset.md)** — Por qué los enlaces de recuperación
apuntaban a `localhost` y qué hay que configurar en Supabase para que no pase.

**[historico/](historico/)** — Auditorías y reportes de QA anteriores. Explican
decisiones pasadas; **no describen el estado actual**.

---

## Estado del proyecto (septiembre 2026)

Hay un plan de cambios pedido por el cliente en seis fases. Estado:

| Fase | Qué | Estado |
|---|---|---|
| 1 | Mecánicos y pintores sin acceso a montos; solo ven la mano de obra | Implementada |
| 2 | Fotos, videos (hasta 2 min) y notas de voz en las órdenes | Implementada |
| 3 | Notificaciones internas en tiempo real y push al teléfono | Implementada |
| 4 | Portal web del cliente (sin cuenta) y correos automáticos | Implementada |
| 5 | Presupuestos: el cliente autoriza o rechaza por línea | Implementada |
| 6 | Reporte como enlace web en vez de PDF | Implementada |

Después de las fases hubo dos revisiones: una **auditoría** y una **revisión previa a
producción** (migración 36, aplicada; el build que la acompaña falta subirlo a Hostinger).
**Antes de atender clientes reales, completar
[salida-a-produccion.md §2](salida-a-produccion.md#2-bloqueantes-fuera-del-código)**: el
registro público de cuentas está abierto en el proyecto real y el plan no tiene respaldos.

La **auditoría completa** (septiembre 2026): 15
hallazgos corregidos, entre ellos funciones internas de dinero que se podían llamar por
la API sin sesión. Detalle, pruebas y lo que queda abierto en
[auditoria-2026-09.md](auditoria-2026-09.md). Su migración
(`20260926000000_audit_hardening`) está aplicada en el proyecto enlazado y el build
que la acompaña está publicado (15 de septiembre de 2026).

> **Las seis fases están desplegadas** en el proyecto de Supabase enlazado
> (septiembre 2026). Para otro entorno hay configuración que no está en el código
> (secretos, Vault, llaves VAPID, Resend): paso a paso en
> [deployment.md](deployment.md#4-configuración-única-de-supabase).

---

## Vocabulario mínimo

| Término | Significado |
|---|---|
| **Sede** | Un taller físico. Casi todo pertenece a una sede y no se mezcla con otras. |
| **Admin** | Rol con acceso a todo, en todas las sedes, incluido el dinero. |
| **Técnico** | Mecánico o pintor. Mismos permisos; cambia el tipo de tarea. |
| **Orden** | Un trabajo sobre un vehículo. Número `ORD-AAAA-###`. |
| **Recepción** | El ingreso del vehículo: fotos 360°, notas, firma del cliente. |
| **Avance** | Una entrada de la bitácora de trabajo, con nota y multimedia. |
| **Enlace del cliente** | `reinventa.shop/r/<token>`: el reporte web de una orden, sin cuenta. |
| **Portal** | La página que abre ese enlace. |
| **Presupuesto** | Trabajos que se le presentan al cliente para que los autorice línea por línea. |
| **Línea autorizada** | Mano de obra o repuesto que el cliente aprobó. Solo eso se cobra. |
| **Montos** | Totales, repuestos con precio y depósito. Solo los ve un admin. |
| **Bolsa de comisión** | Porcentaje de la mano de obra que se reparte entre los técnicos. |
| **RLS** | Row Level Security de Postgres: la regla que decide qué filas ve cada quien. |
| **Trigger** | Función de la base que corre sola cuando cambia una fila. Aquí vive la lógica de dinero y avisos. |
| **Edge function** | Código en el servidor de Supabase (Deno) para lo que el navegador no debe hacer. |
