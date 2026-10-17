import { describe, it, expect } from 'vitest';
import {
  DAMAGE_TYPES,
  DAMAGE_VIEWS,
  MAX_DAMAGE_MARKS,
  sanitizeDamageMarks,
  type DamageMark,
} from './vehicleDiagram';

describe('vehicleDiagram', () => {
  describe('DAMAGE_TYPES', () => {
    it('contiene los 5 tipos requeridos con sus letras', () => {
      expect(DAMAGE_TYPES.golpe.letter).toBe('G');
      expect(DAMAGE_TYPES.rayon.letter).toBe('R');
      expect(DAMAGE_TYPES.pintura.letter).toBe('P');
      expect(DAMAGE_TYPES.roto.letter).toBe('X');
      expect(DAMAGE_TYPES.otro.letter).toBe('O');
      expect(DAMAGE_TYPES.length).toBe(5);
    });
  });

  describe('DAMAGE_VIEWS', () => {
    it('contiene las 5 vistas requeridas con sus dimensiones', () => {
      expect(DAMAGE_VIEWS.izquierda.width).toBe(200);
      expect(DAMAGE_VIEWS.izquierda.height).toBe(80);

      expect(DAMAGE_VIEWS.derecha.width).toBe(200);
      expect(DAMAGE_VIEWS.derecha.height).toBe(80);

      expect(DAMAGE_VIEWS.frontal.width).toBe(100);
      expect(DAMAGE_VIEWS.frontal.height).toBe(80);

      expect(DAMAGE_VIEWS.trasera.width).toBe(100);
      expect(DAMAGE_VIEWS.trasera.height).toBe(80);

      expect(DAMAGE_VIEWS.superior.width).toBe(200);
      expect(DAMAGE_VIEWS.superior.height).toBe(90);

      expect(DAMAGE_VIEWS.length).toBe(5);
    });

    it('cada vista tiene todas sus formas dentro de sus dimensiones width y height', () => {
      for (const view of DAMAGE_VIEWS) {
        expect(view.shapes.length).toBeGreaterThan(0);
        for (const shape of view.shapes) {
          if (shape.kind === 'circle') {
            expect(shape.cx - shape.r).toBeGreaterThanOrEqual(0);
            expect(shape.cx + shape.r).toBeLessThanOrEqual(view.width);
            expect(shape.cy - shape.r).toBeGreaterThanOrEqual(0);
            expect(shape.cy + shape.r).toBeLessThanOrEqual(view.height);
          } else {
            expect(shape.points.length).toBeGreaterThanOrEqual(2);
            for (const [x, y] of shape.points) {
              expect(x).toBeGreaterThanOrEqual(0);
              expect(x).toBeLessThanOrEqual(view.width);
              expect(y).toBeGreaterThanOrEqual(0);
              expect(y).toBeLessThanOrEqual(view.height);
            }
          }
        }
      }
    });
  });

  describe('sanitizeDamageMarks', () => {
    it('retorna arreglo vacío si el input no es un arreglo', () => {
      expect(sanitizeDamageMarks(null)).toEqual([]);
      expect(sanitizeDamageMarks(undefined)).toEqual([]);
      expect(sanitizeDamageMarks({})).toEqual([]);
      expect(sanitizeDamageMarks('string')).toEqual([]);
      expect(sanitizeDamageMarks(123)).toEqual([]);
    });

    it('conserva marcas válidas con todas sus propiedades limpias', () => {
      const valid: DamageMark[] = [
        { vista: 'frontal', x: 0.5, y: 0.25, tipo: 'golpe' },
        { vista: 'superior', x: 0, y: 1, tipo: 'rayon' },
        { vista: 'izquierda', x: 0.8, y: 0.9, tipo: 'pintura' },
        { vista: 'derecha', x: 0.1, y: 0.1, tipo: 'roto' },
        { vista: 'trasera', x: 0.4, y: 0.6, tipo: 'otro' },
      ];

      expect(sanitizeDamageMarks(valid)).toEqual(valid);
    });

    it('descarta marcas con propiedades inválidas o faltantes', () => {
      const mixed = [
        null,
        'no-obj',
        { vista: 'invalid_view', x: 0.5, y: 0.5, tipo: 'golpe' },
        { vista: 'frontal', x: -0.1, y: 0.5, tipo: 'golpe' },
        { vista: 'frontal', x: 1.1, y: 0.5, tipo: 'golpe' },
        { vista: 'frontal', x: 0.5, y: -0.01, tipo: 'golpe' },
        { vista: 'frontal', x: 0.5, y: 1.01, tipo: 'golpe' },
        { vista: 'frontal', x: '0.5', y: 0.5, tipo: 'golpe' },
        { vista: 'frontal', x: NaN, y: 0.5, tipo: 'golpe' },
        { vista: 'frontal', x: 0.5, y: Infinity, tipo: 'golpe' },
        { vista: 'frontal', x: 0.5, y: 0.5, tipo: 'desconocido' },
        { vista: 'frontal', x: 0.5 }, // sin y ni tipo
        // Válida con llaves extra: debe quedarse solo con vista, x, y, tipo
        { vista: 'frontal', x: 0.5, y: 0.5, tipo: 'golpe', extraKey: 'ignored' },
      ];

      const res = sanitizeDamageMarks(mixed);
      expect(res).toEqual([{ vista: 'frontal', x: 0.5, y: 0.5, tipo: 'golpe' }]);
    });

    it('limita la cantidad máxima de marcas a MAX_DAMAGE_MARKS (60)', () => {
      const many = Array.from({ length: 75 }, (_, i) => ({
        vista: 'frontal' as const,
        x: 0.5,
        y: (i % 100) / 100,
        tipo: 'golpe' as const,
      }));

      const res = sanitizeDamageMarks(many);
      expect(res.length).toBe(MAX_DAMAGE_MARKS);
    });
  });
});
