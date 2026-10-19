import { describe, it, expect, vi } from 'vitest';
import { translations } from '../../i18n/translations';
import {
  addMonths,
  addDays,
  presetsFor,
  validateNextService,
  serviceStickerUrl,
  hasNextService,
} from './nextService';

describe('nextService pure logic', () => {
  describe('addMonths', () => {
    it('suma meses en el mismo año', () => {
      expect(addMonths('2027-04-14', 6)).toBe('2027-10-14');
      expect(addMonths('2027-04-14', 3)).toBe('2027-07-14');
    });

    it('cruza el año correctamente', () => {
      expect(addMonths('2027-10-14', 6)).toBe('2028-04-14');
    });

    it('ajusta el 31 de enero a 28 de febrero en año no bisiesto', () => {
      expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    });

    it('ajusta el 31 de enero a 29 de febrero en año bisiesto (2028)', () => {
      expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    });

    it('ajusta el 31 de marzo a 30 de abril', () => {
      expect(addMonths('2027-03-31', 1)).toBe('2027-04-30');
    });

    it('ajusta el 31 de agosto más 6 meses al 29 de febrero bisiesto', () => {
      expect(addMonths('2027-08-31', 6)).toBe('2028-02-29');
    });
  });

  describe('addDays', () => {
    it('suma días correctamente', () => {
      expect(addDays('2027-04-14', 30)).toBe('2027-05-14');
      expect(addDays('2027-01-15', 30)).toBe('2027-02-14');
    });
  });

  describe('presetsFor', () => {
    it('genera los 4 presets con millas de ingreso calculadas', () => {
      const presets = presetsFor(60000, '2027-04-14');
      expect(presets).toHaveLength(4);

      // 1. Sintético
      expect(presets[0].id).toBe('synthetic');
      expect(presets[0].millas).toBe(65000);
      expect(presets[0].fecha).toBe('2027-10-14');

      // 2. Convencional
      expect(presets[1].id).toBe('conventional');
      expect(presets[1].millas).toBe(63000);
      expect(presets[1].fecha).toBe('2027-07-14');

      // 3. Revisión general
      expect(presets[2].id).toBe('general');
      expect(presets[2].millas).toBe(65000);
      expect(presets[2].fecha).toBe('2027-10-14');

      // 4. Pintura / garantía (sin millas)
      expect(presets[3].id).toBe('paint_warranty');
      expect(presets[3].millas).toBeNull();
      expect(presets[3].fecha).toBe('2027-05-14');
    });

    it('genera presets con millas null cuando la orden no tiene millas_ingreso', () => {
      const presets = presetsFor(null, '2027-04-14');
      expect(presets[0].millas).toBeNull();
      expect(presets[1].millas).toBeNull();
      expect(presets[2].millas).toBeNull();
      expect(presets[3].millas).toBeNull();
    });

    it('la nota del preset va en el idioma del sticker (se imprime tal cual)', () => {
      expect(presetsFor(60000, '2027-04-14', 'es')[0].nota).toBe('Aceite sintético');
      expect(presetsFor(60000, '2027-04-14', 'en')[0].nota).toBe('Synthetic oil change');
      expect(presetsFor(60000, '2027-04-14', 'en')[3].nota).toBe('Paint / warranty check');
    });
  });

  describe('validateNextService', () => {
    const hoy = '2027-04-14';

    it('pasa con fecha y millas válidas', () => {
      const errors = validateNextService(
        { fecha: '2027-10-14', millas: 65000, nota: 'Aceite 5W-30' },
        hoy,
        60000
      );
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('pasa solo con fecha (p. ej. pintura)', () => {
      const errors = validateNextService(
        { fecha: '2027-05-14', millas: null, nota: 'Pintura' },
        hoy,
        60000
      );
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('pasa solo con millas (sin fecha)', () => {
      const errors = validateNextService(
        { fecha: null, millas: 65000, nota: 'Revisión' },
        hoy,
        60000
      );
      expect(Object.keys(errors)).toHaveLength(0);
    });

    it('falla sin fecha ni millas', () => {
      const errors = validateNextService(
        { fecha: null, millas: null, nota: 'Nada' },
        hoy,
        60000
      );
      expect(errors.general).toBe('nextService.errors.requireDateOrMiles');
    });

    it('falla si la fecha es anterior a hoy', () => {
      const errors = validateNextService(
        { fecha: '2027-04-13', millas: 65000, nota: 'Ayer' },
        hoy,
        60000
      );
      expect(errors.fecha).toBe('nextService.errors.datePast');
    });

    it('falla si las millas son menores que las de ingreso', () => {
      const errors = validateNextService(
        { fecha: '2027-10-14', millas: 59999, nota: 'Menor' },
        hoy,
        60000
      );
      expect(errors.millas).toBe('nextService.errors.milesLessThanIntake');
    });

    it('falla si las millas son negativas', () => {
      const errors = validateNextService(
        { fecha: '2027-10-14', millas: -10, nota: 'Negativo' },
        hoy,
        null
      );
      expect(errors.millas).toBe('nextService.errors.milesNegative');
    });

    it('falla si la nota excede 120 caracteres', () => {
      const errors = validateNextService(
        { fecha: '2027-10-14', millas: 65000, nota: 'a'.repeat(121) },
        hoy,
        60000
      );
      expect(errors.nota).toBe('nextService.errors.noteTooLong');
    });
  });

  describe('serviceStickerUrl', () => {
    it('construye la URL pública con prefijo /s/', () => {
      vi.stubEnv('VITE_PUBLIC_SITE_URL', 'https://restorifyauto.net');
      const token = '1234567890abcdef'.repeat(4);
      const url = serviceStickerUrl(token);
      expect(url).toBe(`https://restorifyauto.net/s/${token}`);
      vi.unstubAllEnvs();
    });
  });

  // `t()` devuelve la clave cuando no encuentra el texto, y la prueba de paridad ES/EN no lo ve
  // si la clave falta en los dos idiomas: la pantalla mostraba "nextService.presets.synthetic".
  describe('claves de traducción de la función', () => {
    const existe = (lang: 'es' | 'en', clave: string) =>
      typeof clave.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown> | undefined)?.[p], translations[lang]) === 'string';

    it('cada preset y cada error de validación tienen texto en español e inglés', () => {
      const errores = [
        validateNextService({ fecha: null, millas: null, nota: null }, '2027-04-14', null).general,
        validateNextService({ fecha: '2027-04-13', millas: 1, nota: null }, '2027-04-14', null).fecha,
        validateNextService({ fecha: null, millas: -1, nota: null }, '2027-04-14', null).millas,
        validateNextService({ fecha: null, millas: 10, nota: null }, '2027-04-14', 20).millas,
        validateNextService({ fecha: '2027-05-01', millas: null, nota: 'a'.repeat(121) }, '2027-04-14', null).nota,
      ];
      const claves = [...errores, ...presetsFor(1, '2027-04-14').map((p) => p.labelKey)];
      expect(claves.every((k) => typeof k === 'string')).toBe(true);
      for (const k of claves as string[]) {
        expect(existe('es', k), `es: ${k}`).toBe(true);
        expect(existe('en', k), `en: ${k}`).toBe(true);
      }
    });
  });

  describe('hasNextService', () => {
    it('devuelve false con null o undefined o vacío', () => {
      expect(hasNextService(null)).toBe(false);
      expect(hasNextService(undefined)).toBe(false);
      expect(hasNextService({})).toBe(false);
    });

    it('devuelve true si está programado con fecha', () => {
      expect(hasNextService({ token: 'abc', fecha: '2026-12-01' })).toBe(true);
    });

    it('devuelve true si está programado con millas', () => {
      expect(hasNextService({ token: 'abc', millas: 50000 })).toBe(true);
    });

    it('devuelve true si hay sugerencia con fecha o millas', () => {
      expect(hasNextService({ sugerido_en: '2026-10-16', sugerido_fecha: '2026-12-01' })).toBe(true);
      expect(hasNextService({ sugerido_en: '2026-10-16', sugerido_millas: 60000 })).toBe(true);
    });

    it('devuelve false si tiene token pero ni fecha ni millas', () => {
      expect(hasNextService({ token: 'abc', fecha: null, millas: null })).toBe(false);
    });
  });
});

