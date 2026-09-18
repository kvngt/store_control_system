import { useEffect, useRef } from 'react';

/**
 * El recuadro de error de un diálogo, que además se hace ver.
 *
 * El error se pinta como primer hijo del `.modal-body`, que es el contenedor que
 * desplaza. En un teléfono el modal ocupa la pantalla completa y la persona está
 * abajo, junto a Guardar: el mensaje aparecía fuera de vista, el botón solo
 * parpadeaba, y la única pista de que algo falló estaba a un scroll de distancia.
 *
 * Dos cosas lo arreglan. Traerlo a la vista al aparecer — desplazar un hijo
 * desplaza al `.modal-body`, que es justo lo que faltaba — y dejarlo pegado
 * arriba mientras siga ahí, para que no se vuelva a perder al bajar a corregir.
 *
 * `block: 'nearest'` mueve lo mínimo: en escritorio, donde el error ya se ve, no
 * pega ningún tirón.
 */
export function AlertError({ message }: { message?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!message) return;
    // Sin animación: un desplazamiento suave deja el contenido en movimiento, y un
    // botón que se mueve es un botón que no se puede pulsar.
    ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [message]);

  if (!message) return null;

  return (
    <div className="modal-alert-slot">
      <div className="alert-error" role="alert" ref={ref} tabIndex={-1}>
        {message}
      </div>
    </div>
  );
}
