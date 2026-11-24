import { describe, expect, it } from 'vitest';
import { getTranslation } from '../../i18n/translations';
import { formatOverCapacity } from './occupancy';

const translator = (lang: 'es' | 'en') => (key: string) => getTranslation(lang, key);

describe('formatOverCapacity (A-06)', () => {
  it('usa singular y plural correctos en español', () => {
    const t = translator('es');
    expect(formatOverCapacity(33, 10, t)).toBe('33 carros · 10 lugares (sobrecupo)');
    expect(formatOverCapacity(2, 1, t)).toBe('2 carros · 1 lugar (sobrecupo)');
    expect(formatOverCapacity(1, 0, t)).toBe('1 carro · 0 lugares (sobrecupo)');
  });

  it('usa singular y plural correctos en inglés', () => {
    const t = translator('en');
    expect(formatOverCapacity(33, 10, t)).toBe('33 cars · 10 spaces (over capacity)');
    expect(formatOverCapacity(2, 1, t)).toBe('2 cars · 1 space (over capacity)');
    expect(formatOverCapacity(1, 0, t)).toBe('1 car · 0 spaces (over capacity)');
  });
});
