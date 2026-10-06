import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarX, CheckCircle2, ChevronRight, ClipboardCheck, FileQuestion, FileSignature, Mail, UserX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { dashboardService } from '../../services/dashboard.service';
import { queryKeys } from '../../lib/queryClient';
import type { AttentionGroup } from '../../types/database';

/** Cuántas órdenes se nombran por grupo; el resto queda en "+n más" (la RPC manda cinco). */
const SHOWN = 3;

/**
 * Error de "la función no existe": la app nueva publicada antes que su migración (el orden
 * es `db push` y después push a `main`, pero ya pasó). La tarjeta no se muestra en vez de
 * pintar un error que el taller no puede resolver.
 */
function isMissingFunction(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'PGRST202' || code === '42883';
}

interface Row {
  key: string;
  icon: LucideIcon;
  label: string;
  group: AttentionGroup;
  /** La pestaña de la orden donde se resuelve. */
  tab?: string;
}

/**
 * "Requiere atención" (F7, reunión con el taller del 03/10/2026): lo que espera una decisión
 * de la oficina, en una tarjeta al inicio del panel. Lo cuenta la base (`requiere_atencion`),
 * no la lista de órdenes del navegador, que deja fuera el histórico. Cada orden nombrada abre
 * la pestaña donde se resuelve; los correos llevan a Configuración, donde se reintentan.
 *
 * Reemplaza en el panel al aviso de hallazgos, que miraba solo las cinco órdenes recientes.
 */
export default function AttentionCard({ sedeId }: { sedeId?: string }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: queryKeys.attention(sedeId),
    queryFn: () => dashboardService.getAttention(sedeId),
  });

  if (query.isPending) return null;
  if (query.error) {
    if (isMissingFunction(query.error)) return null;
    return (
      <div className="card attention-card" role="region" aria-label={t('attention.title')}>
        <h3 className="card-title">{t('attention.title')}</h3>
        <p className="field-hint">{t('attention.loadError')}</p>
      </div>
    );
  }

  const data = query.data;
  const rows: Row[] = [
    { key: 'hallazgos', icon: AlertTriangle, label: t('attention.findings'), group: data.hallazgos, tab: 'resumen' },
    { key: 'por_autorizar', icon: FileSignature, label: t('attention.toAuthorize'), group: data.por_autorizar ?? { total: 0, ordenes: [] }, tab: 'trabajos' },
    { key: 'presupuestos', icon: FileQuestion, label: t('attention.quotes'), group: data.presupuestos, tab: 'trabajos' },
    { key: 'sin_tecnico', icon: UserX, label: t('attention.unassigned'), group: data.sin_tecnico, tab: 'trabajos' },
    { key: 'por_revisar', icon: ClipboardCheck, label: t('attention.toReview'), group: data.por_revisar ?? { total: 0, ordenes: [] } },
    { key: 'vencidas', icon: CalendarX, label: t('attention.overdue'), group: data.vencidas },
  ].filter((row) => row.group.total > 0);
  const emails = data.correos.total;
  const clear = rows.length === 0 && emails === 0;

  const openOrder = (id: string, tab?: string) =>
    navigate(`/work-orders?open=${id}${tab ? `&tab=${tab}` : ''}`);

  return (
    <div className="card attention-card" role="region" aria-label={t('attention.title')}>
      <h3 className="card-title">{t('attention.title')}</h3>
      {clear ? (
        <p className="attention-clear">
          <CheckCircle2 size={16} aria-hidden="true" /> {t('attention.allClear')}
        </p>
      ) : (
        <ul className="attention-list">
          {rows.map(({ key, icon: Icon, label, group, tab }) => {
            const rest = group.total - Math.min(group.ordenes.length, SHOWN);
            return (
              <li key={key} className={`attention-row attention-${key}`}>
                <Icon size={16} className="attention-icon" aria-hidden="true" />
                <span className="attention-label">
                  {label} <strong className="attention-count">{group.total}</strong>
                </span>
                <span className="attention-orders">
                  {group.ordenes.slice(0, SHOWN).map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      className="link-button attention-order"
                      onClick={() => openOrder(order.id, tab)}
                    >
                      {order.numero_orden}
                    </button>
                  ))}
                  {rest > 0 && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/work-orders')}>
                      {t('attention.more').replace('{n}', String(rest))}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
          {emails > 0 && (
            <li className="attention-row attention-correos">
              <Mail size={16} className="attention-icon" aria-hidden="true" />
              <span className="attention-label">
                {t('attention.emails')} <strong className="attention-count">{emails}</strong>
              </span>
              <span className="attention-orders">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/settings')}>
                  {t('attention.review')} <ChevronRight size={14} aria-hidden="true" />
                </button>
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
