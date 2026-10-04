import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { getErrorMessage } from '../../lib/errors';
import { queryKeys } from '../../lib/queryClient';
import { workOrdersService } from '../../services/workOrders.service';
import { describeHistoryEntry, type HistoryItem } from './historyFormat';

/** Cuántas filas se piden por vez. "Ver más" pide otro tanto. */
const PAGE = 50;

interface OrderHistoryProps {
  orderId: string;
  statusLabels: Record<string, string>;
}

/**
 * El historial de la orden (solo admin): quién cambió qué y cuándo, agrupado por día.
 *
 * Lo pidió el taller el 03/10/2026, después de no poder explicar cómo una orden terminó
 * Finalizada en 0 %. Lo escribe la base (`historial_orden`, 20261010000004); esta tarjeta
 * solo lo lee. Se vuelve a pedir con cada cambio de la orden (`useOrderSync`).
 */
export default function OrderHistory({ orderId, statusLabels }: OrderHistoryProps) {
  const { t, language } = useLanguage();
  const [limit, setLimit] = useState(PAGE);

  const query = useQuery({
    queryKey: [...queryKeys.orderHistory(orderId), limit],
    // Una fila de más para saber si hay más sin contar toda la tabla.
    queryFn: () => workOrdersService.getHistory(orderId, limit + 1),
    placeholderData: (previous) => previous,
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const hasMore = rows.length > limit;

  const days = useMemo(() => {
    const groups: { day: string; items: HistoryItem[] }[] = [];
    for (const entry of rows.slice(0, limit)) {
      const item = describeHistoryEntry(entry, { t, statusLabels, language });
      const day = new Date(item.at).toLocaleDateString(language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(item);
      else groups.push({ day, items: [item] });
    }
    return groups;
  }, [rows, limit, t, statusLabels, language]);

  return (
    <div className="card order-history">
      <h3 className="card-title" style={{ marginBottom: 'var(--space-2)' }}>
        <History size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
        {t('history.title')}
      </h3>
      <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>{t('history.hint')}</p>

      {query.isPending ? (
        <div className="spinner" />
      ) : query.isError ? (
        <p className="field-hint field-hint-error">
          {t('history.loadError')}: {getErrorMessage(query.error, language)}
        </p>
      ) : days.length === 0 ? (
        <p className="field-hint">{t('history.empty')}</p>
      ) : (
        <>
          {days.map(({ day, items }) => (
            <section key={day} className="order-history-day">
              <h4>{day}</h4>
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <time dateTime={item.at}>
                      {new Date(item.at).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' })}
                    </time>
                    <div>
                      <p>
                        <strong>{item.actor}</strong> {item.action}
                      </p>
                      {item.details.length > 0 && (
                        <ul className="order-history-details">
                          {item.details.map((detail, i) => (
                            <li key={i}>{detail}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {hasMore && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setLimit((n) => n + PAGE)}
              disabled={query.isFetching}
            >
              {query.isFetching ? t('common.loading') : t('history.loadMore')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
