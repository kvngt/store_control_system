import { useState } from 'react';
import ChoiceDialog from './ChoiceDialog';
import { useLanguage } from '../context/language.context';
import { useBackButtonTrap } from '../lib/backButtonTrap';

interface DiscardGuardOptions {
  /**
   * Si la trampa está puesta. Un diálogo la tiene mientras está abierto (por defecto). Un formulario en
   * la página (el avance de la pestaña Avances, la nota de un punto) solo mientras hay algo escrito: si
   * no, «atrás» tiene que salir de la orden como siempre.
   */
  active?: boolean;
  /** Hay algo escrito, un archivo agregado o uno que se está preparando: cerrar lo perdería. */
  dirty: boolean;
  /** Guardando: ni la X, ni el fondo, ni «atrás» cierran a medias. */
  busy?: boolean;
  /** Cerrar de verdad (lo que hacían la X y el fondo). */
  onClose: () => void;
  /** La pregunta: «¿Descartar este avance?». */
  title: string;
  /** Qué se pierde. */
  body: string;
  /** La capa de la pregunta, si el diálogo va encima de todo (el grabador). */
  zIndex?: string;
}

/**
 * Un diálogo con trabajo a medias (pedido del taller, 04/11/2026): el técnico escribe un avance o un
 * trabajo adicional en el teléfono, con los guantes puestos, y lo perdía con un «atrás» de Android o
 * con un toque fuera del diálogo. Todas las salidas pasan por aquí:
 *
 * - `requestClose` para la X, «Cancelar» y el fondo;
 * - «atrás» (una trampa en el historial, `useBackButtonTrap`) tiene su propia rama: con la pregunta
 *   abierta la cierra (seguir editando), guardando no hace nada, y si no, lo mismo que `requestClose`.
 *   Cada vez que el diálogo se queda abierto, vuelve a armar la trampa: si no, el siguiente «atrás»
 *   saldría de la orden.
 *
 * Sin nada capturado se cierra sin preguntar; con algo, pregunta con `ChoiceDialog` (Seguir editando /
 * Descartar). Es la regla de ai-context: un diálogo con trabajo a medias usa la trampa, y una pregunta
 * con varias salidas, `ChoiceDialog`.
 */
export function useDiscardGuard({ active = true, dirty, busy = false, onClose, title, body, zIndex }: DiscardGuardOptions) {
  const { t } = useLanguage();
  const [asking, setAsking] = useState(false);

  const requestClose = () => {
    if (busy) return;
    if (dirty) setAsking(true);
    else onClose();
  };

  const backTrap = useBackButtonTrap(active, () => {
    // Este «atrás» ya gastó la entrada de reserva: si el diálogo se queda, se deja otra.
    if (asking) {
      setAsking(false);
      backTrap.rearm();
      return;
    }
    if (busy) {
      backTrap.rearm();
      return;
    }
    if (dirty) {
      setAsking(true);
      backTrap.rearm();
      return;
    }
    onClose();
  });

  const dialog = asking ? (
    <ChoiceDialog
      title={title}
      body={body}
      onDismiss={() => setAsking(false)}
      zIndex={zIndex}
      actions={[
        { label: t('common.keepEditing'), variant: 'primary', onClick: () => setAsking(false) },
        {
          label: t('common.discardChanges'),
          variant: 'danger',
          onClick: () => {
            setAsking(false);
            onClose();
          },
        },
      ]}
    />
  ) : null;

  return { requestClose, dialog };
}
