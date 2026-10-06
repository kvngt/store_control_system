import { CheckCircle2, Clock, PauseCircle, XCircle } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import type { LaborItem, WorkOrder } from '../../types/database';
import { summarizeTechTasks } from './techStatus';

/**
 * Lo primero que ve el técnico en la orden (pedido del taller del 06/10/2026): en qué estado
 * está y qué de lo suyo está autorizado, qué espera al cliente y qué no se hace porque el
 * cliente no lo autorizó. Antes un trabajo rechazado seguía apareciendo "esperando
 * autorización" y el mecánico no sabía si hacerlo.
 */
export default function TechOrderStatus({ order, myTasks, statusLabel }: { order: WorkOrder; myTasks: LaborItem[]; statusLabel: string }) {
  const { t } = useLanguage();
  const summary = summarizeTechTasks(myTasks);
  const paused = order.estatus === 'espera_autorizacion';
  const statusText = order.retirada_sin_reparar ? t('withdrawal.status') : statusLabel;

  return (
    <div className={'tech-order-status' + (paused ? ' is-paused' : '')} role="status">
      <div className="tech-order-status-head">
        {paused ? <PauseCircle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
        <span>
          {t('techStatus.order')}: <strong>{statusText}</strong>
        </span>
      </div>
      {paused && <p className="tech-order-status-note">{t('techStatus.pausedNote')}</p>}
      {myTasks.length > 0 && (
        <ul className="tech-order-status-list">
          {summary.authorized > 0 && (
            <li className="is-authorized">
              <CheckCircle2 size={14} aria-hidden="true" />
              {t('techStatus.authorized').replace('{n}', String(summary.authorized)).replace('{done}', String(summary.done))}
            </li>
          )}
          {summary.waiting.length > 0 && (
            <li className="is-waiting">
              <Clock size={14} aria-hidden="true" />
              {t('techStatus.waiting').replace('{list}', summary.waiting.map((l) => l.descripcion).join(', '))}
            </li>
          )}
          {summary.rejected.length > 0 && (
            <li className="is-rejected">
              <XCircle size={14} aria-hidden="true" />
              {t('techStatus.rejected').replace('{list}', summary.rejected.map((l) => l.descripcion).join(', '))}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
