# Documentos históricos

Auditorías y reportes escritos en momentos anteriores del proyecto. Sirven para
entender **por qué** se tomaron algunas decisiones; **no describen el estado
actual** del sistema. Donde contradigan a los documentos de `docs/`, mandan los de
`docs/`.

| Documento | Qué es | Qué quedó superado |
|---|---|---|
| [ARCHITECTURE_AUDIT.md](ARCHITECTURE_AUDIT.md) | Auditoría de arquitectura previa a la reorganización de servicios | La estructura de carpetas y el servicio único de datos |
| [REFACTOR_2026-09.md](REFACTOR_2026-09.md) | Registro de la refactorización de septiembre de 2026 (servicios por dominio, TanStack Query, formularios) | Los conteos de pruebas y partes del modelo (montos en la orden, nómina) cambiaron después |
| [revision-qa-2026-09-03.md](revision-qa-2026-09-03.md) | Revisión de QA del 3 de septiembre de 2026 | Sus hallazgos se atendieron en revisiones posteriores; lo vigente está en la tabla de regresiones de [plan-de-pruebas.md](../plan-de-pruebas.md#7-regresiones) |
| [ejecucion-pruebas-2026-09-17.md](ejecucion-pruebas-2026-09-17.md) (+ `…-qa-security.json`) | Primera ejecución del plan de pruebas (nivel humo) contra el proyecto real, 36 migraciones | Conteos y resultados de ese día |
| [qa-2026-09-19-app-completa.md](qa-2026-09-19-app-completa.md) | QA de punta a punta en el sitio publicado, 43 migraciones | El flujo cambió después (espera de autorización, permisos del técnico, entrega) |
| [revision-base-2026-09-19.md](revision-base-2026-09-19.md) | Revisión de la base con los avisores de Supabase y el catálogo | Sus hallazgos se corrigieron en las migraciones 44 y 45 |
| [revision-codigo-2026-09-20.md](revision-codigo-2026-09-20.md) | Revisión de código: once hallazgos | Corregidos; conteos de ese día |
| [permisos-2026-09-20-alta-y-asignacion.md](permisos-2026-09-20-alta-y-asignacion.md) | Abrir órdenes y asignar pasan a ser solo de administración | Vigente; la regla está en [ai-context.md](../ai-context.md) |
| [mejoras-2026-09-21.md](mejoras-2026-09-21.md) | Mejoras pendientes de las revisiones anteriores | Hechas |
| [pruebas-kevin-2026-09-28.md](pruebas-kevin-2026-09-28.md) | Lo que salió de la prueba en el teléfono: push, archivar, campana, marca del PDF, teléfono con país, grabador de video | Hecho y publicado |
| [reunion-taller-2026-09.md](reunion-taller-2026-09.md) | Los siete cambios de la reunión con el taller, en cinco fases | Aplicado y publicado el 29/09/2026 |
| [auditoria-2026-09.md](auditoria-2026-09.md) | Auditoría de errores y seguridad de septiembre de 2026: 15 hallazgos, cómo se corrigió cada uno y con qué prueba | Corregido; las reglas que dejó viven en [ai-context.md](../ai-context.md) y `qa:security` las vigila |
| [plan-de-mejora.md](plan-de-mejora.md) | Desempeño, deuda técnica y plan posterior a la auditoría | Lo resuelto está marcado al principio; foto anterior a la revisión previa a producción |
| [salida-a-produccion.md](salida-a-produccion.md) | La revisión con la premisa de atender clientes reales al día siguiente: bloqueantes fuera del código, plan del día y vuelta atrás | El registro público ya está apagado y el plan Pro (con respaldos) está activo desde el 30/09; su §2 sigue siendo la lista de bloqueantes |
| [evaluacion-2026-10.md](evaluacion-2026-10.md) | Evaluación del 01/10/2026, la noche antes de la prueba en vivo: base, código, operación y plan | Cifras y plan de ese día; lo pendiente se lleva en [../bitacora.md](../bitacora.md#estado) |
| [plan-mejoras-2026-10.md](plan-mejoras-2026-10.md) | El plan de la reunión del 03/10/2026 (fases F0–F7) con las decisiones del taller | Las fases están hechas; su estado y su bitácora se mudaron a [../bitacora.md](../bitacora.md) el 11/10/2026 |
| [analisis-del-proceso-2026-10.md](analisis-del-proceso-2026-10.md) | Una orden de punta a punta (05/10/2026): fallas de lógica y qué agrega valor | Sus arreglos están en las migraciones `20261010000016`–`18`; las reglas, en [ai-context.md](../ai-context.md) |
| [plan-pedidos-2026-10-05.md](plan-pedidos-2026-10-05.md) | Los pedidos del taller del 05/10/2026, listos para programar | Implementados (ver [../bitacora.md](../bitacora.md)) |
| [tareas-para-gemini.md](tareas-para-gemini.md) | Tareas para Gemini (10/10/2026): tipo de teléfono (oficina o celular) y WhatsApp por teléfono | Hecho en `20261010000026` y auditado |
| [tareas-para-gemini-parqueo.md](tareas-para-gemini-parqueo.md) | Diseño para Gemini (10/10/2026): trabajo con seguro y módulo de cobro por parqueo | Hecho en `20261010000027`–`28`, auditado y corregido el 11/10/2026; lo vigente está en [parqueo.md](../parqueo.md) |
| [comparativa-comercial-y-ux-2026-10.md](comparativa-comercial-y-ux-2026-10.md) | Restorify frente a los programas comerciales, y qué satura en la interfaz (11/10/2026) | Vigente como análisis: sus propuestas todavía no se implementan |

El estado vigente está en [../bitacora.md](../bitacora.md#estado); el índice de la documentación, en
[../README.md](../README.md).
