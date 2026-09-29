import { AlertTriangle, Wallet } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { money } from '../../lib/money';
import type { CommissionEstimate, Specialty } from '../../types/database';

interface CommissionEstimateCardProps {
  estimate: CommissionEstimate;
  /** Administración ve el reparto entero; un técnico, lo suyo. */
  isAdmin: boolean;
  userId?: string;
  /** Nombre de cada asignado, para el reparto que ve administración. */
  names: Record<string, string>;
}

/**
 * La comisión de una orden, con la cuenta a la vista.
 *
 * Para un técnico es la única cifra de dinero que ve, y por qué la ve: su parte de la mano de
 * obra de SU especialidad (reunión con el taller, sept. 2026). Mostrar la cuenta — bolsa ×
 * porcentaje ÷ compañeros — es lo que evita la pregunta "¿de dónde sale este número?" el día
 * del pago.
 *
 * Para administración es el reparto: cuánto se lleva cada quien de cada bolsa, y el aviso de
 * una bolsa que nadie cobra (mano de obra de pintura sin pintor asignado).
 *
 * La cuenta la hace la base (`comisiones_estimadas`), la misma que devenga al entregar.
 */
export default function CommissionEstimateCard({ estimate, isAdmin, userId, names }: CommissionEstimateCardProps) {
  const { t } = useLanguage();
  const specialtyLabel = (s: Specialty) => (s === 'pintura' ? t('workOrders.painting') : t('workOrders.mechanical'));

  if (!isAdmin) {
    const mine = estimate.reparto.filter((r) => r.usuario_id === userId);
    if (mine.length === 0) return null;
    const salaried = mine.every((r) => r.esquema === 'salario');

    return (
      <div className="card commission-estimate" style={{ marginTop: 'var(--space-4)' }}>
        <div className="commission-estimate-row">
          <div>
            <h3 className="card-title">
              <Wallet size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
              {t('workOrders.estimatedCommission')}
            </h3>
            {salaried ? (
              <p className="field-hint" style={{ marginTop: 'var(--space-1)' }}>{t('commission.salaried')}</p>
            ) : (
              mine.map((r) => {
                const bolsa = estimate.bolsas.find((b) => b.especialidad === r.especialidad);
                return (
                  <p key={r.especialidad} className="field-hint" style={{ marginTop: 'var(--space-1)' }}>
                    {t('commission.detail')
                      .replace('{especialidad}', specialtyLabel(r.especialidad))
                      .replace('{labor}', money(bolsa?.base ?? 0))
                      .replace('{rate}', String(Number(r.porcentaje)))
                      .replace('{crew}', String(r.tecnicos))}
                  </p>
                );
              })
            )}
          </div>
          {!salaried && <div className="commission-estimate-amount">{money(Number(estimate.mi_total))}</div>}
        </div>
        <p className="field-hint" style={{ marginTop: 'var(--space-2)' }}>
          {t('workOrders.estimatedCommissionHint')}
        </p>
      </div>
    );
  }

  // Administración: una sección por bolsa, incluidas las especialidades con gente asignada y
  // sin mano de obra, para que se vea por qué alguien no cobra.
  const specialties = [...new Set([...estimate.bolsas.map((b) => b.especialidad), ...estimate.reparto.map((r) => r.especialidad)])];
  if (specialties.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 'var(--space-4)' }}>
      <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
        <Wallet size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
        {t('commission.splitTitle')}
      </h3>
      {specialties.map((esp) => {
        const bolsa = estimate.bolsas.find((b) => b.especialidad === esp);
        const people = estimate.reparto.filter((r) => r.especialidad === esp);
        return (
          <div key={esp} className="commission-split">
            <div className="commission-split-header">
              <strong>{specialtyLabel(esp)}</strong>
              <span>{t('commission.pool').replace('{monto}', money(bolsa?.base ?? 0))}</span>
            </div>
            {people.length === 0 ? (
              <p className="commission-split-warning" role="note">
                <AlertTriangle size={14} /> {t('commission.nobodyAssigned').replace('{especialidad}', specialtyLabel(esp).toLowerCase())}
              </p>
            ) : (
              <ul className="commission-split-list">
                {people.map((r) => (
                  <li key={r.usuario_id}>
                    <span>{names[r.usuario_id] ?? '—'}</span>
                    <span className="commission-split-rate">
                      {r.esquema === 'salario' ? t('commission.salaryStaysInShop') : `${Number(r.porcentaje)}%`}
                    </span>
                    <span className="commission-split-amount">{r.esquema === 'salario' ? '—' : money(Number(r.monto))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      <p className="field-hint" style={{ marginTop: 'var(--space-2)' }}>{t('commission.splitHint')}</p>
    </div>
  );
}
