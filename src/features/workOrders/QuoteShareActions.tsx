import { useState } from 'react';
import { Check, Copy, MessageCircle } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { whatsAppUrl } from '../../lib/phone';
import { buildCustomerShareMessage } from '../../lib/portalShare';
import type { WorkOrder } from '../../types/database';

/** Acciones en línea para compartir el enlace del presupuesto por WhatsApp o copiarlo. */
export function QuoteShareActions({ order, url }: { order: WorkOrder; url: string | null }) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);

  if (!url) return null;

  const message = buildCustomerShareMessage(order, url, 'quotes.whatsappMessage');
  const waHref = whatsAppUrl(order.cliente?.telefono, message);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      showToast('success', t('customerLink.copied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('error', t('customerLink.actionError'));
    }
  };

  return (
    <div className="quote-share-actions">
      {waHref ? (
        <a className="btn btn-secondary btn-sm" href={waHref} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={14} /> {t('customerLink.whatsapp')}
        </a>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm" disabled title={t('customerLink.noPhone')}>
          <MessageCircle size={14} /> {t('customerLink.whatsapp')}
        </button>
      )}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy()}>
        {copied ? <Check size={14} style={{ color: 'var(--color-success)' }} /> : <Copy size={14} />}
        {copied ? t('customerLink.copied') : t('customerLink.copyLink')}
      </button>
    </div>
  );
}
