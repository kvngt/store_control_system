import { Wallet } from 'lucide-react';
import { useLanguage } from '../../context/language.context';

interface CommissionEstimateCardProps {
  laborTotal: number;
  /** Porcentaje de comisión de la sede, 0-100. */
  rate: number;
  /** Técnicos distintos asignados a la orden. */
  crew: number;
  amount: number;
}

const money = (value: number) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * La única cifra de dinero que ve un técnico en una orden, y por qué la ve.
 *
 * El cliente lo pidió así: el mecánico no ve repuestos, totales ni depósito,
 * pero sí la mano de obra, porque su comisión es proporcional a ella. Mostrar
 * la cuenta completa — y no solo el resultado — es lo que evita la pregunta
 * "¿de dónde sale este número?" el día del pago.
 */
export default function CommissionEstimateCard({ laborTotal, rate, crew, amount }: CommissionEstimateCardProps) {
  const { t } = useLanguage();

  const detail = t('workOrders.estimatedCommissionDetail')
    .replace('{labor}', money(laborTotal))
    .replace('{rate}', String(rate))
    .replace('{crew}', String(crew));

  return (
    <div className="card commission-estimate" style={{ marginTop: 'var(--space-4)' }}>
      <div className="commission-estimate-row">
        <div>
          <h3 className="card-title">
            <Wallet size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {t('workOrders.estimatedCommission')}
          </h3>
          <p className="field-hint" style={{ marginTop: 'var(--space-1)' }}>{detail}</p>
        </div>
        <div className="commission-estimate-amount">{money(amount)}</div>
      </div>
      <p className="field-hint" style={{ marginTop: 'var(--space-2)' }}>
        {t('workOrders.estimatedCommissionHint')}
      </p>
    </div>
  );
}
