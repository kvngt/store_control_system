import { useEffect, useMemo, useState } from 'react';
import { BellRing, BellOff, Send, Share, SquarePlus } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { getErrorMessage } from '../../lib/errors';
import { currentSubscription, detectPushSupport, subscribeThisDevice, subscriptionKeys } from '../../lib/push';
import { notificationsService } from '../../services/notifications.service';

/**
 * "Notificaciones en este teléfono", en Configuración.
 *
 * Cada dispositivo se activa por separado — un permiso de push es de un
 * navegador en un aparato, no de una cuenta — así que la tarjeta habla siempre
 * de "este dispositivo". Y en iPhone, lo primero que tiene que explicar es que
 * hay que agregar la app a la pantalla de inicio: sin eso Safari no ofrece push
 * y no hay botón que valga.
 */
export default function PushSettingsCard() {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const support = useMemo(() => detectPushSupport(), []);
  const [permission, setPermission] = useState<NotificationPermission | 'unknown'>(() =>
    typeof Notification === 'undefined' ? 'unknown' : Notification.permission
  );
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (support !== 'supported') return;
    let cancelled = false;
    void currentSubscription().then((sub) => {
      if (!cancelled) setSubscribed(!!sub && permission === 'granted');
    });
    return () => {
      cancelled = true;
    };
  }, [support, permission]);

  const enable = async () => {
    setBusy(true);
    try {
      const sub = await subscribeThisDevice();
      const keys = subscriptionKeys(sub);
      if (!keys) throw new Error('Suscripción incompleta');
      await notificationsService.registerDevice(keys);
      setSubscribed(true);
      showToast('success', t('notifications.push.enabled'));
    } catch (err) {
      if ((err as { code?: string }).code === 'permission-denied') {
        showToast('error', t('notifications.push.deniedTitle'), t('notifications.push.deniedHint'));
      } else {
        showToast('error', t('notifications.push.enableError'), getErrorMessage(err, language));
      }
    } finally {
      setPermission(typeof Notification === 'undefined' ? 'unknown' : Notification.permission);
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await notificationsService.unregisterDevice(sub.endpoint);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (err) {
      showToast('error', t('notifications.push.disableError'), getErrorMessage(err, language));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    try {
      const queued = await notificationsService.sendTestPush();
      showToast(queued ? 'success' : 'error', queued ? t('notifications.push.testQueued') : t('notifications.push.testNoDevice'));
    } catch (err) {
      showToast('error', t('notifications.push.testError'), getErrorMessage(err, language));
    } finally {
      setBusy(false);
    }
  };

  let content: React.ReactNode;
  if (support === 'not-configured') {
    content = <p className="field-hint">{t('notifications.push.notConfigured')}</p>;
  } else if (support === 'needs-install') {
    content = (
      <>
        <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>{t('notifications.push.iosIntro')}</p>
        <ol className="push-install-steps">
          <li>
            <Share size={16} /> {t('notifications.push.iosStep1')}
          </li>
          <li>
            <SquarePlus size={16} /> {t('notifications.push.iosStep2')}
          </li>
          <li>
            <BellRing size={16} /> {t('notifications.push.iosStep3')}
          </li>
        </ol>
      </>
    );
  } else if (support === 'unsupported') {
    content = <p className="field-hint">{t('notifications.push.unsupported')}</p>;
  } else if (permission === 'denied') {
    content = (
      <p className="field-hint field-hint-warn">
        <BellOff size={14} style={{ verticalAlign: 'middle' }} /> {t('notifications.push.deniedHint')}
      </p>
    );
  } else if (subscribed) {
    content = (
      <>
        <p className="field-hint field-hint-ok" style={{ marginBottom: 'var(--space-3)' }}>
          <BellRing size={14} style={{ verticalAlign: 'middle' }} /> {t('notifications.push.activeHere')}
        </p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={sendTest} disabled={busy}>
            <Send size={14} /> {t('notifications.push.sendTest')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={disable} disabled={busy}>
            <BellOff size={14} /> {t('notifications.push.disable')}
          </button>
        </div>
      </>
    );
  } else {
    content = (
      <>
        <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>{t('notifications.push.explain')}</p>
        <button type="button" className="btn btn-primary" onClick={enable} disabled={busy || subscribed === null}>
          <BellRing size={16} /> {busy ? t('common.loading') : t('notifications.push.enable')}
        </button>
      </>
    );
  }

  return (
    <div className="card">
      <h3 className="card-title" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <BellRing size={18} /> {t('notifications.push.title')}
      </h3>
      {content}
    </div>
  );
}
