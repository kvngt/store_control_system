# Instrucciones para agentes de IA

Restorify es un sistema en producción que maneja dinero, datos de clientes y permisos
por rol. Antes de cambiar algo, lee **[docs/ai-context.md](docs/ai-context.md)**: son
las reglas que no se pueden romper y dónde está cada cosa. Si vas a tomar el proyecto
completo, empieza por **[docs/traspaso.md](docs/traspaso.md)**.

## Lo mínimo

- **No hay backend propio.** El navegador habla directo con Supabase con una clave
  pública. La seguridad y el dinero viven en la base (RLS, triggers, RPC), nunca solo en
  React. Esconder un botón no es un permiso.
- **Todo cambio de esquema o permisos es una migración nueva** en
  `supabase/migrations/`. Nunca edites una migración aplicada ni cambies el esquema desde
  el panel de Supabase.
- **Toda función nueva en `public` se revoca** (`REVOKE ALL ... FROM PUBLIC, anon,
  authenticated`) y se concede solo a quien la necesita.
- **Nunca sumes dinero en el navegador ni leas listas sin paginar.** La API devuelve como
  máximo 1.000 filas por consulta y no avisa: usa `fetchAll` (`src/services/support.ts`)
  para listas y una RPC para totales.
- **Nunca pongas secretos** en el repositorio, la documentación o tu memoria. Viven en
  archivos `*.local`, en `supabase secrets` y en Vault.
- **No despliegues ni apliques migraciones al proyecto real** (`supabase db push`,
  `functions deploy`, subir `dist/`) sin que la persona responsable lo pida.
- **Commits solo cuando se piden.**

## Verificar un cambio

```bash
npm run lint && npx tsc -b && npm test && npm run build
npx supabase start && npm run test:db     # si tocaste SQL (necesita Docker)
npm run qa:security                       # después de aplicar migraciones de permisos
```

Qué probar a mano según lo que cambiaste: [docs/plan-de-pruebas.md](docs/plan-de-pruebas.md) §8.
