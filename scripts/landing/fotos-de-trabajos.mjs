// Las fotos de «Trabajos de nuestro taller» (src/landing/assets/work/): recorta cada toma de los
// collages que mandó el taller (antes y después en una sola imagen, 25/11/2026) y la guarda en WebP.
//
// Uso:
//   node scripts/landing/fotos-de-trabajos.mjs <carpeta con los collages> [carpeta de salida]
// La carpeta de salida es src/landing/assets/work si no se indica. Los collages no van al repositorio:
// los tiene el taller (los nombres de archivo están en CROPS). Usa el Chromium de Playwright, como
// foto-del-estudio.mjs: no hace falta instalar nada. Si cambias un tamaño, pon al día el width/height
// de sections/Work.tsx.
//
// Cada recorte está en píxeles del collage original. Las medidas de las divisiones se sacaron con
// la uniformidad de cada fila y columna; los recortes quedan en 3:2 (el caso grande) y 4:3 (los
// chicos), centrados en el daño y, cuando se puede, en el mismo ángulo en el antes y el después. Las
// tomas con placa legible o con personas no se usan. Del mismo envío quedaron fuera el Camry (su placa
// se lee a medias) y la Sienna (el después tiene un papel de enmascarar a la vista).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

/** `widths`: los anchos que se guardan (sin agrandar nunca la foto). */
export const CROPS = [
  // Hyundai Elantra: golpe trasero fuerte (collage de dos tomas, la de abajo con bordes negros).
  { out: 'elantra-antes', src: 'elantra.jpg', x: 55, y: 1220, w: 1146, h: 764, widths: [640, 1146] },
  { out: 'elantra-despues', src: 'elantra.jpg', x: 12, y: 108, w: 1224, h: 816, widths: [640, 1200] },
  // Dodge Charger: frente y cambio de color (cuadrícula de seis). El antes, la toma de arriba a la
  // derecha (se ve el frente golpeado); el después, la de abajo a la izquierda (el frente entero). La
  // de abajo a la derecha tiene la placa legible y la del medio a la izquierda, a una persona: no se usan.
  { out: 'charger-antes', src: 'charger.jpg', x: 451, y: 150, w: 448, h: 336, widths: [448] },
  { out: 'charger-despues', src: 'charger.jpg', x: 0, y: 1190, w: 448, h: 336, widths: [448] },
  // Nissan Kicks: golpe lateral, sin puertas.
  { out: 'kicks-antes', src: 'kicks.jpg', x: 210, y: 0, w: 877, h: 658, widths: [640] },
  { out: 'kicks-despues', src: 'kicks.jpg', x: 110, y: 659, w: 959, h: 719, widths: [640] },
  // Toyota Corolla: puerta trasera doblada.
  { out: 'corolla-antes', src: 'corolla.jpg', x: 60, y: 0, w: 898, h: 673, widths: [640] },
  { out: 'corolla-despues', src: 'corolla.jpg', x: 120, y: 1400, w: 864, h: 648, widths: [640] },
];

const [srcDir, outDir = 'src/landing/assets/work'] = process.argv.slice(2);
if (!srcDir) {
  console.error('Uso: node scripts/landing/fotos-de-trabajos.mjs <carpeta con los collages> [carpeta de salida]');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
for (const crop of CROPS) {
  const b64 = readFileSync(join(srcDir, crop.src)).toString('base64');
  for (const width of crop.widths) {
    const target = Math.min(width, crop.w);
    const result = await page.evaluate(
      async ({ b64, crop, target }) => {
        const image = new Image();
        image.src = `data:image/jpeg;base64,${b64}`;
        await image.decode();
        const height = Math.round((crop.h / crop.w) * target);
        const canvas = document.createElement('canvas');
        canvas.width = target;
        canvas.height = height;
        const context2d = canvas.getContext('2d');
        context2d.imageSmoothingQuality = 'high';
        context2d.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, target, height);
        return { data: canvas.toDataURL('image/webp', 0.8).split(',')[1], width: target, height };
      },
      { b64, crop, target },
    );
    const name = crop.widths.length > 1 ? `${crop.out}-${result.width}.webp` : `${crop.out}.webp`;
    const bytes = Buffer.from(result.data, 'base64');
    writeFileSync(join(outDir, name), bytes);
    console.log(`${name}: ${result.width} × ${result.height}, ${Math.round(bytes.length / 1024)} KB`);
  }
}
await browser.close();
