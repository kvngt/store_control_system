import { useState } from 'react';
import { Edit2, CheckCircle2, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';

export type ApproveCommission = (comisionId: string, montoNuevo?: number, porcentajeNuevo?: number) => Promise<void>;

export interface ApprovalProps {
  comisionId: string;
  estado?: 'sugerida' | 'aceptada';
  monto: number | null;
  porcentaje: number | null;
  onApprove: ApproveCommission;
}

/**
 * Aceptar una comisión tal cual, o cambiar su porcentaje o su monto. Solo se manda lo que se
 * cambió: con solo el porcentaje, la base recalcula el monto con la misma cuenta del reparto
 * (mandar también el monto viejo dejaría los dos números sin relación).
 */
export default function CommissionApproval({ comisionId, estado, monto, porcentaje, onApprove }: ApprovalProps) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const originalPct = porcentaje != null ? String(Number(porcentaje)) : '';
  const originalMonto = monto != null ? String(Number(monto)) : '';
  const [pct, setPct] = useState(originalPct);
  const [amount, setAmount] = useState(originalMonto);

  const run = async (montoNuevo?: number, porcentajeNuevo?: number) => {
    setBusy(true);
    try {
      await onApprove(comisionId, montoNuevo, porcentajeNuevo);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    const changedPct = pct.trim() !== '' && pct !== originalPct ? Number(pct) : undefined;
    const changedAmount = amount.trim() !== '' && amount !== originalMonto ? Number(amount) : undefined;
    return (
      <span className="commission-approval-edit">
        <input
          type="number"
          min={0}
          max={100}
          step="0.01"
          inputMode="decimal"
          className="form-input form-input-sm"
          aria-label={t('commission.percentLabel')}
          value={pct}
          onChange={(e) => setPct(e.target.value)}
        />
        <span aria-hidden="true">%</span>
        <input
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          className="form-input form-input-sm"
          aria-label={t('commission.amountLabel')}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm btn-icon"
          disabled={busy}
          aria-label={t('commission.accept')}
          onClick={() => void run(changedAmount, changedPct)}
        >
          <CheckCircle2 size={16} />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-icon"
          disabled={busy}
          aria-label={t('common.cancel')}
          onClick={() => {
            setEditing(false);
            setPct(originalPct);
            setAmount(originalMonto);
          }}
        >
          <X size={16} />
        </button>
      </span>
    );
  }

  return (
    <span className="commission-approval">
      <span className={`badge ${estado === 'aceptada' ? 'badge-success' : 'badge-waiting-auth'}`}>
        {estado === 'aceptada' ? t('commission.accepted') : t('commission.suggested')}
      </span>
      {estado !== 'aceptada' && (
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void run()}>
          {t('commission.accept')}
        </button>
      )}
      <button
        type="button"
        className="btn btn-ghost btn-sm btn-icon"
        disabled={busy}
        aria-label={t('commission.editAmount')}
        title={t('commission.editAmount')}
        onClick={() => setEditing(true)}
      >
        <Edit2 size={14} />
      </button>
    </span>
  );
}

