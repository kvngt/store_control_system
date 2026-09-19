import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { AlertError } from '../../components/AlertError';

const MAX_REASON = 1000;

interface AuthorizationReasonModalProps {
  saving: boolean;
  onCancel: () => void;
  onConfirm: (motivo: string) => void | Promise<void>;
}

/**
 * Por qué la orden necesita autorización.
 *
 * Es el único dato que el admin no puede deducir: sabe que la orden está parada, pero no
 * qué encontró el mecánico ni qué tiene que cotizar. La base lo exige con un 42501, así
 * que el diálogo lo pide antes de intentar el cambio y se ahorra el viaje.
 */
export default function AuthorizationReasonModal({ saving, onCancel, onConfirm }: AuthorizationReasonModalProps) {
  const { t } = useLanguage();
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    const limpio = motivo.trim();
    if (!limpio) {
      setError(t('workOrders.authorizationReasonRequired'));
      return;
    }
    setError('');
    await onConfirm(limpio.slice(0, MAX_REASON));
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('workOrders.authorizationReasonTitle')}
      >
        <div className="modal-header">
          <h2 className="modal-title">
            <HelpCircle size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {t('workOrders.authorizationReasonTitle')}
          </h2>
        </div>
        <div className="modal-body">
          <AlertError message={error} />
          <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>
            {t('workOrders.authorizationReasonHint')}
          </p>
          <div className="form-group">
            <label className="form-label" htmlFor="auth-reason">
              {t('workOrders.authorizationReason')}
            </label>
            <textarea
              id="auth-reason"
              className="form-input form-textarea"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={MAX_REASON}
              rows={4}
              autoFocus
            />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving} id="auth-reason-submit">
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
