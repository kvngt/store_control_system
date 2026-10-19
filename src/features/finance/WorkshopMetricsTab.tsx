import { useState, useMemo, useEffect } from 'react';
import { useLanguage } from '../../context/language.context';
import { useAuth } from '../../context/auth.context';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryClient';
import { metricsService } from '../../services/supabaseService';
import { money } from '../../lib/money';
import {
  currentMonthRangeLocal,
  previousMonthRangeLocal,
  last30DaysRangeLocal,
} from '../../lib/dates';
import { AlertError } from '../../components/AlertError';
import { getErrorMessage } from '../../lib/errors';
import type { WorkshopMetrics } from '../../types/database';

export interface WorkshopMetricsTabProps {
  sedeId?: string;
}

type PeriodPreset = 'este_mes' | 'mes_pasado' | 'ultimos_30' | 'custom';

export default function WorkshopMetricsTab({ sedeId }: WorkshopMetricsTabProps) {
  const { t, language } = useLanguage();
  const { user, currentSede, allSedes } = useAuth();

  const [selectedSedeId, setSelectedSedeId] = useState<string>(
    sedeId || currentSede?.id || (allSedes && allSedes[0]?.id) || ''
  );

  useEffect(() => {
    if (sedeId) {
      setSelectedSedeId(sedeId);
    }
  }, [sedeId]);

  const [preset, setPreset] = useState<PeriodPreset>('este_mes');
  const [initDesde, initHasta] = useMemo(() => currentMonthRangeLocal(), []);
  const [customDesde, setCustomDesde] = useState<string>(initDesde);
  const [customHasta, setCustomHasta] = useState<string>(initHasta);

  const [desde, hasta] = useMemo(() => {
    switch (preset) {
      case 'este_mes':
        return currentMonthRangeLocal();
      case 'mes_pasado':
        return previousMonthRangeLocal();
      case 'ultimos_30':
        return last30DaysRangeLocal();
      case 'custom':
        return [customDesde, customHasta];
    }
  }, [preset, customDesde, customHasta]);

  const metricsQuery = useQuery({
    queryKey: queryKeys.workshopMetrics(selectedSedeId, desde, hasta),
    queryFn: () => metricsService.getWorkshopMetrics(selectedSedeId, desde, hasta),
    enabled: !!selectedSedeId && !!desde && !!hasta,
  });

  const metrics: WorkshopMetrics | null = metricsQuery.data ?? null;
  const loading = metricsQuery.isPending;
  const error = metricsQuery.error ? getErrorMessage(metricsQuery.error, language) : '';

  const formatPercent = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return '—';
    return new Intl.NumberFormat(language === 'es' ? 'es-US' : 'en-US', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(val);
  };

  const formatMoney = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return '—';
    return money(val);
  };

  const formatNumber = (val: number | null | undefined, unit?: string): string => {
    if (val === null || val === undefined) return '—';
    const formatted = new Intl.NumberFormat(language === 'es' ? 'es-US' : 'en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(val);
    return unit ? `${formatted} ${unit}` : formatted;
  };

  const kpis = [
    {
      id: 'carsDelivered',
      label: t('metrics.deliveredCars'),
      value: formatNumber(metrics?.carros_entregados),
      subtext: null,
      hint: t('metrics.deliveredCarsHelp'),
    },
    {
      id: 'averageTicket',
      label: t('metrics.averageTicket'),
      value: formatMoney(metrics?.ticket_promedio),
      subtext: null,
      hint: t('metrics.averageTicketHelp'),
    },
    {
      id: 'effectiveRate',
      label: t('metrics.effectiveRate'),
      value: formatMoney(metrics?.tarifa_efectiva),
      subtext: metrics?.tarifa_hora_sede
        ? t('metrics.rateReference').replace('{rate}', money(metrics.tarifa_hora_sede))
        : null,
      hint: t('metrics.effectiveRateHelp'),
    },
    {
      id: 'hoursPerOrder',
      label: t('metrics.hoursPerOrder'),
      value: formatNumber(metrics?.horas_por_orden, 'h'),
      subtext: null,
      hint: t('metrics.hoursPerOrderHelp'),
    },
    {
      id: 'laborMargin',
      label: t('metrics.laborMargin'),
      value: formatPercent(metrics?.margen_mano_obra),
      subtext: null,
      hint: t('metrics.laborMarginHelp'),
    },
    {
      id: 'partsMargin',
      label: t('metrics.partsMargin'),
      value: formatPercent(metrics?.margen_repuestos),
      subtext: null,
      hint: t('metrics.partsMarginHelp'),
    },
    {
      id: 'budgetApprovalRate',
      label: t('metrics.quoteApproval'),
      value: formatPercent(metrics?.aprobacion_presupuestos),
      subtext: null,
      hint: t('metrics.quoteApprovalHelp'),
    },
    {
      id: 'averageDaysInShop',
      label: t('metrics.daysInShop'),
      value: formatNumber(metrics?.dias_promedio_en_taller, t('metrics.daysUnit')),
      subtext: null,
      hint: t('metrics.daysInShopHelp'),
    },
  ];

  return (
    <div className="workshop-metrics-tab">
      {/* Toolbar: Sede picker & Period presets */}
      <div className="metrics-toolbar">
        {user?.rol === 'admin' && allSedes && allSedes.length > 1 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <label htmlFor="metrics-sede-select" className="form-label" style={{ margin: 0 }}>
              Sede:
            </label>
            <select
              id="metrics-sede-select"
              className="form-input form-select"
              value={selectedSedeId}
              onChange={(e) => setSelectedSedeId(e.target.value)}
              style={{ width: 'auto', minWidth: 180 }}
            >
              {allSedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div />
        )}

        <div className="metrics-presets" role="group" aria-label={t('metrics.period')}>
          <button
            type="button"
            className={`btn btn-sm ${preset === 'este_mes' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPreset('este_mes')}
            aria-pressed={preset === 'este_mes'}
          >
            {t('metrics.thisMonth')}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${preset === 'mes_pasado' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPreset('mes_pasado')}
            aria-pressed={preset === 'mes_pasado'}
          >
            {t('metrics.lastMonth')}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${preset === 'ultimos_30' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPreset('ultimos_30')}
            aria-pressed={preset === 'ultimos_30'}
          >
            {t('metrics.last30Days')}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${preset === 'custom' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPreset('custom')}
            aria-pressed={preset === 'custom'}
          >
            {t('metrics.customRange')}
          </button>
        </div>
      </div>

      {preset === 'custom' && (
        <div className="metrics-custom-range" style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <label htmlFor="metrics-desde" className="form-label" style={{ margin: 0 }}>
              {t('metrics.from')}:
            </label>
            <input
              type="date"
              id="metrics-desde"
              className="form-input"
              value={customDesde}
              onChange={(e) => setCustomDesde(e.target.value)}
              style={{ width: 'auto' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <label htmlFor="metrics-hasta" className="form-label" style={{ margin: 0 }}>
              {t('metrics.to')}:
            </label>
            <input
              type="date"
              id="metrics-hasta"
              className="form-input"
              value={customHasta}
              onChange={(e) => setCustomHasta(e.target.value)}
              style={{ width: 'auto' }}
            />
          </div>
        </div>
      )}

      {error && <AlertError message={error} />}

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
        </div>
      ) : (
        <>
          {/* 8 KPI Cards: 2 cols on mobile, 4 on desktop */}
          <div className="metrics-grid">
            {kpis.map((kpi) => (
              <div
                key={kpi.id}
                className="metric-card animate-fade-in-up"
                title={kpi.hint}
                data-testid={`metric-card-${kpi.id}`}
              >
                <div className="metric-card-header">
                  <span className="metric-card-label">{kpi.label}</span>
                </div>
                <div>
                  <div className="metric-card-value">{kpi.value}</div>
                  {kpi.subtext && <div className="metric-card-subtext">{kpi.subtext}</div>}
                </div>
                <div className="metric-card-hint">{kpi.hint}</div>
              </div>
            ))}
          </div>

          {/* Breakdown by Technician */}
          <div className="card" style={{ marginTop: 'var(--space-4)' }}>
            <div className="card-header">
              <h3 className="card-title">{t('metrics.technicianTableTitle')}</h3>
            </div>
            <div className="table-responsive">
              <table className="table cards-on-mobile">
                <thead>
                  <tr>
                    <th>{t('metrics.technician')}</th>
                    <th>{t('metrics.billedHours')}</th>
                    <th>{t('metrics.clockHours')}</th>
                    <th>{t('metrics.efficiency')}</th>
                    <th>{t('metrics.completedTasks')}</th>
                  </tr>
                </thead>
                <tbody>
                  {!metrics?.por_tecnico || metrics.por_tecnico.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="orders-section-empty"
                        style={{ textAlign: 'center', padding: 'var(--space-4)' }}
                      >
                        {t('metrics.noTechnicians')}
                      </td>
                    </tr>
                  ) : (
                    metrics.por_tecnico.map((tech) => (
                      <tr key={tech.usuario_id}>
                        <td data-label={t('metrics.technician')}>
                          <strong>{tech.nombre}</strong>
                        </td>
                        <td data-label={t('metrics.billedHours')}>
                          {formatNumber(tech.horas_facturadas, 'h')}
                        </td>
                        <td data-label={t('metrics.clockHours')}>
                          {formatNumber(tech.horas_reloj, 'h')}
                        </td>
                        <td data-label={t('metrics.efficiency')}>
                          {formatPercent(tech.eficiencia)}
                        </td>
                        <td data-label={t('metrics.completedTasks')}>
                          {tech.tareas_completadas ?? 0}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
