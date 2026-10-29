import { describe, expect, it } from 'vitest';
import { landingStrings } from './strings';

/** Cada hoja del árbol de textos, con su ruta: `hero.coats.1.name`. */
function leaves(value: unknown, path = ''): Array<[string, unknown]> {
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => leaves(child, path ? `${path}.${key}` : key));
  }
  return [[path, value]];
}

describe('landing strings', () => {
  const en = leaves(landingStrings.en);
  const es = leaves(landingStrings.es);

  it('Spanish and English have the same texts, in the same places', () => {
    expect(es.map(([path]) => path)).toEqual(en.map(([path]) => path));
  });

  it('no text is empty', () => {
    for (const [path, text] of [...en, ...es]) {
      expect(typeof text, path).toBe('string');
      expect((text as string).trim(), path).not.toBe('');
    }
  });
});
