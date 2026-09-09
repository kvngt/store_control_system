import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  Calendar,
  ChevronDown,
  ChevronRight,
  FileImage,
  Percent,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { useLanguage } from '../context/language.context';
import { useAuth } from '../context/auth.context';
import { useToast } from '../context/toast.context';
import { commissionsService, sedesService } from '../services/supabaseService';
import { queryKeys } from '../lib/queryClient';
import { emptyList } from '../lib/emptyList';
import { todayLocal } from '../lib/dates';
import { getErrorMessage } from '../lib/errors';
import type { Commission, CommissionBalance, CommissionPayment } from '../types/database';

const money = (value: number) =>
  `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;



type Tab = 'pending' | 'history' | 'payments';

/**
 * Nómina, as the shop actually runs it.
 *
 * Nobody here is on a salary: a technician earns a share of what the shop made
 * on the jobs they worked, and that share is settled periodically by cheque.
 * The screen this replaced asked for a base salary, bonuses, deductions and a
 * pay period — every figure of which had to be worked out on paper first and
 * then retyped, because none of them is a number this business keeps.
 *
 * What accrues is computed by the database when an order is delivered (see the
 * 20260912000000 migration), so nothing here creates a commission. The three
 * tabs are the three questions an admin has: what do I owe, where did it come
 * from, and what have I already paid.
 */
export default function Payroll() {
  const { t, language } = useLanguage();
  const { user, currentSede, refreshSedes } = useAuth();
  const { showToast } = useToast();
  const isAdmin = user?.rol === 'admin';
  const sedeId = isAdmin ? currentSede?.id : user?.sede_id;

  const queryClient = useQueryClient();

  const commissionsQuery = useQuery({
    queryKey: queryKeys.commissions(sedeId),
    queryFn: () => commissionsService.getCommissions(sedeId),
  });
  const paymentsQuery = useQuery({
    queryKey: queryKeys.commissionPayments(sedeId),
    queryFn: () => commissionsService.getPayments(sedeId),
  });

  const commissions = commissionsQuery.data ?? emptyList<Commission>();
  const payments = paymentsQuery.data ?? emptyList<CommissionPayment>();
  const loading = commissionsQuery.isPending || paymentsQuery.isPending;
  const loadError = commissionsQuery.error ?? paymentsQuery.error;
  // Held raw until render, so switching the UI language never re-queries.
  const error = loadError ? getErrorMessage(loadError, language) : '';

  const reload = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.commissions(sedeId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.commissionPayments(sedeId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.transactions(sedeId) });
  };

  const pending = useMemo(() => commissions.filter((c) => !c.pago_id), [commissions]);
  const balances = useMemo(() => commissionsService.buildBalances(pending), [pending]);
  const totalPending = useMemo(() => balances.reduce((sum, b) => sum + b.total, 0), [balances]);
  const totalPaid = useMemo(() => payments.reduce((sum, p) => sum + Number(p.monto), 0), [payments]);

  const [tab, setTab] = useState<Tab>('pending');
  const [expanded, setExpanded] = useState<string | null>(null);

  // ----- commission rate -----------------------------------------------------
  const [rateDraft, setRateDraft] = useState<string | null>(null);
  const [savingRate, setSavingRate] = useState(false);
  const currentRate = currentSede?.comision_porcentaje ?? 35;
  const rateValue = rateDraft ?? String(currentRate);

  const saveRate = async () => {
    if (!currentSede) return;
    const parsed = parseFloat(rateValue);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      showToast('error', t('payroll.rateInvalid'));
      return;
    }
    setSavingRate(true);
    try {
      await sedesService.updateSede(currentSede.id, { comision_porcentaje: parsed });
      await refreshSedes();
      // Changing the rate re-prices every unpaid commission, by trigger.
      reload();
      setRateDraft(null);
      showToast('success', t('payroll.rateSaved'));
    } catch (err) {
      showToast('error', t('payroll.rateError'), getErrorMessage(err, language));
    } finally {
      setSavingRate(false);
    }
  };

  // ----- settling a balance --------------------------------------------------
  const [payTarget, setPayTarget] = useState<CommissionBalance | null>(null);
  const [payForm, setPayForm] = useState({
    fecha_pago: todayLocal(),
    metodo: 'cheque',
    numero_cheque: '',
    notas: '',
  });
  const [chequeFile, setChequeFile] = useState<File | null>(null);
  const [payError, setPayError] = useState('');
  const [paying, setPaying] = useState(false);

  const openPayModal = (balance: CommissionBalance) => {
    setPayTarget(balance);
    setPayForm({ fecha_pago: todayLocal(), metodo: 'cheque', numero_cheque: '', notas: '' });
    setChequeFile(null);
    setPayError('');
  };

  const submitPayment = async () => {
    if (!payTarget) return;
    // A cheque with no number and no photo is a payment nobody can trace back
    // to a bank statement, which is the whole reason the shop asked for this.
    if (payForm.metodo === 'cheque' && !payForm.numero_cheque.trim() && !chequeFile) {
      setPayError(t('payroll.chequeEvidenceRequired'));
      return;
    }
    setPaying(true);
    setPayError('');
    try {
      let comprobante: string | null = null;
      if (chequeFile) {
        comprobante = await commissionsService.uploadComprobante(
          currentSede?.id || sedeId || '',
          chequeFile
        );
      }
      await commissionsService.payCommissions({
        usuario_id: payTarget.usuario_id,
        comision_ids: payTarget.items.map((c) => c.id),
        fecha_pago: payForm.fecha_pago,
        metodo: payForm.metodo,
        numero_cheque: payForm.numero_cheque.trim() || null,
        comprobante_url: comprobante,
        notas: payForm.notas.trim() || null,
      });
      setPayTarget(null);
      reload();
      showToast('success', t('payroll.paymentRecorded'));
    } catch (err) {
      setPayError(getErrorMessage(err, language));
    } finally {
      setPaying(false);
    }
  };

  const undoPayment = async (payment: CommissionPayment) => {
    if (!confirm(t('payroll.confirmUndoPayment'))) return;
    try {
      await commissionsService.deletePayment(payment.id);
      reload();
      showToast('success', t('payroll.paymentUndone'));
    } catch (err) {
      showToast('error', t('payroll.paymentUndoError'), getErrorMessage(err, language));
    }
  };

  const openCheque = async (path: string) => {
    try {
      const url = await commissionsService.signComprobante(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      showToast('error', t('payroll.chequeOpenError'), getErrorMessage(err, language));
    }
  };

  if (loading) {
    return <div className="loading-state"><div className="spinner" /></div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('payroll.title')}</h1>
          <p className="page-subtitle">{t('payroll.subtitle')}</p>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {/* Summary: what is owed, what has been paid, and the rate behind both. */}
      <div className="responsive-grid-2" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="card">
          <div style={{ display: 'flex', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                <Wallet size={14} /> {t('payroll.totalPending')}
              </div>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-warning)' }}>
                {money(totalPending)}
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                <Banknote size={14} /> {t('payroll.totalSettled')}
              </div>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-success)' }}>
                {money(totalPaid)}
              </div>
            </div>
          </div>
        </div>

        {/* The rate. Admin-only, because it decides what everyone is paid. */}
        <div className="card">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            <Percent size={18} /> {t('payroll.commissionRate')}
          </h3>
          {isAdmin ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <input
                  className="form-input"
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  style={{ width: 100 }}
                  value={rateValue}
                  onChange={(e) => setRateDraft(e.target.value)}
                />
                <span style={{ fontWeight: 600 }}>%</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={saveRate}
                  disabled={savingRate || rateDraft === null || rateDraft === String(currentRate)}
                >
                  {savingRate ? t('common.loading') : t('common.save')}
                </button>
              </div>
              <p className="field-hint" style={{ marginTop: 'var(--space-2)' }}>
                {t('payroll.commissionRateHint')}
              </p>
            </>
          ) : (
            <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-light)' }}>
              {currentRate}%
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-1)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        {([
          ['pending', `${t('payroll.tabPending')} (${balances.length})`],
          ['history', `${t('payroll.tabHistory')} (${commissions.length})`],
          ['payments', `${t('payroll.tabPayments')} (${payments.length})`],
        ] as [Tab, string][]).map(([key, labelText]) => (
          <button
            key={key}
            className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => setTab(key)}
            style={{ borderBottom: 'none', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)' }}
          >
            {labelText}
          </button>
        ))}
      </div>

      {/* ===== Pending balances ===== */}
      {tab === 'pending' && (
        balances.length === 0 ? (
          <p className="orders-section-empty">{t('payroll.noPending')}</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {balances.map((balance) => {
              const open = expanded === balance.usuario_id;
              return (
                <div key={balance.usuario_id} className="card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="orders-section-toggle"
                      onClick={() => setExpanded(open ? null : balance.usuario_id)}
                      aria-expanded={open}
                      style={{ flex: 1, minWidth: 200, textAlign: 'left' }}
                    >
                      {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                      <span>
                        <span style={{ fontWeight: 600 }}>{balance.usuario?.nombre_completo}</span>
                        <span style={{ marginLeft: 8, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', textTransform: 'capitalize' }}>
                          {balance.usuario?.rol}
                        </span>
                        <span style={{ display: 'block', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                          {balance.items.length} {t('payroll.ordersCount')}
                        </span>
                      </span>
                    </button>
                    <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-warning)' }}>
                      {money(balance.total)}
                    </div>
                    {isAdmin && (
                      <button className="btn btn-primary btn-sm" onClick={() => openPayModal(balance)}>
                        <Banknote size={16} /> {t('payroll.payBalance')}
                      </button>
                    )}
                  </div>

                  {open && (
                    <div className="table-container cards-on-mobile" style={{ border: 'none', marginTop: 'var(--space-3)' }}>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>{t('workOrders.orderNumber')}</th>
                            <th style={{ textAlign: 'right' }}>{t('payroll.profitBase')}</th>
                            <th style={{ textAlign: 'right' }}>{t('payroll.rate')}</th>
                            <th style={{ textAlign: 'right' }}>{t('payroll.technicians')}</th>
                            <th style={{ textAlign: 'right' }}>{t('payroll.share')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {balance.items.map((c) => (
                            <tr key={c.id}>
                              <td data-label={t('workOrders.orderNumber')} style={{ color: 'var(--color-primary-light)', fontWeight: 600 }}>
                                {c.orden?.numero_orden || '—'}
                              </td>
                              <td data-label={t('payroll.profitBase')} style={{ textAlign: 'right' }}>{money(Number(c.base_ganancia))}</td>
                              <td data-label={t('payroll.rate')} style={{ textAlign: 'right' }}>{Number(c.porcentaje)}%</td>
                              <td data-label={t('payroll.technicians')} style={{ textAlign: 'right' }}>{c.tecnicos}</td>
                              <td data-label={t('payroll.share')} style={{ textAlign: 'right', fontWeight: 700 }}>{money(Number(c.monto))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ===== Every accrual, paid or not ===== */}
      {tab === 'history' && (
        <div className="table-container cards-on-mobile animate-fade-in">
          <table className="table">
            <thead>
              <tr>
                <th>{t('payroll.employee')}</th>
                <th>{t('workOrders.orderNumber')}</th>
                <th style={{ textAlign: 'right' }}>{t('payroll.profitBase')}</th>
                <th style={{ textAlign: 'right' }}>{t('payroll.rate')}</th>
                <th style={{ textAlign: 'right' }}>{t('payroll.technicians')}</th>
                <th style={{ textAlign: 'right' }}>{t('payroll.share')}</th>
                <th>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((c) => (
                <tr key={c.id}>
                  <td data-label={t('payroll.employee')}>{c.usuario?.nombre_completo}</td>
                  <td data-label={t('workOrders.orderNumber')} style={{ color: 'var(--color-primary-light)', fontWeight: 600 }}>
                    {c.orden?.numero_orden || '—'}
                  </td>
                  <td data-label={t('payroll.profitBase')} style={{ textAlign: 'right' }}>{money(Number(c.base_ganancia))}</td>
                  <td data-label={t('payroll.rate')} style={{ textAlign: 'right' }}>{Number(c.porcentaje)}%</td>
                  <td data-label={t('payroll.technicians')} style={{ textAlign: 'right' }}>{c.tecnicos}</td>
                  <td data-label={t('payroll.share')} style={{ textAlign: 'right', fontWeight: 700 }}>{money(Number(c.monto))}</td>
                  <td data-label={t('common.status')}>
                    <span className={`badge badge-${c.pago_id ? 'entregado' : 'espera_repuestos'}`}>
                      {c.pago_id ? t('payroll.settled') : t('payroll.pending')}
                    </span>
                  </td>
                </tr>
              ))}
              {commissions.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-tertiary)' }}>{t('common.noResults')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== Settlements ===== */}
      {tab === 'payments' && (
        <div className="table-container cards-on-mobile animate-fade-in">
          <table className="table">
            <thead>
              <tr>
                <th>{t('payroll.employee')}</th>
                <th>{t('payroll.payDate')}</th>
                <th>{t('payroll.method')}</th>
                <th>{t('payroll.chequeNumber')}</th>
                <th style={{ textAlign: 'right' }}>{t('payroll.amount')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td data-label={t('payroll.employee')}>{p.usuario?.nombre_completo}</td>
                  <td data-label={t('payroll.payDate')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-sm)' }}>
                      <Calendar size={12} style={{ color: 'var(--color-text-tertiary)' }} /> {p.fecha_pago}
                    </div>
                  </td>
                  <td data-label={t('payroll.method')} style={{ textTransform: 'capitalize' }}>{p.metodo}</td>
                  <td data-label={t('payroll.chequeNumber')}>{p.numero_cheque || '—'}</td>
                  <td data-label={t('payroll.amount')} style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary-light)' }}>
                    {money(Number(p.monto))}
                  </td>
                  <td>
                    <div className="table-actions">
                      {p.comprobante_url && (
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          title={t('payroll.viewCheque')}
                          onClick={() => openCheque(p.comprobante_url as string)}
                        >
                          <FileImage size={16} />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          className="btn btn-ghost btn-sm btn-icon"
                          title={t('payroll.undoPayment')}
                          style={{ color: 'var(--color-danger)' }}
                          onClick={() => undoPayment(p)}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-tertiary)' }}>{t('common.noResults')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== Pay dialog ===== */}
      {payTarget && (
        <div className="modal-overlay" onClick={() => setPayTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('payroll.payBalance')}</h3>
              <button className="modal-close" onClick={() => setPayTarget(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              {payError && <div className="alert-error" role="alert">{payError}</div>}

              <div className="share-target">
                <div className="share-target-label">{t('payroll.employee')}</div>
                <div className="share-target-value">{payTarget.usuario?.nombre_completo}</div>
              </div>
              <div className="share-target">
                <div className="share-target-label">{t('payroll.amount')}</div>
                <div className="share-target-value" style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-primary-light)' }}>
                  {money(payTarget.total)}
                </div>
              </div>
              <p className="field-hint">
                {payTarget.items.length} {t('payroll.ordersCount')} · {t('payroll.amountIsServerSide')}
              </p>

              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label" htmlFor="pay-date">{t('payroll.payDate')}</label>
                  <input
                    className="form-input"
                    id="pay-date"
                    type="date"
                    value={payForm.fecha_pago}
                    onChange={(e) => setPayForm({ ...payForm, fecha_pago: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="pay-method">{t('payroll.method')}</label>
                  <select
                    className="form-input form-select"
                    id="pay-method"
                    value={payForm.metodo}
                    onChange={(e) => setPayForm({ ...payForm, metodo: e.target.value })}
                  >
                    <option value="cheque">{t('payroll.methodCheque')}</option>
                    <option value="efectivo">{t('payroll.methodCash')}</option>
                    <option value="transferencia">{t('payroll.methodTransfer')}</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="pay-cheque">{t('payroll.chequeNumber')}</label>
                <input
                  className="form-input"
                  id="pay-cheque"
                  value={payForm.numero_cheque}
                  onChange={(e) => setPayForm({ ...payForm, numero_cheque: e.target.value })}
                  placeholder={payForm.metodo === 'cheque' ? '1042' : t('payroll.optional')}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="pay-photo">{t('payroll.chequePhoto')}</label>
                <input
                  className="form-input"
                  id="pay-photo"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setChequeFile(e.target.files?.[0] ?? null)}
                />
                <p className="field-hint">{t('payroll.chequePhotoHint')}</p>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="pay-notes">{t('common.notes')}</label>
                <textarea
                  className="form-input form-textarea"
                  id="pay-notes"
                  rows={2}
                  value={payForm.notas}
                  onChange={(e) => setPayForm({ ...payForm, notas: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPayTarget(null)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={submitPayment} disabled={paying}>
                {paying ? t('common.loading') : t('payroll.confirmPayment')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
