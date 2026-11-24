import { useEffect, useMemo, useState } from 'react';
import { Mail } from 'lucide-react';
import PortalSection from '../PortalSection';
import type { PortalStrings } from '../format';
import { setEmailPreference } from '../portal.api';
import { ConfirmDialog } from './ConfirmDialog';

export interface EmailPreferenceProps {
  token: string;
  initial: boolean;
  soloBaja?: boolean;
  s: PortalStrings;
}

export function EmailPreference({ token, initial, soloBaja = false, s }: EmailPreferenceProps) {
  const [accepts, setAccepts] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Llegó desde "No quiero recibir estos correos". La baja se confirma con el
  // botón: un enlace directo daría de baja a quien tenga un filtro de correo que
  // abre los enlaces para revisarlos.
  const fromUnsubscribeLink = useMemo(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('correos') === 'baja',
    []
  );
  const isCorreosHash = typeof window !== 'undefined' && window.location.hash === '#correos';
  const defaultOpen = fromUnsubscribeLink || isCorreosHash;

  useEffect(() => {
    if (fromUnsubscribeLink) document.getElementById('correos')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [fromUnsubscribeLink]);

  const applyChange = async (next: boolean) => {
    setSaving(true);
    setMessage(null);
    try {
      setAccepts(await setEmailPreference(token, next));
      setConfirmingStop(false);
      setMessage({ ok: true, text: s.emailsSaved });
    } catch {
      setConfirmingStop(false);
      setMessage({ ok: false, text: s.emailsError });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleClick = () => {
    if (accepts) {
      setConfirmingStop(true);
      return;
    }
    void applyChange(true);
  };

  return (
    <PortalSection
      id="correos"
      icon={Mail}
      title={s.emailsTitle}
      defaultOpen={defaultOpen}
      className={fromUnsubscribeLink && accepts ? 'is-highlighted' : ''}
    >
      <p className="portal-muted">{accepts ? s.emailsOn : s.emailsOff}</p>
      {fromUnsubscribeLink && accepts && <p>{s.unsubscribeHint}</p>}
      {accepts || !soloBaja ? (
        <div className="portal-actions">
          <button type="button" className={accepts ? 'btn btn-secondary' : 'btn btn-primary'} onClick={handleToggleClick} disabled={saving}>
            {accepts ? s.emailsStop : s.emailsStart}
          </button>
        </div>
      ) : (
        <p className="portal-muted">{s.emailsExpiredReenableHint}</p>
      )}
      {confirmingStop && (
        <ConfirmDialog
          title={s.emailsStopConfirmTitle}
          message={soloBaja ? s.emailsStopConfirmExpired : s.emailsStopConfirm}
          confirmLabel={s.emailsStopConfirmButton}
          cancelLabel={s.confirmBack}
          busy={saving}
          onConfirm={() => void applyChange(false)}
          onCancel={() => setConfirmingStop(false)}
        />
      )}
      {message && (
        <p className={message.ok ? 'portal-success' : 'portal-error'} role="status">
          {message.text}
        </p>
      )}
    </PortalSection>
  );
}
