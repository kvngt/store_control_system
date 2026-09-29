import { useQuery } from '@tanstack/react-query';
import { Scale } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { financeService } from '../../services/supabaseService';
import { queryKeys } from '../../lib/queryClient';
import { money, moneySigned } from '../../lib/money';
import { getErrorMessage } from '../../lib/errors';

/**
 * Cuánto dejó una orden entregada (reunión con el taller, sept. 2026): lo cobrado, menos el
 * costo de repuestos, menos las comisiones que generó. Solo administración.
 *
 * La cuenta es de la base (`balance_orden`). Las comisiones son las devengadas, estén pagadas
 * o no: el margen de un trabajo no cambia el día que se firma el cheque. Una compra del banco
 * o un movimiento a mano vinculados a la orden se listan aparte, sin restarlos, porque el
 * costo de las piezas ya está en las líneas.
 */
export default function OrderBalanceCard({ orderId }: { orderId: string }) {
  const { t, language } = useLanguage();
  const query = useQuery({
    queryKey: queryKeys.orderFinancialBalance(orderId),
    queryFn: () => financeService.getOrderBalance(orderId),
  });
  const b = query.data;

  return (
    <div className="card" style={{ marginTop: 'var(--space-4)' }}>
      <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
        <Scale size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
        {t('orderBalance.title')}
      </h3>
      {query.isPending ? (
        <div className="spinner-small" />
      ) : query.error || !b ? (
        <p className="field-hint">{getErrorMessage(query.error, language)}</p>
      ) : (
        <>
          <dl className="delivery-balance">
            <div className="delivery-balance-row">
              <dt>{t('orderBalance.collected')}</dt>
              <dd>{money(Number(b.cobrado))}</dd>
            </div>
            <div className="delivery-balance-row">
              <dt>{t('orderBalance.parts')}</dt>
              <dd>{moneySigned(Number(b.costo_repuestos), false)}</dd>
            </div>
            <div className="delivery-balance-row">
              <dt>
                {t('orderBalance.commissions')}
                {Number(b.comisiones_pagadas) > 0 && (
                  <span className="order-balance-note">
                    {' '}· {t('orderBalance.paidOf').replace('{monto}', money(Number(b.comisiones_pagadas)))}
                  </span>
                )}
              </dt>
              <dd>{moneySigned(Number(b.comisiones), false)}</dd>
            </div>
            <div className={'delivery-balance-row is-result' + (Number(b.margen) < 0 ? ' is-refund' : '')}>
              <dt>{t('orderBalance.margin')}</dt>
              <dd>{money(Number(b.margen))}</dd>
            </div>
          </dl>
          {b.otros.length > 0 && (
            <>
              <p className="field-hint">{t('orderBalance.othersHint')}</p>
              <ul className="order-balance-others">
                {b.otros.map((o) => (
                  <li key={o.id}>
                    <span>{o.descripcion}</span>
                    <span className="order-balance-note">{o.fecha}{o.importado ? ` · ${t('orderBalance.fromBank')}` : ''}</span>
                    <span>{moneySigned(Number(o.monto), o.tipo === 'ingreso')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
