// Regenera supabase/schema/actual.sql desde la base LOCAL (todas las migraciones aplicadas).
// Correr después de cada migración: el CI verifica que este archivo coincida con el estado
// real del esquema `public` generado por `supabase/migrations/`.
//
// Usa el stack local por defecto (`supabase/config.toml`). Si el tuyo responde en otro puerto,
// pásale la URL: SUPABASE_DB_URL="postgresql://postgres:postgres@127.0.0.1:44322/postgres?sslmode=disable".
// Nunca apuntes esto a producción: el esquema de referencia debe salir de las migraciones.
//
// Solo escribe el archivo si el comando terminó bien y la salida contiene DDL válido: si la
// base no responde, no se toca el archivo existente.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT = 'supabase/schema/actual.sql';

const HEADER = [
  '-- ============================================================================',
  '-- RESTORIFY — Esquema vigente del esquema `public` (SOLO LECTURA)',
  '-- ============================================================================',
  '-- Qué es: foto completa del estado actual de la base (tablas, funciones,',
  '--         triggers, políticas RLS, vistas e índices del esquema `public`).',
  '--',
  '-- NO editar a mano: cualquier cambio manual se perderá al regenerar y hará',
  '--                   fallar la verificación del CI.',
  '-- NO es una migración ni se aplica contra ninguna base de datos.',
  '-- La fuente de verdad que manda es `supabase/migrations/`.',
  '--',
  '-- Cómo regenerar después de añadir o cambiar una migración:',
  '--   npm run db:schema',
  '-- ============================================================================',
].join('\n');

const SESSION_SET_RE =
  /^SET (?:statement_timeout|lock_timeout|idle_in_transaction_session_timeout|transaction_timeout|client_encoding|standard_conforming_strings|check_function_bodies|xmloption|client_min_messages|row_security)\s*=.*;$/;

const VOLATILE_LINE_RES = [
  /^-- Dumped from database version\b.*$/,
  /^-- Dumped by pg_dump version\b.*$/,
  /^\\(?:un)?restrict\b.*$/,
  SESSION_SET_RE,
];

function normalizeDump(raw) {
  const lf = raw.replace(/\r\n?/g, '\n');
  const filtered = lf
    .split('\n')
    .filter((line) => !VOLATILE_LINE_RES.some((re) => re.test(line)));

  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const dbUrl = process.env.SUPABASE_DB_URL;
const args = ['-y', 'supabase@3', 'db', 'dump', '--schema', 'public'];
if (dbUrl) args.push('--db-url', dbUrl);

const result = spawnSync('npx', args, {
  encoding: 'utf8',
  shell: process.platform === 'win32',
  maxBuffer: 32 * 1024 * 1024,
});

const rawOut = result.stdout ?? '';
const body = normalizeDump(rawOut);
const looksLikeSchema = /\bCREATE\s+(TABLE|FUNCTION)\b/i.test(body);

if (result.error || result.status !== 0 || !looksLikeSchema) {
  if (result.error) console.error(result.error.message);
  process.stderr.write(rawOut.slice(0, 2000));
  process.stderr.write(result.stderr ?? '');
  console.error(
    `\nNo se regeneró ${OUT}: la CLI no devolvió un esquema SQL válido (¿está corriendo la base local? ¿SUPABASE_DB_URL?).`,
  );
  process.exit(1);
}

const content = `${HEADER}\n\n${body}\n`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, content, 'utf8');
console.log(`${OUT} regenerado (${content.split('\n').length - 1} líneas).`);
