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

El estado vigente está en [../README.md](../README.md).
