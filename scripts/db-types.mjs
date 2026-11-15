// Regenera src/types/supabase.gen.ts desde la base LOCAL (todas las migraciones aplicadas).
// Correr después de cada migración: `src/types/domain/schema.contract.ts` avisa en `tsc -b` si un
// tipo de dominio dejó de coincidir con la base.
//
// Usa el stack local por defecto (`supabase/config.toml`). Si el tuyo responde en otro puerto,
// pásale la URL: SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:44322/postgres?sslmode=disable".
// Nunca apuntes esto a producción: no hace falta y los tipos deben salir de las migraciones.
//
// Solo escribe el archivo si lo que devolvió la CLI son tipos: si la base no responde, la CLI
// escribe el error en la salida y antes ese texto quedaba como contenido del archivo.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const OUT = 'src/types/supabase.gen.ts';
const dbUrl = process.env.SUPABASE_DB_URL;
const args = ['-y', 'supabase@3', 'gen', 'types', 'typescript', '--schema', 'public'];
if (dbUrl) args.push('--db-url', dbUrl);

const result = spawnSync('npx', args, { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 32 * 1024 * 1024 });
const out = result.stdout ?? '';

if (result.status !== 0 || !out.includes('export type Database')) {
  process.stderr.write(out.slice(0, 2000));
  process.stderr.write(result.stderr ?? '');
  console.error(`\nNo se regeneró ${OUT}: la CLI no devolvió tipos (¿está corriendo la base local? ¿SUPABASE_DB_URL?).`);
  process.exit(1);
}

writeFileSync(OUT, out);
console.log(`${OUT} regenerado (${out.split('\n').length} líneas).`);
