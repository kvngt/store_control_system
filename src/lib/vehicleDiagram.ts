/**
 * Geometría y tipos del diagrama del vehículo para marcas de daños (B1).
 * Módulo puro sin React ni dependencias externas.
 */

export type DamageView = 'izquierda' | 'derecha' | 'frontal' | 'trasera' | 'superior';
export type DamageType = 'golpe' | 'rayon' | 'pintura' | 'roto' | 'otro';

export interface DamageMark {
  vista: DamageView;
  x: number;
  y: number;
  tipo: DamageType;
}

export type DiagramShape =
  | { kind: 'poly'; points: [number, number][]; closed: boolean }
  | { kind: 'circle'; cx: number; cy: number; r: number };

export interface DamageViewConfig {
  id: DamageView;
  width: number;
  height: number;
  shapes: DiagramShape[];
}

export interface DamageTypeConfig {
  id: DamageType;
  letter: string;
}

export const MAX_DAMAGE_MARKS = 60;

const DAMAGE_TYPE_LIST: readonly DamageTypeConfig[] = [
  { id: 'golpe', letter: 'G' },
  { id: 'rayon', letter: 'R' },
  { id: 'pintura', letter: 'P' },
  { id: 'roto', letter: 'X' },
  { id: 'otro', letter: 'O' },
] as const;

export const DAMAGE_TYPES: readonly DamageTypeConfig[] & Record<DamageType, DamageTypeConfig> = Object.assign(
  [...DAMAGE_TYPE_LIST],
  {
    golpe: { id: 'golpe' as const, letter: 'G' },
    rayon: { id: 'rayon' as const, letter: 'R' },
    pintura: { id: 'pintura' as const, letter: 'P' },
    roto: { id: 'roto' as const, letter: 'X' },
    otro: { id: 'otro' as const, letter: 'O' },
  }
);

// Formas de las vistas del vehículo
const IZQUIERDA_SHAPES: DiagramShape[] = [
  // Carrocería exterior
  {
    kind: 'poly',
    points: [
      [15, 55], [10, 48], [12, 40], [25, 38], [58, 36], [85, 18],
      [140, 18], [165, 36], [188, 38], [192, 46], [188, 55], [172, 55],
      [170, 50], [166, 45], [157, 43], [148, 45], [144, 50], [142, 55],
      [74, 55], [72, 50], [68, 45], [59, 43], [50, 45], [46, 50], [44, 55],
      [20, 55]
    ],
    closed: true,
  },
  // Ventana delantera
  {
    kind: 'poly',
    points: [[62, 35], [87, 21], [110, 21], [110, 35]],
    closed: true,
  },
  // Ventana trasera
  {
    kind: 'poly',
    points: [[115, 21], [137, 21], [160, 35], [115, 35]],
    closed: true,
  },
  // Rueda delantera
  { kind: 'circle', cx: 59, cy: 55, r: 11 },
  { kind: 'circle', cx: 59, cy: 55, r: 5 },
  // Rueda trasera
  { kind: 'circle', cx: 157, cy: 55, r: 11 },
  { kind: 'circle', cx: 157, cy: 55, r: 5 },
];

// Lado derecho (espejo horizontal del izquierdo: x' = 200 - x)
const DERECHA_SHAPES: DiagramShape[] = IZQUIERDA_SHAPES.map((shape) => {
  if (shape.kind === 'circle') {
    return { kind: 'circle', cx: 200 - shape.cx, cy: shape.cy, r: shape.r };
  }
  return {
    kind: 'poly',
    points: shape.points.map(([x, y]) => [200 - x, y] as [number, number]),
    closed: shape.closed,
  };
});

const FRONTAL_SHAPES: DiagramShape[] = [
  // Carrocería exterior
  {
    kind: 'poly',
    points: [
      [32, 16], [68, 16], [78, 34], [86, 38], [88, 52], [88, 62],
      [12, 62], [12, 52], [14, 38], [22, 34], [32, 16]
    ],
    closed: true,
  },
  // Parabrisas delantero
  {
    kind: 'poly',
    points: [[35, 19], [65, 19], [74, 33], [26, 33]],
    closed: true,
  },
  // Líneas del capó hacia la parrilla
  {
    kind: 'poly',
    points: [[30, 34], [36, 40]],
    closed: false,
  },
  {
    kind: 'poly',
    points: [[70, 34], [64, 40]],
    closed: false,
  },
  // Faro delantero izquierdo
  {
    kind: 'poly',
    points: [[16, 39], [34, 40], [32, 47], [16, 46]],
    closed: true,
  },
  { kind: 'circle', cx: 23, cy: 43, r: 2.5 },
  // Faro delantero derecho
  {
    kind: 'poly',
    points: [[84, 39], [66, 40], [68, 47], [84, 46]],
    closed: true,
  },
  { kind: 'circle', cx: 77, cy: 43, r: 2.5 },
  // Parrilla delantera central
  {
    kind: 'poly',
    points: [[36, 41], [64, 41], [62, 53], [38, 53]],
    closed: true,
  },
  {
    kind: 'poly',
    points: [[37, 45], [63, 45]],
    closed: false,
  },
  {
    kind: 'poly',
    points: [[37, 49], [63, 49]],
    closed: false,
  },
  { kind: 'circle', cx: 50, cy: 45, r: 2 },
  // Toma de aire inferior del parachoques
  {
    kind: 'poly',
    points: [[30, 56], [70, 56], [68, 60], [32, 60]],
    closed: true,
  },
  // Espejos retrovisores
  {
    kind: 'poly',
    points: [[12, 32], [20, 32], [20, 37], [12, 36]],
    closed: true,
  },
  {
    kind: 'poly',
    points: [[88, 32], [80, 32], [80, 37], [88, 36]],
    closed: true,
  },
  // Ruedas frontales
  {
    kind: 'poly',
    points: [[14, 60], [22, 60], [22, 68], [14, 68]],
    closed: true,
  },
  {
    kind: 'poly',
    points: [[78, 60], [86, 60], [86, 68], [78, 68]],
    closed: true,
  },
];

const TRASERA_SHAPES: DiagramShape[] = [
  // Carrocería exterior
  {
    kind: 'poly',
    points: [
      [32, 16], [68, 16], [78, 34], [86, 38], [88, 52], [88, 62],
      [12, 62], [12, 52], [14, 38], [22, 34], [32, 16]
    ],
    closed: true,
  },
  // Medallón trasero
  {
    kind: 'poly',
    points: [[35, 19], [65, 19], [74, 33], [26, 33]],
    closed: true,
  },
  // Tercera luz de freno superior
  {
    kind: 'poly',
    points: [[44, 17], [56, 17], [56, 19], [44, 19]],
    closed: true,
  },
  // Línea del portón / cajuela
  {
    kind: 'poly',
    points: [[24, 35], [76, 35]],
    closed: false,
  },
  // Calaveras horizontales traseras
  // Calavera izquierda
  {
    kind: 'poly',
    points: [[15, 38], [37, 38], [37, 44], [15, 44]],
    closed: true,
  },
  {
    kind: 'poly',
    points: [[15, 41], [37, 41]],
    closed: false,
  },
  // Calavera derecha
  {
    kind: 'poly',
    points: [[85, 38], [63, 38], [63, 44], [85, 44]],
    closed: true,
  },
  {
    kind: 'poly',
    points: [[85, 41], [63, 41]],
    closed: false,
  },
  // Rectángulo de la placa
  {
    kind: 'poly',
    points: [[38, 47], [62, 47], [62, 54], [38, 54]],
    closed: true,
  },
  {
    kind: 'poly',
    points: [[42, 45], [58, 45]],
    closed: false,
  },
  // Parachoques y reflectores traseros
  {
    kind: 'poly',
    points: [[12, 56], [88, 56]],
    closed: false,
  },
  {
    kind: 'poly',
    points: [[17, 58], [27, 58], [27, 60], [17, 60]],
    closed: true,
  },
  {
    kind: 'poly',
    points: [[83, 58], [73, 58], [73, 60], [83, 60]],
    closed: true,
  },
  // Doble salida de escape
  { kind: 'circle', cx: 22, cy: 64, r: 2 },
  { kind: 'circle', cx: 78, cy: 64, r: 2 },
  // Espejos retrovisores
  {
    kind: 'poly',
    points: [[12, 32], [20, 32], [20, 37], [12, 36]],
    closed: true,
  },
  {
    kind: 'poly',
    points: [[88, 32], [80, 32], [80, 37], [88, 36]],
    closed: true,
  },
  // Ruedas traseras
  {
    kind: 'poly',
    points: [[14, 60], [22, 60], [22, 68], [14, 68]],
    closed: true,
  },
  {
    kind: 'poly',
    points: [[78, 60], [86, 60], [86, 68], [78, 68]],
    closed: true,
  },
];

const SUPERIOR_SHAPES: DiagramShape[] = [
  // Contorno exterior
  {
    kind: 'poly',
    points: [
      [15, 28], [10, 45], [15, 62], [25, 70], [55, 72], [145, 72],
      [175, 70], [185, 62], [190, 45], [185, 28], [175, 20], [145, 18],
      [55, 18], [25, 20], [15, 28]
    ],
    closed: true,
  },
  // Capó
  {
    kind: 'poly',
    points: [[25, 26], [58, 25], [58, 65], [25, 64]],
    closed: false,
  },
  // Parabrisas
  {
    kind: 'poly',
    points: [[60, 24], [78, 26], [78, 64], [60, 66]],
    closed: true,
  },
  // Techo
  {
    kind: 'poly',
    points: [[80, 26], [135, 26], [135, 64], [80, 64]],
    closed: true,
  },
  // Medallón trasero
  {
    kind: 'poly',
    points: [[137, 26], [152, 24], [152, 66], [137, 64]],
    closed: true,
  },
  // Cajuela
  {
    kind: 'poly',
    points: [[154, 25], [178, 28], [178, 62], [154, 65]],
    closed: false,
  },
  // Espejos exteriores
  {
    kind: 'poly',
    points: [[65, 12], [75, 12], [75, 18], [65, 18]],
    closed: true,
  },
  {
    kind: 'poly',
    points: [[65, 72], [75, 72], [75, 78], [65, 78]],
    closed: true,
  },
];

const DAMAGE_VIEW_LIST: readonly DamageViewConfig[] = [
  { id: 'izquierda', width: 200, height: 80, shapes: IZQUIERDA_SHAPES },
  { id: 'derecha', width: 200, height: 80, shapes: DERECHA_SHAPES },
  { id: 'frontal', width: 100, height: 80, shapes: FRONTAL_SHAPES },
  { id: 'trasera', width: 100, height: 80, shapes: TRASERA_SHAPES },
  { id: 'superior', width: 200, height: 90, shapes: SUPERIOR_SHAPES },
] as const;

export const DAMAGE_VIEWS: readonly DamageViewConfig[] & Record<DamageView, DamageViewConfig> = Object.assign(
  [...DAMAGE_VIEW_LIST],
  {
    izquierda: DAMAGE_VIEW_LIST[0],
    derecha: DAMAGE_VIEW_LIST[1],
    frontal: DAMAGE_VIEW_LIST[2],
    trasera: DAMAGE_VIEW_LIST[3],
    superior: DAMAGE_VIEW_LIST[4],
  }
);

const VALID_VIEWS = new Set<DamageView>(['superior', 'frontal', 'trasera', 'izquierda', 'derecha']);
const VALID_TYPES = new Set<DamageType>(['golpe', 'rayon', 'pintura', 'roto', 'otro']);

export function sanitizeDamageMarks(raw: unknown): DamageMark[] {
  if (!Array.isArray(raw)) return [];
  const result: DamageMark[] = [];

  for (const item of raw) {
    if (result.length >= MAX_DAMAGE_MARKS) break;
    if (typeof item !== 'object' || item === null) continue;

    const candidate = item as Record<string, unknown>;
    const vista = candidate.vista as DamageView;
    const tipo = candidate.tipo as DamageType;
    const x = candidate.x;
    const y = candidate.y;

    if (!VALID_VIEWS.has(vista)) continue;
    if (!VALID_TYPES.has(tipo)) continue;
    if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1) continue;
    if (typeof y !== 'number' || !Number.isFinite(y) || y < 0 || y > 1) continue;

    result.push({ vista, x, y, tipo });
  }

  return result;
}
