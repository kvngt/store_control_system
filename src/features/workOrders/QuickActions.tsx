import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '../../context/language.context';

export interface QuickAction {
  key: string;
  icon: LucideIcon;
  /** Clave de traducción. */
  label: string;
  onClick: () => void;
  /** El paso que toca ahora: se pinta como botón principal. */
  primary?: boolean;
  disabled?: boolean;
}

/**
 * Los atajos de la orden (pedido del taller del 06/10/2026: "que el mecánico y el administrador
 * puedan acceder rápidamente"). Una fila de botones arriba de la pestaña, que abren la sección o
 * el diálogo de cada cosa; el que corresponde al paso actual va resaltado.
 */
export default function QuickActions({ actions }: { actions: QuickAction[] }) {
  const { t } = useLanguage();
  if (actions.length === 0) return null;
  return (
    <div className="quick-actions" role="toolbar" aria-label={t('quickActions.title')}>
      {actions.map(({ key, icon: Icon, label, onClick, primary, disabled }) => (
        <button
          key={key}
          type="button"
          className={`btn btn-sm ${primary ? 'btn-primary' : 'btn-secondary'}`}
          onClick={onClick}
          disabled={disabled}
        >
          <Icon size={14} aria-hidden="true" /> {t(label)}
        </button>
      ))}
    </div>
  );
}
