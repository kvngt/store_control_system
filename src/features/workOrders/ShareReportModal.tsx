import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Download, ExternalLink, Mail, MessageCircle, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { getErrorMessage } from '../../lib/errors';
import { isValidEmail } from '../../lib/email';
import { queryKeys } from '../../lib/queryClient';
import { customerPortalService } from '../../services/customerPortal.service';
import { reportsService } from '../../services/reports.service';
import type { WorkOrder } from '../../types/database';

interface ShareReportModalProps {
  order: WorkOrder;
  /** El enlace personal del cliente (reinventa.shop/r/<token>) y el mensaje de WhatsApp. */
  link: string;
  message: string;
  onClose: () => void;
  onDownload: () => void;
  downloading: boolean;
}

/**
 * Enviar el reporte al cliente: su enlace web, no un archivo.
 *
 * El reporte es la página del cliente — estado, fotos y videos publicados,
 * presupuesto y cuenta —, que se ve bien en un teléfono y reproduce los videos que
 * un PDF no puede. El correo sale desde el sistema con el nombre del taller (y las
 * respuestas llegan al correo de contacto de la sede); WhatsApp se abre con el
 * mensaje listo para mandarlo desde el número del taller. El PDF queda para
 * imprimir.
 */
export default function ShareReportModal({ order, link, message, onClose, onDownload, downloading }: ShareReportModalProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  const customer = order.cliente;
  const hasPhone = !!customer?.telefono?.trim();
  const canEmail = isValidEmail(customer?.email) && customer?.acepta_correos !== false;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el enlace está a la vista y se puede seleccionar.
    }
  };

  const sendEmail = async () => {
    setSending(true);
    try {
      const result = await customerPortalService.sendReportEmail(order.id);
      if (result.correo === 'encolado') {
        showToast('success', t('workOrders.reportEmailQueued'));
        void queryClient.invalidateQueries({ queryKey: queryKeys.customerEmails(order.id) });
        onClose();
      } else {
        showToast('error', t('workOrders.reportEmailNoEmail'));
      }
    } catch (err) {
      showToast('error', t('workOrders.reportEmailError'), getErrorMessage(err, language));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-report-title"
      >
        <div className="modal-header">
          <h3 className="modal-title" id="share-report-title">{t('workOrders.shareReport')}</h3>
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
            <div className="share-target-value">
              {!customer?.email?.trim()
                ? t('workOrders.shareNoEmail')
                : customer.acepta_correos === false
                  ? `${customer.email} · ${t('customerLink.optedOut')}`
                  : customer.email}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canEmail || sending}
              title={canEmail ? undefined : t('workOrders.reportEmailNoEmail')}
              onClick={() => void sendEmail()}
            >
              <Mail size={16} /> {sending ? t('common.loading') : t('workOrders.sendEmail')}
            </button>

            <a
              className="btn btn-secondary"
              href={reportsService.whatsAppLink(customer, message)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={16} />
              {hasPhone ? t('workOrders.sendWhatsApp') : t('workOrders.sendWhatsAppPick')}
            </a>

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => void copyLink()}>
                {copied ? <Check size={16} style={{ color: 'var(--color-success)' }} /> : <Copy size={16} />}
                {copied ? t('workOrders.linkCopied') : t('workOrders.copyLink')}
              </button>
              <a className="btn btn-secondary" style={{ flex: 1 }} href={link} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={16} /> {t('workOrders.openReport')}
              </a>
            </div>

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
