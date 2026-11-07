/**
 * Geometría y tipos del diagrama del vehículo para marcas de daños (B1).
 * Módulo puro sin React ni dependencias externas: lo usan la app, el portal y el PDF.
 *
 * El dibujo es un sedán moderno (06/11/2026: el de líneas rectas no le gustó al cliente).
 * Cada forma es un círculo o un trazo con la sintaxis de SVG restringida a comandos absolutos
 * M, L, Q, C y Z: el componente lo pinta tal cual y el PDF lo convierte con `pathSubpaths`.
 * Las marcas guardan `x` y `y` de 0 a 1 sobre el ancho y el alto de su vista, así que el
 * tamaño de cada vista no se cambia: una marca ya guardada caería en otro lugar.
 */

export type DamageView = 'izquierda' | 'derecha' | 'frontal' | 'trasera' | 'superior';
export type DamageType = 'golpe' | 'rayon' | 'pintura' | 'roto' | 'otro';

export interface DamageMark {
  vista: DamageView;
  x: number;
  y: number;
  tipo: DamageType;
}

/**
 * Cómo se pinta una forma: `line` es el contorno (trazo principal), `detail` las líneas
 * finas (puertas, pliegues, rejillas), `glass` los vidrios y faros (relleno tenue),
 * `dark` las llantas y las molduras negras (relleno oscuro) y `solid` lo que tapa lo de abajo (rin, placa).
 */
export type DiagramTone = 'line' | 'detail' | 'glass' | 'dark' | 'solid';

export type DiagramShape =
  | { kind: 'path'; d: string; tone?: DiagramTone }
  | { kind: 'circle'; cx: number; cy: number; r: number; tone?: DiagramTone };

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

// ===== Trazos =====

type Pt = readonly [number, number];

export type PathCommand =
  | { op: 'M'; to: Pt }
  | { op: 'L'; to: Pt }
  | { op: 'Q'; c: Pt; to: Pt }
  | { op: 'C'; c1: Pt; c2: Pt; to: Pt }
  | { op: 'Z' };

const ARITY = { M: 2, L: 2, Q: 4, C: 6, Z: 0 } as const;
type Op = keyof typeof ARITY;

/**
 * Lee un trazo con comandos absolutos M, L, Q, C y Z, cada uno con su letra. Cualquier otra
 * cosa (comandos relativos, arcos, números de más o de menos) es un error: el PDF no sabría
 * dibujarla y la pantalla sí, y el cliente vería dos dibujos distintos.
 */
export function parsePathData(d: string): PathCommand[] {
  if (/[^MLQCZ0-9.,\s-]/.test(d)) throw new Error(`Trazo no admitido: ${d}`);
  const tokens = d.match(/[MLQCZ]|-?(?:\d+(?:\.\d*)?|\.\d+)/g) ?? [];
  const out: PathCommand[] = [];
  let i = 0;
  while (i < tokens.length) {
    const op = tokens[i++] as Op;
    if (!(op in ARITY)) throw new Error(`Trazo sin comando antes de ${op}: ${d}`);
    const args = tokens.slice(i, i + ARITY[op]);
    if (args.length !== ARITY[op] || args.some((t) => /[A-Z]/.test(t))) {
      throw new Error(`El comando ${op} lleva ${ARITY[op]} números: ${d}`);
    }
    const v = args.map(Number);
    i += args.length;
    if (op === 'M' || op === 'L') out.push({ op, to: [v[0], v[1]] });
    else if (op === 'Q') out.push({ op, c: [v[0], v[1]], to: [v[2], v[3]] });
    else if (op === 'C') out.push({ op, c1: [v[0], v[1]], c2: [v[2], v[3]], to: [v[4], v[5]] });
    else out.push({ op: 'Z' });
  }
  if (out.length > 0 && out[0].op !== 'M') throw new Error(`Un trazo empieza con M: ${d}`);
  return out;
}

const num = (v: number) => String(Math.round(v * 100) / 100);
const pt = ([x, y]: Pt) => `${num(x)} ${num(y)}`;

export function formatPathData(commands: PathCommand[]): string {
  return commands
    .map((c) => {
      switch (c.op) {
        case 'M':
        case 'L':
          return `${c.op} ${pt(c.to)}`;
        case 'Q':
          return `Q ${pt(c.c)} ${pt(c.to)}`;
        case 'C':
          return `C ${pt(c.c1)} ${pt(c.c2)} ${pt(c.to)}`;
        default:
          return 'Z';
      }
    })
    .join(' ');
}

/** Todos los puntos de un trazo, también los de control: si están dentro de la vista, la curva también. */
export function pathPoints(commands: PathCommand[]): Pt[] {
  return commands.flatMap((c) => {
    switch (c.op) {
      case 'M':
      case 'L':
        return [c.to];
      case 'Q':
        return [c.c, c.to];
      case 'C':
        return [c.c1, c.c2, c.to];
      default:
        return [];
    }
  });
}

function mapPoints(commands: PathCommand[], f: (p: Pt) => Pt): PathCommand[] {
  return commands.map((c) => {
    switch (c.op) {
      case 'M':
      case 'L':
        return { op: c.op, to: f(c.to) };
      case 'Q':
        return { op: 'Q', c: f(c.c), to: f(c.to) };
      case 'C':
        return { op: 'C', c1: f(c.c1), c2: f(c.c2), to: f(c.to) };
      default:
        return c;
    }
  });
}

/** El mismo trazo recorrido al revés (sin Z): sirve para cerrar una figura simétrica. */
function reversePath(commands: PathCommand[]): PathCommand[] {
  const segs = commands.filter((c) => c.op !== 'Z');
  const points = segs.map((c) => c.to);
  const out: PathCommand[] = [{ op: 'M', to: points[points.length - 1] }];
  for (let i = segs.length - 1; i >= 1; i--) {
    const c = segs[i];
    const prev = points[i - 1];
    if (c.op === 'Q') out.push({ op: 'Q', c: c.c, to: prev });
    else if (c.op === 'C') out.push({ op: 'C', c1: c.c2, c2: c.c1, to: prev });
    else out.push({ op: 'L', to: prev });
  }
  return out;
}

/** El trazo reflejado sobre la vertical `x = axis` (o la horizontal, con `alongY`). */
export function mirrorPath(d: string, axis: number, alongY = false): string {
  const flip = alongY
    ? ([x, y]: Pt): Pt => [x, 2 * axis - y]
    : ([x, y]: Pt): Pt => [2 * axis - x, y];
  return formatPathData(mapPoints(parsePathData(d), flip));
}

/**
 * Una figura simétrica a partir de su mitad, que empieza y termina sobre el eje: la mitad,
 * y su reflejo recorrido de vuelta. Cerrada (`Z`) o abierta (una línea de lado a lado).
 */
function symmetric(half: string, axis: number, opts: { alongY?: boolean; closed?: boolean } = {}): string {
  const cmds = parsePathData(half);
  const mirrored = parsePathData(mirrorPath(half, axis, opts.alongY));
  const back = reversePath(mirrored).slice(1);
  return formatPathData([...cmds, ...back, ...(opts.closed === false ? [] : [{ op: 'Z' } as const])]);
}

/** Un arco de circunferencia en curvas cúbicas (sin el punto de partida), de `fromDeg` a `toDeg`. */
function arc(cx: number, cy: number, r: number, fromDeg: number, toDeg: number): string {
  const total = toDeg - fromDeg;
  const pieces = Math.max(1, Math.ceil(Math.abs(total) / 90));
  const step = ((total / pieces) * Math.PI) / 180;
  const k = (4 / 3) * Math.tan(step / 4);
  let a = (fromDeg * Math.PI) / 180;
  const out: string[] = [];
  for (let i = 0; i < pieces; i++) {
    const b = a + step;
    const x0 = cx + r * Math.cos(a);
    const y0 = cy + r * Math.sin(a);
    const x3 = cx + r * Math.cos(b);
    const y3 = cy + r * Math.sin(b);
    out.push(
      `C ${pt([x0 - k * r * Math.sin(a), y0 + k * r * Math.cos(a)])} ` +
        `${pt([x3 + k * r * Math.sin(b), y3 - k * r * Math.cos(b)])} ${pt([x3, y3])}`
    );
    a = b;
  }
  return out.join(' ');
}

function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  const kx = rx * 0.5523;
  const ky = ry * 0.5523;
  return [
    `M ${pt([cx + rx, cy])}`,
    `C ${pt([cx + rx, cy + ky])} ${pt([cx + kx, cy + ry])} ${pt([cx, cy + ry])}`,
    `C ${pt([cx - kx, cy + ry])} ${pt([cx - rx, cy + ky])} ${pt([cx - rx, cy])}`,
    `C ${pt([cx - rx, cy - ky])} ${pt([cx - kx, cy - ry])} ${pt([cx, cy - ry])}`,
    `C ${pt([cx + kx, cy - ry])} ${pt([cx + rx, cy - ky])} ${pt([cx + rx, cy])}`,
    'Z',
  ].join(' ');
}

const path = (d: string, tone: DiagramTone = 'line'): DiagramShape => ({ kind: 'path', d, tone });

/** La pieza y su gemela del otro lado (faros, espejos, llantas en las vistas de frente). */
const pair = (d: string, axis: number, tone: DiagramTone = 'line', alongY = false): DiagramShape[] => [
  path(d, tone),
  path(mirrorPath(d, axis, alongY), tone),
];

// ===== Lado izquierdo (el frente mira a la izquierda) =====
// Proporciones de un sedán mediano de 2024: 4,9 m de largo, 1,45 m de alto, 2,83 m entre ejes
// y rines de 19". El piso queda en y = 71.

const SIDE = {
  wheelY: 58.5,
  tireR: 12.5,
  rimR: 8.6,
  archY: 58.2,
  archR: 14.8,
  sillY: 64.6,
  frontX: 44,
  rearX: 150,
};

/** El arco de la rueda, del lado de atrás al de adelante pasando por arriba. */
function wheelArch(cx: number) {
  const dy = SIDE.sillY - SIDE.archY;
  const dx = Math.sqrt(SIDE.archR ** 2 - dy ** 2);
  const start = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { rearX: cx + dx, frontX: cx - dx, d: arc(cx, SIDE.archY, SIDE.archR, start, -180 - start) };
}

/** El corte de la puerta trasera: baja del cinturón y rodea el arco de la rueda de atrás. */
function rearDoorCut(): string {
  const r = SIDE.archR + 2.4;
  const cx = SIDE.rearX;
  const x = 147.8;
  const startDy = -Math.sqrt(r ** 2 - (x - cx) ** 2);
  const endDy = SIDE.sillY - 0.2 - SIDE.archY;
  const from = (Math.atan2(startDy, x - cx) * 180) / Math.PI;
  const to = (Math.atan2(endDy, -Math.sqrt(r ** 2 - endDy ** 2)) * 180) / Math.PI - 360;
  return `M 147.3 33 L ${pt([x, SIDE.archY + startDy])} ${arc(cx, SIDE.archY, r, from, to)}`;
}

/** Rin de cinco rayos: cada rayo, una cuña del cubo al aro. */
function spokes(cx: number, cy: number): string {
  const rIn = 2.5;
  const rOut = SIDE.rimR - 1;
  const parts: string[] = [];
  for (let i = 0; i < 5; i++) {
    const t = ((-90 + i * 72) * Math.PI) / 180;
    const [ux, uy] = [Math.cos(t), Math.sin(t)];
    const [nx, ny] = [-uy, ux];
    const p = (r: number, w: number): Pt => [cx + ux * r + nx * w, cy + uy * r + ny * w];
    parts.push(`M ${pt(p(rIn, 0.7))} L ${pt(p(rOut, 1.3))} L ${pt(p(rOut, -1.3))} L ${pt(p(rIn, -0.7))} Z`);
  }
  return parts.join(' ');
}

function sideWheel(cx: number): DiagramShape[] {
  const cy = SIDE.wheelY;
  return [
    { kind: 'circle', cx, cy, r: SIDE.tireR, tone: 'dark' },
    { kind: 'circle', cx, cy, r: SIDE.rimR, tone: 'solid' },
    path(spokes(cx, cy), 'detail'),
    { kind: 'circle', cx, cy, r: 1.7, tone: 'detail' },
  ];
}

const frontArch = wheelArch(SIDE.frontX);
const rearArch = wheelArch(SIDE.rearX);

const capsule = (cx: number, cy: number, w: number, h: number) => {
  const r = h / 2;
  const [l, rt, t, b] = [cx - w / 2, cx + w / 2, cy - r, cy + r];
  return `M ${pt([l + r, t])} L ${pt([rt - r, t])} Q ${pt([rt, t])} ${pt([rt, cy])} Q ${pt([rt, b])} ${pt([rt - r, b])} L ${pt([l + r, b])} Q ${pt([l, b])} ${pt([l, cy])} Q ${pt([l, t])} ${pt([l + r, t])} Z`;
};

const IZQUIERDA_SHAPES: DiagramShape[] = [
  // Carrocería: defensa, cofre, parabrisas, techo, medallón, cajuela, defensa trasera y arcos.
  path(
    [
      `M ${num(frontArch.frontX)} ${SIDE.sillY}`,
      'L 18.4 64.4',
      'C 14.4 64.2 11.6 62.6 10.2 60',
      'C 9 57.8 8.4 55.2 8.2 52.6',
      'C 8 50.4 8.2 48.4 9 46.6',
      'C 9.8 44.8 11.6 43.4 14.4 42.6',
      'C 30 39.6 52 35.8 66.5 33.9',
      'C 75 28.9 84.2 22.8 91.6 19.6',
      'C 93.8 18.6 96.4 17.7 99.5 17.1',
      'C 108 15.8 118 15.9 127 17.1',
      'C 134.5 18.1 141 20.3 147.6 23.4',
      'C 155.4 27.2 162.6 31 168.6 32.6',
      'C 175 33.8 182.6 33.4 187.6 32.3',
      'C 189.2 32 190.4 32.6 190.8 33.8',
      'C 191.4 35.8 191.8 38.4 192 41.2',
      'C 192.2 44.2 192.1 47.2 191.6 50',
      'C 190.6 54.6 188.8 58.4 185.8 60.4',
      'C 183.4 61.6 180 62 176 62.2',
      `C 171 62.6 166.6 63.8 ${num(rearArch.rearX)} ${SIDE.sillY}`,
      rearArch.d,
      `L ${num(frontArch.rearX)} ${SIDE.sillY}`,
      frontArch.d,
      'Z',
    ].join(' ')
  ),
  // Vidrios en una sola pieza (el cinturón sube hacia atrás), con el pilar B y el divisor de
  // la aleta en negro, como en los sedanes de ahora.
  path('M 71.2 34.3 L 89.4 23.3 Q 91.4 22 94 21.4 C 104 19.4 120 19.1 132 20.4 C 136 21 140 22.8 144 24.8 C 148.6 27 152.6 29.4 156 31.4 Q 156.6 31.8 155.8 31.8 Z', 'glass'),
  path('M 112.1 19.6 L 114.9 19.5 L 114.9 33.2 L 112.1 33.4 Z', 'dark'),
  path('M 137.4 21.2 L 139.4 21.9 L 147.6 32 L 145.6 32.1 Z', 'dark'),
  // Faro y calavera, que envuelven las esquinas.
  path('M 10.2 45.4 C 15.4 44 22.6 43.2 29.6 43 C 28.2 44.9 25.4 46.2 21.4 46.8 C 17.4 47.3 13.4 47.3 9.6 46.9 Z', 'glass'),
  path('M 178.4 35.3 C 182.6 34.9 187 34.6 190.6 34.7 C 191 36.2 191.2 37.8 191.3 39.4 C 187.2 39.6 182.4 39.1 178.5 38 C 177.8 37.2 177.7 36 178.4 35.3 Z', 'glass'),
  // Espejo, delante del vidrio.
  path('M 71.6 34.4 C 71.4 32.4 72.4 30.7 74.6 30.2 L 80 29.8 C 81.6 29.7 82.4 30.6 82.1 31.9 L 81.6 33.4 C 81.3 34.2 80.6 34.5 79.6 34.5 Z', 'solid'),
  // Cortes de las puertas.
  path('M 69.6 35.4 C 69 42 67.9 48.5 66.7 54 C 66 57.4 65.8 61 65.9 64.4', 'detail'),
  path('M 113.5 33.4 L 113.2 64.4', 'detail'),
  path(rearDoorCut(), 'detail'),
  // Línea de hombro (pasa sobre los arcos), estribo y manijas.
  path('M 32 42 C 62 40.8 120 39.4 178 37.6', 'detail'),
  path('M 59.4 61.9 L 134.6 61.9', 'detail'),
  path(capsule(101.5, 43.4, 7, 1.5), 'detail'),
  path(capsule(139, 41.6, 6.4, 1.5), 'detail'),
  // Toma de aire de la defensa delantera.
  path('M 12.6 57.8 C 16.6 58.2 21 59 24.6 60.4', 'detail'),
  // Ruedas.
  ...sideWheel(SIDE.frontX),
  ...sideWheel(SIDE.rearX),
];

/** El lado derecho es el izquierdo reflejado (el frente mira a la derecha). */
export function mirrorShape(shape: DiagramShape, width: number): DiagramShape {
  if (shape.kind === 'circle') return { ...shape, cx: width - shape.cx };
  return { ...shape, d: mirrorPath(shape.d, width / 2) };
}

const DERECHA_SHAPES: DiagramShape[] = IZQUIERDA_SHAPES.map((s) => mirrorShape(s, 200));

// ===== Frente y atrás (100 × 80, centro en x = 50, piso en y = 74) =====

const FACE_BODY = symmetric(
  [
    'M 50 11.9',
    'C 41.6 11.9 34.2 12.2 29.2 12.9',
    'C 26.8 13.3 25.4 14.3 24.6 16',
    'C 22.4 21.4 20.4 27.4 18.6 33',
    'C 18 34.6 16.4 35.6 14.6 36.6',
    'C 12.6 37.8 11.2 39.6 10.8 41.8',
    'C 10.5 43.6 10.4 46 10.4 48.6',
    'L 10.4 57',
    'C 10.4 59.6 11 61.2 12.4 62.2',
    'L 21.4 62.4',
    'C 23 62.5 24 63.4 24.6 64.6',
    'C 25.4 65.9 27 66.4 30 66.4',
    'L 50 66.4',
  ].join(' '),
  50
);

const FACE_COMMON: DiagramShape[] = [
  ...pair('M 11.8 62.3 L 21.2 62.4 L 21.2 72.4 Q 21.2 74 19.6 74 L 13.4 74 Q 11.8 74 11.8 72.4 Z', 50, 'dark'),
  path(FACE_BODY),
  ...pair('M 18.6 31.4 C 16 30.4 11.6 30 7.8 30.6 C 5.9 30.9 5 32.2 5.2 33.6 C 5.4 35 6.6 35.8 8.4 35.8 L 16.8 35.6 Z', 50),
];

const FRONTAL_SHAPES: DiagramShape[] = [
  ...FACE_COMMON,
  // Parabrisas, orilla del cofre y sus pliegues.
  path(symmetric('M 50 14.6 C 42.4 14.6 35.6 14.9 30.8 15.6 C 29 15.9 27.9 16.8 27.3 18.3 C 25.4 22.8 23.8 27.4 22.6 31.8 C 30.4 32.8 40 33.2 50 33.2', 50), 'glass'),
  path(symmetric('M 15.4 42 C 26 42.9 38 43.3 50 43.3', 50, { closed: false })),
  ...pair('M 36.4 34.2 C 37.2 37.2 37.9 40.2 38.5 43', 50, 'detail'),
  // Faros con su luz de día.
  ...pair('M 12.6 44.4 C 18.4 44.8 26.4 45.8 33.4 47 C 34.1 47.1 34.3 47.7 33.8 48.1 C 31.8 49.6 28.6 50.3 24.8 50.3 L 16.4 50.1 C 13.9 50 12.7 48.9 12.5 47.5 Z', 50, 'glass'),
  ...pair('M 15 46.6 C 21 47 27 47.6 31.8 48.2', 50, 'detail'),
  // Parrilla de arriba con su emblema, parrilla grande, placa y tomas de los lados.
  path(symmetric('M 50 47.8 L 37.2 47.8 Q 36.2 47.8 36.6 48.7 L 37.4 50.3 Q 37.8 51 38.6 51 L 50 51', 50), 'detail'),
  path(ellipse(50, 49.4, 2.4, 1.2), 'detail'),
  path(symmetric('M 50 53.2 L 31.2 53.2 C 30 53.2 29.5 54.1 30 55 L 33.6 62.4 C 34 63.2 34.8 63.7 35.8 63.7 L 50 63.7', 50)),
  path('M 31.4 56.6 L 68.6 56.6', 'detail'),
  path('M 33 60 L 67 60', 'detail'),
  path('M 42 55.2 L 58 55.2 Q 58.8 55.2 58.8 56 L 58.8 61.6 Q 58.8 62.4 58 62.4 L 42 62.4 Q 41.2 62.4 41.2 61.6 L 41.2 56 Q 41.2 55.2 42 55.2 Z', 'solid'),
  ...pair('M 14.6 53.6 C 18.2 53.8 22.6 54.6 25.8 55.8 Q 26.4 56 26.2 56.6 L 24.4 60.2 Q 24.1 60.8 23.4 60.8 C 20.4 60.9 17 60.6 14.4 60 Q 13.8 59.9 13.8 59.2 L 13.8 54.4 Q 13.8 53.6 14.6 53.6 Z', 50, 'detail'),
];

const TRASERA_SHAPES: DiagramShape[] = [
  ...FACE_COMMON,
  // Medallón con la tercera luz de freno, tapa de la cajuela y su remate.
  path(symmetric('M 50 15.8 C 42.8 15.8 36.4 16.1 31.8 16.8 C 30 17.1 28.9 18 28.3 19.5 C 26.6 23.4 25.2 27.4 24.2 31.2 C 32 32 41 32.4 50 32.4', 50), 'glass'),
  path('M 44.6 16.9 L 55.4 16.9 L 55 18 L 45 18 Z', 'detail'),
  path(symmetric('M 24.2 33.6 C 25 37.6 25.8 41.6 26.6 45.4 L 50 45.4', 50, { closed: false }), 'detail'),
  path(symmetric('M 24.8 36.4 C 33 37.1 41.6 37.4 50 37.4', 50, { closed: false }), 'detail'),
  // Calaveras unidas por una barra de luz.
  ...pair('M 11.6 39.6 C 16.8 39.2 24 39.8 30.8 41 C 31.6 41.2 31.8 42 31.2 42.6 C 30 43.8 27.6 44.4 24.4 44.4 L 15.4 44.2 C 13 44.1 11.8 43.2 11.6 42 Z', 50, 'glass'),
  path('M 31.8 41.8 L 68.2 41.8', 'detail'),
  // Hueco y placa, pliegue de la defensa, reflejantes y difusor.
  path('M 38.6 47.6 L 61.4 47.6 Q 62.4 47.6 62.4 48.6 L 62.4 55.2 Q 62.4 56.2 61.4 56.2 L 38.6 56.2 Q 37.6 56.2 37.6 55.2 L 37.6 48.6 Q 37.6 47.6 38.6 47.6 Z', 'detail'),
  path('M 40.8 48.8 L 59.2 48.8 Q 59.8 48.8 59.8 49.4 L 59.8 54.4 Q 59.8 55 59.2 55 L 40.8 55 Q 40.2 55 40.2 54.4 L 40.2 49.4 Q 40.2 48.8 40.8 48.8 Z', 'solid'),
  path(symmetric('M 11.6 57.6 C 24.6 58.2 37.8 58.4 50 58.4', 50, { closed: false }), 'detail'),
  ...pair('M 14 60.2 L 21.6 60.6', 50, 'detail'),
  path('M 31.6 61.4 L 68.4 61.4 L 66.4 65.2 L 33.6 65.2 Z', 'detail'),
];

// ===== Arriba (200 × 90, el frente a la izquierda, centro en y = 45) =====

const SUPERIOR_SHAPES: DiagramShape[] = [
  // Carrocería: más ancha en las ruedas que en las puertas.
  path(
    symmetric(
      [
        'M 8 45',
        'C 8 34.5 8.7 24.4 10.9 18.6',
        'C 12.5 14.4 16.2 11.9 21.8 11.1',
        'C 30 10.2 38 10.3 44 10.4',
        'C 62 10.7 82 11.5 100 11.5',
        'C 118 11.5 138 10.6 150 10.4',
        'C 162 10.3 172 10.7 179.2 11.5',
        'C 185.4 12.3 189.4 14.8 190.7 19.6',
        'C 191.7 24.6 192 34.6 192 45',
      ].join(' '),
      45,
      { alongY: true }
    )
  ),
  // Espejos.
  ...pair('M 70.8 11.6 L 72.4 7.4 C 72.8 6.4 73.8 6 75 6.2 L 79.6 7.2 C 80.6 7.4 81 8.2 80.6 9.2 L 79.4 11.5 Z', 45, 'solid', true),
  // Cofre y cajuela.
  path(symmetric('M 63.6 45 C 63.6 33.6 64.4 24.6 66 17.4 L 21.6 15.2 Q 16.6 15.1 14.8 19.4 C 13.2 24.8 12.8 34 12.8 45', 45, { alongY: true }), 'detail'),
  path(symmetric('M 167.6 45 C 167.6 34 166.6 25.6 164.4 18.6 L 183.4 18.4 Q 186.2 18.4 186.8 21 C 187.6 27 187.8 36 187.8 45', 45, { alongY: true }), 'detail'),
  // Cinturón: donde la carrocería se encuentra con los vidrios de los lados.
  path(symmetric('M 65 45 C 65 33 66.2 23.4 68.8 16.6 C 69.4 15.4 70.4 14.9 72 14.8 C 95 14.4 130 14.4 156 14.8 C 159 14.9 160.4 15.6 161.6 17.2 C 165.4 23 167.2 33 167.2 45', 45, { alongY: true }), 'detail'),
  // Parabrisas, techo y medallón.
  path(symmetric('M 66.4 45 C 66.4 33.4 67.6 24 70.2 17.4 Q 70.6 16.5 71.6 16.6 L 91.4 19.6 Q 92.3 19.8 92.5 20.8 C 93.3 28 93.6 36 93.6 45', 45, { alongY: true }), 'glass'),
  path(symmetric('M 94.6 45 C 94.6 36.4 94.4 28.2 93.9 21.6 Q 93.8 20.2 95.3 20 C 109 19.4 125 19.4 138.4 20 Q 139.8 20.1 139.8 21.5 C 140.2 28.2 140.4 36.4 140.4 45', 45, { alongY: true })),
  path(symmetric('M 141.6 45 C 141.6 36.4 141.4 28.4 141 21.8 Q 140.9 20.5 142.2 20.4 L 159.4 18 Q 160.4 17.9 160.8 18.9 C 163.6 25.4 165.2 34 165.2 45', 45, { alongY: true }), 'glass'),
  // Faros y calaveras en las esquinas.
  ...pair('M 11.4 21.6 C 12.6 16.6 16.4 13.2 22.6 12.2 L 27.6 11.9 C 27.8 12.8 27.4 13.6 26.4 13.9 C 20.6 15.2 16.4 17.6 13.8 21.4 C 13.2 22.2 12 22.4 11.4 21.6 Z', 45, 'glass', true),
  ...pair('M 190.6 21.4 C 189.6 16.8 186.4 13.6 181.2 12.4 L 176.4 11.9 C 176.2 12.8 176.6 13.6 177.6 13.9 C 182.4 15 186 17.4 188.2 21.2 C 188.8 22.1 190 22.3 190.6 21.4 Z', 45, 'glass', true),
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

// ===== Para el PDF =====

export interface PdfSubpath {
  /** Punto de partida, en unidades de la vista. */
  start: [number, number];
  /**
   * Tramos relativos al final del tramo anterior, como los pide `jsPDF.lines`:
   * `[dx, dy]` para una recta y `[c1x, c1y, c2x, c2y, dx, dy]` para una curva.
   */
  segments: number[][];
  closed: boolean;
}

/** Un trazo partido en subtrazos para `jsPDF.lines` (las Q pasan a curvas cúbicas exactas). */
export function pathSubpaths(d: string): PdfSubpath[] {
  const out: PdfSubpath[] = [];
  let current: PdfSubpath | null = null;
  let at: Pt = [0, 0];
  for (const c of parsePathData(d)) {
    if (c.op === 'M') {
      current = { start: [c.to[0], c.to[1]], segments: [], closed: false };
      out.push(current);
      at = c.to;
      continue;
    }
    if (!current) continue;
    if (c.op === 'Z') {
      current.closed = true;
      continue;
    }
    const [x0, y0] = at;
    if (c.op === 'L') {
      current.segments.push([c.to[0] - x0, c.to[1] - y0]);
    } else if (c.op === 'Q') {
      const c1: Pt = [x0 + (2 / 3) * (c.c[0] - x0), y0 + (2 / 3) * (c.c[1] - y0)];
      const c2: Pt = [c.to[0] + (2 / 3) * (c.c[0] - c.to[0]), c.to[1] + (2 / 3) * (c.c[1] - c.to[1])];
      current.segments.push([c1[0] - x0, c1[1] - y0, c2[0] - x0, c2[1] - y0, c.to[0] - x0, c.to[1] - y0]);
    } else {
      current.segments.push([c.c1[0] - x0, c.c1[1] - y0, c.c2[0] - x0, c.c2[1] - y0, c.to[0] - x0, c.to[1] - y0]);
    }
    at = c.to;
  }
  return out;
}

// ===== Marcas =====

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
