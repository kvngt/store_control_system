import poster from './assets/rfiintro-poster.webp';
import displayFont from './assets/fonts/archivo-expanded-italic.woff2?url';
import textFont from './assets/fonts/open-sans.woff2?url';

// Lo que pinta la primera pantalla: el primer cuadro del video de la portada y las dos letras de la
// portada. Vive aparte para que main.tsx lo pida por adelantado sin descargar la página: así no
// espera a que llegue el paquete de la landing, y el título no cambia de letra (ni de ancho) al cargar.

/** El primer cuadro del video: se ve mientras carga, con "reducir movimiento" y con ahorro de datos. */
export const HERO_POSTER = poster;

/**
 * El video de la intro, que dio el taller (public/videos/rfiintro.mp4), sin audio y con el índice al
 * principio para que arranque sin bajarlo entero: 1,9 MB en 720p y 0,9 MB en 480p para el teléfono.
 * Se sacan del original con ffmpeg:
 *   ffmpeg -i rfiintro.mp4 -vf scale=1280:-2 -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -an -movflags +faststart rfiintro-720.mp4
 *   (igual con scale=854:-2 y -crf 27 para rfiintro-480.mp4; el póster, con -frames:v 1 -c:v libwebp)
 */
export const HERO_VIDEOS = [
  { src: '/videos/rfiintro-480.mp4', media: '(max-width: 767px)' },
  { src: '/videos/rfiintro-720.mp4' },
];

/** Agrega `<link rel="preload">` del póster y las letras de la portada. Solo la página de inicio lo usa. */
export function preloadHeroImage() {
  const image = document.createElement('link');
  image.rel = 'preload';
  image.as = 'image';
  image.href = HERO_POSTER;
  image.setAttribute('fetchpriority', 'high');
  document.head.appendChild(image);
  for (const href of [displayFont, textFont]) {
    const font = document.createElement('link');
    font.rel = 'preload';
    font.as = 'font';
    font.type = 'font/woff2';
    font.href = href;
    font.crossOrigin = 'anonymous';
    document.head.appendChild(font);
  }
}
