import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserCog } from 'lucide-react';
import { useLanguage } from '../context/language.context';
import { useAuth } from '../context/auth.context';
import { sedesService, usersService } from '../services/supabaseService';
import { employeesService } from '../services/employees.service';
import { queryKeys } from '../lib/queryClient';
import { emptyList } from '../lib/emptyList';
import { getErrorMessage } from '../lib/errors';
import { money } from '../lib/money';
import type { PayScheme, Sede, UserProfile } from '../types/database';
import UsersCard from '../features/settings/UsersCard';
import EmployeeDetailModal from '../features/employees/EmployeeDetailModal';

/**
 * Empleados: quién trabaja en el taller, cómo se le paga y qué ha hecho.
 *
 * Pedido en la reunión con el taller (sept. 2026). El alta, la edición y la baja de cuentas
 * vivían en Configuración; se mudan aquí, junto al esquema de pago de cada quien (comisión
 * con su porcentaje o el de la sede, o salario) y su actividad. Solo administración.
 */
export default function Employees() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<UserProfile | null>(null);

  const sedesQuery = useQuery({ queryKey: queryKeys.sedes(), queryFn: () => sedesService.getSedes() });
  const usersQuery = useQuery({ queryKey: queryKeys.users(undefined), queryFn: () => usersService.getUsers() });
  const schemesQuery = useQuery({ queryKey: queryKeys.paySchemes(), queryFn: () => employeesService.getPaySchemes() });

  const sedes = sedesQuery.data ?? emptyList<Sede>();
  const users = usersQuery.data ?? emptyList<UserProfile>();
  const schemes = useMemo(
    () => Object.fromEntries((schemesQuery.data ?? []).map((s) => [s.usuario_id, s])) as Record<string, PayScheme>,
    [schemesQuery.data]
  );
  const loading = sedesQuery.isPending || usersQuery.isPending;
  const loadError = sedesQuery.error ?? usersQuery.error ?? schemesQuery.error;

  // Las comisiones son de quien trabaja las órdenes. Un admin puede estar asignado, pero su
  // pago no se configura aquí.
  const staff = users.filter((u) => u.rol !== 'admin');
  const sedeOf = (u: UserProfile) => sedes.find((s) => s.id === u.sede_id);

  const payLabel = (u: UserProfile) => {
    const scheme = schemes[u.id];
    if (scheme?.esquema === 'salario') {
      return scheme.salario_monto != null
        ? t('employees.payLabel.salary')
            .replace('{monto}', money(Number(scheme.salario_monto)))
            .replace('{periodo}', t('employees.periods.' + (scheme.salario_periodo ?? 'quincenal')).toLowerCase())
        : t('employees.kind.salario');
    }
    if (scheme?.comision_porcentaje != null) {
      return t('employees.payLabel.ownRate').replace('{rate}', String(Number(scheme.comision_porcentaje)));
    }
    return t('employees.payLabel.sedeRate').replace('{rate}', String(sedeOf(u)?.comision_porcentaje ?? 0));
  };

  const reload = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.users(undefined) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.paySchemes() });
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('employees.title')}</h1>
          <p className="page-subtitle">{t('employees.subtitle')}</p>
        </div>
      </div>

      {loadError && <div className="alert-error">{getErrorMessage(loadError, language)}</div>}

      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
          <UserCog size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
          {t('employees.payTitle')}
        </h3>
        {loading ? (
          <div className="loading-state"><div className="spinner" /></div>
        ) : staff.length === 0 ? (
          <p className="field-hint">{t('employees.empty')}</p>
        ) : (
          <div className="table-container cards-on-mobile" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('employees.role')}</th>
                  <th>{t('employees.sede')}</th>
                  <th>{t('employees.payScheme')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {staff.map((u) => (
                  <tr key={u.id}>
                    <td data-label={t('common.name')}>{u.nombre_completo}</td>
                    <td data-label={t('employees.role')}>{t('employees.roles.' + u.rol)}</td>
                    <td data-label={t('employees.sede')}>{sedeOf(u)?.nombre ?? '—'}</td>
                    <td data-label={t('employees.payScheme')}>{payLabel(u)}</td>
                    <td>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected(u)}>
                        {t('employees.open')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="field-hint" style={{ marginTop: 'var(--space-3)' }}>{t('employees.payHint')}</p>
      </div>

      <UsersCard users={users} sedes={sedes} currentUserId={user?.id} loading={loading} onChanged={reload} />

      {selected && (
        <EmployeeDetailModal
          employee={selected}
          sede={sedeOf(selected)}
          scheme={schemes[selected.id]}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
