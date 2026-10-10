// Los teléfonos de la sede llegan al cliente (enlace, PDF, correos): lo que se guarda tiene que
// poder marcarse, y una descripción sin número no se guarda en silencio.
import { describe, it, expect } from 'vitest';
import { cleanSedePhones } from './sedePhones';

describe('cleanSedePhones', () => {
  it('recorta, descarta las filas en blanco y respeta el orden', () => {
    expect(
      cleanSedePhones([
        { label: ' English ', numero: ' 240-355-1266 ' },
        { label: '', numero: '' },
        { label: 'Restorify office', numero: '+1 (301) 909-9937' },
      ])
    ).toEqual({
      phones: [
        { label: 'English', numero: '240-355-1266' },
        { label: 'Restorify office', numero: '+1 (301) 909-9937' },
      ],
    });
  });

  it('acepta un número sin descripción y una lista vacía', () => {
    expect(cleanSedePhones([{ label: '', numero: '2403551266' }])).toEqual({
      phones: [{ label: '', numero: '2403551266' }],
    });
    expect(cleanSedePhones([])).toEqual({ phones: [] });
  });

  it('rechaza una descripción sin número', () => {
    expect(cleanSedePhones([{ label: 'Spanish', numero: '  ' }])).toEqual({ error: 'settings.phoneMissingNumber' });
  });

  it('rechaza un número que no se puede marcar', () => {
    expect(cleanSedePhones([{ label: 'English', numero: '240-35' }])).toEqual({ error: 'settings.phoneInvalid' });
  });
});
