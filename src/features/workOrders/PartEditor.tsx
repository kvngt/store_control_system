import { useEffect, useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import AddedConfirmation from './AddedConfirmation';
import { useAddedConfirmation } from './useAddedConfirmation';

/** Un repuesto del borrador del alta, con los campos como texto (vienen de `<input>`). */
export interface PartDraft {
  descripcion: string;
  cantidad: string;
  precio_venta_unitario: string;
}

interface PartEditorProps {
  /** Suma el repuesto al borrador (o lo reemplaza, si se está editando). */
  onSave: (part: PartDraft) => void;
  /** Editar un repuesto ya agregado: abre con estos valores y al terminar llama a `onClose`. */
  initial?: PartDraft;
  onClose?: () => void;
  /** Avisa si hay un repuesto escrito sin agregar, para que "Crear" no lo pierda. */
  onPendingChange?: (pending: boolean) => void;
  disabled?: boolean;
  idPrefix?: string;
}

const EMPTY: PartDraft = { descripcion: '', cantidad: '1', precio_venta_unitario: '' };

/** Bloquea las teclas que meten un signo menos en un `type="number"`. */
const blockNegativeKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === '-' || e.key === 'e' || e.key === 'E') e.preventDefault();
};

/**
 * "Agregar repuesto" del alta de la orden: el mismo patrón que el editor de trabajos —un botón
 * verde que abre un formulario en línea y, al agregar, el repuesto pasa a la lista, donde se
 * edita o se quita—. Antes cada repuesto era una fila de campos sueltos siempre abierta y el
 * taller no sabía si ya estaba agregado (pedido del 06/10/2026).
 *
 * Valida aquí lo mismo que el esquema del formulario, para no dejar entrar a la lista una fila
 * que después frenaría "Crear" en otro lado.
 */
export default function PartEditor({ onSave, initial, onClose, onPendingChange, disabled = false, idPrefix = 'part-editor' }: PartEditorProps) {
  const { t } = useLanguage();
  const editing = !!initial;
  const [open, setOpen] = useState(editing);
  const [draft, setDraft] = useState<PartDraft>(initial ?? EMPTY);
  const [error, setError] = useState('');
  const descriptionRef = useRef<HTMLInputElement>(null);
  const { added, flash: flashAdded } = useAddedConfirmation();

  const pending = open && !editing && (draft.descripcion.trim() !== '' || draft.precio_venta_unitario.trim() !== '');
  useEffect(() => {
    onPendingChange?.(pending);
    return () => onPendingChange?.(false);
  }, [pending, onPendingChange]);

  const close = () => {
    setOpen(false);
    setError('');
    setDraft(EMPTY);
    onClose?.();
  };

  const submit = () => {
    const part: PartDraft = {
      descripcion: draft.descripcion.trim(),
      cantidad: draft.cantidad.trim() || '1',
      precio_venta_unitario: draft.precio_venta_unitario.trim() || '0',
    };
    if (!part.descripcion) {
      setError(t('parts.descriptionRequired'));
      descriptionRef.current?.focus();
      return;
    }
    if ((parseInt(part.cantidad, 10) || 0) < 1) {
      setError(t('workOrders.validation.quantityMin'));
      return;
    }
    if (!(parseFloat(part.precio_venta_unitario) >= 0)) {
      setError(t('workOrders.validation.priceNegative'));
      return;
    }
    setError('');
    onSave(part);
    if (editing) {
      onClose?.();
      return;
    }
    // Queda abierto para el siguiente, como el de trabajos.
    flashAdded(part.descripcion);
    setDraft(EMPTY);
    descriptionRef.current?.focus();
  };

  const onEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  if (!open) {
    return (
      <div className="task-editor-start">
        <button type="button" className="btn btn-success" onClick={() => setOpen(true)} disabled={disabled} id={`${idPrefix}-open`}>
          <Plus size={16} /> {t('parts.add')}
        </button>
      </div>
    );
  }

  return (
    <div className="task-editor part-editor" role="group" aria-label={editing ? t('parts.editTitle') : t('parts.formTitle')}>
      <div className="part-editor-fields">
        <div className="form-group part-editor-description">
          <label className="form-label" htmlFor={`${idPrefix}-description`}>{t('common.description')}</label>
          <input
            ref={descriptionRef}
            id={`${idPrefix}-description`}
            className="form-input"
            value={draft.descripcion}
            onChange={(e) => setDraft({ ...draft, descripcion: e.target.value })}
            onKeyDown={onEnter}
            disabled={disabled}
            autoFocus
            aria-invalid={!!error || undefined}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={`${idPrefix}-quantity`}>{t('common.quantity')}</label>
          <input
            id={`${idPrefix}-quantity`}
            className="form-input"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={draft.cantidad}
            onChange={(e) => setDraft({ ...draft, cantidad: e.target.value })}
            onKeyDown={(e) => {
              blockNegativeKeys(e);
              onEnter(e);
            }}
            disabled={disabled}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor={`${idPrefix}-price`}>{t('parts.unitPrice')}</label>
          <input
            id={`${idPrefix}-price`}
            className="form-input"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="$"
            value={draft.precio_venta_unitario}
            onChange={(e) => setDraft({ ...draft, precio_venta_unitario: e.target.value })}
            onKeyDown={(e) => {
              blockNegativeKeys(e);
              onEnter(e);
            }}
            disabled={disabled}
          />
        </div>
      </div>
      {error && <p className="task-editor-error" role="alert">{error}</p>}
      <AddedConfirmation text={added} />
      <div className="task-editor-actions">
        <button type="button" className="btn btn-ghost" onClick={close}>
          {t('common.cancel')}
        </button>
        <button type="button" className="btn btn-success" onClick={submit} disabled={disabled} id={`${idPrefix}-submit`}>
          {editing ? <><Check size={16} /> {t('common.save')}</> : <><Plus size={16} /> {t('common.add')}</>}
        </button>
      </div>
    </div>
  );
}
