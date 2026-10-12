import { describe, expect, it } from 'vitest';
import { headingId, helpRoleOf, prepareManual, searchSections, sectionHeadings, splitSections } from './helpDoc';

// `node:fs` con importación dinámica y especificador no literal, como en `styles/cardHover.test.ts`:
// la app compila sin los tipos de Node y así esta prueba no se los pide.
type Fs = { readFileSync(path: URL, encoding: 'utf8'): string; existsSync(path: URL): boolean };
const fs = (await import(/* @vite-ignore */ `node:${'fs'}`)) as Fs;
const raiz = new URL('../../../', import.meta.url);

// Los dos manuales que muestra Ayuda (docs/manual-usuario.md y su versión en inglés).
const leer = (f: string) => fs.readFileSync(new URL(`docs/${f}`, raiz), 'utf8');
const MANUALES = { es: leer('manual-usuario.md'), en: leer('manual-usuario.en.md') };

const titulos = (md: string) => md.split(/\r?\n/).filter((l) => /^#{2,6} /.test(l));

describe('helpRoleOf', () => {
  it('mecánico y pintor son técnico; admin es admin', () => {
    expect(helpRoleOf('admin')).toBe('admin');
    expect(helpRoleOf('mecanico')).toBe('tecnico');
    expect(helpRoleOf('pintor')).toBe('tecnico');
    expect(helpRoleOf(undefined)).toBe('tecnico');
  });
});

describe('headingId', () => {
  it('arma el ancla como GitHub, con acentos', () => {
    expect(headingId('8. Órdenes de trabajo')).toBe('8-órdenes-de-trabajo');
    expect(headingId('Presupuestos: lo que el cliente autoriza')).toBe('presupuestos-lo-que-el-cliente-autoriza');
  });
});

describe('prepareManual (manual en español)', () => {
  const admin = prepareManual(MANUALES.es, 'admin');
  const tecnico = prepareManual(MANUALES.es, 'tecnico');

  it('quita la nota del editor, el índice y las marcas', () => {
    for (const md of [admin, tecnico]) {
      expect(md).not.toMatch(/Sobre este documento/);
      expect(md).not.toMatch(/^## Índice/m);
      expect(md).not.toMatch(/<!--/);
    }
  });

  it('cada rol ve lo suyo', () => {
    expect(admin).toMatch(/^## 12\. Finanzas/m);
    expect(tecnico).not.toMatch(/^## 12\. Finanzas/m);
    expect(admin).toMatch(/^## 6\. Clientes/m);
    expect(tecnico).not.toMatch(/^## 6\. Clientes/m);
    expect(tecnico).toMatch(/^### Para el técnico: Mis comisiones/m);
    expect(admin).not.toMatch(/^### Para el técnico: Mis comisiones/m);
    // Lo de todos, para los dos.
    for (const md of [admin, tecnico]) expect(md).toMatch(/^## 10\. Tablero Kanban/m);
  });

  it('una sección escondida se lleva sus subsecciones, pero no la siguiente de su nivel', () => {
    expect(tecnico).not.toMatch(/^#### Revisar y aceptar/m); // dentro de "Para administración"
    expect(tecnico).toMatch(/^## 13\. Comisiones/m);
    expect(tecnico).toMatch(/^### Cómo se calcula/m);
  });

  it('las imágenes apuntan a /ayuda/es/', () => {
    expect(admin).toMatch(/\]\(\/ayuda\/es\/01\.webp\)/);
    expect(admin).not.toMatch(/\.\.\/public\//);
  });
});

describe('los dos manuales', () => {
  it('tienen la misma estructura: títulos, marcas de rol e imágenes en el mismo orden', () => {
    const forma = (md: string) => md.split(/\r?\n/)
      .map((l) => (/^(#{2,6}) /.exec(l)?.[1] ?? /<!-- rol: (\w+) -->/.exec(l)?.[1] ?? /ayuda\/\w+\/(\d+)\.webp/.exec(l)?.[1] ?? null))
      .filter((x): x is string => x !== null);
    expect(forma(MANUALES.en)).toEqual(forma(MANUALES.es));
  });

  it('las marcas de rol van justo debajo de un título y solo son admin o tecnico', () => {
    for (const md of Object.values(MANUALES)) {
      const lineas = md.split(/\r?\n/);
      lineas.forEach((l: string, i: number) => {
        if (!/^\s*<!--\s*rol:/.test(l)) return; // la nota del editor las menciona entre comillas
        expect(l.trim()).toMatch(/^<!-- rol: (admin|tecnico) -->$/);
        expect(lineas[i - 1]).toMatch(/^#{2,6} /);
      });
    }
  });

  it('cada imagen existe en public/ayuda/<idioma>/', () => {
    for (const [idioma, md] of Object.entries(MANUALES)) {
      const rutas = [...md.matchAll(/\]\(\.\.\/public\/(ayuda\/[^)]+)\)/g)].map((m) => m[1]);
      expect(rutas.length).toBeGreaterThan(30);
      for (const r of rutas) {
        expect(r.startsWith(`ayuda/${idioma}/`), r).toBe(true);
        expect(fs.existsSync(new URL(`public/${r}`, raiz)), r).toBe(true);
      }
    }
  });

  it('el inglés tiene sus títulos traducidos (no es una copia del español)', () => {
    expect(titulos(MANUALES.en).length).toBe(titulos(MANUALES.es).length);
    expect(titulos(MANUALES.en).filter((t, i) => t === titulos(MANUALES.es)[i]).length).toBeLessThan(5);
  });
});

describe('búsqueda y secciones', () => {
  const secciones = splitSections(prepareManual(MANUALES.es, 'admin'));

  it('cada título tiene un id único, aunque el título se repita en dos secciones', () => {
    for (const md of Object.values(MANUALES)) {
      for (const rol of ['admin', 'tecnico'] as const) {
        const ids = splitSections(prepareManual(md, rol)).flatMap((s) => sectionHeadings(s).map((h) => h.id));
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it('parte el manual en sus secciones de nivel 2', () => {
    expect(secciones.length).toBeGreaterThan(15);
    expect(secciones[0].heading.id).toBe(headingId(secciones[0].heading.title));
    expect(sectionHeadings(secciones[0])[0].level).toBe(2);
  });

  it('busca sin acentos ni mayúsculas y exige todas las palabras', () => {
    const r = searchSections(secciones, 'ESTADO de cuenta');
    expect(r.length).toBeGreaterThan(0);
    // Todas las palabras, no la frase exacta.
    expect(r.every((s) => /estado/i.test(s.markdown) && /cuenta/i.test(s.markdown))).toBe(true);
    expect(searchSections(secciones, 'envio').length).toBe(searchSections(secciones, 'ENVÍO').length);
    expect(searchSections(secciones, 'parqueo').map((s) => s.heading.title)).toContain('14. Cobro por parqueo');
    expect(searchSections(secciones, 'zzzz-no-existe')).toEqual([]);
    expect(searchSections(secciones, '  ')).toBe(secciones);
  });
});
