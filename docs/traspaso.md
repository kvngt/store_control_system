# Traspaso: cómo hacerse cargo de Restorify

Para la persona —o el agente de IA— que recibe el proyecto sin poder preguntarle a quien lo
construyó. Dice qué es, qué cuentas hay que tener, cómo dejar una máquina lista, cómo se
trabaja, cómo se publica y qué hacer cuando algo se rompe.

---

## Índice

1. [Qué es y en qué estado está](#1-qué-es-y-en-qué-estado-está)
2. [Cuentas y accesos](#2-cuentas-y-accesos)
3. [Lo que solo existe fuera del repositorio](#3-lo-que-solo-existe-fuera-del-repositorio)
4. [Primer día: dejar la máquina lista](#4-primer-día-dejar-la-máquina-lista)
5. [Orden de lectura](#5-orden-de-lectura)
6. [Cómo se trabaja](#6-cómo-se-trabaja)
7. [Operaciones frecuentes](#7-operaciones-frecuentes)
8. [Cuando algo se rompe](#8-cuando-algo-se-rompe)
9. [Si eres un agente de IA](#9-si-eres-un-agente-de-ia)
10. [Cómo se construyó (y qué vigilar por eso)](#10-cómo-se-construyó-y-qué-vigilar-por-eso)

---

## 1. Qué es y en qué estado está

**Restorify** administra talleres mecánicos y de pintura con varias sedes: clientes,
vehículos, órdenes de trabajo con fotos, videos y notas de voz, presupuestos que el cliente
autoriza por línea desde un enlace sin cuenta, correos automáticos, finanzas con importación
de estados de cuenta de Wells Fargo, comisiones del personal y avisos push al teléfono.

| | |
|---|---|
| **Usuarios** | Personal del taller (admin, mecánico, pintor) y clientes finales (solo el portal) |
| **Escala esperada** | 2 talleres, ~8 personas cada uno, ~120 órdenes al mes |
| **Frontend** | React 19 + TypeScript + Vite, sitio estático en Hostinger (`reinventa.shop`) |
| **Backend** | Supabase (proyecto `dbstores`): Postgres con RLS y triggers, Auth, Storage, Realtime, 6 Edge Functions, pg_cron |
| **Correo** | Resend, dominio `reinventa.shop` |
| **Estado** | Las seis fases del cliente, una auditoría y una revisión previa a producción, todas hechas. Antes de atender clientes reales: [salida-a-produccion.md](salida-a-produccion.md) §2 |
| **Idioma** | La interfaz en español e inglés; la documentación y los comentarios del código, en español (algunos antiguos en inglés) |

La decisión que explica todo: **no hay servidor propio**. El navegador habla directo con
Supabase, así que la seguridad y las reglas de dinero viven en la base de datos.
[arquitectura.md §2](arquitectura.md#2-la-decisión-que-explica-todo-lo-demás).

---

## 2. Cuentas y accesos

Pide acceso a cada una **antes** de que la persona anterior se vaya. Sin la de Supabase y la
de Hostinger no se puede publicar nada.

| Servicio | Qué hay ahí | Qué acceso necesitas | Si no lo tienes |
|---|---|---|---|
| **GitHub** — `kvngt/store_control_system` | El código, las pull requests, la integración continua (`.github/workflows/ci.yml`) | Colaborador con escritura, o ser dueño | No puedes publicar cambios versionados |
| **Supabase** — proyecto `dbstores` (`lendsiqkxhvbxxkaadrt`, región `ca-central-1`) | Base de datos, Auth, Storage, Edge Functions, secretos, Vault, tareas programadas | Miembro **Owner** o **Administrator** de la organización | No puedes aplicar migraciones, desplegar funciones ni ver logs. Nadie puede recuperar el proyecto sin el dueño de la organización |
| **Hostinger** | El hosting de `reinventa.shop` (`public_html/`) y el **DNS del dominio**, incluidos los registros que verifican Resend | Acceso a hPanel (o acceso delegado de Hostinger) | No puedes publicar el frontend; si el dominio vence, cae todo |
| **Resend** | Envío de correos al cliente, dominio verificado, llaves | Miembro del equipo | No puedes rotar la llave ni ver rebotes |
| **Sentry** (org `restorify`, proyecto `restorify-frontend`) | Errores del frontend. **Hoy sin DSN configurado** | Miembro | No ves errores en producción |
| **Google Jules** (bot "Bolt" en GitHub) | Abre pull requests automáticas de rendimiento | Quien lo conectó al repositorio | Sigue abriendo PRs; revisarlas o desconectarlo |

Datos que conviene tener anotados en un gestor de contraseñas del negocio, **no en el
repositorio**: dueño y fecha de vencimiento del dominio, correo dueño de cada cuenta,
método de pago del plan de Supabase y de Hostinger.

---

## 3. Lo que solo existe fuera del repositorio

Esto no se recupera clonando el repositorio. Si se pierde, hay que regenerarlo.

| Qué | Dónde vive | Si se pierde |
|---|---|---|
| `.env.local` (URL y clave anónima de Supabase, llave pública VAPID, DSN de Sentry) | Máquina de desarrollo | Todo se vuelve a leer del panel de Supabase (Project Settings → API Keys) salvo la llave pública VAPID, que también está en `supabase/.env.secrets.local` |
| `.env.test.local` (cuentas para pruebas e2e y `qa:security`) | Máquina de desarrollo | Crear cuentas de prueba nuevas ([plan-de-pruebas.md §2.2](plan-de-pruebas.md#22-cuentas)) |
| `supabase/.env.secrets.local` (secreto de funciones internas, par VAPID) | Máquina de desarrollo y, sin forma de leerlos de vuelta, en Supabase → Edge Functions → Secrets | Generar un juego nuevo ([deployment.md §7](deployment.md#7-rotar-secretos-y-llaves)): nuevo secreto en Supabase **y** en Vault; nuevo par VAPID en los secretos **y** en `VITE_VAPID_PUBLIC_KEY`, recompilar. Cada persona vuelve a activar el push en su teléfono |
| Llave de Resend | Solo en Supabase → Edge Functions → Secrets | Crear otra en Resend y cargarla con `npx supabase secrets set` |
| Configuración de Auth del proyecto real (registro apagado, SMTP, URL del sitio, largo de contraseña) | Panel de Supabase | `supabase/config.toml` describe la local, **no** la real. Ver [supabase.md §8](supabase.md#8-auth) |
| Respaldos de la base | Supabase (solo en plan Pro) | Sin Pro no hay respaldos |

---

## 4. Primer día: dejar la máquina lista

**Instalar:** Node 22 (`.nvmrc`), Git y Docker Desktop (solo para las pruebas de base de
datos; [pruebas.md §2.4](pruebas.md#24-para-qué-hace-falta-docker)). La CLI de Supabase y
Deno se usan con `npx`, sin instalar.

```bash
git clone https://github.com/kvngt/store_control_system.git
cd store_control_system
npm ci

cp .env.example .env.local           # completar con los valores de la sección 3
cp .env.test.example .env.test.local # cuentas de prueba (opcional)

npx supabase login                   # abre el navegador
npx supabase link --project-ref lendsiqkxhvbxxkaadrt

npm run db:check                     # "Base de datos al día"
npm run dev                          # http://localhost:5173
```

**Comprobar que todo funciona:**

```bash
npm run lint && npx tsc -b && npm test && npm run build
npx supabase start && npm run test:db && npx supabase stop
npm run qa:security
```

Si todo pasa, la máquina está lista.

> `npm run dev` usa el proyecto **real** de `.env.local`. No hay staging: lo que crees
> desde tu máquina aparece en el taller. Usa el prefijo `PRUEBA` y bórralo después.

---

## 5. Orden de lectura

| Día | Documento | Para qué |
|---|---|---|
| 1 | [README.md](README.md) | Mapa de la documentación |
| 1 | [arquitectura.md](arquitectura.md) | Cómo está construido y por qué |
| 1 | [supabase.md](supabase.md) | Qué hay en el backend y dónde se ve |
| 2 | [reglas-de-negocio.md](reglas-de-negocio.md) | Qué hace el sistema; para decidir si algo es un error |
| 2 | [salida-a-produccion.md](salida-a-produccion.md) y [auditoria-2026-09.md](auditoria-2026-09.md) | Qué se rompió, cómo se arregló, qué queda abierto |
| 3 | [deployment.md](deployment.md) | Publicar, rotar llaves, volver atrás |
| 3 | [pruebas.md](pruebas.md) y [plan-de-pruebas.md](plan-de-pruebas.md) | Qué está probado y cómo probar lo que cambies |
| Cuando toque | [presupuestos.md](presupuestos.md), [portal-y-correos.md](portal-y-correos.md), [multimedia-y-notificaciones.md](multimedia-y-notificaciones.md), [comisiones.md](comisiones.md) | Cada subsistema a fondo |
| Cuando toque | [evolucion.md](evolucion.md) | Por qué algo es como es (decisiones que se reemplazaron) |
| Para el taller | [manual-usuario.md](manual-usuario.md) | La app pantalla por pantalla |

---

## 6. Cómo se trabaja

### Ramas y revisión

- `main` es lo publicado. Trabaja en una rama y abre una pull request.
- La integración continua corre en cada PR: lint, tipos, 294 pruebas, build, y las 36
  migraciones desde cero con las 176 aserciones pgTAP. **No fusiones con CI en rojo.**

### Un cambio que toca la base

1. Migración nueva `supabase/migrations/AAAAMMDDHHMMSS_descripcion.sql`. Nunca editar una
   aplicada. Comentario al inicio con el problema que resuelve.
2. Toda función nueva: `REVOKE ALL ... FROM PUBLIC, anon, authenticated` y conceder solo lo
   necesario. Si es `SECURITY DEFINER`: `SET search_path = public` y validar rol por dentro.
3. Si protege algo, protegerlo en `INSERT` **y** en `UPDATE`.
4. Prueba pgTAP en `supabase/tests/database/`.
5. `npx supabase start && npm run test:db`.
6. Si agrega una RPC o función interna que no debe ser pública, sumar su caso a
   `scripts/qa/api-security.mjs`.

### Un cambio en el frontend

- Consultas solo en `src/services/`. **Listas con `fetchAll`**, **totales con una RPC**: la
  API corta en 1.000 filas sin avisar.
- Todo texto visible en `src/i18n/translations.ts` (español e inglés).
- Fechas con `src/lib/dates.ts`.
- Qué probar a mano según lo que cambiaste: [plan-de-pruebas.md §8](plan-de-pruebas.md#8-antes-de-cada-publicación).

Reglas completas: [ai-context.md](ai-context.md) (sirven igual para personas).

---

## 7. Operaciones frecuentes

| Tarea | Cómo |
|---|---|
| **Publicar una versión** | [deployment.md §5](deployment.md#5-publicar-una-versión): migraciones → funciones que cambiaron → build → subir `dist/` → [§6](deployment.md#6-verificación-después-de-publicar) |
| **Volver atrás** | [deployment.md §8](deployment.md#8-volver-atrás) y [salida-a-produccion.md §5](salida-a-produccion.md#5-volver-atrás) |
| **Crear o dar de baja a un empleado** | En la app: Configuración → Personal. Nunca desde Authentication → Users |
| **Un empleado olvidó la contraseña** | "¿Olvidaste tu contraseña?" en el login, o un admin le asigna una nueva editando su ficha |
| **Agregar una sede** | En la app: Configuración → Sedes. Cargar correo de contacto y WhatsApp |
| **Rotar llaves** (Resend, VAPID, secreto interno) | [deployment.md §7](deployment.md#7-rotar-secretos-y-llaves) |
| **Ver qué pasó con una orden** | `npx supabase db query --linked -f scripts/qa/estado-orden.sql` (editar el número) |
| **Restaurar un respaldo** | Supabase → Database → Backups (Pro). Restaura el proyecto entero a esa fecha: se pierde lo posterior |
| **Exportar datos** | Finanzas → Exportar CSV; o `npx supabase db dump --linked --data-only -f datos.sql` (tiene datos personales: no a git) |
| **Revisar la salud** | [salida-a-produccion.md §6](salida-a-produccion.md#6-la-primera-semana) |

---

## 8. Cuando algo se rompe

| Síntoma | Primero mira | Detalle |
|---|---|---|
| El sitio no abre o da 500 | ¿Se subió un `.htaccess` nuevo? ¿Hostinger está arriba? | [salida-a-produccion.md §5](salida-a-produccion.md#5-volver-atrás) |
| Aviso "esquema desactualizado" | `npm run db:check`: faltan migraciones o el `dist/` es viejo | [deployment.md §5](deployment.md#5-publicar-una-versión) |
| Nadie puede iniciar sesión | Supabase → Authentication → Providers: **Email** encendido | [salida-a-produccion.md PRD-16](salida-a-produccion.md#prd-16--media--un-config-push-habría-dejado-a-todos-sin-poder-entrar) |
| Una pantalla dice "no tienes permiso" | Rol de la cuenta; política RLS de la tabla | [reglas-de-negocio.md §3](reglas-de-negocio.md#3-qué-puede-hacer-cada-rol) |
| No llegan correos al cliente | Tarjeta "Enlace del cliente" de la orden; `cola_envios` | [portal-y-correos.md §9](portal-y-correos.md#9-diagnóstico) |
| No llegan push | Configuración → Notificaciones → Enviar prueba; secretos VAPID | [multimedia-y-notificaciones.md](multimedia-y-notificaciones.md#diagnóstico-1) |
| Un total no cuadra | ¿La línea está autorizada? ¿Se borró un movimiento automático? | [presupuestos.md §8](presupuestos.md#8-diagnóstico), [reglas-de-negocio.md §2](reglas-de-negocio.md#2-el-dinero-que-se-asienta-solo) |
| Editar o crear un empleado falla | `npm run qa:security` → SEC-17 (funciones desplegadas) | [supabase.md §6](supabase.md#6-edge-functions) |
| Subidas de video fallan | Tope de 50 MB; cuota de Storage del plan | [multimedia-y-notificaciones.md](multimedia-y-notificaciones.md) |
| Tareas programadas no corren | `cron.job_run_details` | [supabase.md §10](supabase.md#10-tareas-programadas-y-llamadas-salientes) |

Logs: Supabase → Logs & Analytics (API, Auth, Storage) y Edge Functions → la función → Logs.

---

## 9. Si eres un agente de IA

1. Lee `AGENTS.md` en la raíz y después [ai-context.md](ai-context.md). No empieces a editar
   antes.
2. Antes de afirmar cómo funciona algo, verifícalo en el código o en la base: la
   documentación puede quedar atrás. Si encuentras una diferencia, corrige la documentación
   en el mismo cambio.
3. Nunca apliques migraciones, despliegues funciones, cambies la configuración del panel ni
   subas archivos a Hostinger sin que la persona responsable lo pida explícitamente.
4. Nunca leas, copies ni escribas valores de secretos; solo nombres.
5. Para probar, usa el Supabase local (`npx supabase start`) y
   [plan-de-pruebas.md](plan-de-pruebas.md) §1.4. Contra el proyecto real, solo consultas
   de lectura.
6. Al terminar un cambio, todo en verde (sección 4) y la documentación afectada actualizada.

---

## 10. Cómo se construyó (y qué vigilar por eso)

Restorify se escribió en su mayor parte con asistentes de IA, con revisiones sucesivas
(ver [evolucion.md](evolucion.md) y [historico/](historico/)). Eso deja patrones que ya
aparecieron aquí y que conviene buscar en cualquier cambio nuevo:

| Patrón | Cómo se vio en este proyecto | Qué hacer |
|---|---|---|
| **Seguridad en la pantalla y no en la base** | Botones escondidos que la API no protegía (etapas 1–3, fase 1) | Toda regla en RLS, trigger o RPC; probar con `qa:security` |
| **Funciona con 20 filas, falla con 2.000** | Totales y listas cortados a 1.000 filas (PRD-10/11) | `fetchAll` para listas, RPC para agregados |
| **Permisos por defecto que nadie revisa** | Funciones de dinero ejecutables por cualquiera (AUD-01) | `REVOKE` en la misma migración; `qa:security` |
| **Varias peticiones donde hacía falta una transacción** | Borrar orden, importar estado de cuenta (AUD-04, PRD-14) | Un trigger o una RPC |
| **Carreras en operaciones de dinero** | Pago doble de comisiones (PRD-15) | `FOR UPDATE` o restricciones únicas |
| **Configuración que dice una cosa y hace otra** | `config.toml` que apagaba el login (PRD-16); documentación que decía "registro apagado" con el registro abierto (PRD-01) | Verificar contra el sistema real, no contra el archivo |
| **Algo implementado y nunca desplegado** | `update-employee` (AUD-26) | `qa:security` SEC-17; `functions list` tras publicar |
| **Pruebas escritas y nunca ejecutadas** | 158 aserciones pgTAP sin correr durante semanas (AUD-24) | CI con Docker |
| **Documentación optimista** | Varias veces "listo" antes de probarlo en el entorno real | Cada afirmación de estado con la fecha y cómo se comprobó |
| **PRs automáticas repetidas** | El bot Bolt propuso 6 veces la misma optimización | Revisarlas contra el código actual o desconectar el bot |
