import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import type { PreparedMedia } from '../../types/database';
import DraftMediaStrip from '../media/DraftMediaStrip';
import MediaCaptureBar from '../media/MediaCaptureBar';

const MAX_TEXT = 1000;

interface ReportFindingModalProps {
  saving: boolean;
  onCancel: () => void;
  /** Devuelve `false` si no se guardó, para dejar lo escrito y reintentar. */
  onConfirm: (descripcion: string, media: PreparedMedia[]) => Promise<boolean>;
}

/**
 * "Reportar trabajo adicional" (F6): lo que antes era elegir "espera de autorización" y
 * escribir un motivo. El técnico describe lo que encontró y, si quiere, toma fotos; la
 * orden queda en pausa y administración decide si se cotiza o no.
 *
 * Todo es interno: las fotos caen en un avance que el técnico no puede publicar.
 */
export default function ReportFindingModal({ saving, onCancel, onConfirm }: ReportFindingModalProps) {
  const { t } = useLanguage();
  const [texto, setTexto] = useState('');
  const [drafts, setDrafts] = useState<PreparedMedia[]>([]);
  const [processing, setProcessing] = useState(false);
  const canSubmit = !saving && !processing && texto.trim().length > 0;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('findings.reportTitle')}
      >
        <div className="modal-header">
          <h2 className="modal-title">
            <AlertTriangle size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {t('findings.reportTitle')}
          </h2>
        </div>
        <div className="modal-body">
          <p className="field-hint">{t('findings.reportHint')}</p>
          <div className="form-group">
            <label className="form-label" htmlFor="finding-description">
              {t('findings.reportLabel')}
            </label>
            <textarea
              id="finding-description"
              className="form-input form-textarea"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={t('findings.reportPlaceholder')}
              maxLength={MAX_TEXT}
              rows={4}
              disabled={saving}
              autoFocus
            />
          </div>
          <DraftMediaStrip items={drafts} onRemove={(index) => setDrafts((prev) => prev.filter((_, i) => i !== index))} />
          <MediaCaptureBar
            onAdd={(items) => setDrafts((prev) => [...prev, ...items])}
            disabled={saving}
            onBusyChange={setProcessing}
          />
          <p className="field-hint">{t('findings.reportInternal')}</p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void onConfirm(texto.trim(), drafts)}
            disabled={!canSubmit}
          >
            {saving ? t('common.loading') : t('findings.reportConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
