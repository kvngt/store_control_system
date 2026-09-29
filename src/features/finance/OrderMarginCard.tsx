import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { financeService } from '../../services/supabaseService';
import { shopTimeZone } from '../../services/dashboard.service';
import { queryKeys } from '../../lib/queryClient';
import { monthRange, todayLocal } from '../../lib/dates';
import { money } from '../../lib/money';
import { getErrorMessage } from '../../lib/errors';

const PAGE_SIZE = 25;

/**
 * El margen de cada orden entregada en un mes (reunión con el taller, sept. 2026): cuánto
 * se cobró, cuánto costaron sus repuestos y sus comisiones, y cuánto quedó. La lista crece
 * con el tiempo, así que viene de la base de a páginas, con las sumas del mes ya hechas.
 */
export default function OrderMarginCard({ sedeId }: { sedeId?: string }) {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => todayLocal().slice(0, 7));
  const [page, setPage] = useState(0);
  const [desde, hasta] = monthRange(month);

  const query = useQuery({
    queryKey: queryKeys.orderMargins(sedeId, month, page),
    queryFn: () =>
      financeService.getOrderMargins({ sedeId, desde, hasta, limit: PAGE_SIZE, offset: page * PAGE_SIZE, tz: shopTimeZone() }),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const pages = data ? Math.max(1, Math.ceil(data.total_filas / PAGE_SIZE)) : 1;

  return (
    <div className="card" style={{ marginTop: 'var(--space-6)' }}>
      <div className="order-margin-header">
        <h3 className="card-title">
          <TrendingUp size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
          {t('orderBalance.marginTitle')}
        </h3>
        <input
          type="month"
          className="form-input order-margin-month"
          value={month}
          aria-label={t('orderBalance.month')}
          onChange={(e) => {
            if (!e.target.value) return;
            setMonth(e.target.value);
            setPage(0);
          }}
        />
      </div>

      {query.isPending ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : query.error || !data ? (
        <p className="field-hint">{getErrorMessage(query.error, language)}</p>
      ) : data.total_filas === 0 ? (
        <p className="field-hint">{t('orderBalance.noneInMonth')}</p>
      ) : (
        <>
          <div className="table-container cards-on-mobile" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('workOrders.orderNumber')}</th>
                  <th>{t('orderBalance.customer')}</th>
                  <th style={{ textAlign: 'right' }}>{t('orderBalance.collected')}</th>
                  <th style={{ textAlign: 'right' }}>{t('orderBalance.parts')}</th>
                  <th style={{ textAlign: 'right' }}>{t('orderBalance.commissions')}</th>
                  <th style={{ textAlign: 'right' }}>{t('orderBalance.margin')}</th>
                </tr>
              </thead>
              <tbody>
                {data.filas.map((row) => (
                  <tr key={row.id}>
                    <td data-label={t('workOrders.orderNumber')}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '2px 6px', color: 'var(--color-primary-light)' }}
                        onClick={() => navigate(`/work-orders?open=${row.id}`)}
                      >
                        {row.numero_orden}
                      </button>
                    </td>
                    <td data-label={t('orderBalance.customer')}>{row.cliente ?? '—'}</td>
                    <td data-label={t('orderBalance.collected')} style={{ textAlign: 'right' }}>{money(Number(row.cobrado))}</td>
                    <td data-label={t('orderBalance.parts')} style={{ textAlign: 'right' }}>{money(Number(row.costo_repuestos))}</td>
                    <td data-label={t('orderBalance.commissions')} style={{ textAlign: 'right' }}>{money(Number(row.comisiones))}</td>
                    <td
                      data-label={t('orderBalance.margin')}
                      style={{ textAlign: 'right', fontWeight: 700, color: Number(row.margen) < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}
                    >
                      {money(Number(row.margen))}
                    </td>
                  </tr>
                ))}
                <tr className="order-margin-total">
                  <td className="desktop-only" colSpan={2}>{t('orderBalance.monthTotal').replace('{n}', String(data.total_filas))}</td>
                  <td data-label={t('orderBalance.collected')} style={{ textAlign: 'right' }}>{money(Number(data.sumas.cobrado))}</td>
                  <td data-label={t('orderBalance.parts')} style={{ textAlign: 'right' }}>{money(Number(data.sumas.costo_repuestos))}</td>
                  <td data-label={t('orderBalance.commissions')} style={{ textAlign: 'right' }}>{money(Number(data.sumas.comisiones))}</td>
                  <td data-label={t('orderBalance.margin')} style={{ textAlign: 'right' }}>{money(Number(data.sumas.margen))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="order-margin-pager">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage((p) => p - 1)} disabled={page === 0} aria-label={t('common.previous')}>
                <ChevronLeft size={16} />
              </button>
              <span>{t('orderBalance.page').replace('{page}', String(page + 1)).replace('{pages}', String(pages))}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage((p) => p + 1)} disabled={page + 1 >= pages} aria-label={t('common.next')}>
                <ChevronRight size={16} />
              </button>
            </div>
          )}
          <p className="field-hint" style={{ marginTop: 'var(--space-2)' }}>{t('orderBalance.marginHint')}</p>
        </>
      )}
    </div>
  );
}
