import { useState } from 'react';
import { Check, Copy, Download, Mail, MessageCircle, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { reportsService } from '../../services/reports.service';
import type { WorkOrder } from '../../types/database';

interface ShareReportModalProps {
  order: WorkOrder;
  /** The signed link to the uploaded report, and the message to send with it. */
  link: string;
  message: string;
  onClose: () => void;
  onDownload: () => void;
  downloading: boolean;
}

/**
 * What to do with a report once it has been generated.
 *
 * Every button here hands off to something the user already has open — their
 * WhatsApp, their mail client — rather than sending on their behalf. That is a
 * deliberate choice, not a stopgap: the shop wanted the customer to receive the
 * report from the shop's own number and address, and a server sending on their
 * behalf would arrive from neither. It also means no email or messaging
 * provider to pay for, configure or keep credentials for.
 */
export default function ShareReportModal({
  order,
  link,
  message,
  onClose,
  onDownload,
  downloading,
}: ShareReportModalProps) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const customer = order.cliente;
  const hasPhone = !!customer?.telefono?.trim();
  const hasEmail = !!customer?.email?.trim();

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission denied, or an insecure origin. The link is on
      // screen and selectable, so there is still a way to get at it.
    }
  };

  const openExternally = (url: string) => {
    // `noopener` matters: without it the opened tab gets a handle on this one.
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{t('workOrders.shareReport')}</h3>
          <button className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
            {t('workOrders.shareReportHint')}
          </p>

          <div className="share-target">
            <div className="share-target-label">{t('common.name')}</div>
            <div className="share-target-value">{customer?.nombre || '—'}</div>
          </div>
          <div className="share-target">
            <div className="share-target-label">{t('common.phone')}</div>
            <div className="share-target-value">{customer?.telefono || t('workOrders.shareNoPhone')}</div>
          </div>
          <div className="share-target">
            <div className="share-target-label">{t('common.email')}</div>
            <div className="share-target-value">{customer?.email || t('workOrders.shareNoEmail')}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => openExternally(reportsService.whatsAppLink(customer, message))}
            >
              <MessageCircle size={16} />
              {hasPhone ? t('workOrders.sendWhatsApp') : t('workOrders.sendWhatsAppPick')}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              disabled={!hasEmail}
              title={hasEmail ? undefined : t('workOrders.shareNoEmail')}
              onClick={() =>
                openExternally(
                  reportsService.mailtoLink(
                    customer,
                    `${t('workOrders.title')} ${order.numero_orden}`,
                    message
                  )
                )
              }
            >
              <Mail size={16} /> {t('workOrders.sendEmail')}
            </button>

            <button type="button" className="btn btn-secondary" onClick={copyLink}>
              {copied ? <Check size={16} style={{ color: 'var(--color-success)' }} /> : <Copy size={16} />}
              {copied ? t('workOrders.linkCopied') : t('workOrders.copyLink')}
            </button>

            <button type="button" className="btn btn-ghost" onClick={onDownload} disabled={downloading}>
              <Download size={16} /> {downloading ? t('common.loading') : t('workOrders.downloadPdf')}
            </button>
          </div>

          <p className="field-hint" style={{ marginTop: 'var(--space-4)', wordBreak: 'break-all' }}>
            {link}
          </p>
          <p className="field-hint">{t('workOrders.shareLinkExpiry')}</p>
        </div>
      </div>
    </div>
  );
}
