// Los teléfonos de la sede llegan al cliente (enlace, PDF, correos): lo que se guarda tiene que
// poder marcarse, y una descripción sin número no se guarda en silencio.
import { describe, it, expect } from 'vitest';
import { cleanSedePhones, normalizeSedePhone, EMPTY_PHONE } from './sedePhones';

describe('normalizeSedePhone', () => {
  it('aplica valores por defecto a datos viejos o parciales', () => {
    expect(normalizeSedePhone({ label: 'Oficina', numero: '301-909-9937' })).toEqual({
      label: 'Oficina',
      numero: '301-909-9937',
      tipo: 'oficina',
      whatsapp: false,
    });
  });

  it('conserva tipo celular y whatsapp true', () => {
    expect(normalizeSedePhone({ label: 'Móvil', numero: '202-607-6126', tipo: 'celular', whatsapp: true })).toEqual({
      label: 'Móvil',
      numero: '202-607-6126',
      tipo: 'celular',
      whatsapp: true,
    });
  });

  it('EMPTY_PHONE nace como celular sin whatsapp', () => {
    expect(EMPTY_PHONE).toEqual({
      label: '',
      numero: '',
      tipo: 'celular',
      whatsapp: false,
    });
  });
});

describe('cleanSedePhones', () => {
  it('recorta, descarta las filas en blanco, conserva tipo y whatsapp, y respeta el orden', () => {
    expect(
      cleanSedePhones([
        { label: ' English ', numero: ' 240-355-1266 ', tipo: 'celular', whatsapp: true },
        { label: '', numero: '', tipo: 'celular', whatsapp: false },
        { label: 'Restorify office', numero: '+1 (301) 909-9937', tipo: 'oficina', whatsapp: false },
      ])
    ).toEqual({
      phones: [
        { label: 'English', numero: '240-355-1266', tipo: 'celular', whatsapp: true },
        { label: 'Restorify office', numero: '+1 (301) 909-9937', tipo: 'oficina', whatsapp: false },
      ],
    });
  });

  it('acepta un número sin descripción y una lista vacía', () => {
    expect(cleanSedePhones([{ label: '', numero: '2403551266', tipo: 'celular', whatsapp: false }])).toEqual({
      phones: [{ label: '', numero: '2403551266', tipo: 'celular', whatsapp: false }],
    });
    expect(cleanSedePhones([])).toEqual({ phones: [] });
  });

  it('rechaza una descripción sin número', () => {
    expect(cleanSedePhones([{ label: 'Spanish', numero: '  ', tipo: 'celular', whatsapp: true }])).toEqual({
      error: 'settings.phoneMissingNumber',
    });
  });

  it('rechaza un número que no se puede marcar', () => {
    expect(cleanSedePhones([{ label: 'English', numero: '240-35', tipo: 'celular', whatsapp: false }])).toEqual({
      error: 'settings.phoneInvalid',
    });
  });

  it('rechaza WhatsApp cuando el número tiene menos de 10 dígitos y no empieza con +', () => {
    // 7 dígitos se puede marcar localmente pero wa.me falla
    expect(cleanSedePhones([{ label: 'Taller', numero: '555-0199', tipo: 'celular', whatsapp: true }])).toEqual({
      error: 'settings.phoneWhatsappInvalid',
    });
  });

  it('acepta WhatsApp con 10 dígitos o con + y 8 o más dígitos', () => {
    expect(
      cleanSedePhones([
        { label: 'US', numero: '240-355-1266', tipo: 'celular', whatsapp: true },
        { label: 'Intl', numero: '+53 5123 4567', tipo: 'celular', whatsapp: true },
      ])
    ).toEqual({
      phones: [
        { label: 'US', numero: '240-355-1266', tipo: 'celular', whatsapp: true },
        { label: 'Intl', numero: '+53 5123 4567', tipo: 'celular', whatsapp: true },
      ],
    });
  });

  it('respeta el orden de errores: falta número antes de no se puede marcar antes de whatsapp inválido', () => {
    // Falta número antes de no se puede marcar
    expect(
      cleanSedePhones([
        { label: 'Sin num', numero: '', tipo: 'celular', whatsapp: true },
        { label: 'Inv', numero: '123', tipo: 'celular', whatsapp: false },
      ])
    ).toEqual({ error: 'settings.phoneMissingNumber' });

    // No se puede marcar antes de whatsapp inválido
    expect(
      cleanSedePhones([
        { label: 'Inv', numero: '123', tipo: 'celular', whatsapp: false },
        { label: 'Corto WA', numero: '555-0199', tipo: 'celular', whatsapp: true },
      ])
    ).toEqual({ error: 'settings.phoneInvalid' });
  });
});
