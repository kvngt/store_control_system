import { StrictMode } from 'react';
import type { Root } from 'react-dom/client';
// Las letras de la tarjeta del taller van en landing.css (@font-face), alojadas aquí: la página no
// pide nada a Google Fonts.
import './landing.css';
import Landing from './Landing';

function setMeta(name: string, content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

/** La página de inicio del taller. La app y el portal arrancan aparte (ver main.tsx). */
export function start(root: Root) {
  // El manifiesto y "pantalla completa en iPhone" son de la app del taller: "Agregar a inicio" desde
  // aquí instalaría el login del personal en el teléfono de un cliente.
  document.querySelector('link[rel="manifest"]')?.remove();
  document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.remove();
  document.querySelector('meta[name="mobile-web-app-capable"]')?.remove();
  setMeta('theme-color', '#000000');

  root.render(
    <StrictMode>
      <Landing />
    </StrictMode>,
  );
}
