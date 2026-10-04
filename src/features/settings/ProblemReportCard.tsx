import { useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { monitoringEnabled, openProblemReport } from '../../lib/monitoring';

/**
 * "¿Algo no funciona?", en Configuración, para todos los roles.
 *
 * Abre el formulario de Sentry: quien reporta escribe qué pasó y el reporte llega con quién
 * era, en qué pantalla estaba y la grabación de los segundos previos (con el texto oculto).
 * Así un "la orden se quedó en 0 %" deja de depender de que alguien se acuerde qué tocó.
 * Sin Sentry configurado la tarjeta no se dibuja: un botón que no manda nada a ningún lado
 * es peor que no tenerlo.
 */
export default function ProblemReportCard() {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [opening, setOpening] = useState(false);

  if (!monitoringEnabled) return null;

  const open = async () => {
    setOpening(true);
    try {
      const opened = await openProblemReport({
        formTitle: t('support.form.title'),
        nameLabel: t('support.form.name'),
        namePlaceholder: t('support.form.namePlaceholder'),
        emailLabel: t('support.form.email'),
        emailPlaceholder: t('support.form.emailPlaceholder'),
        messageLabel: t('support.form.message'),
        messagePlaceholder: t('support.form.messagePlaceholder'),
        submitButtonLabel: t('support.form.submit'),
        cancelButtonLabel: t('common.cancel'),
        successMessageText: t('support.form.thanks'),
        isRequiredLabel: t('support.form.required'),
        addScreenshotButtonLabel: t('support.form.addScreenshot'),
        removeScreenshotButtonLabel: t('support.form.removeScreenshot'),
      });
      if (!opened) showToast('error', t('support.unavailable'));
    } catch {
      showToast('error', t('support.unavailable'));
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="card">
      <h3 className="card-title" style={{ marginBottom: 'var(--space-2)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <LifeBuoy size={18} /> {t('support.title')}
      </h3>
      <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>{t('support.hint')}</p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={open} disabled={opening}>
        {opening ? t('common.loading') : t('support.report')}
      </button>
    </div>
  );
}
