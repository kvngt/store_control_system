import { useEffect, useRef } from 'react';
import BodyPortal from './BodyPortal';

export interface ChoiceAction {
  label: string;
  onClick: () => void;
  /** `primary`: lo que se recomienda; `danger`: lo que pierde algo; `secondary`: lo demás. */
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

interface ChoiceDialogProps {
  title: string;
  /** Párrafos separados por una línea en blanco. */
  body: string;
  actions: ChoiceAction[];
  /** Esc y el fondo: lo mismo que la opción segura (seguir donde se estaba). */
  onDismiss: () => void;
}

/**
 * Una pregunta con varias salidas, en la propia pantalla (no un `confirm` del navegador, que solo
 * tiene Aceptar y Cancelar y en el teléfono se ve como un aviso del sistema).
 *
 * Los botones miden 44 px y van uno debajo de otro, para que el pulgar no falle. La opción que se
 * recomienda es la primera de la lista y es donde cae el foco.
 */
export default function ChoiceDialog({ title, body, actions, onDismiss }: ChoiceDialogProps) {
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onDismiss]);

  return (
    <BodyPortal>
      {/* El clic no sube al diálogo de abajo (React propaga por el árbol aunque esté en el body). */}
      <div className="modal-overlay" style={{ zIndex: 'calc(var(--z-modal) + 10)' }} onClick={(e) => { e.stopPropagation(); onDismiss(); }}>
        <div
          className="modal"
          // En el teléfono `.modal` ocupa toda la pantalla: una pregunta es una tarjeta del tamaño de su texto.
          style={{ maxWidth: 440, height: 'auto', maxHeight: '90dvh', borderRadius: 'var(--radius-2xl)' }}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="choice-dialog-title"
          aria-describedby="choice-dialog-body"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2 className="modal-title" id="choice-dialog-title">{title}</h2>
          </div>
          <div className="modal-body" id="choice-dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {body.split('\n\n').map((p, i) => (
              <p key={i} style={{ margin: 0 }}>{p}</p>
            ))}
          </div>
          <div className="modal-footer" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {actions.map((a, i) => (
              <button
                key={a.label}
                ref={i === 0 ? first : undefined}
                type="button"
                className={`btn btn-touch ${a.variant === 'danger' ? 'btn-danger' : a.variant === 'secondary' ? 'btn-secondary' : 'btn-primary'}`}
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={a.onClick}
                disabled={a.disabled}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
