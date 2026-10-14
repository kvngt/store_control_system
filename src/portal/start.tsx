import { StrictMode } from 'react';
import type { Root } from 'react-dom/client';
import CustomerPortal from './CustomerPortal';
import ServicePage from './ServicePage';
import { isServicePath, serviceTokenFromPath, tokenFromPath } from './path';
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

/** El portal del cliente o la página de próximo servicio. La app del taller arranca aparte (ver main.tsx). */
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

  const pathname = window.location.pathname;
  const isService = isServicePath(pathname);

  root.render(
    <StrictMode>
      {isService ? (
        <ServicePage token={serviceTokenFromPath(pathname)} />
      ) : (
        <CustomerPortal token={tokenFromPath(pathname)} />
      )}
    </StrictMode>
  );
}
