import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Wrench, Plus, Edit2, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useAuth } from '../../context/auth.context';
import { useToast } from '../../context/toast.context';
import { AlertError } from '../../components/AlertError';
import { catalogService } from '../../services/catalog.service';
import { sedesService } from '../../services/supabaseService';
import { emptyList } from '../../lib/emptyList';
import { queryKeys } from '../../lib/queryClient';
import { getErrorMessage } from '../../lib/errors';
import { money } from '../../lib/money';
import CatalogJobModal from './CatalogJobModal';
import type { Sede, CatalogJob } from '../../types/database';

export default function JobCatalogCard() {
  const { t, language } = useLanguage();
  const { currentSede } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const sedesQuery = useQuery({
    queryKey: queryKeys.sedes(),
    queryFn: () => sedesService.getSedes(),
  });
  const sedes = sedesQuery.data ?? emptyList<Sede>();

  const [selectedSedeId, setSelectedSedeId] = useState<string>(() => currentSede?.id || '');

  useEffect(() => {
    if (!selectedSedeId && (currentSede?.id || sedes[0]?.id)) {
      setSelectedSedeId(currentSede?.id || sedes[0]?.id || '');
    }
  }, [currentSede, sedes, selectedSedeId]);

  const catalogQuery = useQuery({
    queryKey: queryKeys.catalog(selectedSedeId),
    queryFn: () => catalogService.list(selectedSedeId, true),
    enabled: !!selectedSedeId,
  });
  const jobs = catalogQuery.data ?? emptyList<CatalogJob>();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CatalogJob | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleNewJob = () => {
    setEditingJob(null);
    setModalOpen(true);
  };

  const handleEditJob = (job: CatalogJob) => {
    setEditingJob(job);
    setModalOpen(true);
  };

  const handleDeleteJob = async (job: CatalogJob) => {
    if (!window.confirm(t('catalog.deleteConfirm'))) return;
    try {
      setDeletingId(job.id);
      setError('');
      await catalogService.remove(job.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.catalog(selectedSedeId) });
      showToast('success', t('catalog.deletedSuccess'));
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="card" style={{ gridColumn: '1 / -1' }}>
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Wrench size={18} /> {t('catalog.title')}
        </h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginLeft: 'auto' }}>
          {sedes.length > 1 && (
            <select
              className="form-input form-select"
              style={{ maxWidth: 220 }}
              value={selectedSedeId}
              onChange={(e) => setSelectedSedeId(e.target.value)}
              aria-label={t('settings.workshops')}
            >
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleNewJob}
            disabled={!selectedSedeId}
          >
            <Plus size={16} /> {t('catalog.newJob')}
          </button>
        </div>
      </div>

      <div className="card-body">
        <AlertError message={error} />

        {catalogQuery.isLoading ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            {t('common.loading')}
          </div>
        ) : jobs.length === 0 ? (
          <p className="field-hint" style={{ margin: 0 }}>
            {t('catalog.empty')}
          </p>
        ) : (
          <div className="table-container" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('catalog.name')}</th>
                  <th>{t('catalog.lines')}</th>
                  <th>{t('common.total')}</th>
                  <th>{t('common.status')}</th>
                  <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td style={{ fontWeight: 600 }}>{job.nombre}</td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>
                      {job.lineas?.length ?? 0}
                    </td>
                    <td style={{ fontWeight: 600 }}>{money(job.total)}</td>
                    <td>
                      {job.activo ? (
                        <span
                          className="job-chip"
                          style={{
                            background: 'var(--color-success-bg, rgba(16, 185, 129, 0.1))',
                            color: 'var(--color-success)',
                            borderColor: 'var(--color-success)',
                          }}
                        >
                          <CheckCircle2 size={12} /> {t('catalog.active')}
                        </span>
                      ) : (
                        <span
                          className="job-chip"
                          style={{
                            background: 'var(--color-bg-tertiary)',
                            color: 'var(--color-text-tertiary)',
                          }}
                        >
                          <XCircle size={12} /> Inactivo
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 'var(--space-1)' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => handleEditJob(job)}
                          title={t('common.edit')}
                          aria-label={t('common.edit')}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => handleDeleteJob(job)}
                          disabled={deletingId === job.id}
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
                        >
                          <Trash2 size={16} style={{ color: 'var(--color-danger)' }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CatalogJobModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        sedeId={selectedSedeId}
        job={editingJob}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.catalog(selectedSedeId) });
        }}
      />
    </div>
  );
}
