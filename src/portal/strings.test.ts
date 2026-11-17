import { describe, it, expect } from 'vitest';
import { portalStrings } from './strings';

function collectLeafEntries(obj: Record<string, unknown>, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') {
      entries.set(path, value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [subKey, subVal] of collectLeafEntries(value as Record<string, unknown>, path)) {
        entries.set(subKey, subVal);
      }
    } else {
      throw new Error(`Unexpected value at ${path}: ${typeof value}`);
    }
  }
  return entries;
}

describe('portalStrings', () => {
  it('es y en tienen exactamente las mismas claves y ninguna cadena vacía', () => {
    const esEntries = collectLeafEntries(portalStrings.es as unknown as Record<string, unknown>);
    const enEntries = collectLeafEntries(portalStrings.en as unknown as Record<string, unknown>);

    expect([...enEntries.keys()].sort()).toEqual([...esEntries.keys()].sort());

    for (const [key, value] of esEntries) {
      expect(value.trim().length, `es.${key} vacía`).toBeGreaterThan(0);
    }
    for (const [key, value] of enEntries) {
      expect(value.trim().length, `en.${key} vacía`).toBeGreaterThan(0);
    }
  });
});
