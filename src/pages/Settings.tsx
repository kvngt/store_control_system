import { useEffect, useState, useCallback } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { supabaseService } from '../services/supabaseService';
import { getErrorMessage } from '../lib/errors';
import type { Sede, UserProfile, UserRole } from '../types/database';
import {
  Building2,
  Phone,
  MapPin,
  Users,
  Globe,
  User,
  Shield,
  Sun,
  Moon,
  UserPlus,
  X,
} from 'lucide-react';

export default function Settings() {
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, string>>({});
  const [savingSedeId, setSavingSedeId] = useState<string | null>(null);

  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({
    nombre_completo: '',
    email: '',
    password: '',
    telefono: '',
    rol: 'mecanico' as UserRole,
    sede_id: '',
  });

  const loadData = useCallback(() => {
    setLoading(true);
    setError('');
    Promise.all([supabaseService.getSedes(), supabaseService.getUsers()])
      .then(([s, u]) => {
        setSedes(s);
        setUsers(u);
        setCapacityDrafts(Object.fromEntries(s.map((sede) => [sede.id, String(sede.capacidad)])));
      })
      .catch((err) => setError(getErrorMessage(err, language)))
      .finally(() => setLoading(false));
  }, [language]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveCapacity = async (sedeId: string) => {
    const value = parseInt(capacityDrafts[sedeId], 10);
    if (!value || value <= 0) return;
    setSavingSedeId(sedeId);
    try {
      await supabaseService.updateSede(sedeId, { capacidad: value });
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setSavingSedeId(null);
    }
  };

  const openEmployeeModal = () => {
    setEmployeeForm({ nombre_completo: '', email: '', password: '', telefono: '', rol: 'mecanico', sede_id: sedes[0]?.id || '' });
    setError('');
    setShowEmployeeModal(true);
  };

  const handleCreateEmployee = async () => {
    const { nombre_completo, email, password, sede_id } = employeeForm;
    if (!nombre_completo.trim() || !email.trim() || !password || !sede_id) return;
    setSavingEmployee(true);
    setError('');
    try {
      await supabaseService.createEmployee({
        ...employeeForm,
        nombre_completo: nombre_completo.trim(),
        email: email.trim(),
        telefono: employeeForm.telefono.trim() || undefined,
      });
      setShowEmployeeModal(false);
      loadData();
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setSavingEmployee(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('settings.title')}</h1>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="responsive-grid-2">
        {/* Profile */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <User size={18} /> {t('settings.profile')}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 'var(--font-size-xl)', fontWeight: 700, color: 'var(--color-text-inverse)',
            }}>
              {user?.nombre_completo?.split(' ').map(n => n[0]).slice(0, 2).join('')}
            </div>
            <div>
              <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>{user?.nombre_completo}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 4 }}>
                <Shield size={14} style={{ color: 'var(--color-primary-light)' }} />
                <span style={{ color: 'var(--color-primary-light)', fontWeight: 500, textTransform: 'capitalize' }}>{user?.rol}</span>
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: 4 }}>{user?.email}</div>
            </div>
          </div>
        </div>

        {/* Language */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Globe size={18} /> {t('settings.language')}
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              className={`btn ${language === 'es' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setLanguage('es')}
              style={{ flex: 1 }}
            >
              🇪🇸 {t('settings.spanish')}
            </button>
            <button
              className={`btn ${language === 'en' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setLanguage('en')}
              style={{ flex: 1 }}
            >
              🇺🇸 {t('settings.english')}
            </button>
          </div>
        </div>

        {/* Theme */}
        <div className="card">
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Sun size={18} /> {t('settings.theme')}
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button
              className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTheme('dark')}
              style={{ flex: 1 }}
            >
              <Moon size={16} /> {t('settings.themeDark')}
            </button>
            <button
              className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTheme('light')}
              style={{ flex: 1 }}
            >
              <Sun size={16} /> {t('settings.themeLight')}
            </button>
          </div>
        </div>

        {/* Workshops */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Building2 size={18} /> {t('settings.workshops')}
            </h3>
            {user?.rol === 'admin' && (
              <button className="btn btn-primary btn-sm" onClick={openEmployeeModal}>
                <UserPlus size={16} /> {t('settings.newEmployee')}
              </button>
            )}
          </div>
          {loading ? (
            <div className="loading-state"><div className="spinner" /></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
              {sedes.map((sede) => {
                const sedeUsers = users.filter((u) => u.sede_id === sede.id);
                return (
                  <div
                    key={sede.id}
                    style={{
                      padding: 'var(--space-5)',
                      background: 'var(--color-bg-tertiary)',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--color-surface-border)',
                    }}
                  >
                    <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
                      {sede.nombre}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                        <MapPin size={14} /> {sede.direccion}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                        <Phone size={14} /> {sede.telefono}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                        <Users size={14} /> {sedeUsers.length} {language === 'es' ? 'empleados' : 'employees'}
                      </div>
                    </div>

                    {user?.rol === 'admin' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                        <label style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                          {t('settings.capacity')}
                        </label>
                        <input
                          className="form-input"
                          type="number"
                          min={1}
                          style={{ width: 80 }}
                          value={capacityDrafts[sede.id] ?? ''}
                          onChange={(e) => setCapacityDrafts((prev) => ({ ...prev, [sede.id]: e.target.value }))}
                        />
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleSaveCapacity(sede.id)}
                          disabled={savingSedeId === sede.id || capacityDrafts[sede.id] === String(sede.capacidad)}
                        >
                          {savingSedeId === sede.id ? t('common.loading') : t('common.update')}
                        </button>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
                      {sedeUsers.map((u) => (
                        <div
                          key={u.id}
                          style={{
                            padding: '4px 10px',
                            background: 'var(--color-bg-hover)',
                            borderRadius: 'var(--radius-full)',
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          {u.nombre_completo.split(' ')[0]} · <span style={{ textTransform: 'capitalize' }}>{u.rol}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showEmployeeModal && (
        <div className="modal-overlay" onClick={() => setShowEmployeeModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('settings.newEmployee')}</h3>
              <button className="modal-close" onClick={() => setShowEmployeeModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">{t('common.name')}</label>
                <input
                  className="form-input"
                  value={employeeForm.nombre_completo}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, nombre_completo: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('common.email')}</label>
                  <input
                    className="form-input"
                    type="email"
                    value={employeeForm.email}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">{t('common.phone')}</label>
                  <input
                    className="form-input"
                    value={employeeForm.telefono}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, telefono: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('settings.temporaryPassword')}</label>
                <input
                  className="form-input"
                  type="text"
                  minLength={6}
                  value={employeeForm.password}
                  onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })}
                  required
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">{t('settings.role')}</label>
                  <select
                    className="form-input form-select"
                    value={employeeForm.rol}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, rol: e.target.value as UserRole })}
                  >
                    <option value="mecanico">{t('settings.roleMecanico')}</option>
                    <option value="pintor">{t('settings.rolePintor')}</option>
                    <option value="admin">{t('settings.roleAdmin')}</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{t('settings.workshops')}</label>
                  <select
                    className="form-input form-select"
                    value={employeeForm.sede_id}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, sede_id: e.target.value })}
                    required
                  >
                    <option value="">-- {t('settings.workshops')} --</option>
                    {sedes.map((sede) => (
                      <option key={sede.id} value={sede.id}>{sede.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEmployeeModal(false)}>{t('common.cancel')}</button>
              <button className="btn btn-primary" onClick={handleCreateEmployee} disabled={savingEmployee}>
                {savingEmployee ? t('common.loading') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
