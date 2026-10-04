import { useState } from 'react';
import { AlertTriangle, FileSignature, Paperclip, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import type { OrderFinding } from '../../types/database';

const MAX_TEXT = 1000;

interface FindingsCardProps {
  findings: OrderFinding[];
  /** usuario → nombre, para decir quién lo reportó. */
  names: Record<string, string>;
  /** avance → cuántos archivos tiene (las fotos del hallazgo). */
  mediaCount: Record<string, number>;
  busy: boolean;
  onQuote: (finding: OrderFinding) => void | Promise<void>;
  onDiscard: (finding: OrderFinding, enReporte: boolean, texto: string) => Promise<boolean>;
}

/**
 * "La mecánica reportó un trabajo" (F6): arriba de Resumen y de Trabajos para administración.
 * Cotizar precarga la tarea con el texto del técnico; Descartar abre el diálogo donde el
 * admin decide si el cliente lo verá en su reporte y con qué palabras.
 *
 * Un cotizado sigue aquí hasta que sale en un presupuesto: es la tarea que falta agregar.
 */
export default function FindingsCard({ findings, names, mediaCount, busy, onQuote, onDiscard }: FindingsCardProps) {
  const { t, language } = useLanguage();
  const [discarding, setDiscarding] = useState<OrderFinding | null>(null);

  if (findings.length === 0) return null;

  return (
    <div className="alert-warn findings-card" role="region" aria-label={t('findings.cardTitle')}>
      <div className="findings-card-title">
        <AlertTriangle size={16} aria-hidden="true" />
        <strong>{t('findings.cardTitle')}</strong>
      </div>
      <ul className="findings-list">
        {findings.map((h) => {
          const files = h.avance_id ? mediaCount[h.avance_id] ?? 0 : 0;
          return (
            <li key={h.id} className="findings-item">
              <p className="findings-text">{h.descripcion}</p>
              <p className="findings-meta">
                {names[h.reportado_por] ?? '—'} · {new Date(h.creado_en).toLocaleString(language === 'es' ? 'es' : 'en')}
                {files > 0 && (
                  <>
                    {' · '}
                    <Paperclip size={12} aria-hidden="true" /> {t('findings.files').replace('{n}', String(files))}
                  </>
                )}
              </p>
              {h.estado === 'cotizado' ? (
                <p className="findings-meta">{t('findings.quotedHint')}</p>
              ) : null}
              <div className="findings-actions">
                {h.estado === 'pendiente' && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => void onQuote(h)} disabled={busy}>
                    <FileSignature size={14} /> {t('findings.quote')}
                  </button>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDiscarding(h)} disabled={busy}>
                  <X size={14} /> {t('findings.discard')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {discarding && (
        <DiscardFindingModal
          finding={discarding}
          saving={busy}
          onCancel={() => setDiscarding(null)}
          onConfirm={async (enReporte, texto) => {
            if (await onDiscard(discarding, enReporte, texto)) setDiscarding(null);
          }}
        />
      )}
    </div>
  );
}

interface DiscardFindingModalProps {
  finding: OrderFinding;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (enReporte: boolean, texto: string) => void | Promise<void>;
}

/**
 * Descartar no es borrar: el taller vio algo y el cliente decide después. El texto del
 * técnico es interno ("el dueño no lo va a querer pagar"), así que lo que va al reporte es
 * lo que el admin escribe aquí, precargado con aquel para no empezar de cero.
 */
export function DiscardFindingModal({ finding, saving, onCancel, onConfirm }: DiscardFindingModalProps) {
  const { t } = useLanguage();
  const [texto, setTexto] = useState(finding.texto_cliente ?? finding.descripcion);
  const [enReporte, setEnReporte] = useState(false);
  const missingText = enReporte && !texto.trim();

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('findings.discardTitle')}
      >
        <div className="modal-header">
          <h2 className="modal-title">{t('findings.discardTitle')}</h2>
        </div>
        <div className="modal-body">
          <p className="field-hint">{t('findings.reportedText')}</p>
          <blockquote className="findings-quote">{finding.descripcion}</blockquote>

          <label className="checkbox-row" htmlFor="finding-in-report">
            <input
              id="finding-in-report"
              type="checkbox"
              checked={enReporte}
              onChange={(e) => setEnReporte(e.target.checked)}
              disabled={saving}
            />
            <span>
              {t('findings.inReport')}
              <span className="field-hint" style={{ display: 'block' }}>{t('findings.inReportHint')}</span>
            </span>
          </label>

          <div className="form-group">
            <label className="form-label" htmlFor="finding-customer-text">
              {enReporte ? t('findings.customerText') : t('findings.internalNote')}
            </label>
            <textarea
              id="finding-customer-text"
              className="form-input form-textarea"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={MAX_TEXT}
              rows={4}
              disabled={saving}
              aria-invalid={missingText || undefined}
            />
            {missingText && <p className="findings-error" role="alert">{t('findings.customerTextRequired')}</p>}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void onConfirm(enReporte, texto.trim())}
            disabled={saving || missingText}
          >
            {saving ? t('common.loading') : t('findings.discardConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
