import { useState, useEffect } from 'react';
import { Check, Copy, Link as LinkIcon, Loader2, MessageCircle, MessageSquareText, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { getTranslation } from '../../i18n/translations';
import { canOpenSms, smsUrl, whatsAppUrl } from '../../lib/phone';
import { customerPortalService } from '../../services/customerPortal.service';
import { getErrorMessage } from '../../lib/errors';
import { AlertError } from '../../components/AlertError';
import type { WorkOrder } from '../../types/database';

interface ReadyNotifyModalProps {
  order: WorkOrder;
  onClose: () => void;
}

export default function ReadyNotifyModal({ order, onClose }: ReadyNotifyModalProps) {
  const { t, language } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalUrl, setPortalUrl] = useState('');
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadLink() {
      setLoading(true);
      setError(null);
      try {
        const token = await customerPortalService.getOrCreateToken(order.id);
        if (!cancelled && token) {
          setPortalUrl(customerPortalService.buildPortalUrl(token));
        }
      } catch (err) {
        if (!cancelled) {
          setError(getErrorMessage(err, language));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    loadLink();
    return () => {
      cancelled = true;
    };
  }, [order.id, language]);

  const clientLang = order.cliente?.idioma === 'es' ? 'es' : 'en';
  const nombre = order.cliente?.nombre?.trim().split(/\s+/)[0] || (clientLang === 'es' ? 'cliente' : 'customer');
  const vehiculo = [order.vehiculo?.marca, order.vehiculo?.modelo]
    .filter(Boolean)
    .join(' ') || (clientLang === 'es' ? 'vehículo' : 'vehicle');
  const numero = order.numero_orden ?? (order as unknown as { numero?: string }).numero ?? '';

  const readyMessage = portalUrl
    ? getTranslation(clientLang, 'customerLink.readyMessage')
        .replace('{nombre}', nombre)
        .replace('{vehiculo}', vehiculo)
        .replace('{numero}', numero)
        .replace('{url}', portalUrl)
    : '';

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(readyMessage);
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2000);
    } catch {
      // portapapeles no disponible
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // portapapeles no disponible
    }
  };

  const hasPhone = Boolean(order.cliente?.telefono?.trim());
  const smsAvailable = canOpenSms();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 520 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ready-notify-title"
      >
        <div className="modal-header">
          <h3 className="modal-title" id="ready-notify-title">
            {t('customerLink.readyTitle')}
          </h3>
          <button className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-4)' }}>
            {t('customerLink.readyHint')}
          </p>

          {!hasPhone && (
            <div className="alert-info" style={{ marginBottom: 'var(--space-4)' }}>
              {t('customerLink.noPhone')}
            </div>
          )}

          {error && <div style={{ marginBottom: 'var(--space-4)' }}><AlertError message={error} /></div>}

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', padding: 'var(--space-6) 0' }}>
              <Loader2 size={20} className="spin" />
              <span>{t('common.loading')}</span>
            </div>
          ) : (
            <>
              <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
                <textarea
                  className="form-input"
                  readOnly
                  rows={4}
                  value={readyMessage}
                  style={{ resize: 'none', width: '100%', fontFamily: 'inherit' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {hasPhone ? (
                  <a
                    className="btn btn-primary"
                    href={whatsAppUrl(order.cliente?.telefono, readyMessage)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ minHeight: '44px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}
                  >
                    <MessageCircle size={18} />
                    {t('customerLink.whatsapp')}
                  </a>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled
                    style={{ minHeight: '44px', opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}
                  >
                    <MessageCircle size={18} />
                    {t('customerLink.whatsapp')}
                  </button>
                )}

                {smsAvailable && (
                  hasPhone ? (
                    <a
                      className="btn btn-secondary"
                      href={smsUrl(order.cliente?.telefono, readyMessage)}
                      style={{ minHeight: '44px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}
                    >
                      <MessageSquareText size={18} />
                      {t('customerLink.openSms')}
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled
                      style={{ minHeight: '44px', opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}
                    >
                      <MessageSquareText size={18} />
                      {t('customerLink.openSms')}
                    </button>
                  )
                )}

                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1, minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}
                    onClick={() => void handleCopyMessage()}
                  >
                    {copiedMessage ? <Check size={16} style={{ color: 'var(--color-success)' }} /> : <Copy size={16} />}
                    {copiedMessage ? t('customerLink.messageCopied') : t('customerLink.copyMessage')}
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1, minHeight: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)' }}
                    onClick={() => void handleCopyLink()}
                  >
                    {copiedLink ? <Check size={16} style={{ color: 'var(--color-success)' }} /> : <LinkIcon size={16} />}
                    {copiedLink ? t('customerLink.copied') : t('customerLink.copyLink')}
                  </button>
                </div>

                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ width: '100%', marginTop: 'var(--space-2)' }}
                  onClick={onClose}
                >
                  {t('common.close')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
