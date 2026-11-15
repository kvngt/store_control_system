import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/language.context';

export default function EmployeesLinkCard() {
  const { t } = useLanguage();

  return (
    <div className="card">
      <h3 className="card-title">{t('employees.title')}</h3>
      <p className="field-hint" style={{ margin: 'var(--space-2) 0 var(--space-3)' }}>{t('employees.movedHint')}</p>
      <Link to="/employees" className="btn btn-secondary btn-sm">{t('employees.goTo')}</Link>
    </div>
  );
}
