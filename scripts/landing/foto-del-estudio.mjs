// La imagen fija del estudio de color (src/landing/assets/studio-poster.webp): el mismo carro en 3D,
// quieto en su ángulo inicial, sin las etiquetas encima. Se ve mientras carga el 3D y en los
// teléfonos sin WebGL 2 o con ahorro de datos. Si cambias el modelo, la pintura inicial o el encuadre
// (src/landing/studio/), vuelve a sacarla.
//
// Uso, con la página corriendo en local (npm run dev):
//   node scripts/landing/foto-del-estudio.mjs http://localhost:5173/home src/landing/assets/studio-poster.webp
// Usa el Chromium de Playwright (ya está en las dependencias) con WebGL por software, y lo convierte a
// WebP con el mismo navegador: no hace falta instalar nada más. Si cambia el tamaño, pon al día el
// width/height del <img> en sections/ColorStudio.tsx.
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const [url, out] = process.argv.slice(2);
if (!url || !out) {
  console.error('Uso: node scripts/landing/foto-del-estudio.mjs <url de /home> <salida.webp>');
  process.exit(1);
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// Con "reducir movimiento" el carro no gira solo. A 1440 de ancho el escenario mide unos 694 × 477;
// al doble de densidad sobra para una imagen de 1200 de ancho.
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
const page = await context.newPage();
page.on('pageerror', (error) => console.error('Error en la página:', error.message));
await page.goto(url, { waitUntil: 'load', timeout: 120_000 });
await page.waitForSelector('#estudio', { timeout: 60_000 });
await page.evaluate(() => document.querySelector('#estudio').scrollIntoView({ block: 'center' }));
await page.waitForSelector('.lp-stage[data-mode="live"]', { timeout: 180_000 });
await page.addStyleTag({ content: '.lp-stage__chip, .lp-stage__hint { visibility: hidden !important; } .lp-stage, .lp-stage * { clip-path: none !important; }' });
await page.waitForTimeout(4000);
const png = await page.locator('.lp-stage').screenshot({ timeout: 120_000 });

const converter = await browser.newPage();
const webp = await converter.evaluate(async (base64) => {
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const width = 1200;
  const height = Math.round((image.height / image.width) * width);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context2d = canvas.getContext('2d');
  context2d.imageSmoothingQuality = 'high';
  context2d.drawImage(image, 0, 0, width, height);
  return { data: canvas.toDataURL('image/webp', 0.8).split(',')[1], width, height };
}, png.toString('base64'));
const bytes = Buffer.from(webp.data, 'base64');
writeFileSync(out, bytes);
console.log(`${out}: ${webp.width} × ${webp.height}, ${Math.round(bytes.length / 1024)} KB`);
await browser.close();
