import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/auth.context';
import { useLanguage } from '../context/language.context';
import { checkSchemaVersion } from '../lib/schemaVersion';

/**
 * Says out loud when the app and the database are on different migrations.
 *
 * Deliberately shown to everybody, not just admins. A mechanic cannot push a
 * migration, but they are the one who finds the broken button, and "there is a
 * pending update" is a far better answer than "Bucket not found" — it tells
 * them it is not their fault and gives them something to report.
 */
export default function SchemaDriftBanner() {
  const { t } = useLanguage();
  const { user } = useAuth();

  const { data: status } = useQuery({
    queryKey: ['schema-version'],
    queryFn: checkSchemaVersion,
    // The schema cannot change under a running tab without someone deploying,
    // so this is asked once per session rather than kept fresh.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    // A version banner is not worth a request until there is a session to make
    // it with; the RPC is granted to `authenticated` only.
    enabled: !!user,
  });

  if (!status || status.state === 'ok' || status.state === 'unknown') return null;

  const databaseBehind = status.state === 'database-behind';

  return (
    <div className={`schema-banner ${databaseBehind ? 'schema-banner-error' : ''}`} role="alert">
      {databaseBehind ? <AlertTriangle size={18} /> : <RefreshCw size={18} />}
      <div>
        <strong>
          {databaseBehind ? t('schema.databaseBehindTitle') : t('schema.appBehindTitle')}
        </strong>
        <p>{databaseBehind ? t('schema.databaseBehindBody') : t('schema.appBehindBody')}</p>
        {/* The versions only mean something to whoever runs the deploy. */}
        {user?.rol === 'admin' && (
          <p className="schema-banner-versions">
            {t('schema.expected')} <code>{status.expected}</code> ·{' '}
            {t('schema.actual')} <code>{status.actual}</code>
          </p>
        )}
      </div>
      {!databaseBehind && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>
          {t('schema.reload')}
        </button>
      )}
    </div>
  );
}
