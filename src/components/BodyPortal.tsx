import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Dibuja a sus hijos directamente en `<body>`, fuera de la tarjeta que los abre.
 *
 * Para las capas de pantalla completa (el grabador de video, el visor de fotos). Un
 * `position: fixed` solo se mide contra la pantalla si ningún ancestro tiene `transform`,
 * `filter` o `will-change`: si lo tiene, ese ancestro pasa a ser su caja y su contexto de
 * apilamiento. `.card` se levanta con un `transform` al pasar el ratón, y en el teléfono ese
 * `:hover` se queda pegado después de tocarla. El grabador de video quedaba entonces
 * encajonado dentro de la tarjeta de Avances, por debajo de la barra inferior, con los
 * botones de detener y de "Usar video" fuera de la pantalla.
 *
 * Fuera del árbol de la tarjeta ningún estilo de un ancestro la puede volver a atrapar. Los
 * eventos de React siguen subiendo por el árbol de componentes como antes, así que el
 * comportamiento no cambia.
 */
export default function BodyPortal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
