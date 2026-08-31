// Copies the pdfjs-dist worker into public/ with a plain .js extension.
//
// Why: some static hosts (Hostinger's CDN among them) serve .mjs files with
// Content-Type: text/plain instead of a JavaScript MIME type. Browsers
// enforce strict MIME checking for ES modules, so pdfjs-dist's worker
// (loaded as `new Worker(url, { type: 'module' })`) fails to load with
// "Failed to fetch dynamically imported module" even though the file itself
// is served correctly. Copying it into public/ under a .js name sidesteps
// the host's extension-based MIME mapping entirely — public/ files are
// copied verbatim by Vite, and .js is already known to work since it's what
// the main app bundle uses.
//
// Runs on `npm install` (see the "postinstall" script) so it stays in sync
// whenever the pdfjs-dist version changes — pdfjs throws at runtime if the
// worker version doesn't match the main library's.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(rootDir, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
const destDir = join(rootDir, 'public');
const dest = join(destDir, 'pdf.worker.min.js');

mkdirSync(destDir, { recursive: true });
copyFileSync(source, dest);
console.log(`Copied pdfjs-dist worker to ${dest}`);
