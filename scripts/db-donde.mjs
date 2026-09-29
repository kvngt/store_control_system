#!/usr/bin/env node
// ====================================================================================
// RESTORIFY — ¿En qué migración está la versión vigente de…?
// ====================================================================================
//   npm run db:donde -- sync_order_commissions
//   npm run db:donde -- perfiles_pago
//   npm run db:donde -- ordenes_trabajo_select
//
// Una función de este proyecto se reescribe entera en cada migración que la cambia
// (`CREATE OR REPLACE` la reemplaza completa), y algunas van por su quinta versión. La
// vigente es la de la migración más nueva que la define; las demás son historia. Este
// script la encuentra, junto con el resto de lugares donde se nombra.
//
// Solo lee `supabase/migrations/`. No se conecta a ninguna base. La fuente de verdad sigue
// siendo la base: si hay duda, `pg_get_functiondef` (ver docs/mantenimiento.md).
// ====================================================================================
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const nombre = process.argv[2];
if (!nombre || !/^[a-z_][a-z0-9_]*$/i.test(nombre)) {
  console.error('Uso: npm run db:donde -- <función | trigger | política | tabla>');
  process.exit(2);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');
const archivos = readdirSync(dir).filter((f) => /^\d{14}_.*\.sql$/.test(f)).sort();

const n = nombre.replace(/_/g, '_');
const q = `"?${n}"?`;
const patrones = [
  { tipo: 'función', define: true, re: new RegExp(`CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+(public\\.)?${n}\\s*\\(`, 'i') },
  { tipo: 'función (borrada)', borra: true, re: new RegExp(`DROP\\s+FUNCTION\\s+(IF\\s+EXISTS\\s+)?(public\\.)?${n}\\b`, 'i') },
  { tipo: 'trigger', define: true, re: new RegExp(`CREATE\\s+(OR\\s+REPLACE\\s+)?TRIGGER\\s+${n}\\b`, 'i') },
  { tipo: 'trigger (borrado)', borra: true, re: new RegExp(`DROP\\s+TRIGGER\\s+(IF\\s+EXISTS\\s+)?${n}\\b`, 'i') },
  { tipo: 'política', define: true, re: new RegExp(`CREATE\\s+POLICY\\s+${q}\\s`, 'i') },
  { tipo: 'política (borrada)', borra: true, re: new RegExp(`DROP\\s+POLICY\\s+(IF\\s+EXISTS\\s+)?${q}\\s`, 'i') },
  { tipo: 'tabla', define: true, re: new RegExp(`CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?(public\\.)?${n}\\b`, 'i') },
  { tipo: 'tabla (cambio)', re: new RegExp(`ALTER\\s+TABLE\\s+(ONLY\\s+)?(public\\.)?${n}\\b`, 'i') },
];
const mencion = new RegExp(`\\b${n}\\b`, 'i');

const hallazgos = [];
const menciones = new Map();
for (const archivo of archivos) {
  const lineas = readFileSync(join(dir, archivo), 'utf8').split(/\r?\n/);
  lineas.forEach((linea, i) => {
    const sinComentario = linea.replace(/--.*$/, '');
    const p = patrones.find((x) => x.re.test(sinComentario));
    if (p) hallazgos.push({ archivo, linea: i + 1, ...p });
    else if (mencion.test(sinComentario)) menciones.set(archivo, (menciones.get(archivo) ?? 0) + 1);
  });
}

if (hallazgos.length === 0 && menciones.size === 0) {
  console.log(`No aparece "${nombre}" en ninguna migración.`);
  process.exit(1);
}

const definiciones = hallazgos.filter((h) => h.define || h.borra);
const ultima = definiciones.at(-1);

console.log(`\n"${nombre}" en supabase/migrations/\n`);
for (const h of hallazgos) {
  const marca = h === ultima ? (h.borra ? '  ← BORRADA aquí' : '  ← VIGENTE') : '';
  console.log(`  ${h.archivo}:${h.linea}  ${h.tipo}${marca}`);
}
if (ultima?.borra) {
  console.log(`\nLa última migración que lo toca lo borra: ya no existe en la base.`);
} else if (ultima) {
  const versiones = definiciones.filter((h) => h.define && h.tipo === ultima.tipo).length;
  console.log(`\nVersión vigente: ${ultima.archivo}, línea ${ultima.linea} (${versiones} ${versiones === 1 ? 'versión' : 'versiones'} en total).`);
  console.log('Para cambiarlo: migración nueva que lo reescriba entero, partiendo de esa versión.');
}
if (menciones.size) {
  console.log(`\nOtras migraciones que lo nombran (lo usan o lo mencionan): ${menciones.size}`);
  for (const [archivo, veces] of menciones) console.log(`  ${archivo} (${veces})`);
}
console.log('');
