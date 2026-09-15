# Restorify — Sistema de Administración de Talleres

Gestión de talleres mecánicos y de pintura con varias sedes: clientes, vehículos,
órdenes de trabajo con tablero Kanban, fotos, videos y notas de voz, presupuestos que
el cliente autoriza línea por línea, un enlace web para que el cliente siga su
vehículo sin crear cuenta, correos automáticos, finanzas con importación de estados
de cuenta, comisiones del personal y notificaciones en tiempo real y push al teléfono.

Frontend en React + Vite + TypeScript servido como sitio estático; todo el backend
es Supabase (Postgres con Row Level Security, Auth, Storage, Realtime, Edge
Functions, pg_cron).

## Documentación

Toda la documentación vigente está en **[docs/](docs/README.md)**:

| Si vas a… | Lee |
|---|---|
| Entender el sistema | [docs/arquitectura.md](docs/arquitectura.md) → [docs/reglas-de-negocio.md](docs/reglas-de-negocio.md) |
| Probar la plataforma (persona o agente de IA) | [docs/plan-de-pruebas.md](docs/plan-de-pruebas.md) |
| Saber qué cubren las pruebas automatizadas | [docs/pruebas.md](docs/pruebas.md) |
| Revisar los hallazgos de la última auditoría | [docs/auditoria-2026-09.md](docs/auditoria-2026-09.md) |
| Saber qué hay en Supabase y cómo está repartido | [docs/supabase.md](docs/supabase.md) |
| Desplegar | [docs/deployment.md](docs/deployment.md) |
| Usar la aplicación | [docs/manual-usuario.md](docs/manual-usuario.md) |
| Entender cómo evolucionó y por qué | [docs/evolucion.md](docs/evolucion.md) |
| Modificar el código con un agente de IA | [docs/ai-context.md](docs/ai-context.md) |

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 19, React Router 7, TypeScript, Vite, TanStack Query, react-hook-form + Zod |
| Backend | Supabase: Postgres 17 + RLS, Auth, Storage (TUS), Realtime, Edge Functions (Deno), pg_cron, pg_net, Vault |
| Multimedia | MediaRecorder, WebCodecs (Mediabunny), tus-js-client |
| Push | Web Push (VAPID) con service worker y manifest PWA |
| Correo | Resend (dominio `reinventa.shop`) |
| Estilos | CSS plano con variables, sin framework de UI |
| i18n | Español / Inglés |
| Calidad | oxlint, Vitest, pgTAP, Playwright, Sentry |
| Hosting | Hostinger (Apache) |

## Puesta en marcha

```bash
npm install
cp .env.example .env.local   # completa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173
```

| Comando | Qué hace |
|---|---|
| `npm run build` | `tsc -b && vite build` → `dist/` |
| `npm run lint` | oxlint |
| `npm test` | Pruebas unitarias y de componentes (Vitest) |
| `npm run test:db` | Pruebas de base de datos (pgTAP; requiere Docker y `npx supabase start`, ver [docs/pruebas.md](docs/pruebas.md#24-para-qué-hace-falta-docker)) |
| `npm run test:e2e` | Pruebas end-to-end (Playwright; credenciales en `.env.test.local`) |
| `npm run db:check` | Qué migraciones faltan en el proyecto enlazado |
| `npm run qa:security` | Pruebas de seguridad contra la API desplegada (ver [docs/pruebas.md](docs/pruebas.md#25-seguridad-contra-la-api-qasecurity)) |

Migraciones en `supabase/migrations/`, edge functions en `supabase/functions/`.
**No apliques migraciones ni despliegues funciones sin leer
[docs/deployment.md](docs/deployment.md)**: algunas migraciones exigen publicar el
frontend al mismo tiempo, y hay configuración (Storage, secretos, Vault) que no
está en el código.

## Seguridad en una línea

No hay servidor propio: el navegador habla directo con Supabase, así que **las
reglas de permisos y dinero viven en la base de datos** (RLS y triggers), nunca
solo en la interfaz. Ver [docs/arquitectura.md](docs/arquitectura.md#2-la-decisión-que-explica-todo-lo-demás).
