#!/usr/bin/env node
// ====================================================================================
// RESTORIFY — Íconos de la app instalada (PWA)
// ====================================================================================
// Genera public/icons/ a partir del logo del login (src/assets/restorify-logo.webp),
// centrado sobre el fondo oscuro de la app. Usa el Chromium que ya instala Playwright
// para las pruebas e2e (no agrega dependencias). Se corre a mano solo si cambia el logo:
//
//   node scripts/generate-pwa-icons.mjs
//
// Por qué PNG y no solo el SVG: iOS no acepta SVG como apple-touch-icon, y
// Android usa el PNG en la notificación push y en la pantalla de inicio.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'public', 'icons');
const logo = readFileSync(join(root, 'src', 'assets', 'restorify-logo.webp')).toString('base64');

// El fondo es el de la app y el manifiesto (`background_color`, `theme_color`).
const BG = '#0A0A0A';
const LOGO_W = 900;
const LOGO_H = 290;

/**
 * El logo es horizontal: ocupa `width` (fracción del lado) y queda centrado.
 * Para el maskable el ancho baja a 0.72: Android recorta el ícono con la forma del
 * launcher y solo garantiza el círculo central del 80 %; las esquinas del logo
 * tienen que caber en él.
 */
function iconSvg(width) {
  const w = 512 * width;
  const h = (w * LOGO_H) / LOGO_W;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- Generado por scripts/generate-pwa-icons.mjs a partir del logo del login. -->
  <rect width="512" height="512" fill="${BG}"/>
  <image href="data:image/webp;base64,${logo}" x="${((512 - w) / 2).toFixed(1)}" y="${((512 - h) / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/>
</svg>`;
}

const regular = iconSvg(0.86);
const maskable = iconSvg(0.72);

// Solo la llave, blanca sobre transparente: Android pinta el "badge" de la barra
// de estado como silueta monocroma, y el logo a color ahí sería un cuadro blanco.
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;

const targets = [
  { file: 'icon-192.png', size: 192, markup: regular },
  { file: 'icon-512.png', size: 512, markup: regular },
  { file: 'icon-maskable-512.png', size: 512, markup: maskable },
  // iOS redondea las esquinas por su cuenta; el logo ya deja margen.
  { file: 'apple-touch-icon.png', size: 180, markup: regular },
  { file: 'badge-72.png', size: 72, markup: badgeSvg, transparent: true },
];

// El favicon de la pestaña es el mismo ícono.
writeFileSync(join(iconsDir, 'icon.svg'), regular + '\n');
console.log('✓ icon.svg');

const browser = await chromium.launch();
try {
  for (const target of targets) {
    const page = await browser.newPage({ viewport: { width: target.size, height: target.size } });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${target.markup.replace(
        '<svg ',
        `<svg width="${target.size}" height="${target.size}" `
      )}</body></html>`,
      { waitUntil: 'load' }
    );
    // La imagen embebida se decodifica aparte del `load` del documento.
    await page.waitForTimeout(300);
    await page.screenshot({
      path: join(iconsDir, target.file),
      omitBackground: !!target.transparent,
      clip: { x: 0, y: 0, width: target.size, height: target.size },
    });
    await page.close();
    console.log('✓', target.file);
  }
} finally {
  await browser.close();
}
