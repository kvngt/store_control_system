import { useNavigate } from 'react-router-dom';
import type { WorkOrder } from '../../types/database';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../context/language.context';

interface FindingsAlertProps {
  orders: WorkOrder[];
}

export default function FindingsAlert({ orders }: FindingsAlertProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const pendingFindings = orders.flatMap((o) => 
    (o.hallazgos || []).filter((h) => h.estado === 'pendiente').map((h) => ({ order: o, finding: h }))
  );

  if (pendingFindings.length === 0) return null;

  return (
    <div style={{ marginBottom: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {pendingFindings.map(({ order, finding }) => (
        <div key={finding.id} className="alert-warn" style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
            <AlertTriangle className="alert-icon" />
            <div>
              <strong>{t('tasks.findingTitle') || 'La mecánica reportó un trabajo'} ({order.numero_orden})</strong>
              <p style={{ margin: 0, marginTop: 'var(--space-1)' }}>{finding.descripcion}</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button className="btn btn-primary btn-sm" onClick={() => navigate(`/work-orders/${order.id}?action=quote&findingId=${finding.id}`)}>
              {t('tasks.quoteCustomer') || 'Cotizar al cliente'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/work-orders/${order.id}?action=discard&findingId=${finding.id}`)}>
              {t('tasks.discard') || 'Descartar…'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
