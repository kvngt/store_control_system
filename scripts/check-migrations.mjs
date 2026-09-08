#!/usr/bin/env node
// ====================================================================================
// RESTORIFY — ¿Está la base de datos al día con el código?
// ====================================================================================
// Ejecútalo ANTES de desplegar: `npm run db:check`
//
// Existe por un incidente real: se desplegó una compilación cuyas migraciones
// nunca se habían aplicado. La pantalla de Comisiones, eliminar una sede y
// enviar un reporte fallaron, cada una con un mensaje distinto, y ninguno decía
// que la base de datos estuviera atrasada. Este script lo dice antes de que un
// usuario lo descubra apretando un botón.
//
// La aplicación además lo comprueba en caliente (ver src/lib/schemaVersion.ts);
// esto es la red de la que se cae primero.
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION_RE = /^(\d{14})_.*\.sql$/;

function localVersions() {
  return readdirSync(join(root, 'supabase', 'migrations'))
    .map((file) => MIGRATION_RE.exec(file)?.[1])
    .filter(Boolean)
    .sort();
}

function remoteVersions() {
  // `migration list` habla con el proyecto enlazado usando la sesión de la CLI,
  // así que no hace falta ninguna contraseña aquí.
  // `shell: true` en Windows a propósito: desde Node 18.20 lanzar un .cmd sin
  // shell falla con EINVAL, y `npx` en Windows es npx.cmd. Todos los argumentos
  // son literales fijos, así que no hay nada que citar.
  const isWindows = process.platform === 'win32';
  const out = execFileSync(
    isWindows ? 'npx.cmd' : 'npx',
    ['supabase', 'migration', 'list', '--linked', '--output-format', 'json'],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: isWindows }
  );
  // La CLI imprime líneas de progreso antes del JSON.
  const start = out.indexOf('{');
  if (start === -1) throw new Error('La CLI de Supabase no devolvió JSON.');
  const parsed = JSON.parse(out.slice(start));
  return (parsed.migrations ?? []).filter((m) => m.remote).map((m) => m.remote);
}

try {
  const local = localVersions();
  const remote = new Set(remoteVersions());
  const pending = local.filter((v) => !remote.has(v));

  if (pending.length === 0) {
    console.log(`✓ Base de datos al día — ${local.length} migraciones aplicadas.`);
    process.exit(0);
  }

  console.error(`\n✗ Hay ${pending.length} migración(es) sin aplicar:\n`);
  for (const v of pending) console.error(`    ${v}`);
  console.error(
    '\n  Desplegar así deja funciones rotas en producción.' +
      '\n  Aplícalas con:  npx supabase db push --linked\n'
  );
  process.exit(1);
} catch (err) {
  // Fallar ruidosamente: una comprobación que se salta en silencio no comprueba
  // nada, y este script solo se ejecuta cuando alguien lo pide explícitamente.
  console.error('\n✗ No se pudo comprobar el estado de las migraciones.');
  console.error(`  ${err.message.trim().split('\n').pop()}`);
  console.error(
    '\n  Comprueba que la CLI esté enlazada e iniciada la sesión:' +
      '\n    npx supabase login' +
      '\n    npx supabase link --project-ref <ref>\n'
  );
  process.exit(1);
}
