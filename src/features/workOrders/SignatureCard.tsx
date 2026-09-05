import { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Check, Pencil, PenLine, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { trimmedSignatureDataUrl } from '../../lib/signature';

interface SignatureCardProps {
  /** Stored signature URL, or null while none has been captured. */
  signatureUrl?: string | null;
  signedAt?: string | null;
  customerName?: string;
  canEdit: boolean;
  saving: boolean;
  onSave: (dataUrl: string) => Promise<void>;
  onClear: () => Promise<void>;
}

/**
 * Captures the customer's signature at intake, or shows the stored one.
 *
 * The canvas sizing lives here because it is a property of this card and
 * nothing else: `signature_pad` draws in canvas pixels, so the element needs a
 * real `width` attribute — a CSS-stretched canvas offsets every stroke from
 * the pen.
 */
export default function SignatureCard({
  signatureUrl,
  signedAt,
  customerName,
  canEdit,
  saving,
  onSave,
  onClear,
}: SignatureCardProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const padRef = useRef<SignatureCanvas>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth || 560);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [signatureUrl]);

  const save = async () => {
    const pad = padRef.current;
    if (!pad) return;
    if (pad.isEmpty()) {
      showToast('error', t('workOrders.signatureEmpty'));
      return;
    }
    await onSave(trimmedSignatureDataUrl(pad.getCanvas()));
  };

  return (
    <div className="card">
      <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
        <PenLine size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
        {t('workOrders.customerSignature')}
      </h3>

      {signatureUrl ? (
        <div>
          <img src={signatureUrl} alt={t('workOrders.customerSignature')} className="signature-preview" />
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-2)' }}>
            {customerName}
            {signedAt &&
              ` — ${t('workOrders.signedOn')} ${new Date(signedAt).toLocaleDateString(
                language === 'es' ? 'es' : 'en'
              )}`}
          </p>
          {canEdit && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClear}
              disabled={saving}
              style={{ marginTop: 'var(--space-2)' }}
            >
              <Pencil size={14} /> {t('workOrders.resign')}
            </button>
          )}
        </div>
      ) : canEdit ? (
        <>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)' }}>
            {t('workOrders.signatureHint')}
          </p>
          <div className="signature-wrap" ref={wrapRef}>
            <SignatureCanvas
              ref={padRef}
              penColor="#111827"
              canvasProps={{ width, height: 170, className: 'signature-canvas' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => padRef.current?.clear()}
              disabled={saving}
            >
              <X size={14} /> {t('workOrders.clearSignature')}
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
              <Check size={14} /> {saving ? t('common.loading') : t('workOrders.saveSignature')}
            </button>
          </div>
        </>
      ) : (
        <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
          {t('workOrders.noSignature')}
        </p>
      )}
    </div>
  );
}
