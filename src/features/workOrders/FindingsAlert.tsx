import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { WorkOrder } from '../../types/database';
import { useLanguage } from '../../context/language.context';
import { findingsToReview } from './findings';

interface FindingsAlertProps {
  orders: WorkOrder[];
}

/**
 * En la lista de órdenes y en el panel: qué órdenes tienen trabajo adicional reportado que
 * administración no ha decidido. Cotizar o descartar se hace dentro de la orden, donde está
 * el contexto (fotos, tareas, presupuesto); aquí solo se llega a ella.
 */
export default function FindingsAlert({ orders }: FindingsAlertProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const pending = orders
    .map((order) => ({ order, findings: findingsToReview(order.hallazgos) }))
    .filter((x) => x.findings.length > 0);

  if (pending.length === 0) return null;

  return (
    <div className="alert-warn findings-card" role="region" aria-label={t('findings.listTitle')}>
      <div className="findings-card-title">
        <AlertTriangle size={16} aria-hidden="true" />
        <strong>{t('findings.listTitle')}</strong>
      </div>
      <ul className="findings-list">
        {pending.map(({ order, findings }) => (
          <li key={order.id} className="findings-item findings-row">
            <span className="findings-text">
              <strong>{order.numero_orden}</strong> — {findings[0].descripcion}
              {findings.length > 1 && ` (+${findings.length - 1})`}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => navigate(`/work-orders?open=${order.id}&tab=resumen`)}
            >
              {t('findings.review')} <ChevronRight size={14} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
