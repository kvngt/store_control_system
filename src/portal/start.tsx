import { StrictMode } from 'react';
import type { Root } from 'react-dom/client';
import CustomerPortal from './CustomerPortal';
import { tokenFromPath } from './path';
import './portal.css';

function setMeta(name: string, content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = name;
    document.head.appendChild(meta);
  }
  meta.content = content;
}

/** El reporte del cliente. La app del taller arranca aparte (ver main.tsx). */
export function start(root: Root) {
  // El token está en la URL: que no salga como Referer al tocar WhatsApp o el logo,
  // y que ningún buscador indexe la página.
  setMeta('referrer', 'no-referrer');
  setMeta('robots', 'noindex, nofollow');
  setMeta('theme-color', '#FFFFFF');
  // El manifest es de la app del taller: "Agregar a inicio" desde aquí instalaría
  // el login del taller en el teléfono del cliente.
  document.querySelector('link[rel="manifest"]')?.remove();
  document.documentElement.setAttribute('data-theme', 'light');

  root.render(
    <StrictMode>
      <CustomerPortal token={tokenFromPath(window.location.pathname)} />
    </StrictMode>
  );
}
