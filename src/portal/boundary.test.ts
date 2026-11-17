import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// El portal del cliente es un paquete aparte: lo ve cualquiera sin sesión y no puede arrastrar
// Supabase, los servicios, los contextos ni las traducciones de la app (habla con la edge function
// `portal` por fetch). Esta prueba sigue cada import relativo desde src/portal, también los de lib/,
// y falla si alguno llega a uno de esos módulos. Puede importar src/landing/business.ts (datos puros,
// sin imports): como la sigue, también vigila que siga así.

const PORTAL = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN = [/^@supabase\//, /^@sentry\//, /\/lib\/supabase$/, /\/services\//, /\/context\//, /\/i18n\/translations$/];

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });

// Un `import type` desaparece al compilar: no arrastra nada al paquete (`lib/branding.ts` toma así el
// tipo `Theme` del contexto).
const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(/(?:import|export)(?!\s+type\s)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map(
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

describe('the portal bundle', () => {
  it('never reaches Supabase, the services, the contexts or the app translations', () => {
    const seen = new Set<string>();
    const offenders: string[] = [];
    const queue = sourceFiles(PORTAL);
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
    // Se recorrió de verdad: el portal, lo que usa de lib/ y los datos del taller de la página de inicio.
    expect([...seen].some((file) => /lib[\\/]phone\.ts$/.test(file))).toBe(true);
    expect([...seen].some((file) => /components[\\/]QuoteSection\.tsx$/.test(file))).toBe(true);
    expect([...seen].some((file) => /landing[\\/]business\.ts$/.test(file))).toBe(true);
  });
});
