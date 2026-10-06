import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Calendar, CheckCircle2, Clock, Wallet } from 'lucide-react';
import { useLanguage } from '../context/language.context';
import { useAuth } from '../context/auth.context';
import { commissionsService } from '../services/commissions.service';
import { queryKeys } from '../lib/queryClient';
import { getErrorMessage } from '../lib/errors';
import { money } from '../lib/money';
import { AlertError } from '../components/AlertError';
import type { Commission, CommissionPayment, MyCommissionsSummary } from '../types/database';

/** La app nueva publicada antes que su migración: sin totales en vez de un error. */
function isMissingFunction(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'PGRST202' || code === '42883';
}

/**
 * "Mis comisiones" del técnico (pedido del taller del 06/10/2026): lo que administración ya le
 * aceptó y está por cobrar, y su historial de pagos con lo que entró en cada uno.
 *
 * Solo lectura. Lo que ve lo decide la base: la política de `comisiones` le deja leer lo suyo
 * aceptado o pagado (lo sugerido no le llega hasta que administración lo acepta) y la de
 * `comision_pagos`, sus pagos. Los totales los suma `resumen_mis_comisiones`.
 */
export default function MyCommissions() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const userId = user?.id;

  const query = useQuery({
    queryKey: queryKeys.myCommissions(userId),
    enabled: !!userId,
    queryFn: async () => {
      const [commissions, payments, summary] = await Promise.all([
        commissionsService.getMyCommissions(userId!),
        commissionsService.getMyPayments(userId!),
        commissionsService.getMySummary().catch((err: unknown) => {
          if (isMissingFunction(err)) return null;
          throw err;
        }),
      ]);
      return { commissions, payments, summary };
    },
  });

  if (query.isPending) {
    return <div className="loading-state"><div className="spinner" /></div>;
  }

  const commissions: Commission[] = query.data?.commissions ?? [];
  const payments: CommissionPayment[] = query.data?.payments ?? [];
  const summary: MyCommissionsSummary | null = query.data?.summary ?? null;
  const pending = commissions.filter((c) => !c.pago_id);
  const byPayment = new Map<string, Commission[]>();
  for (const c of commissions) {
    if (c.pago_id) byPayment.set(c.pago_id, [...(byPayment.get(c.pago_id) ?? []), c]);
  }

  const methodLabel = (metodo: string) => {
    const key = `delivery.methods.${metodo}`;
    const label = t(key);
    return label === key ? metodo : label;
  };
  const what = (c: Commission) =>
    c.labor?.descripcion || (c.especialidad === 'pintura' ? t('workOrders.painting') : t('workOrders.mechanical'));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('myCommissions.title')}</h1>
          <p className="page-subtitle">{t('myCommissions.subtitle')}</p>
        </div>
      </div>

      {query.error && <AlertError message={getErrorMessage(query.error, language)} />}

      {summary && (
        <div className="stats-grid my-commissions-stats">
          <div className="stat-card">
            <div className="stat-icon warning"><Clock size={22} /></div>
            <div className="stat-content">
              <div className="stat-label">{t('myCommissions.toCollect')}</div>
              <div className="stat-value">{money(Number(summary.por_cobrar))}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon success"><Calendar size={22} /></div>
            <div className="stat-content">
              <div className="stat-label">{t('myCommissions.paidThisMonth')}</div>
              <div className="stat-value">{money(Number(summary.pagado_mes))}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon primary"><Wallet size={22} /></div>
            <div className="stat-content">
              <div className="stat-label">{t('myCommissions.paidTotal')}</div>
              <div className="stat-value">{money(Number(summary.pagado_total))}</div>
            </div>
          </div>
        </div>
      )}

      <section className="card" aria-labelledby="my-commissions-pending">
        <h2 className="card-title" id="my-commissions-pending">{t('myCommissions.pendingTitle')}</h2>
        <p className="field-hint">{t('myCommissions.pendingHint')}</p>
        {pending.length === 0 ? (
          <p className="my-commissions-empty">{t('myCommissions.nothingPending')}</p>
        ) : (
          <div className="table-container cards-on-mobile" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('workOrders.orderNumber')}</th>
                  <th>{t('myCommissions.job')}</th>
                  <th style={{ textAlign: 'right' }}>{t('payroll.rate')}</th>
                  <th style={{ textAlign: 'right' }}>{t('payroll.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((c) => (
                  <tr key={c.id}>
                    <td data-label={t('workOrders.orderNumber')}>
                      {c.orden ? <Link to={`/work-orders?open=${c.orden_id}`}>{c.orden.numero_orden}</Link> : '—'}
                    </td>
                    <td data-label={t('myCommissions.job')}>{what(c)}</td>
                    <td data-label={t('payroll.rate')} style={{ textAlign: 'right' }}>{Number(c.porcentaje)}%</td>
                    <td data-label={t('payroll.amount')} style={{ textAlign: 'right', fontWeight: 700 }}>{money(Number(c.monto))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="my-commissions-payments" style={{ marginTop: 'var(--space-4)' }}>
        <h2 className="card-title" id="my-commissions-payments">{t('myCommissions.paymentsTitle')}</h2>
        {payments.length === 0 ? (
          <p className="my-commissions-empty">{t('myCommissions.noPayments')}</p>
        ) : (
          <ul className="my-commissions-payments">
            {payments.map((p) => {
              const included = byPayment.get(p.id) ?? [];
              return (
                <li key={p.id} className="my-commissions-payment">
                  <div className="my-commissions-payment-head">
                    <span className="my-commissions-payment-date">
                      <CheckCircle2 size={14} aria-hidden="true" /> {p.fecha_pago}
                    </span>
                    <strong>{money(Number(p.monto))}</strong>
                  </div>
                  <div className="field-hint">
                    {methodLabel(p.metodo)}
                    {p.numero_cheque ? ` · ${t('payroll.chequeNumber')} ${p.numero_cheque}` : ''}
                    {p.notas ? ` · ${p.notas}` : ''}
                  </div>
                  {included.length > 0 && (
                    <ul className="my-commissions-included">
                      {included.map((c) => (
                        <li key={c.id}>
                          <span>{c.orden?.numero_orden ?? '—'} · {what(c)}</span>
                          <span>{money(Number(c.monto))}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
