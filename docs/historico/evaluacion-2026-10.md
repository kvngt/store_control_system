# Evaluación del proyecto — 1 de octubre de 2026

Estado de la estructura del código, de la base de datos y de la operación, revisado la noche
anterior a la primera prueba en vivo con el taller. Parte de la revisión del 29/09
([mantenimiento.md](../mantenimiento.md)) y registra lo que cambió desde entonces. Para entender
*cómo* está construido el sistema, [radiografia.md](../radiografia.md); este documento dice
*qué tan sano está* y qué hacer primero.

## Índice

1. [Veredicto](#1-veredicto)
2. [Qué cambió desde el 29/09](#2-qué-cambió-desde-el-2909)
3. [Estructura del código](#3-estructura-del-código)
4. [Base de datos](#4-base-de-datos)
5. [Operación y despliegue](#5-operación-y-despliegue)
6. [Secuelas del cambio de dominio](#6-secuelas-del-cambio-de-dominio)
7. [Plan priorizado](#7-plan-priorizado)
8. [Cómo se revisó](#8-cómo-se-revisó)

---

## 1. Veredicto

**El código y la base están sanos; lo frágil es la operación alrededor.**

- **Base de datos:** las 23 tablas tienen RLS, el dinero usa `NUMERIC`, las fechas llevan zona
  horaria, las llaves foráneas tienen índice y cada `ON DELETE` es una decisión explícita. El
  dinero lo asientan triggers probados por 330 aserciones pgTAP, que el CI corre en cada push.
- **Código:** una sola puerta a Supabase (`services/`), lógica pura en `lib/` con pruebas,
  páginas grandes ya partidas en `features/`. 504 pruebas unitarias en verde.
- **Operación:** el sitio se publica con cada push a `main` sin esperar al CI, no hay staging,
  Sentry no está activo y las cuentas de prueba ya no existen. Ninguno de estos rompe la app
  hoy, pero hacen que un error llegue a producción sin que nadie se entere. Son lo primero del
  [plan](#7-plan-priorizado).

---

## 2. Qué cambió desde el 29/09

| Cambio | Dónde | Efecto |
|---|---|---|
| **Dominio definitivo `restorifyauto.net`** (antes `reinventa.shop`, dado de baja) | Código, Hostinger, Resend, Auth | El código y el sitio publicado ya no mencionan el dominio viejo. Quedan secuelas fuera del código: [§6](#6-secuelas-del-cambio-de-dominio) |
| **Supabase Pro** | Panel de Supabase | Respaldos diarios. Cierra R-B4 y P0-2 de [mantenimiento.md](../mantenimiento.md) |
| **Secciones plegables en el detalle de la orden** (teléfono) | `components/MobileSection.tsx`, `features/workOrders/WorkOrderDetail.tsx` | Cada tarjeta es una pestaña con un dato en el encabezado; Avances abre desplegada para el técnico. En escritorio no cambia nada |
| **Ícono de la app con el logo del login** | `scripts/generate-pwa-icons.mjs`, `public/icons/` | Los íconos se generan desde `src/assets/restorify-logo.webp`; las URLs llevan `?v=2` porque Hostinger los guarda 7 días |
| **Recarga sola tras una publicación** | `lib/staleChunk.ts`, `components/ErrorBoundary.tsx`, `public/.htaccess` | Antes, quien tenía la app abierta al publicar veía "Algo salió mal" al entrar a una sección. Ahora la página se recarga una vez y un archivo inexistente de `assets/` responde 404 |

Los tres cambios de código están publicados (commits `e98c339`, `f2fca35`, `3a11005`) con el CI
en verde.

---

## 3. Estructura del código

### Cifras

| Carpeta | Archivos | Líneas (sin pruebas) | Archivos de prueba | Qué hay |
|---|---:|---:|---:|---|
| `features/` | 43 | 7 900 | 21 | Módulos con estado propio: detalle de orden, multimedia, avisos, empleados… |
| `pages/` | 12 | 5 250 | 10 | Una pantalla por archivo |
| `lib/` | 31 | 3 480 | 21 | Lógica sin React: fechas, dinero, errores, PDF, multimedia, push |
| `services/` | 17 | 2 230 | 8 | Todas las consultas a Supabase, una por dominio |
| `i18n/` | 1 | 1 840 | 1 | Español e inglés |
| `components/` | 14 | 1 520 | 6 | Piezas compartidas y el layout |
| `portal/` | 6 | 1 380 | 1 | Reporte web del cliente, paquete aparte |
| `types/` | 13 | 730 | — | Tipos de dominio |
| `context/` | 10 | 550 | 2 | Auth, idioma, tema, avisos, cambios sin guardar |
| **Total** | | **25 300** (33 600 con pruebas) | **71** | Más 5 600 líneas de CSS |

### Lo que está bien

- **Una sola puerta a la base.** Ningún componente llama a `supabase.from`; solo `services/`,
  más `AuthContext` (sesión) y `lib/schemaVersion.ts` (aviso de esquema desactualizado), que son
  infraestructura y está bien que lo hagan.
- **La lógica pura está aislada y probada.** `lib/` tiene una prueba por cada dos archivos.
- **El detalle de la orden ya no es un solo archivo de 2 000 líneas.** Vive en
  `features/workOrders/` con una tarjeta por archivo.
- **Las reglas que se repiten tienen red.** Paridad de traducciones (`translations.test.ts`),
  contraste del color de marca (`branding.test.ts`) y el `:hover` de las tarjetas
  (`cardHover.test.ts`) fallan en el CI si alguien las rompe.

### Riesgos

| # | Riesgo | Evidencia | Qué hacer |
|---|---|---|---|
| C-1 | **Archivos grandes que mezclan responsabilidades** | `useWorkOrderDetail.ts` (710 líneas, el hook que más se toca), `Settings.tsx` (830), `CustomerPortal.tsx` (850) | Partirlos cuando toque cambiarlos (P1-2, P2-3, P2-4) |
| C-2 | **La fachada `supabaseService` sigue en uso** | 19 archivos la importan | Retirarla poco a poco (P1-3); código nuevo importa el servicio del dominio |
| C-3 | **Dos archivos que crecen sin límite** | `translations.ts` (1 840 líneas) y `components.css` (4 640) | Partir por dominio (P2-1, P2-2). La prueba de paridad sigue igual |

Ninguno es urgente: son de mantenimiento, no de errores.

---

## 4. Base de datos

### Inventario

23 tablas, 114 funciones, 55 triggers, 125 políticas RLS y 54 índices, construidos por 54
migraciones (11 500 líneas de SQL).

| Dominio | Tablas |
|---|---|
| **Sedes y personas** | `sedes`, `perfiles`, `perfiles_pago` |
| **Clientes** | `clientes`, `vehiculos` |
| **Órdenes** | `ordenes_trabajo`, `orden_montos`, `orden_labor`, `orden_repuestos`, `orden_asignaciones`, `orden_avances`, `orden_media`, `orden_enlaces`, `presupuestos`, `numero_orden_contadores` |
| **Dinero del personal** | `comisiones`, `comision_pagos` |
| **Finanzas** | `finanzas_movimientos`, `finanzas_importaciones`, `finanzas_reglas_categorizacion` |
| **Avisos y envíos** | `notificaciones`, `push_suscripciones`, `cola_envios` |

El diagrama de relaciones y los detalles que no son obvios están en
[radiografia.md §4](radiografia.md#4-modelo-de-datos); los triggers por tabla, en
[§5](radiografia.md#5-dónde-vive-la-lógica-de-negocio).

### Revisión

| Qué se revisó | Resultado |
|---|---|
| RLS activo | **23 de 23 tablas** |
| Tipo del dinero | `NUMERIC` en todas las columnas de dinero (`NUMERIC(10,2)` y `(12,2)` en totales, `NUMERIC` sin escala en cálculos). Ninguna en `float` ni `real` |
| Fechas | Todas `TIMESTAMP WITH TIME ZONE` |
| Llaves foráneas | Todas las de uso frecuente con índice (incluida `finanzas_movimientos.referencia_orden_id`, que usan el margen y las reversiones) |
| `ON DELETE` | 27 `CASCADE` (hijos de una orden, vehículos de un cliente), 12 `RESTRICT` (una orden protege a su cliente y su vehículo), 23 `SET NULL` (autoría, referencias de finanzas) |
| Funciones expuestas | Las internas se revocan de `anon` y `authenticated`; `npm run qa:security` lo comprueba contra la API real |
| Pruebas | 330 aserciones pgTAP en 13 archivos, corridas por el CI de GitHub en cada push a `main` |

### Riesgos

| # | Riesgo | Por qué importa | Qué hacer |
|---|---|---|---|
| **B-1** *(nuevo)* | **Hay 11 migraciones con fecha futura** (`20261002…` a `20261010…`) | Supabase aplica las migraciones en orden de nombre. Una migración nueva con la fecha real de hoy (`20261001…`) quedaría *antes* de las ya aplicadas, y `supabase db push` la rechaza ("would be inserted before the last migration") o exige `--include-all`. | **Hasta el 10/10/2026, nombra las migraciones nuevas después de `20261010000000`** (por ejemplo `20261011000000_…`). Después de esa fecha, la fecha real vuelve a funcionar. `npm run db:check` muestra la última aplicada |
| B-2 | **El esquema vigente solo existe repartido en 54 migraciones** (R-B1) | Para saber cómo está hoy una función hay que encontrar su última versión (`npm run db:donde`) | Generar `supabase/schema/actual.sql` (P1-1) |
| B-3 | **Muchos triggers sobre `ordenes_trabajo`** (R-B2) | Su orden de ejecución depende del nombre; uno nuevo puede correr antes de lo esperado | Convención de nombres (P2-6) y prueba pgTAP del caso |
| B-4 | **Los movimientos automáticos de Finanzas se pueden borrar a mano** (R-B5, AUD-23) | Un admin puede descuadrar el margen de una orden | Decisión pendiente del taller |

---

## 5. Operación y despliegue

| # | Hallazgo | Evidencia | Riesgo | Qué hacer |
|---|---|---|---|---|
| **O-1** | **Hostinger publica la rama `main`, no `produccion`** | El 30/09 el sitio cambió 1–2 minutos después de cada uno de tres pushes a `main`; `produccion` no se movió desde el 29/09 | Un push a `main` sale a producción **antes** de que el CI termine y antes de un `db push`. Si la versión necesita una migración, la app falla hasta aplicarla | Decidir: **(a)** cambiar en el panel de Hostinger la rama a `produccion` (lo que describe [deployment.md](../deployment.md)) o **(b)** aceptar `main` y no empujar a `main` nada que no esté listo para producción. Mientras no se decida, **un push a `main` es un despliegue** |
| **O-2** | **Sentry no está activo en producción** | El sitio publicado no contiene un DSN; `appStart.tsx` solo inicia Sentry si `VITE_SENTRY_DSN` existe | Un error en el teléfono de un técnico no queda registrado en ningún lado | Crear el proyecto en Sentry y poner `VITE_SENTRY_DSN` en las variables de Hostinger (P0-3) |
| **O-3** | **Las cuentas de prueba ya no existen** | Las 6 de `.env.test.local` responden `invalid_credentials` (se borraron con la limpieza del 29/09) | `qa:security` salta 62 de 85 casos y los e2e no pueden entrar | Crearlas en un proyecto de staging (P0-1), no en el del taller |
| O-4 | **No hay staging** | Un solo proyecto de Supabase | Toda prueba que escribe datos (e2e, entregar, pagar) lo hace sobre los datos del taller | P0-1 |
| O-5 | **Docker no está disponible en la máquina de desarrollo** | `npm run test:db` no corre localmente | Bajo: el CI de GitHub sí corre las pgTAP en cada push | Instalar Docker Desktop para correrlas antes del push |

**Lo que sí funciona:** CI en verde en cada push (lint, tipos, pruebas, build y pgTAP); la base
tiene todas las migraciones del código (`npm run db:check`); las 6 edge functions están
desplegadas y responden; el sitio envía las cabeceras de seguridad y redirige `www` al dominio
sin `www`; la app es instalable en Android y en iPhone (verificado con la comprobación de
instalabilidad de Chrome).

---

## 6. Secuelas del cambio de dominio

El código y el sitio publicado están limpios: ninguno de los 42 archivos JavaScript publicados
menciona `reinventa.shop`, y la URL pública configurada en Hostinger es
`https://restorifyauto.net`. Lo que queda está fuera del código:

| Qué | Efecto | Qué hacer |
|---|---|---|
| **Suscripciones push creadas en `reinventa.shop`** | El navegador del teléfono conserva la suscripción del dominio viejo y el servicio de push la sigue aceptando, así que `process-outbox` no la borra. Quien activó los avisos en los dos dominios los recibe dos veces, y tocar el viejo abre un dominio muerto | Revisar `push_suscripciones` por `creado_en` y borrar las anteriores al 30/09; esas personas reactivan los avisos en Configuración |
| **App instalada desde `reinventa.shop`** | El ícono abre el dominio muerto | Borrarla e instalarla desde `restorifyauto.net` |
| **Enlaces del portal ya enviados** (`reinventa.shop/r/…`) | No abren | El token sigue vigente: reenviar desde la orden ("Enviar reporte") |
| **Plantilla del correo de recuperación** | El ejemplo de [password-reset.md](../password-reset.md) firmaba "Taller Reinventa" | Revisar la plantilla en Authentication → Emails |
| **Configuración del panel** | Site URL, Redirect URLs, `PUBLIC_SITE_URL`, `EMAIL_FROM_ADDRESS` | Según [deployment.md](../deployment.md) se cambiaron el 30/09; confirmarlo a la vista |

Si todavía se controla `reinventa.shop`, una redirección 301 a `restorifyauto.net` resolvería
de golpe los enlaces viejos y las apps instaladas.

---

## 7. Plan priorizado

Actualiza el plan de [mantenimiento.md §5](../mantenimiento.md#5-plan-priorizado).

### Antes de atender clientes reales

| # | Qué | Estado |
|---|---|---|
| O-1 | Decidir la rama que publica Hostinger | **Pendiente.** Mientras tanto, un push a `main` es un despliegue |
| P0-1 | Proyecto de staging con cuentas de prueba | Pendiente |
| P0-2 | Plan Pro (respaldos) | **Hecho** (30/09) |
| P0-3 | Sentry en producción | **Pendiente:** falta `VITE_SENTRY_DSN` en Hostinger |
| — | Limpiar las suscripciones push del dominio viejo ([§6](#6-secuelas-del-cambio-de-dominio)) | Pendiente |
| B-1 | Regla de nombres para migraciones nuevas | Documentada en [ai-context.md](../ai-context.md) y [radiografia.md §9](radiografia.md#9-migraciones-el-flujo-de-trabajo) |

### Bajo riesgo, alto valor

Sin cambios respecto a [mantenimiento.md](../mantenimiento.md): P1-1 (esquema en un archivo), P1-2
(partir `useWorkOrderDetail`), P1-3 (retirar `supabaseService`), P1-4 (pagos a empleados).

### Cuando toque esa parte

P2-1 a P2-7 de [mantenimiento.md](../mantenimiento.md), sin cambios. A la lista de compactar el
teléfono se agrega el **encabezado del detalle de la orden** (número, botones, estado y avance
ocupan media pantalla antes de la primera sección).

---

## 8. Cómo se revisó

- **Código:** conteo de archivos y líneas por carpeta, importaciones de `supabaseService` y
  llamadas a Supabase fuera de `services/`. `npm run lint`, `npx tsc -b`, `npm test` (504 en
  verde) y `npm run build`.
- **Base:** lectura de las 54 migraciones (tablas creadas y eliminadas, `ENABLE ROW LEVEL
  SECURITY`, tipos de columnas de dinero y fechas, índices, `ON DELETE`). `npm run db:check`
  contra el proyecto real. No se consultaron datos de producción.
- **Operación:** encabezados y archivos del sitio publicado, los 42 archivos JS publicados,
  `supabase functions list`, `npm run qa:security` (23 en verde, 0 fallas, 62 saltados por falta
  de cuentas), la API de GitHub Actions para el CI y la comprobación de instalabilidad de
  Chrome (`Page.getInstallabilityErrors`) en el sitio publicado.
