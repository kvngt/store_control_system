import { useLanguage } from '../context/language.context';
import { useAuth } from '../context/auth.context';
import ProfileCard from '../features/settings/ProfileCard';
import LanguageCard from '../features/settings/LanguageCard';
import ThemeCard from '../features/settings/ThemeCard';
import PushSettingsCard from '../features/notifications/PushSettingsCard';
import EmailOutboxCard from '../features/settings/EmailOutboxCard';
import ParkingSettingsCard from '../features/parking/ParkingSettingsCard';
import JobCatalogCard from '../features/catalog/JobCatalogCard';
import InspectionTemplatesCard from '../features/inspection/InspectionTemplatesCard';
import ProblemReportCard from '../features/settings/ProblemReportCard';
import SedesCard from '../features/settings/SedesCard';
import EmployeesLinkCard from '../features/settings/EmployeesLinkCard';

export default function Settings() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isAdmin = user?.rol === 'admin';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('settings.title')}</h1>
        </div>
      </div>

      <div className="responsive-grid-2">
        {/* Profile — editable by the signed-in user, whatever their role */}
        <ProfileCard />

        {/* Language */}
        <LanguageCard />

        {/* Theme */}
        <ThemeCard />

        {/* Push en este dispositivo — para todos: el mecánico es quien más lo necesita. */}
        <PushSettingsCard />

        {/* Correos al cliente que fallaron (p. ej. con la llave de Resend mal puesta). */}
        {isAdmin && <EmailOutboxCard />}

        {/* Cobro por parqueo (módulo configurable por sede, solo admin). */}
        {isAdmin && <ParkingSettingsCard />}

        {/* Catálogo de trabajos frecuentes (solo admin). */}
        {isAdmin && <JobCatalogCard />}

        {/* Plantillas de inspección por puntos (solo admin). */}
        {isAdmin && <InspectionTemplatesCard />}

        {/* Reportar un problema (Sentry). No se dibuja si Sentry no está configurado. */}
        <ProblemReportCard />

        {/* Workshops — sede and staff management is admin-only. Everyone else
            still reaches /settings for their own profile, language and theme. */}
        {isAdmin && <SedesCard />}

        {/* El personal se mudó a Empleados (reunión con el taller, sept. 2026), junto al
            esquema de pago de cada quien. Aquí queda el camino, porque aquí lo buscaban. */}
        {isAdmin && <EmployeesLinkCard />}
      </div>
    </div>
  );
}
