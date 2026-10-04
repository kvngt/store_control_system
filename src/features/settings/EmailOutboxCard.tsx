import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MailWarning, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { getErrorMessage } from '../../lib/errors';
import { queryKeys } from '../../lib/queryClient';
import { customerPortalService } from '../../services/customerPortal.service';

/**
 * "Correos al cliente", en Configuración (solo admin).
 *
 * Un correo que falla con un 4xx queda en error y ya no se reintenta solo. Pasó con la llave
 * de Resend mal puesta (octubre 2026): corregida la llave, los correos de esos días seguían
 * perdidos y solo se veían orden por orden. Esta tarjeta los cuenta y los devuelve a la cola
 * de una vez (`reintentar_correos_fallidos`, últimas 72 horas).
 */
export default function EmailOutboxCard() {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const failed = useQuery({
    queryKey: queryKeys.failedEmails(),
    queryFn: () => customerPortalService.failedEmailCount(),
  });
  const count = failed.data ?? 0;

  const retryAll = async () => {
    setBusy(true);
    try {
      const n = await customerPortalService.retryFailedEmails();
      showToast('success', t('settings.emailOutbox.retried').replace('{n}', String(n)));
      await queryClient.invalidateQueries({ queryKey: queryKeys.failedEmails() });
      // Las tarjetas de cada orden también muestran el estado de sus correos.
      void queryClient.invalidateQueries({ queryKey: ['customer-emails'] });
    } catch (err) {
      showToast('error', t('settings.emailOutbox.retryError'), getErrorMessage(err, language));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3 className="card-title" style={{ marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <MailWarning size={18} /> {t('settings.emailOutbox.title')}
      </h3>
      <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>{t('settings.emailOutbox.hint')}</p>
      {failed.isError ? (
        <p className="field-hint field-hint-error">{getErrorMessage(failed.error, language)}</p>
      ) : (
        <p style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--space-3)' }}>
          {failed.isPending
            ? t('common.loading')
            : count === 0
              ? t('settings.emailOutbox.none')
              : t('settings.emailOutbox.failedCount').replace('{n}', String(count))}
        </p>
      )}
      {count > 0 && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={retryAll} disabled={busy}>
          <RefreshCw size={14} /> {busy ? t('common.loading') : t('settings.emailOutbox.retryAll')}
        </button>
      )}
    </div>
  );
}
