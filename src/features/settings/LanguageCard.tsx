import { Globe } from 'lucide-react';
import { useLanguage } from '../../context/language.context';

export default function LanguageCard() {
  const { t, language, setLanguage } = useLanguage();

  return (
    <div className="card">
      <h3 className="card-title" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <Globe size={18} /> {t('settings.language')}
      </h3>
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <button
          type="button"
          className={`btn ${language === 'es' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setLanguage('es')}
          style={{ flex: 1 }}
        >
          🇪🇸 {t('settings.spanish')}
        </button>
        <button
          type="button"
          className={`btn ${language === 'en' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setLanguage('en')}
          style={{ flex: 1 }}
        >
          🇺🇸 {t('settings.english')}
        </button>
      </div>
    </div>
  );
}
