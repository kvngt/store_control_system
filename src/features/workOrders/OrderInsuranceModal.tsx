import { useState } from 'react';
import { Shield, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { AlertError } from '../../components/AlertError';
import { getErrorMessage } from '../../lib/errors';
import type { WorkOrder } from '../../types/database';

interface OrderInsuranceModalProps {
  order: Pick<WorkOrder, 'id' | 'numero_orden' | 'con_seguro' | 'aseguradora' | 'numero_reclamo'>;
  onSave: (insurance: { con_seguro: boolean; aseguradora?: string | null; numero_reclamo?: string | null }) => Promise<void>;
  onClose: () => void;
}

export default function OrderInsuranceModal({ order, onSave, onClose }: OrderInsuranceModalProps) {
  const { t, language } = useLanguage();
  const [withInsurance, setWithInsurance] = useState(order.con_seguro);
  const [insurer, setInsurer] = useState(order.aseguradora || '');
  const [claimNumber, setClaimNumber] = useState(order.numero_reclamo || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSave({
        con_seguro: withInsurance,
        aseguradora: withInsurance ? insurer.trim() || null : null,
        numero_reclamo: withInsurance ? claimNumber.trim() || null : null,
      });
      onClose();
    } catch (err) {
      // Traducido, nunca el mensaje crudo de la base (un CHECK o un permiso se ven como tales).
      setError(getErrorMessage(err, language));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: '480px' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-insurance-modal-title"
      >
        <div className="modal-header">
          <h2 className="modal-title" id="order-insurance-modal-title">
            <Shield size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {t('workOrders.editInsurance')}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <AlertError message={error} />
            <div className="form-group">
              <label className="form-checkbox" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  id="modal-with-insurance"
                  checked={withInsurance}
                  onChange={(e) => setWithInsurance(e.target.checked)}
                  disabled={saving}
                />
                <span style={{ fontWeight: 500 }}>{t('workOrders.withInsurance')}</span>
              </label>
            </div>

            {withInsurance && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="modal-insurer">{t('workOrders.insurer')}</label>
                  <input
                    id="modal-insurer"
                    className="form-input"
                    type="text"
                    placeholder={t('workOrders.insurerPlaceholder')}
                    value={insurer}
                    onChange={(e) => setInsurer(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="modal-claim-number">{t('workOrders.claimNumber')}</label>
                  <input
                    id="modal-claim-number"
                    className="form-input"
                    type="text"
                    placeholder={t('workOrders.claimNumberPlaceholder')}
                    value={claimNumber}
                    onChange={(e) => setClaimNumber(e.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" id="insurance-submit-btn" disabled={saving}>
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
