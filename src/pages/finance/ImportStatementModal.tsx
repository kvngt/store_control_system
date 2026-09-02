import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { supabaseService } from '../../services/supabaseService';
import { getErrorMessage } from '../../lib/errors';
import { parseWellsFargoStatement } from '../../lib/bankStatementParser';
import { isLikelyInternalTransfer, suggestCategory } from '../../lib/categorizationRules';
import type { CategorizationRule, ReviewableTransaction, TransactionCategory } from '../../types/database';
import { X, Upload, AlertTriangle } from 'lucide-react';

interface Props {
  onClose: () => void;
  onImported: () => void;
}

const CATEGORY_KEYS: Record<TransactionCategory, string> = {
  pago_cliente: 'finance.clientPayment',
  compra_repuesto: 'finance.partsPurchase',
  planilla: 'finance.payroll',
  gasto_operativo: 'finance.operatingExpense',
};

export default function ImportStatementModal({ onClose, onImported }: Props) {
  const { t, language } = useLanguage();
  const { user, currentSede } = useAuth();
  const sedeId = (user?.rol === 'admin' ? currentSede?.id : user?.sede_id) || '';

  const [file, setFile] = useState<File | null>(null);
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [rows, setRows] = useState<ReviewableTransaction[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [bulkCategory, setBulkCategory] = useState<TransactionCategory | ''>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabaseService.getCategorizationRules().then(setRules).catch(() => {});
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setError('');
    setSuccessCount(null);
    setParsing(true);
    try {
      const { transactions, warnings: parseWarnings } = await parseWellsFargoStatement(selected);
      setWarnings(parseWarnings);

      const duplicates = sedeId ? await supabaseService.findPossibleDuplicates(sedeId, transactions) : new Map<number, string>();

      const reviewRows: ReviewableTransaction[] = transactions.map((tx, idx) => {
        const internal = isLikelyInternalTransfer(tx.descripcion);
        const dup = duplicates.get(idx);
        const suggested = internal ? null : suggestCategory(tx.descripcion, rules);
        return {
          ...tx,
          rowId: `${idx}-${tx.fecha}-${tx.monto}`,
          categoria: (suggested || '') as TransactionCategory | '',
          incluir: !internal && !dup,
          posibleDuplicado: Boolean(dup),
          duplicadoDescripcion: dup,
        };
      });
      setRows(reviewRows);
    } catch (err) {
      setError(getErrorMessage(err, language));
      setRows([]);
    } finally {
      setParsing(false);
    }
  };

  const updateRow = (rowId: string, patch: Partial<ReviewableTransaction>) => {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  };

  const selectedRows = rows.filter((r) => r.incluir);
  const allSelected = rows.length > 0 && rows.every((r) => r.incluir);
  const someSelected = rows.some((r) => r.incluir);
  const toggleAll = (checked: boolean) =>
    setRows((prev) => prev.map((r) => ({ ...r, incluir: checked })));

  // Plain "Check" lines carry no payee at all, so no keyword rule can ever
  // classify them — on a real statement that's ~60 rows the reviewer would
  // otherwise have to set one dropdown at a time before importing anything.
  const uncategorized = rows.filter((r) => r.incluir && !r.categoria);
  const applyBulkCategory = () => {
    if (!bulkCategory) return;
    setRows((prev) =>
      prev.map((r) => (r.incluir && !r.categoria ? { ...r, categoria: bulkCategory } : r))
    );
    setBulkCategory('');
  };
  const hasUnresolvedSelection = selectedRows.some((r) => !r.categoria);
  const totalIngresos = selectedRows.filter((r) => r.tipo === 'ingreso').reduce((s, r) => s + r.monto, 0);
  const totalEgresos = selectedRows.filter((r) => r.tipo === 'egreso').reduce((s, r) => s + r.monto, 0);

  const handleImport = async () => {
    if (!file || !user || !sedeId || selectedRows.length === 0 || hasUnresolvedSelection) return;
    setSaving(true);
    setError('');
    try {
      const path = await supabaseService.uploadStatement(file, sedeId);
      const batch = await supabaseService.createImportBatch({
        sede_id: sedeId,
        nombre_archivo: file.name,
        ruta_archivo: path,
        importado_por: user.id,
        total_transacciones: selectedRows.length,
      });
      await supabaseService.bulkInsertTransactions(
        selectedRows.map((r) => ({
          sede_id: sedeId,
          tipo: r.tipo,
          categoria: r.categoria as TransactionCategory,
          monto: r.monto,
          descripcion: `Importado: ${r.descripcion}`,
          fecha: r.fecha,
          numero_cheque: r.numero_cheque?.trim() || null,
          registrado_por: user.id,
          importacion_id: batch.id,
        }))
      );
      setSuccessCount(selectedRows.length);
      setRows([]);
      onImported();
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '960px' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('finance.importStatement')}</h3>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body">
          {error && <div className="alert-error">{error}</div>}

          {successCount !== null ? (
            <div style={{
              padding: 'var(--space-4)', background: 'var(--color-success-bg)',
              border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-md)',
              color: 'var(--color-success)', fontSize: 'var(--font-size-sm)',
            }}>
              {successCount} {t('finance.importSuccess')}
            </div>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">{t('finance.uploadPdf')}</label>
                <input
                  ref={fileInputRef}
                  className="form-input"
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  disabled={parsing || saving}
                />
              </div>

              {parsing && (
                <div className="loading-state"><div className="spinner" /> <span>{t('finance.parsingStatement')}</span></div>
              )}

              {warnings.length > 0 && (
                <div className="alert-error" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {warnings.map((w, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={14} /> {w}
                    </div>
                  ))}
                </div>
              )}

              {!parsing && rows.length === 0 && file && warnings.length === 0 && (
                <p style={{ color: 'var(--color-text-tertiary)' }}>{t('finance.noTransactionsFound')}</p>
              )}

              {rows.length > 0 && (
                <>
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>
                    {t('finance.reviewImport')}
                  </p>

                  {uncategorized.length > 0 && (
                    <div className="import-bulk-bar">
                      <AlertTriangle size={14} style={{ color: 'var(--color-warning)', flexShrink: 0 }} />
                      <span style={{ fontSize: 'var(--font-size-sm)' }}>
                        <strong>{uncategorized.length}</strong> {t('finance.uncategorizedCount')}
                      </span>
                      <select
                        className="form-input form-select"
                        style={{ minWidth: 170 }}
                        value={bulkCategory}
                        onChange={(e) => setBulkCategory(e.target.value as TransactionCategory)}
                      >
                        <option value="">{t('finance.selectCategory')}</option>
                        {(Object.keys(CATEGORY_KEYS) as TransactionCategory[]).map((cat) => (
                          <option key={cat} value={cat}>{t(CATEGORY_KEYS[cat])}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={applyBulkCategory}
                        disabled={!bulkCategory}
                      >
                        {t('finance.applyToUncategorized')}
                      </button>
                    </div>
                  )}
                  <div className="table-container" style={{ maxHeight: 420, overflowY: 'auto' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th style={{ width: 36 }}>
                            <input
                              type="checkbox"
                              checked={allSelected}
                              // Indeterminate can only be set imperatively, not via an attribute.
                              ref={(el) => {
                                if (el) el.indeterminate = someSelected && !allSelected;
                              }}
                              onChange={(e) => toggleAll(e.target.checked)}
                              title={t('finance.selectAll')}
                              aria-label={t('finance.selectAll')}
                            />
                          </th>
                          <th>{t('common.date')}</th>
                          <th style={{ width: 110 }}>{t('finance.checkNumber')}</th>
                          <th>{t('common.description')}</th>
                          <th style={{ textAlign: 'right' }}>{t('common.amount')}</th>
                          <th>{t('common.category')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.rowId} style={{ opacity: row.incluir ? 1 : 0.5 }}>
                            <td>
                              <input
                                type="checkbox"
                                checked={row.incluir}
                                onChange={(e) => updateRow(row.rowId, { incluir: e.target.checked })}
                              />
                            </td>
                            <td style={{ whiteSpace: 'nowrap', fontSize: 'var(--font-size-sm)' }}>{row.fecha}</td>
                            <td>
                              <input
                                className="form-input"
                                style={{ width: 90, padding: '4px 8px', fontSize: 'var(--font-size-sm)' }}
                                value={row.numero_cheque || ''}
                                placeholder="—"
                                inputMode="numeric"
                                onChange={(e) => updateRow(row.rowId, { numero_cheque: e.target.value })}
                                disabled={!row.incluir}
                              />
                            </td>
                            <td style={{ fontSize: 'var(--font-size-sm)' }}>
                              {row.descripcion}
                              {row.posibleDuplicado && (
                                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)' }}>
                                  <AlertTriangle size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                                  {t('finance.possibleDuplicate')}: {row.duplicadoDescripcion}
                                </div>
                              )}
                              {!row.posibleDuplicado && isLikelyInternalTransfer(row.descripcion) && (
                                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                                  {t('finance.internalTransfer')}
                                </div>
                              )}
                            </td>
                            <td style={{
                              textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600,
                              color: row.tipo === 'ingreso' ? 'var(--color-success)' : 'var(--color-danger)',
                            }}>
                              {row.tipo === 'ingreso' ? '+' : '-'}${row.monto.toFixed(2)}
                            </td>
                            <td>
                              <select
                                className="form-input form-select"
                                style={{ minWidth: 160 }}
                                value={row.categoria}
                                onChange={(e) => updateRow(row.rowId, { categoria: e.target.value as TransactionCategory })}
                                disabled={!row.incluir}
                              >
                                <option value="">{t('finance.selectCategory')}</option>
                                {(Object.keys(CATEGORY_KEYS) as TransactionCategory[]).map((cat) => (
                                  <option key={cat} value={cat}>{t(CATEGORY_KEYS[cat])}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-6)', marginTop: 'var(--space-3)', fontSize: 'var(--font-size-sm)' }}>
                    <span>{selectedRows.length} {t('common.results')}</span>
                    <span style={{ color: 'var(--color-success)' }}>+${totalIngresos.toFixed(2)}</span>
                    <span style={{ color: 'var(--color-danger)' }}>-${totalEgresos.toFixed(2)}</span>
                  </div>

                  {hasUnresolvedSelection && (
                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-warning)', marginTop: 'var(--space-2)' }}>
                      {t('finance.resolveCategoriesFirst')}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          {successCount === null && (
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={saving || parsing || selectedRows.length === 0 || hasUnresolvedSelection}
            >
              <Upload size={16} /> {saving ? t('common.loading') : t('finance.importSelected')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
