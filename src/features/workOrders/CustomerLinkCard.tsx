import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, ExternalLink, Link2, Mail, MessageCircle, RefreshCw, Send, XCircle } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { getErrorMessage } from '../../lib/errors';
import { isValidEmail } from '../../lib/email';
import { whatsAppUrl } from '../../lib/phone';
import { queryKeys } from '../../lib/queryClient';
import { relativeTime } from '../notifications/renderNotification';
import { customerPortalService } from '../../services/customerPortal.service';
import type { CustomerEmail, WorkOrder } from '../../types/database';

interface CustomerLinkCardProps {
  order: WorkOrder;
  statusLabels: Record<string, string>;
}

const STATE_BADGE: Record<CustomerEmail['estado'], string> = {
  pendiente: 'badge-espera_repuestos',
  procesando: 'badge-en_proceso',
  enviado: 'badge-finalizado',
  omitido: 'badge-entregado',
  error: 'badge-danger',
};

/**
 * El enlace personal del cliente y los correos que ha recibido. Solo admin: el
 * enlace abre precios y totales.
 *
 * El enlace nace solo al firmar la recepción; esta tarjeta sirve para compartirlo
 * por WhatsApp a quien no tiene correo, para cambiarlo si llegó a otra persona y
 * para ver si el cliente lo abrió.
 */
export default function CustomerLinkCard({ order, statusLabels }: CustomerLinkCardProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const linkQuery = useQuery({
    queryKey: queryKeys.customerLink(order.id),
    queryFn: () => customerPortalService.getActiveLink(order.id),
  });
  const emailsQuery = useQuery({
    queryKey: queryKeys.customerEmails(order.id),
    queryFn: () => customerPortalService.listEmails(order.id),
    // Un aviso programado sale en minutos: que la lista se entere sin recargar.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((e) => e.estado === 'pendiente' || e.estado === 'procesando') ? 30_000 : false,
  });

  const link = linkQuery.data ?? null;
  const url = link ? customerPortalService.portalUrl(link.token) : null;
  const customer = order.cliente;
  const hasEmail = isValidEmail(customer?.email);
  const acceptsEmail = customer?.acepta_correos !== false;

  const run = async (action: () => Promise<unknown>, errorKey = 'customerLink.actionError') => {
    setBusy(true);
    try {
      await action();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.customerLink(order.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.customerEmails(order.id) }),
      ]);
    } catch (err) {
      showToast('error', t(errorKey), getErrorMessage(err, language));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles: el enlace está a la vista y se puede seleccionar.
    }
  };

  const notify = () =>
    run(async () => {
      const result = await customerPortalService.notifyProgress(order.id);
      if (result === 'encolado') showToast('success', t('customerLink.notifyQueued'));
      else showToast('error', t('customerLink.notifyNoEmail'));
    }, 'customerLink.notifyError');

  const whatsAppMessage = url
    ? t('customerLink.whatsappMessage')
        .replace('{nombre}', customer?.nombre?.split(' ')[0] || '')
        .replace('{numero}', order.numero_orden)
        .replace('{url}', url)
        .replace(/\s+,/, ',')
    : '';

  const emailLabel = (email: CustomerEmail) => {
    const template = t(`customerLink.template.${email.plantilla}`);
    const status = email.datos?.estatus_enviado ?? email.datos?.estatus;
    return email.plantilla === 'estatus' && status ? `${template}: ${statusLabels[status] ?? status}` : template;
  };

  return (
    <div className="card customer-link-card" style={{ marginTop: 'var(--space-4)' }}>
      <h3 className="card-title" style={{ marginBottom: 'var(--space-2)' }}>
        <Link2 size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
        {t('customerLink.title')}
      </h3>
      <p className="field-hint" style={{ marginBottom: 'var(--space-4)' }}>{t('customerLink.hint')}</p>

      {linkQuery.isLoading ? (
        <div className="spinner" />
      ) : !link ? (
        <div className="customer-link-empty">
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>{t('customerLink.none')}</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => run(() => customerPortalService.createLink(order.id))} disabled={busy}>
            <Link2 size={14} /> {t('customerLink.create')}
          </button>
        </div>
      ) : (
        <>
          <div className="customer-link-url">
            <input className="form-input" readOnly value={url ?? ''} onFocus={(e) => e.currentTarget.select()} aria-label={t('customerLink.title')} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>
              {copied ? <Check size={14} style={{ color: 'var(--color-success)' }} /> : <Copy size={14} />}
              {copied ? t('customerLink.copied') : t('customerLink.copy')}
            </button>
          </div>

          <div className="customer-link-actions">
            <a className="btn btn-secondary btn-sm" href={url ?? undefined} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={14} /> {t('customerLink.open')}
            </a>
            <a className="btn btn-primary btn-sm" href={whatsAppUrl(customer?.telefono, whatsAppMessage)} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={14} /> {t('customerLink.whatsapp')}
            </a>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => {
                if (confirm(t('customerLink.regenerateConfirm'))) void run(() => customerPortalService.regenerateLink(order.id));
              }}
            >
              <RefreshCw size={14} /> {t('customerLink.regenerate')}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => {
                if (confirm(t('customerLink.revokeConfirm'))) void run(() => customerPortalService.revokeLink(order.id));
              }}
            >
              <XCircle size={14} style={{ color: 'var(--color-danger)' }} /> {t('customerLink.revoke')}
            </button>
          </div>

          <p className="field-hint">
            {link.accesos > 0
              ? `${t('customerLink.views').replace('{count}', String(link.accesos))}${
                  link.ultimo_acceso_en ? ` · ${t('customerLink.lastViewed').replace('{time}', relativeTime(link.ultimo_acceso_en, language))}` : ''
                }.`
              : t('customerLink.neverViewed')}
            {link.expira_en && ` ${t('customerLink.expires').replace('{date}', new Date(link.expira_en).toLocaleDateString(language === 'en' ? 'en-US' : 'es-US'))}`}
          </p>
        </>
      )}

      <div className="customer-link-emails">
        <div className="customer-link-emails-head">
          <h4>
            <Mail size={15} /> {t('customerLink.emailsTitle')}
          </h4>
          {hasEmail && acceptsEmail && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={notify} disabled={busy} title={t('customerLink.notifyHint')}>
              <Send size={14} /> {t('customerLink.notify')}
            </button>
          )}
        </div>
        <p className="field-hint">
          {!hasEmail
            ? t('customerLink.noEmail')
            : !acceptsEmail
              ? t('customerLink.optedOut')
              : t('customerLink.emailTo').replace('{email}', customer?.email?.trim() ?? '')}
        </p>

        {(emailsQuery.data ?? []).length === 0 ? (
          hasEmail && <p className="field-hint">{t('customerLink.historyEmpty')}</p>
        ) : (
          <ul className="customer-link-email-list">
            {(emailsQuery.data ?? []).map((email) => (
              <li key={email.id}>
                <div className="customer-link-email-main">
                  <span>{emailLabel(email)}</span>
                  <span className={`badge ${STATE_BADGE[email.estado] ?? ''}`} title={email.ultimo_error ?? undefined}>
                    {t(`customerLink.state.${email.estado}`)}
                  </span>
                </div>
                <div className="customer-link-email-meta">
                  {email.estado === 'pendiente'
                    ? t('customerLink.scheduled').replace('{time}', relativeTime(email.enviar_despues_de, language))
                    : relativeTime(email.enviado_en ?? email.creado_en, language)}
                  {email.ultimo_error && email.estado !== 'enviado' && ` · ${email.ultimo_error}`}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
