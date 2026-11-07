import { describe, it, expect } from 'vitest';
import {
  DAMAGE_TYPES,
  DAMAGE_VIEWS,
  MAX_DAMAGE_MARKS,
  formatPathData,
  mirrorPath,
  parsePathData,
  pathPoints,
  pathSubpaths,
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
            // Los puntos de control también: una curva no sale de ellos, así que si están
            // dentro, la curva también.
            const points = pathPoints(parsePathData(shape.d));
            expect(points.length).toBeGreaterThanOrEqual(2);
            for (const [x, y] of points) {
              expect(x).toBeGreaterThanOrEqual(0);
              expect(x).toBeLessThanOrEqual(view.width);
              expect(y).toBeGreaterThanOrEqual(0);
              expect(y).toBeLessThanOrEqual(view.height);
            }
          }
        }
      }
    });

    it('cada vista tiene su contorno, y las de los lados sus dos ruedas', () => {
      for (const view of DAMAGE_VIEWS) {
        expect(view.shapes.some((s) => (s.tone ?? 'line') === 'line')).toBe(true);
      }
      for (const view of [DAMAGE_VIEWS.izquierda, DAMAGE_VIEWS.derecha]) {
        const llantas = view.shapes.filter((s) => s.kind === 'circle' && s.tone === 'dark');
        expect(llantas).toHaveLength(2);
      }
    });

    it('el lado derecho es el izquierdo reflejado, forma por forma', () => {
      const izq = DAMAGE_VIEWS.izquierda.shapes;
      const der = DAMAGE_VIEWS.derecha.shapes;
      expect(der).toHaveLength(izq.length);
      izq.forEach((shape, i) => {
        const other = der[i];
        expect(other.kind).toBe(shape.kind);
        expect(other.tone).toBe(shape.tone);
        if (shape.kind === 'circle' && other.kind === 'circle') {
          expect(other.cx).toBeCloseTo(200 - shape.cx, 5);
          expect(other.cy).toBe(shape.cy);
        } else if (shape.kind === 'path' && other.kind === 'path') {
          const a = pathPoints(parsePathData(shape.d));
          const b = pathPoints(parsePathData(other.d));
          expect(b).toHaveLength(a.length);
          a.forEach(([x, y], j) => {
            expect(b[j][0]).toBeCloseTo(200 - x, 1);
            expect(b[j][1]).toBeCloseTo(y, 5);
          });
        }
      });
    });

    it('el contorno del frente, de atrás y de arriba es simétrico', () => {
      const cases = [
        { view: DAMAGE_VIEWS.frontal, mirror: ([x, y]: readonly [number, number]) => `${(100 - x).toFixed(1)},${y.toFixed(1)}` },
        { view: DAMAGE_VIEWS.trasera, mirror: ([x, y]: readonly [number, number]) => `${(100 - x).toFixed(1)},${y.toFixed(1)}` },
        { view: DAMAGE_VIEWS.superior, mirror: ([x, y]: readonly [number, number]) => `${x.toFixed(1)},${(90 - y).toFixed(1)}` },
      ];
      for (const { view, mirror } of cases) {
        const outline = view.shapes.find((s) => s.kind === 'path' && (s.tone ?? 'line') === 'line' && s.d.endsWith('Z'));
        expect(outline).toBeDefined();
        const points = pathPoints(parsePathData((outline as { d: string }).d));
        const keys = new Set(points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`));
        for (const p of points) expect(keys.has(mirror(p))).toBe(true);
      }
    });
  });

  describe('trazos', () => {
    it('lee M, L, Q, C y Z con sus números', () => {
      expect(parsePathData('M 1 2 L 3 4 Q 5 6 7 8 C 9 10 11 12 13 14 Z')).toEqual([
        { op: 'M', to: [1, 2] },
        { op: 'L', to: [3, 4] },
        { op: 'Q', c: [5, 6], to: [7, 8] },
        { op: 'C', c1: [9, 10], c2: [11, 12], to: [13, 14] },
        { op: 'Z' },
      ]);
      expect(parsePathData('M 1.5,-2 L .5 3')).toEqual([
        { op: 'M', to: [1.5, -2] },
        { op: 'L', to: [0.5, 3] },
      ]);
    });

    it('rechaza lo que el PDF no sabría dibujar', () => {
      expect(() => parsePathData('m 1 2 l 3 4')).toThrow();
      expect(() => parsePathData('M 1 2 A 5 5 0 0 1 10 10')).toThrow();
      expect(() => parsePathData('M 1 2 L 3')).toThrow();
      expect(() => parsePathData('M 1 2 3')).toThrow();
      expect(() => parsePathData('L 1 2')).toThrow();
    });

    it('vuelve a escribir un trazo igual que como se leyó', () => {
      const d = 'M 1 2 L 3 4 Q 5 6 7 8 C 9 10 11 12 13 14 Z';
      expect(formatPathData(parsePathData(d))).toBe(d);
    });

    it('refleja un trazo sobre la vertical o la horizontal', () => {
      expect(mirrorPath('M 10 5 L 30 8', 50)).toBe('M 90 5 L 70 8');
      expect(mirrorPath('M 10 5 L 30 8', 45, true)).toBe('M 10 85 L 30 82');
    });

    it('parte un trazo en tramos relativos para jsPDF.lines', () => {
      expect(pathSubpaths('M 10 10 L 20 10 C 22 10 24 12 24 14 Z M 0 0 L 1 1')).toEqual([
        { start: [10, 10], segments: [[10, 0], [2, 0, 4, 2, 4, 4]], closed: true },
        { start: [0, 0], segments: [[1, 1]], closed: false },
      ]);
    });

    it('pasa las curvas cuadráticas a cúbicas exactas', () => {
      // Q de (0,0) con control (3,3) a (6,0): los controles cúbicos quedan a 2/3 del control.
      const [sub] = pathSubpaths('M 0 0 Q 3 3 6 0');
      const [c1x, c1y, c2x, c2y, x, y] = sub.segments[0];
      expect([c1x, c1y, c2x, c2y, x, y].map((v) => Math.round(v * 1000) / 1000)).toEqual([2, 2, 4, 2, 6, 0]);
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
