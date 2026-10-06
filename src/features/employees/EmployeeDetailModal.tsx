import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, MessageSquare, UserCog } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { AlertError } from '../../components/AlertError';
import { employeesService } from '../../services/employees.service';
import { queryKeys } from '../../lib/queryClient';
import { getErrorMessage } from '../../lib/errors';
import { money } from '../../lib/money';
import type { PayKind, PayScheme, SalaryPeriod, Sede, UserProfile } from '../../types/database';

interface EmployeeDetailModalProps {
  employee: UserProfile;
  sede?: Sede;
  /** Su fila en `perfiles_pago`; ausente = comisión al porcentaje de la sede. */
  scheme?: PayScheme;
  onClose: () => void;
}

const PERIODS: SalaryPeriod[] = ['semanal', 'quincenal', 'mensual'];

/**
 * Un empleado: cómo se le paga, cuánto se le debe y qué ha hecho últimamente.
 *
 * La reunión con el taller (sept. 2026) pidió comisiones flexibles por persona y una sección
 * donde ver a cada empleado. El porcentaje vacío es "el de la sede", no cero: así un cambio
 * del porcentaje del taller le sigue llegando a quien no tiene uno propio.
 */
export default function EmployeeDetailModal({ employee, sede, scheme, onClose }: EmployeeDetailModalProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [esquema, setEsquema] = useState<PayKind>(scheme?.esquema ?? 'comision');
  const [porcentaje, setPorcentaje] = useState(scheme?.comision_porcentaje != null ? String(scheme.comision_porcentaje) : '');
  const [salario, setSalario] = useState(scheme?.salario_monto != null ? String(scheme.salario_monto) : '');
  const [periodo, setPeriodo] = useState<SalaryPeriod>(scheme?.salario_periodo ?? 'quincenal');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const summaryQuery = useQuery({
    queryKey: queryKeys.employeeSummary(employee.id),
    queryFn: () => employeesService.getSummary(employee.id),
  });
  const recentQuery = useQuery({
    queryKey: queryKeys.employeeRecent(employee.id),
    queryFn: async () => {
      const [asignaciones, avances] = await Promise.all([
        employeesService.getRecentAssignments(employee.id),
        employeesService.getRecentProgress(employee.id),
      ]);
      return { asignaciones, avances };
    },
  });
  const summary = summaryQuery.data;
  const sedeRate = sede?.comision_porcentaje ?? 0;

  const save = async () => {
    const rate = porcentaje.trim() === '' ? null : Number(porcentaje);
    if ((esquema === 'comision' || esquema === 'mixto') && rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
      setError(t('employees.rateInvalid'));
      return;
    }
    const amount = salario.trim() === '' ? null : Number(salario);
    if ((esquema === 'salario' || esquema === 'mixto') && amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      setError(t('employees.salaryInvalid'));
      return;
    }
    // Pasar a salario recalcula lo pendiente, y a un asalariado no le toca comisión: lo que
    // se le debía deja de contar. Se dice con el monto antes de hacerlo.
    const pending = Number(summary?.comisiones_pendientes ?? 0);
    const wasCommission = (scheme?.esquema ?? 'comision') === 'comision' || scheme?.esquema === 'mixto';
    if (esquema === 'salario' && wasCommission && pending > 0 &&
        !confirm(t('employees.confirmSalary').replace('{monto}', money(pending)))) {
      return;
    }

    setError('');
    setSaving(true);
    try {
      await employeesService.savePayScheme({
        usuario_id: employee.id,
        esquema,
        comision_porcentaje: esquema === 'comision' || esquema === 'mixto' ? rate : null,
        salario_monto: esquema === 'salario' || esquema === 'mixto' ? amount : null,
        salario_periodo: esquema === 'salario' || esquema === 'mixto' ? periodo : null,
      });
      // Lo pendiente se recalculó en la base: Comisiones y el resumen cambian.
      void queryClient.invalidateQueries({ queryKey: queryKeys.paySchemes() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.employeeSummary(employee.id) });
      void queryClient.invalidateQueries({ queryKey: ['commissions'] });
      showToast('success', t('employees.saved'));
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setSaving(false);
    }
  };

  const openOrder = (orderId: string) => navigate(`/work-orders?open=${orderId}`);
  const statusLabels: Record<string, string> = {
    recepcion: t('workOrders.intake'),
    en_proceso: t('workOrders.inProgress'),
    espera_autorizacion: t('workOrders.waitingAuthorization'),
    finalizado: t('workOrders.completed'),
    entregado: t('workOrders.delivered'),
  };

  return (
    <div className="modal-overlay" onClick={saving ? undefined : onClose}>
      <div
        className="modal"
        style={{ maxWidth: 640 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={employee.nombre_completo}
      >
        <div className="modal-header">
          <h2 className="modal-title">
            <UserCog size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {employee.nombre_completo}
          </h2>
        </div>

        <div className="modal-body">
          <AlertError message={error} />

          {/* Lo que se le debe y lo que ha trabajado. Las sumas vienen de la base. */}
          <div className="employee-summary">
            <div>
              <span className="employee-summary-label">{t('employees.pending')}</span>
              <strong>{summary ? money(Number(summary.comisiones_pendientes)) : '—'}</strong>
            </div>
            <div>
              <span className="employee-summary-label">{t('employees.paid')}</span>
              <strong>{summary ? money(Number(summary.comisiones_pagadas)) : '—'}</strong>
            </div>
            <div>
              <span className="employee-summary-label">{t('employees.activeOrders')}</span>
              <strong>{summary?.ordenes_activas ?? '—'}</strong>
            </div>
            <div>
              <span className="employee-summary-label">{t('employees.deliveredOrders')}</span>
              <strong>{summary?.ordenes_entregadas ?? '—'}</strong>
            </div>
          </div>

          <fieldset className="employee-pay">
            <legend className="form-label">{t('employees.payScheme')}</legend>
            <div className="employee-pay-kinds" role="radiogroup">
              {(['comision', 'salario', 'mixto'] as PayKind[]).map((kind) => (
                <label key={kind} className={'employee-pay-kind' + (esquema === kind ? ' is-selected' : '')}>
                  <input
                    type="radio"
                    name="esquema"
                    value={kind}
                    checked={esquema === kind}
                    onChange={() => setEsquema(kind)}
                    disabled={saving}
                  />
                  {t('employees.kind.' + kind)}
                </label>
              ))}
            </div>

            {esquema === 'comision' || esquema === 'mixto' ? (
              <div className="form-group" style={{ marginBottom: esquema === 'mixto' ? 'var(--space-4)' : undefined }}>
                <label className="form-label" htmlFor="employee-rate">{t('employees.rate')}</label>
                <input
                  id="employee-rate"
                  className="form-input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="0.5"
                  placeholder={String(sedeRate)}
                  value={porcentaje}
                  onChange={(e) => setPorcentaje(e.target.value)}
                  disabled={saving}
                />
                <p className="field-hint">{t('employees.rateHint').replace('{rate}', String(sedeRate))}</p>
              </div>
            ) : null}
            {esquema === 'salario' || esquema === 'mixto' ? (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="employee-salary">{t('employees.salary')}</label>
                  <input
                    id="employee-salary"
                    className="form-input"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={salario}
                    onChange={(e) => setSalario(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="employee-period">{t('employees.period')}</label>
                  <select
                    id="employee-period"
                    className="form-input form-select"
                    value={periodo}
                    onChange={(e) => setPeriodo(e.target.value as SalaryPeriod)}
                    disabled={saving}
                  >
                    {PERIODS.map((p) => (
                      <option key={p} value={p}>{t('employees.periods.' + p)}</option>
                    ))}
                  </select>
                </div>
              </div>
            ) : null}
            <p className="field-hint">{esquema === 'salario' ? t('employees.salaryHint') : esquema === 'mixto' ? t('employees.mixedHint') : t('employees.recalcHint')}</p>
          </fieldset>

          <h3 className="employee-section-title">
            <ClipboardList size={16} /> {t('employees.recentOrders')}
          </h3>
          {recentQuery.isPending ? (
            <div className="spinner-small" />
          ) : (recentQuery.data?.asignaciones.length ?? 0) === 0 ? (
            <p className="field-hint">{t('employees.noOrders')}</p>
          ) : (
            <ul className="employee-recent">
              {recentQuery.data!.asignaciones.map((a) => (
                <li key={`${a.orden_id}-${a.tipo_tarea}`}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openOrder(a.orden_id)}>
                    {a.orden?.numero_orden ?? '—'}
                  </button>
                  <span>{a.tipo_tarea === 'pintura' ? t('workOrders.painting') : t('workOrders.mechanical')}</span>
                  <span className="employee-recent-meta">{a.orden ? statusLabels[a.orden.estatus] ?? a.orden.estatus : ''}</span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="employee-section-title">
            <MessageSquare size={16} /> {t('employees.recentProgress')}
          </h3>
          {recentQuery.isPending ? (
            <div className="spinner-small" />
          ) : (recentQuery.data?.avances.length ?? 0) === 0 ? (
            <p className="field-hint">{t('employees.noProgress')}</p>
          ) : (
            <ul className="employee-recent">
              {recentQuery.data!.avances.map((a) => (
                <li key={a.id}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => openOrder(a.orden_id)}>
                    {a.orden?.numero_orden ?? '—'}
                  </button>
                  <span className="employee-recent-text">{a.descripcion}</span>
                  <span className="employee-recent-meta">{new Date(a.creado_en).toLocaleDateString(language === 'es' ? 'es' : 'en')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            {t('common.close')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving} id="employee-save">
            {saving ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
