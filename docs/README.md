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
| **Entender el sistema** antes de tocar código | [arquitectura.md](arquitectura.md) → [reglas-de-negocio.md](reglas-de-negocio.md) |
| **Probar la plataforma completa** | [pruebas.md](pruebas.md) |
| **Desplegar o configurar un entorno** | [deployment.md](deployment.md) |
| **Usar la aplicación** o capacitar al taller | [manual-usuario.md](manual-usuario.md) |
| Trabajar con **multimedia o notificaciones** | [multimedia-y-notificaciones.md](multimedia-y-notificaciones.md) |
| Trabajar con el **portal del cliente o los correos** | [portal-y-correos.md](portal-y-correos.md) |
| Entender **cómo se paga al personal** | [comisiones.md](comisiones.md) |
| Arreglar **correos de recuperación de contraseña** | [password-reset.md](password-reset.md) |
| Ser un **agente de IA** que va a modificar el código | [ai-context.md](ai-context.md) primero |

---

## Qué hay en cada documento

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

**[pruebas.md](pruebas.md)** — Todas las pruebas: las automatizadas (Vitest, base
de datos con pgTAP, Playwright), qué cubre cada una y qué no, y el plan de pruebas
manual por módulo y por rol, con la matriz de dispositivos reales para video,
audio y push. Termina con la lista de verificación antes de cada despliegue.

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
| 5 | Presupuestos: el cliente autoriza o rechaza por línea | Pendiente |
| 6 | Reporte como enlace web en vez de PDF | Pendiente |

Donde un documento menciona algo de las fases 5–6, lo marca como pendiente.

> **Las fases 1–4 están desplegadas** en el proyecto de Supabase enlazado
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
| **Montos** | Totales, repuestos con precio y depósito. Solo los ve un admin. |
| **Bolsa de comisión** | Porcentaje de la mano de obra que se reparte entre los técnicos. |
| **RLS** | Row Level Security de Postgres: la regla que decide qué filas ve cada quien. |
| **Trigger** | Función de la base que corre sola cuando cambia una fila. Aquí vive la lógica de dinero y avisos. |
| **Edge function** | Código en el servidor de Supabase (Deno) para lo que el navegador no debe hacer. |
