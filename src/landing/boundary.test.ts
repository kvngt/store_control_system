import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// La página de inicio es un paquete aparte, como el portal: la ve cualquiera sin sesión y no puede
// arrastrar Supabase, los servicios, los contextos ni las traducciones de la app (pesan y la ligan a
// la app). Esta prueba sigue cada import relativo desde src/landing, también los de lib/, y falla si
// alguno llega a uno de esos módulos.

const LANDING = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN = [/^@supabase\//, /^@sentry\//, /\/lib\/supabase$/, /\/services\//, /\/context\//, /\/i18n\/translations$/];

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map(
    (match) => match[1] ?? match[2],
  );

const resolveLocal = (from: string, specifier: string): string | null => {
  const base = resolve(dirname(from), specifier.replace(/\?.*$/, ''));
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Sigue con la siguiente forma del nombre.
    }
  }
  return null;
};

describe('the landing bundle', () => {
  it('never reaches Supabase, the services, the contexts or the app translations', () => {
    const seen = new Set<string>();
    const offenders: string[] = [];
    const queue = sourceFiles(LANDING);
    while (queue.length) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      for (const specifier of importsOf(file)) {
        const normalized = specifier.startsWith('.') ? resolve(dirname(file), specifier).replace(/\\/g, '/').replace(/\.(tsx?)$/, '') : specifier;
        if (FORBIDDEN.some((pattern) => pattern.test(normalized))) offenders.push(`${file} → ${specifier}`);
        if (specifier.startsWith('.') && /\.tsx?$|\/[^.]+$/.test(specifier)) {
          const next = resolveLocal(file, specifier);
          if (next) queue.push(next);
        }
      }
    }
    expect(offenders).toEqual([]);
    // Se recorrió de verdad: la página, sus secciones y lo que usa de lib/.
    expect([...seen].some((file) => /lib[\\/]phone\.ts$/.test(file))).toBe(true);
    expect([...seen].some((file) => /sections[\\/]ColorStudio\.tsx$/.test(file))).toBe(true);
  });
});
