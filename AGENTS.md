# Instrucciones para agentes de IA

Restorify es un sistema en producción que maneja dinero, datos de clientes y permisos
por rol. Antes de cambiar algo, lee **[docs/ai-context.md](docs/ai-context.md)**: son
las reglas que no se pueden romper y dónde está cada cosa. Si vas a tomar el proyecto
completo, empieza por **[docs/traspaso.md](docs/traspaso.md)**. Para ver cómo está construido todo en diagramas (los "planos"), **[docs/planos.md](docs/planos.md)** (el resumen con cifras es [docs/radiografia.md](docs/radiografia.md) y el detalle, [docs/arquitectura.md](docs/arquitectura.md)); para ubicar una sección
(archivos, tablas, pruebas), **[docs/mapa-de-secciones.md](docs/mapa-de-secciones.md)**.

**Si retomas trabajo en curso** (varios modelos se turnan): la tabla de estado y la
**bitácora de traspaso** están en
**[docs/bitacora.md](docs/bitacora.md#bitácora-de-traspaso-entre-agentes)**.
Léela antes de empezar y agrega tu entrada al terminar cada bloque de trabajo.

## Lo mínimo

- **No hay backend propio.** El navegador habla directo con Supabase con una clave
  pública. La seguridad y el dinero viven en la base (RLS, triggers, RPC), nunca solo en
  React. Esconder un botón no es un permiso.
- **Todo cambio de esquema o permisos es una migración nueva** en
  `supabase/migrations/`. Nunca edites una migración aplicada ni cambies el esquema desde
  el panel de Supabase. Para reemitir una función, parte de su versión vigente:
  `npm run db:donde -- <nombre>`.
- **Toda función nueva en `public` se revoca** (`REVOKE ALL ... FROM PUBLIC, anon,
  authenticated`) y se concede solo a quien la necesita.
- **Nunca sumes dinero en el navegador ni leas listas sin paginar.** La API devuelve como
  máximo 1.000 filas por consulta y no avisa: usa `fetchAll` (`src/services/support.ts`)
  para listas y una RPC para totales.
- **Nunca pongas secretos** en el repositorio, la documentación o tu memoria. Viven en
  archivos `*.local`, en `supabase secrets` y en Vault.
- **No despliegues ni apliques migraciones al proyecto real** (`supabase db push`,
  `functions deploy`, un push a `main` o a `produccion`) sin que la persona responsable lo
  pida. **Hoy Hostinger publica la rama `main`** (verificado el 30/09/2026; la
  documentación decía `produccion`, ver [docs/historico/evaluacion-2026-10.md](docs/historico/evaluacion-2026-10.md#5-operación-y-despliegue)):
  un push a `main` sale en vivo en uno o dos minutos, sin esperar al CI.
- **Migraciones nuevas: nómbralas después de la última** que haya en `supabase/migrations/`
  (hoy `20261010000039`), no con la fecha de hoy. Hay migraciones aplicadas con fecha futura y
  una más vieja que la última no se aplica con `db push`.
- **Commits solo cuando se piden.**

## Principios de UX y adopción en el taller

En la semana de prueba el taller volvió a su hoja de papel. Una causa probable es que registrar
un carro costaba más que llenar la hoja ([docs/plan-adopcion-2026-10.md](docs/plan-adopcion-2026-10.md)).
Antes de cambiar una pantalla:

- **Recibir un carro toma menos de 60 segundos** con un cliente que solo trae nombre y
  teléfono. Todo campo obligatorio nuevo del alta tiene que justificarse contra eso.
- **Antes de agregar una tarjeta, sección o botón, di qué elemento existente se oculta, se
  fusiona o se automatiza.** Una acción nueva vive dentro de una sección existente
  (`TAB_SECTIONS`) o como acción rápida, nunca como una tarjeta por tabla.
- **Cada estado de la orden tiene un solo botón principal** (`QuickActions`, `primary`).
- **El técnico resuelve lo suyo en 1 o 2 toques** en un teléfono de 390 px, con botones de
  44 px o más.
- **El cliente puede no tener correo:** ningún paso depende del correo. WhatsApp y SMS son los
  canales, y lo que se le manda va en su idioma (`clientes.idioma`).
- Antes de dar por buena una pantalla, `/ux-taller`; antes de un cambio de base,
  `/nueva-migracion` (`.claude/commands/`).

## Verificar un cambio

```bash
npm run lint && npx tsc -b && npm test && npm run build
npx supabase start && npm run test:db     # si tocaste SQL (necesita Docker)
npm run qa:security                       # después de aplicar migraciones de permisos
```

Qué probar a mano según lo que cambiaste: [docs/plan-de-pruebas.md](docs/plan-de-pruebas.md) §8.
