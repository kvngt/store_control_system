// El manual de usuario dentro de la app (Ayuda). El texto vive en docs/manual-usuario.md (y su
// versión en inglés, docs/manual-usuario.en.md): aquí solo se prepara para mostrarlo.
//
// Marcas que entiende, escritas en el propio manual:
//   <!-- rol: admin -->    debajo de un título: esa sección, hasta el siguiente título de su
//   <!-- rol: tecnico -->  nivel o mayor, la ve solo ese rol. Sin marca, la ven todos.
// Las imágenes apuntan a ../public/ayuda/<idioma>/NN.webp para que también se vean en el
// repositorio; la app las sirve desde /ayuda/<idioma>/NN.webp.

export type HelpRole = 'admin' | 'tecnico';

export interface HelpHeading {
  level: number;
  title: string;
  id: string;
}

export interface HelpSection {
  /** El título de nivel 2 de la sección (con su id). */
  heading: HelpHeading;
  /** El markdown de la sección, título incluido. */
  markdown: string;
}

const ROLE_MARK = /^<!--\s*rol:\s*(admin|tecnico)\s*-->\s*$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/** Mecánico y pintor tienen los mismos permisos: para la ayuda los dos son "técnico". */
export function helpRoleOf(rol: string | null | undefined): HelpRole {
  return rol === 'admin' ? 'admin' : 'tecnico';
}

/**
 * El id de un título, como lo arma GitHub: minúsculas, sin signos y con guiones. Así un enlace
 * #ancla del manual funciona igual en el repositorio y en la app.
 */
export function headingId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[*_`]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

/** Quita lo que no es para el lector: la nota del principio y el índice (la app pone el suyo). */
function stripEditorialParts(lines: string[]): string[] {
  const out: string[] = [];
  let skippingIndex = false;
  let skippingNote = false;
  for (const line of lines) {
    const h = HEADING.exec(line);
    if (h && h[1].length === 2) {
      skippingIndex = /^(índice|indice|contents|table of contents)$/i.test(h[2].trim());
      if (skippingIndex) continue;
    }
    if (skippingIndex) continue;
    if (/^>\s*\*\*(Sobre este documento|About this document)\.?\*\*/i.test(line)) {
      skippingNote = true;
      continue;
    }
    if (skippingNote) {
      if (/^>/.test(line)) continue;
      skippingNote = false;
    }
    if (/^-{3,}\s*$/.test(line)) continue; // separadores: la app separa por secciones
    out.push(line);
  }
  return out;
}

/** Quita las secciones marcadas para el otro rol. */
function filterByRole(lines: string[], role: HelpRole): string[] {
  const out: string[] = [];
  let hiddenLevel: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = HEADING.exec(line);
    if (h) {
      const level = h[1].length;
      if (hiddenLevel !== null && level <= hiddenLevel) hiddenLevel = null;
      if (hiddenLevel === null) {
        const mark = ROLE_MARK.exec(lines[i + 1] ?? '');
        if (mark && mark[1] !== role) {
          hiddenLevel = level;
          continue;
        }
      }
    }
    if (hiddenLevel !== null) continue;
    if (ROLE_MARK.test(line)) continue;
    out.push(line);
  }
  return out;
}

/** El manual listo para mostrar a un rol: sin notas internas, sin lo del otro rol y con las rutas de la app. */
export function prepareManual(markdown: string, role: HelpRole): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  return filterByRole(stripEditorialParts(lines), role)
    .join('\n')
    .replace(/\]\(\.\.\/public\/ayuda\//g, '](/ayuda/')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** El título principal (#) del manual. */
export function manualTitle(prepared: string): string {
  const m = /^#\s+(.*)$/m.exec(prepared);
  return m ? m[1].trim() : '';
}

/** Parte el manual en sus secciones de nivel 2 (lo que va antes del primer ## se descarta: es el título). */
export function splitSections(prepared: string): HelpSection[] {
  const sections: HelpSection[] = [];
  let current: { heading: HelpHeading; lines: string[] } | null = null;
  for (const line of prepared.split('\n')) {
    const h = HEADING.exec(line);
    if (h && h[1].length === 2) {
      if (current) sections.push({ heading: current.heading, markdown: current.lines.join('\n').trim() });
      const title = h[2].trim();
      current = { heading: { level: 2, title, id: headingId(title) }, lines: [line] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) sections.push({ heading: current.heading, markdown: current.lines.join('\n').trim() });
  return sections;
}

/**
 * El id de un subtítulo (nivel 3 o 4): lleva delante el de su sección, porque hay títulos que se
 * repiten ("Editar y eliminar" está en Clientes y en Vehículos) y dos ids iguales confunden el
 * índice y los enlaces. Los de nivel 2 son únicos (van numerados) y quedan como en GitHub.
 */
export function subheadingId(sectionId: string, title: string): string {
  return `${sectionId}--${headingId(title)}`;
}

/** Los títulos de nivel 2 y 3 de una sección, para el índice de la página. */
export function sectionHeadings(section: HelpSection): HelpHeading[] {
  const out: HelpHeading[] = [];
  for (const line of section.markdown.split('\n')) {
    const h = HEADING.exec(line);
    if (h && (h[1].length === 2 || h[1].length === 3)) {
      const title = h[2].trim();
      const level = h[1].length;
      out.push({ level, title, id: level === 2 ? headingId(title) : subheadingId(section.heading.id, title) });
    }
  }
  return out;
}

/** Sin acentos ni mayúsculas, para buscar "envio" y encontrar "Envío". */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Las secciones que contienen todas las palabras buscadas. Sin búsqueda, todas. */
export function searchSections(sections: HelpSection[], query: string): HelpSection[] {
  const words = normalizeForSearch(query).split(/\s+/).filter((w) => w.length > 1);
  if (words.length === 0) return sections;
  return sections.filter((s) => {
    const text = normalizeForSearch(s.markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, ''));
    return words.every((w) => text.includes(w));
  });
}
