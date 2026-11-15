import { Car, DollarSign, Fuel } from 'lucide-react';
import CollapsibleSection from '../../../../components/CollapsibleSection';
import { useLanguage } from '../../../../context/language.context';
import { money } from '../../../../lib/money';
import type { WorkOrder } from '../../../../types/database';
import type { SectionStateProps } from '../detailTypes';

interface VehicleSectionProps {
  order: WorkOrder;
  isAdmin: boolean;
  sectionProps: SectionStateProps;
  onEditInsurance: () => void;
}

export default function VehicleSection({
  order,
  isAdmin,
  sectionProps,
  onEditInsurance,
}: VehicleSectionProps) {
  const { t } = useLanguage();
  const vehicle = order.vehiculo;
  // Null para mecánicos y pintores: `orden_montos` es solo admin.
  const amounts = order.montos ?? null;

  return (
    <CollapsibleSection
      {...sectionProps}
      title={t('workOrders.vehicleInfo')}
      icon={<Car size={18} />}
      summary={vehicle?.placa || undefined}
    >
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
          <Car size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
          {t('workOrders.vehicleInfo')}
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
          {[
            [t('vehicles.brand'), `${vehicle?.marca} ${vehicle?.modelo}`],
            [t('vehicles.year'), vehicle?.anio],
            [t('vehicles.vin'), vehicle?.vin || '—'],
            [t('vehicles.plate'), vehicle?.placa],
            [t('vehicles.color'), vehicle?.color],
            [t('workOrders.milesIn'), order.millas_ingreso.toLocaleString()],
          ].map(([label, value], i) => (
            <div key={i} style={{ padding: 'var(--space-2) 0' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-2) 0',
            marginTop: 'var(--space-2)',
            borderTop: '1px solid var(--color-surface-border)',
          }}
        >
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 2 }}>
              {t('workOrders.insurance')}
            </div>
            <div style={{ fontWeight: 500 }}>
              {order.con_seguro
                ? `${t('common.yes')}${order.aseguradora || order.numero_reclamo ? ` (${[order.aseguradora, order.numero_reclamo ? `#${order.numero_reclamo}` : ''].filter(Boolean).join(' · ')})` : ''}`
                : t('common.no')}
            </div>
          </div>
          {isAdmin && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onEditInsurance}
              id="edit-insurance-btn"
            >
              {t('common.edit')}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Fuel size={16} style={{ color: 'var(--color-warning)' }} />
            <div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>{t('workOrders.fuelLevel')}</div>
              <div style={{ fontWeight: 600 }}>{order.nivel_gasolina}</div>
            </div>
          </div>
          {amounts && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <DollarSign size={16} style={{ color: 'var(--color-success)' }} />
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>{t('workOrders.deposit')}</div>
                <div style={{ fontWeight: 600 }}>{money(amounts.deposito_inicial)}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}
