import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CarFront } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { AlertError } from '../../components/AlertError';
import { workOrdersService } from '../../services/supabaseService';
import { queryKeys } from '../../lib/queryClient';
import { getErrorMessage } from '../../lib/errors';
import { money } from '../../lib/money';
import type { PaymentMethod, WorkOrder } from '../../types/database';
import PaymentFields from './PaymentFields';

/** Una línea autorizada de la orden: lo que se puede marcar como hecho y cobrado. */
export interface WithdrawalLine {
  id: string;
  tipo: 'mano_obra' | 'repuesto';
  descripcion: string;
  monto: number;
  /** Una tarea ya marcada como hecha: arranca marcada en "algunos trabajos". */
  hecho?: boolean;
}

type Outcome = 'cancelar' | 'revision' | 'parcial';

interface WithdrawalModalProps {
  order: Pick<WorkOrder, 'id' | 'numero_orden' | 'sede_id'>;
  /** Lo autorizado de la orden. */
  lines: WithdrawalLine[];
  onCancel: () => void;
  onDone: () => void | Promise<void>;
}

/** Menos de un centavo es cero: la misma tolerancia que usa la base. */
const CENT = 0.01;

/**
 * "Retirada sin reparar": el cliente se lleva el vehículo sin que se haga todo el trabajo.
 * Administración dice qué pasó (pedido del taller, 05/10/2026):
 *
 * - **Se canceló todo**: no se cobra nada y se le devuelve lo que dejó.
 * - **Solo la revisión**: se cobra la revisión del vehículo.
 * - **Algunos trabajos**: se cobran los que sí se hicieron (su técnico cobra su comisión) y,
 *   si se quiere, la revisión; el resto no se cobra.
 *
 * Lo que no se cobra pasa a "no realizado" y queda como pendiente del vehículo para ofrecerlo en
 * la próxima visita. La diferencia con lo que dejó el cliente se devuelve o se cobra con su
 * método. Todo lo hace la base en una transacción (`retirar_sin_reparar`), y la cuenta también
 * (`saldo_retiro`).
 */
export default function WithdrawalModal({ order, lines, onCancel, onDone }: WithdrawalModalProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const [outcome, setOutcome] = useState<Outcome>('cancelar');
  const [kept, setKept] = useState<Set<string>>(() => new Set(lines.filter((l) => l.hecho).map((l) => l.id)));
  const [concepto, setConcepto] = useState(t('withdrawal.defaultConcept'));
  const [cobroText, setCobroText] = useState('');
  const [cobro, setCobro] = useState(0);
  const [metodo, setMetodo] = useState<PaymentMethod | ''>('');
  const [numeroCheque, setNumeroCheque] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // La cuenta se pide al dejar de escribir, no en cada tecla.
  useEffect(() => {
    const parsed = parseFloat(cobroText);
    const value = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) / 100 : 0;
    const timer = setTimeout(() => setCobro(value), 300);
    return () => clearTimeout(timer);
  }, [cobroText]);

  // Lo que viaja a la base según la salida elegida.
  const conservar = useMemo(
    () => (outcome === 'parcial' ? lines.filter((l) => kept.has(l.id)).map((l) => l.id) : []),
    [outcome, lines, kept]
  );
  const extra = outcome === 'cancelar' ? 0 : cobro;

  const balanceQuery = useQuery({
    queryKey: [...queryKeys.orderBalance(order.id), 'retiro', extra, [...conservar].sort().join(',')],
    queryFn: () => workOrdersService.getWithdrawalBalance(order.id, extra, conservar),
    staleTime: 0,
  });
  const balance = balanceQuery.data;
  const saldo = balance?.saldo ?? 0;
  const collects = saldo > CENT;
  const refunds = saldo < -CENT;
  const needsMethod = collects || refunds;

  const toggle = (id: string) =>
    setKept((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const submit = async () => {
    if (!balance) return;
    if (outcome === 'revision' && extra <= 0) {
      setError(t('withdrawal.chargeRequired'));
      return;
    }
    if (outcome === 'parcial' && conservar.length === 0) {
      setError(t('withdrawal.pickJobs'));
      return;
    }
    if (needsMethod && !metodo) {
      setError(t('delivery.methodRequired'));
      return;
    }
    if (metodo === 'cheque' && !numeroCheque.trim() && !file) {
      setError(t('delivery.checkRequired'));
      return;
    }
    if (!confirm(t('withdrawal.confirm'))) return;
    setError('');
    setSaving(true);
    let uploaded: string | null = null;
    try {
      if (needsMethod && file) {
        uploaded = await workOrdersService.uploadReceipt(order.sede_id, order.numero_orden, file);
      }
      await workOrdersService.withdrawWithoutRepair({
        orderId: order.id,
        cobro: extra,
        concepto: extra > 0 ? concepto.trim() || null : null,
        metodo: needsMethod ? (metodo as PaymentMethod) : null,
        numeroCheque: needsMethod && metodo === 'cheque' ? numeroCheque.trim() || null : null,
        comprobanteRuta: uploaded,
        conservar,
      });
      showToast('success', t('withdrawal.done'));
      await onDone();
    } catch (err) {
      if (uploaded) void workOrdersService.removeDeliveryReceipt(uploaded).catch(() => {});
      setError(getErrorMessage(err, language));
      setSaving(false);
    }
  };

  // La cuenta mostrada tiene que ser la de lo que está elegido ahora mismo.
  const settling = !balance || balance.revision !== extra;
  const confirmLabel = collects
    ? t('withdrawal.collect').replace('{monto}', money(saldo))
    : refunds
      ? t('withdrawal.refund').replace('{monto}', money(-saldo))
      : t('withdrawal.submit');

  const OUTCOMES: Outcome[] = ['cancelar', 'revision', 'parcial'];

  return (
    <div className="modal-overlay" onClick={saving ? undefined : onCancel}>
      <div
        className="modal"
        style={{ maxWidth: 560 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('withdrawal.title').replace('{numero}', order.numero_orden)}
      >
        <div className="modal-header">
          <h2 className="modal-title">
            <CarFront size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {t('withdrawal.title').replace('{numero}', order.numero_orden)}
          </h2>
        </div>

        <div className="modal-body">
          <AlertError message={error} />

          <fieldset className="withdrawal-outcomes">
            <legend className="form-label">{t('withdrawal.whatHappened')}</legend>
            {OUTCOMES.map((o) => (
              <label key={o} className={`withdrawal-outcome${outcome === o ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="withdrawal-outcome"
                  value={o}
                  checked={outcome === o}
                  onChange={() => {
                    setOutcome(o);
                    setError('');
                  }}
                  disabled={saving}
                />
                <span>
                  <strong>{t(`withdrawal.outcome.${o}`)}</strong>
                  <span className="field-hint">{t(`withdrawal.outcomeHint.${o}`)}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {outcome === 'parcial' && (
            <fieldset className="withdrawal-jobs">
              <legend className="form-label">{t('withdrawal.jobsDone')}</legend>
              {lines.length === 0 ? (
                <p className="field-hint">{t('withdrawal.noAuthorizedJobs')}</p>
              ) : (
                lines.map((l) => (
                  <label key={l.id} className="withdrawal-job">
                    <input type="checkbox" checked={kept.has(l.id)} onChange={() => toggle(l.id)} disabled={saving} />
                    <span className="withdrawal-job-desc">
                      {l.descripcion}
                      <span className="field-hint"> · {l.tipo === 'mano_obra' ? t('workOrders.labor') : t('workOrders.parts')}</span>
                    </span>
                    <span className="withdrawal-job-amount">{money(l.monto)}</span>
                  </label>
                ))
              )}
            </fieldset>
          )}

          {outcome !== 'cancelar' && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="withdrawal-concept">{t('withdrawal.concept')}</label>
                <input
                  id="withdrawal-concept"
                  className="form-input"
                  value={concepto}
                  onChange={(e) => setConcepto(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="withdrawal-charge">
                  {outcome === 'revision' ? t('withdrawal.charge') : t('withdrawal.chargeOptional')}
                </label>
                <input
                  id="withdrawal-charge"
                  className="form-input"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={cobroText}
                  onChange={(e) => setCobroText(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
          )}

          {balanceQuery.error ? (
            <AlertError message={t('delivery.balanceError')} />
          ) : !balance ? (
            <div className="loading-state"><div className="spinner" /></div>
          ) : (
            <>
              <dl className="delivery-balance">
                <div className="delivery-balance-row">
                  <dt>{t('delivery.paid')}</dt>
                  <dd>{money(balance.cobrado)}</dd>
                </div>
                {balance.trabajos > 0 && (
                  <div className="delivery-balance-row">
                    <dt>{t('withdrawal.jobsCharged')}</dt>
                    <dd>{money(balance.trabajos)}</dd>
                  </div>
                )}
                {balance.revision > 0 && (
                  <div className="delivery-balance-row">
                    <dt>{concepto.trim() || t('withdrawal.defaultConcept')}</dt>
                    <dd>{money(balance.revision)}</dd>
                  </div>
                )}
                <div className={'delivery-balance-row is-result' + (refunds ? ' is-refund' : '')}>
                  <dt>{collects ? t('delivery.toCollect') : refunds ? t('delivery.toRefund') : t('delivery.nothingDue')}</dt>
                  {needsMethod && <dd>{money(Math.abs(saldo))}</dd>}
                </div>
              </dl>

              {needsMethod && (
                <PaymentFields
                  metodo={metodo}
                  onChangeMetodo={setMetodo}
                  numeroCheque={numeroCheque}
                  onChangeNumeroCheque={setNumeroCheque}
                  onChangeFile={setFile}
                  disabled={saving}
                  refunds={refunds}
                />
              )}
              <p className="field-hint">{t('withdrawal.explain')}</p>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            id="withdrawal-submit"
            onClick={() => void submit()}
            disabled={saving || settling}
          >
            {saving ? t('common.loading') : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
