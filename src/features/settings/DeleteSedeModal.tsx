import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useAuth } from '../../context/auth.context';
import { useToast } from '../../context/toast.context';
import { sedesService, type SedeDeleteImpact } from '../../services/sedes.service';
import { getErrorMessage } from '../../lib/errors';
import type { Sede } from '../../types/database';
import { AlertError } from '../../components/AlertError';
import Modal from '../../components/Modal';

interface DeleteSedeModalProps {
  sede: Sede;
  onClose: () => void;
  onDeleted: () => void;
}

// Deleting a workshop takes its whole history with it, so it is a two-step
// dialog rather than a browser confirm: the admin is shown exactly what will
// be destroyed, and then has to type the sede's name to say they meant it.
// Reported from the shop as an outright bug — the plain delete always failed
// with "this record is linked to other data" and there was no way through.
export default function DeleteSedeModal({ sede, onClose, onDeleted }: DeleteSedeModalProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const { refreshSedes } = useAuth();
  const languageRef = useRef(language);
  languageRef.current = language;

  const [deleteImpact, setDeleteImpact] = useState<SedeDeleteImpact | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deletingSede, setDeletingSede] = useState(false);

  useEffect(() => {
    let active = true;
    setDeleteImpact(null);
    setDeleteConfirmName('');
    setDeleteError('');
    sedesService
      .getDeleteImpact(sede.id)
      .then((impact) => {
        if (active) setDeleteImpact(impact);
      })
      .catch((err) => {
        if (active) setDeleteError(getErrorMessage(err, languageRef.current));
      });
    return () => {
      active = false;
    };
  }, [sede.id]);

  const confirmDeleteSede = async () => {
    setDeletingSede(true);
    setDeleteError('');
    try {
      await sedesService.deleteSedeCascade(sede.id);
      await refreshSedes();
      onDeleted();
      onClose();
      showToast('success', t('settings.sedeDeleted'));
    } catch (err) {
      setDeleteError(getErrorMessage(err, language));
    } finally {
      setDeletingSede(false);
    }
  };

  const impactRows: readonly [string, number][] = deleteImpact
    ? [
        [t('workOrders.title'), deleteImpact.ordenes],
        [t('customers.title'), deleteImpact.clientes],
        [t('vehicles.title'), deleteImpact.vehiculos],
        [t('finance.title'), deleteImpact.movimientos],
      ]
    : [];

  return (
    <Modal
      onClose={onClose}
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <AlertTriangle size={18} style={{ color: 'var(--color-danger)' }} />
          {t('settings.deleteSedeTitle')}
        </span>
      }
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={confirmDeleteSede}
            disabled={
              deletingSede ||
              deleteConfirmName.trim().toLowerCase() !== sede.nombre.trim().toLowerCase() ||
              deleteImpact?.otras_sedes === 0
            }
          >
            {deletingSede ? t('common.loading') : t('settings.deleteSedeConfirm')}
          </button>
        </>
      }
    >
      <AlertError message={deleteError} />

      <p style={{ marginBottom: 'var(--space-3)' }}>
        {t('settings.deleteSedeWarning').replace('{sede}', sede.nombre)}
      </p>

      {deleteImpact ? (
        <>
          <div className="table-container" style={{ border: 'none' }}>
            <table className="table">
              <tbody>
                {impactRows.map(([labelText, count]) => (
                  <tr key={labelText}>
                    <td>{labelText}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: count > 0 ? 'var(--color-danger)' : undefined }}>
                      {count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* People are moved, not deleted — a profile is somebody's
              login, and wiping a workshop should not close accounts. */}
          {deleteImpact.empleados > 0 && (
            <p className="field-hint" style={{ marginTop: 'var(--space-2)' }}>
              {t('settings.deleteSedeStaff').replace('{count}', String(deleteImpact.empleados))}
            </p>
          )}
          {deleteImpact.otras_sedes === 0 && (
            <div className="alert-error" style={{ marginTop: 'var(--space-3)' }}>
              {t('settings.deleteSedeLastOne')}
            </div>
          )}
        </>
      ) : (
        !deleteError && <div className="loading-state"><div className="spinner" /></div>
      )}

      <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
        <label className="form-label" htmlFor="delete-sede-confirm">
          {t('settings.deleteSedeConfirmLabel').replace('{sede}', sede.nombre)}
        </label>
        <input
          className="form-input"
          id="delete-sede-confirm"
          autoComplete="off"
          value={deleteConfirmName}
          onChange={(e) => setDeleteConfirmName(e.target.value)}
          placeholder={sede.nombre}
        />
      </div>
    </Modal>
  );
}
