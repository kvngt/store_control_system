import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, UserCheck, Save } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { AlertError } from '../../components/AlertError';
import { parkingService } from '../../services/parking.service';
import { queryKeys } from '../../lib/queryClient';
import { getErrorMessage } from '../../lib/errors';
import { money } from '../../lib/money';
import type { WorkOrder } from '../../types/database';
import type { OrderParkingAdjustments } from '../../types/domain/parking.types';

interface ParkingCardProps {
  order: Pick<WorkOrder, 'id' | 'sede_id' | 'con_seguro'>;
}

export default function ParkingCard({ order }: ParkingCardProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const parkingQuery = useQuery({
    queryKey: queryKeys.orderParking(order.id),
    queryFn: () => parkingService.getOrderParking(order.id),
    staleTime: 0,
  });

  const parking = parkingQuery.data;

  // Form states for adjustments
  const [cobrar, setCobrar] = useState(true);
  const [tarifaManual, setTarifaManual] = useState('');
  const [inicioManual, setInicioManual] = useState('');
  const [diasExonerados, setDiasExonerados] = useState('0');
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Sync form state when parking data loads
  useEffect(() => {
    if (parking) {
      setCobrar(parking.cobrar);
      setTarifaManual(parking.tarifa_manual != null ? String(parking.tarifa_manual) : '');
      setInicioManual(parking.inicio_manual ?? '');
      setDiasExonerados(parking.dias_exonerados != null ? String(parking.dias_exonerados) : '0');
      setNota(parking.nota ?? '');
    }
  }, [parking]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const parsedTarifa = tarifaManual.trim() !== '' ? parseFloat(tarifaManual) : null;
      if (parsedTarifa != null && (isNaN(parsedTarifa) || parsedTarifa < 0)) {
        throw new Error(t('parking.errors.invalidManualRate'));
      }

      const parsedDias = diasExonerados.trim() !== '' ? parseInt(diasExonerados, 10) : 0;
      if (isNaN(parsedDias) || parsedDias < 0) {
        throw new Error(t('parking.errors.invalidWaivedDays'));
      }

      const adjustments: OrderParkingAdjustments = {
        cobrar,
        tarifa_manual: parsedTarifa,
        inicio_manual: inicioManual.trim() || null,
        dias_exonerados: parsedDias,
        nota: nota.trim() || null,
      };

      await parkingService.adjustOrderParking(order.id, adjustments);
      showToast('success', t('parking.orderCard.adjustmentsSaved'));

      // Invalidate relevant queries
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.orderParking(order.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workOrderDetail(order.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.orderBalance(order.id) }),
      ]);
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setSaving(false);
    }
  };

  if (parkingQuery.isPending) {
    return (
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <div className="loading-state">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  if (parkingQuery.error || !parking) {
    return (
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <AlertError message={getErrorMessage(parkingQuery.error, language)} />
      </div>
    );
  }

  // Format status text
  const formatStatus = () => {
    switch (parking.estado) {
      case 'inactivo':
        return t('parking.states.inactivo');
      case 'esperando':
        return t('parking.states.esperando');
      case 'por_empezar':
        return t('parking.states.por_empezar').replace('{date}', parking.inicio_cobro ?? '—');
      case 'orden_previa':
        return t('parking.states.orden_previa');
      case 'sin_cobro':
        return t('parking.states.sin_cobro');
      case 'acumulando':
        return t('parking.states.acumulando').replace('{date}', parking.inicio_cobro ?? '—');
      case 'cerrado':
        return t('parking.states.cerrado');
      default:
        return parking.estado;
    }
  };

  const isAccumulating = parking.estado === 'acumulando' || parking.estado === 'cerrado';

  return (
    <div className="card parking-order-card" style={{ padding: 'var(--space-4)' }}>
      {/* Resumen del cálculo actual */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-4)',
          paddingBottom: 'var(--space-4)',
          borderBottom: '1px solid var(--color-surface-border)',
        }}
      >
        <div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            {t('parking.orderCard.profile')}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-1)', fontWeight: 600 }}>
            {parking.perfil === 'seguro' ? (
              <>
                <ShieldCheck size={16} style={{ color: 'var(--color-primary)' }} />
                <span>{t('parking.insuranceProfile')}</span>
              </>
            ) : parking.perfil === 'particular' ? (
              <>
                <UserCheck size={16} style={{ color: 'var(--color-info)' }} />
                <span>{t('parking.privateProfile')}</span>
              </>
            ) : (
              <span>—</span>
            )}
          </div>
        </div>

        <div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            {t('parking.orderCard.status')}
          </span>
          <div style={{ marginTop: 'var(--space-1)', fontWeight: 600 }}>
            <span
              className={`badge ${
                isAccumulating ? 'badge-finalizado' : parking.estado === 'por_empezar' ? 'badge-warn' : 'badge-neutral'
              }`}
            >
              {formatStatus()}
            </span>
          </div>
        </div>

        <div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            {t('parking.orderCard.daysCharged')}
          </span>
          <div style={{ marginTop: 'var(--space-1)', fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>
            {parking.dias_cobrados} {t('parking.orderCard.days')}
          </div>
        </div>

        <div>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            {t('parking.orderCard.amount')}
          </span>
          <div style={{ marginTop: 'var(--space-1)', fontSize: 'var(--font-size-lg)', fontWeight: 700, color: 'var(--color-primary)' }}>
            {money(parking.monto)}
            {parking.tope_aplicado && (
              <span
                className="badge badge-warn"
                style={{ marginLeft: 'var(--space-2)', fontSize: 'var(--font-size-xs)', verticalAlign: 'middle' }}
              >
                {t('parking.orderCard.capApplied')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Desglose por tramos si hay cobro */}
      {parking.detalle && parking.detalle.length > 0 && parking.dias_cobrados > 0 && (
        <div style={{ marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--color-surface-border)' }}>
          <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-2)' }}>
            {t('parking.orderCard.breakdown')}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
            {parking.detalle.map((tier, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-secondary)',
                  padding: 'var(--space-1) var(--space-2)',
                  background: 'var(--color-bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <span>
                  {tier.desde_dia === tier.hasta_dia
                    ? `Día ${tier.desde_dia}`
                    : `Días ${tier.desde_dia}–${tier.hasta_dia}`}{' '}
                  ({tier.dias} {t('parking.orderCard.days')} × {money(tier.tarifa)})
                </span>
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {money(tier.subtotal)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formulario de Ajustes Administrativos */}
      <form onSubmit={handleSave}>
        <h4 style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
          {t('parking.orderCard.adjustments')}
        </h4>

        {error && <AlertError message={error} />}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={cobrar}
              onChange={(e) => setCobrar(e.target.checked)}
              disabled={saving}
            />
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
              {t('parking.orderCard.chargeThisOrder')}
            </span>
          </label>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 'var(--space-3)',
            }}
          >
            <div className="form-group">
              <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
                {t('parking.orderCard.manualRate')}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                placeholder={t('parking.orderCard.manualRateAuto')}
                aria-label={t('parking.orderCard.manualRate')}
                value={tarifaManual}
                onChange={(e) => setTarifaManual(e.target.value)}
                disabled={saving || !cobrar}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
                {t('parking.orderCard.manualStart')}
              </label>
              <input
                type="date"
                aria-label={t('parking.orderCard.manualStart')}
                className="form-input"
                value={inicioManual}
                onChange={(e) => setInicioManual(e.target.value)}
                disabled={saving || !cobrar}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
                {t('parking.orderCard.waivedDays')}
              </label>
              <input
                type="number"
                min="0"
                aria-label={t('parking.orderCard.waivedDays')}
                className="form-input"
                value={diasExonerados}
                onChange={(e) => setDiasExonerados(e.target.value)}
                disabled={saving || !cobrar}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
              {t('parking.orderCard.note')}
            </label>
            <input
              type="text"
              className="form-input"
              placeholder={t('parking.orderCard.notePlaceholder')}
              aria-label={t('parking.orderCard.note')}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              disabled={saving}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={saving}
            >
              <Save size={14} style={{ marginRight: 'var(--space-1)' }} />
              {saving ? t('common.loading') : t('parking.orderCard.saveAdjustments')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
