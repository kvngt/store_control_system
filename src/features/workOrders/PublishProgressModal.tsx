import { useState } from 'react';
import { Eye } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import type { OrderProgressUpdate } from '../../types/database';

const MAX_MESSAGE = 1000;

interface PublishProgressModalProps {
  entry: OrderProgressUpdate;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (descripcion: string) => void | Promise<void>;
}

/**
 * Lo que el cliente va a leer, antes de que lo lea.
 *
 * El texto del avance es uno solo: el mismo que escribe el técnico para el taller. Eso lo
 * hace simple de usar y arriesgado de publicar, porque una nota escrita al vuelo ("el dueño
 * es difícil") saldría tal cual. Este diálogo es la única red: muestra el texto como lo va a
 * ver el cliente y deja corregirlo antes de guardar.
 *
 * Al cliente no le llega el autor. Que el reporte no nombre a los técnicos es una regla
 * aparte y no cambia con esto.
 */
export default function PublishProgressModal({ entry, saving, onCancel, onConfirm }: PublishProgressModalProps) {
  const { t } = useLanguage();
  const [texto, setTexto] = useState(entry.descripcion ?? '');

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('workOrders.publishProgressTitle')}
      >
        <div className="modal-header">
          <h2 className="modal-title">
            <Eye size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {t('workOrders.publishProgressTitle')}
          </h2>
        </div>
        <div className="modal-body">
          <div className="alert-warn">{t('workOrders.publishProgressWarning')}</div>
          <div className="form-group">
            <label className="form-label" htmlFor="publish-progress-text">
              {t('workOrders.publishProgressLabel')}
            </label>
            <textarea
              id="publish-progress-text"
              className="form-input form-textarea"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={MAX_MESSAGE}
              rows={4}
            />
          </div>
          <p className="field-hint">{t('workOrders.publishProgressHint')}</p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onConfirm(texto.trim())}
            disabled={saving}
            id="publish-progress-submit"
          >
            {saving ? t('common.loading') : t('workOrders.publishProgressConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
