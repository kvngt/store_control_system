import { Moon, Sun } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useTheme } from '../../context/theme.context';

export default function ThemeCard() {
  const { t } = useLanguage();
  const { theme, setTheme } = useTheme();

  return (
    <div className="card">
      <h3 className="card-title" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <Sun size={18} /> {t('settings.theme')}
      </h3>
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <button
          type="button"
          className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTheme('dark')}
          style={{ flex: 1 }}
        >
          <Moon size={16} /> {t('settings.themeDark')}
        </button>
        <button
          type="button"
          className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTheme('light')}
          style={{ flex: 1 }}
        >
          <Sun size={16} /> {t('settings.themeLight')}
        </button>
      </div>
    </div>
  );
}
