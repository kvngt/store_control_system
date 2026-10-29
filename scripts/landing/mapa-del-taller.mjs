// El mapa de "Visítenos" (src/landing/assets/shop-map.svg): las calles de OpenStreetMap alrededor del
// taller (© OpenStreetMap contributors, ODbL; el crédito va debajo del mapa), por jerarquía, con las
// vías del tren, el río, el nombre de algunas calles y el taller. Es un dibujo propio y no Google Maps
// incrustado a propósito: la página no carga nada de terceros.
//
// Uso (sin dependencias):
//   curl -s --data-urlencode 'data=[out:json][timeout:40];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|motorway_link|trunk_link|primary_link|secondary_link)$"](38.9455,-76.9490,38.9580,-76.9295);way["railway"~"^(rail|subway)$"](38.9455,-76.9490,38.9580,-76.9295);way["waterway"~"^(river|stream)$"](38.9455,-76.9490,38.9580,-76.9295););out geom;' https://overpass-api.de/api/interpreter -o roads.json
//   node scripts/landing/mapa-del-taller.mjs roads.json src/landing/assets/shop-map.svg
// Si el taller se muda, cambia SHOP aquí, el recuadro de la consulta y SHOP en src/landing/business.ts.
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
const data = JSON.parse(readFileSync(input, 'utf8'));

const SHOP = { lat: 38.9518, lon: -76.9392 };
const W = 640;
const H = 440;
const WIDTH_M = 1300; // metros de este a oeste que cubre el mapa
const M_PER_DEG = 111320;
const scale = W / WIDTH_M;
const cosLat = Math.cos((SHOP.lat * Math.PI) / 180);
const project = ({ lat, lon }) => [
  (lon - SHOP.lon) * cosLat * M_PER_DEG * scale + W / 2,
  -(lat - SHOP.lat) * M_PER_DEG * scale + H / 2,
];

const STYLE = {
  water: { stroke: '#1d3340', width: 7, order: 0 },
  rail: { stroke: '#30343c', width: 2, dash: '7 6', order: 1 },
  minor: { stroke: '#23272d', width: 3.2, order: 2 },
  tertiary: { stroke: '#2d3139', width: 4.6, order: 3 },
  major: { stroke: '#3b4049', width: 7.5, order: 4 },
};
const kindOf = (tags) => {
  if (tags.waterway) return 'water';
  if (tags.railway) return 'rail';
  const h = tags.highway ?? '';
  if (/^(motorway|trunk|primary)/.test(h)) return 'major';
  if (/^(secondary|tertiary)/.test(h)) return 'tertiary';
  return 'minor';
};

const inView = ([x, y]) => x > -60 && x < W + 60 && y > -60 && y < H + 60;
const ways = [];
for (const el of data.elements) {
  if (el.type !== 'way' || !el.geometry) continue;
  const pts = el.geometry.map(project);
  if (!pts.some(inView)) continue;
  // Sin puntos repetidos al redondear a medio pixel.
  const clean = [];
  for (const [x, y] of pts) {
    const p = [Math.round(x * 2) / 2, Math.round(y * 2) / 2];
    const last = clean[clean.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= 1.5) clean.push(p);
  }
  if (clean.length < 2) continue;
  ways.push({ kind: kindOf(el.tags), name: el.tags.name ?? '', pts: clean });
}

const d = (pts) => 'M' + pts.map(([x, y]) => `${x} ${y}`).join('L');
const length = (pts) => pts.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

const layers = Object.entries(STYLE)
  .sort((a, b) => a[1].order - b[1].order)
  .map(([kind, s]) => {
    const paths = ways.filter((w) => w.kind === kind).map((w) => d(w.pts)).join('');
    if (!paths) return '';
    const dash = s.dash ? ` stroke-dasharray="${s.dash}"` : '';
    return `<path d="${paths}" fill="none" stroke="${s.stroke}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
  })
  .join('\n');

// Nombres: el tramo más largo de cada avenida, escrito de izquierda a derecha.
const LABELS = { 'Baltimore Avenue': 'Baltimore Ave', '46th Avenue': '46th Ave', 'Decatur Street': 'Decatur St', 'Gallatin Street': 'Gallatin St' };
const defs = [];
const texts = [];
Object.entries(LABELS).forEach(([name, label], i) => {
  const candidates = ways.filter((w) => w.name === name);
  if (!candidates.length) return;
  const visible = candidates.map((w) => w.pts.filter(inView)).filter((p) => p.length > 1);
  if (!visible.length) return;
  let pts = visible.reduce((a, b) => (length(b) > length(a) ? b : a));
  if (pts.length < 2 || length(pts) < label.length * 7 + 20) return;
  if (pts[pts.length - 1][0] < pts[0][0]) pts = [...pts].reverse();
  defs.push(`<path id="l${i}" d="${d(pts)}"/>`);
  texts.push(
    `<text dy="4"><textPath href="#l${i}" xlink:href="#l${i}" startOffset="50%" text-anchor="middle">${label}</textPath></text>`,
  );
});

const [sx, sy] = project(SHOP);
const hex = (r) =>
  Array.from({ length: 6 }, (_, k) => {
    const a = (Math.PI / 3) * k - Math.PI / 2;
    return `${(sx + r * Math.cos(a)).toFixed(1)},${(sy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<!-- Calles: © OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright -->
<rect width="${W}" height="${H}" fill="#121418"/>
${layers}
<defs>${defs.join('')}</defs>
<g font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="11.5" font-weight="600" letter-spacing=".4" fill="#8b9099" stroke="#121418" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round">${texts.join('')}</g>
<circle cx="${sx}" cy="${sy}" r="34" fill="#f5b800" fill-opacity=".12"/>
<polygon points="${hex(15)}" fill="#f5b800" stroke="#0d0e10" stroke-width="3"/>
<circle cx="${sx}" cy="${sy}" r="4.5" fill="#0d0e10"/>
<text x="${sx + 22}" y="${sy + 5}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" font-size="15" font-weight="800" fill="#f3f4f5" stroke="#121418" stroke-width="4" paint-order="stroke">Restorify Auto</text>
</svg>
`;
writeFileSync(output, svg);
console.log('ok', output, (svg.length / 1024).toFixed(1), 'KB', ways.length, 'tramos', texts.length, 'nombres');
