import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('pone cada celda entre comillas y duplica las comillas internas', () => {
    expect(toCsv([['Fecha', 'Descripción'], ['2026-10-05', 'Pieza "original"']])).toBe(
      '"Fecha","Descripción"\r\n"2026-10-05","Pieza ""original"""'
    );
  });

  it('deja los montos como números, también los negativos', () => {
    expect(toCsv([[-150.5, 1200, null]])).toBe('"-150.5","1200",""');
  });

  it('neutraliza un texto que Excel ejecutaría como fórmula', () => {
    // Las descripciones vienen del banco o las escribe cualquiera.
    expect(toCsv([['=HYPERLINK("http://x")', '+1', '-2', '@SUM(A1)']])).toBe(
      '"\'=HYPERLINK(""http://x"")","\'+1","\'-2","\'@SUM(A1)"'
    );
  });
});
