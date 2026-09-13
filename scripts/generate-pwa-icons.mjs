#!/usr/bin/env node
// ====================================================================================
// RESTORIFY — Íconos de la app instalada (PWA)
// ====================================================================================
// Genera los PNG de public/icons/ a partir de public/icons/icon.svg, usando el
// Chromium que ya instala Playwright para las pruebas e2e (no agrega
// dependencias). Se corre a mano solo si cambia el ícono:
//
//   node scripts/generate-pwa-icons.mjs
//
// Por qué PNG y no solo el SVG: iOS no acepta SVG como apple-touch-icon, y
// Android usa el PNG en la notificación push y en la pantalla de inicio.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconsDir = join(root, 'public', 'icons');
const svg = readFileSync(join(iconsDir, 'icon.svg'), 'utf8');

// Solo la llave, blanca sobre transparente: Android pinta el "badge" de la barra
// de estado como silueta monocroma.
const badgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;

const targets = [
  { file: 'icon-192.png', size: 192, markup: svg },
  { file: 'icon-512.png', size: 512, markup: svg },
  // Maskable: Android recorta con la forma del launcher; el motivo ya deja el
  // 70 % central libre, que es la zona segura.
  { file: 'icon-maskable-512.png', size: 512, markup: svg },
  { file: 'apple-touch-icon.png', size: 180, markup: svg },
  { file: 'badge-72.png', size: 72, markup: badgeSvg, transparent: true },
];

const browser = await chromium.launch();
try {
  for (const target of targets) {
    const page = await browser.newPage({ viewport: { width: target.size, height: target.size } });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${target.markup.replace(
        '<svg ',
        `<svg width="${target.size}" height="${target.size}" `
      )}</body></html>`
    );
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
