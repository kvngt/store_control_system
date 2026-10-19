import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Plus, Edit2, Trash2, CheckCircle2, XCircle, Star } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useAuth } from '../../context/auth.context';
import { useToast } from '../../context/toast.context';
import { AlertError } from '../../components/AlertError';
import { inspectionService } from '../../services/inspection.service';
import { sedesService } from '../../services/supabaseService';
import { emptyList } from '../../lib/emptyList';
import { queryKeys } from '../../lib/queryClient';
import { getErrorMessage } from '../../lib/errors';
import InspectionTemplateModal from './InspectionTemplateModal';
import type { Sede, InspectionTemplate } from '../../types/database';

export default function InspectionTemplatesCard() {
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

  const templatesQuery = useQuery({
    queryKey: queryKeys.inspectionTemplates(selectedSedeId),
    queryFn: () => inspectionService.listTemplates(selectedSedeId),
    enabled: !!selectedSedeId,
  });
  const templates = templatesQuery.data ?? emptyList<InspectionTemplate>();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<InspectionTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleNewTemplate = () => {
    setEditingTemplate(null);
    setModalOpen(true);
  };

  const handleEditTemplate = (tpl: InspectionTemplate) => {
    setEditingTemplate(tpl);
    setModalOpen(true);
  };

  const handleDeleteTemplate = async (tpl: InspectionTemplate) => {
    if (!window.confirm(t('inspection.templates.deleteConfirm'))) return;
    try {
      setDeletingId(tpl.id);
      setError('');
      await inspectionService.deleteTemplate(tpl.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.inspectionTemplates(selectedSedeId) });
      showToast('success', t('inspection.templates.deletedSuccess'));
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
          <ClipboardCheck size={18} /> {t('inspection.templates.title')}
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
            onClick={handleNewTemplate}
            disabled={!selectedSedeId}
          >
            <Plus size={16} /> {t('inspection.templates.newTemplate')}
          </button>
        </div>
      </div>

      <div className="card-body">
        <p className="field-hint" style={{ marginBottom: 'var(--space-4)' }}>
          {t('inspection.templates.subtitle')}
        </p>

        <AlertError message={error} />

        {templatesQuery.isLoading ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            {t('common.loading')}
          </div>
        ) : templates.length === 0 ? (
          <p className="field-hint" style={{ margin: 0 }}>
            {t('inspection.templates.empty')}
          </p>
        ) : (
          <div className="table-container cards-on-mobile" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('inspection.templates.name')}</th>
                  <th>{t('inspection.templates.sections')}</th>
                  <th>{t('common.status')}</th>
                  <th style={{ textAlign: 'right' }}>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((tpl) => (
                  <tr key={tpl.id}>
                    <td data-label={t('inspection.templates.name')}>
                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                        <span style={{ fontWeight: 600 }}>{tpl.nombre}</span>
                        {tpl.predeterminada && (
                          <span
                            className="job-chip"
                            style={{
                              background: 'var(--color-primary-subtle, rgba(235, 195, 52, 0.15))',
                              color: 'var(--color-primary-dark, #C9A227)',
                              borderColor: 'var(--color-primary)',
                            }}
                          >
                            <Star size={12} fill="currentColor" /> {t('inspection.templates.defaultBadge')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td data-label={t('inspection.templates.sections')} style={{ color: 'var(--color-text-secondary)' }}>
                      {t('inspection.templates.pointsCount').replace('{n}', String(tpl.puntos?.length ?? 0))}
                    </td>
                    <td data-label={t('common.status')}>
                      {tpl.activo ? (
                        <span
                          className="job-chip"
                          style={{
                            background: 'var(--color-success-bg, rgba(16, 185, 129, 0.1))',
                            color: 'var(--color-success)',
                            borderColor: 'var(--color-success)',
                          }}
                        >
                          <CheckCircle2 size={12} /> {t('inspection.templates.active')}
                        </span>
                      ) : (
                        <span
                          className="job-chip"
                          style={{
                            background: 'var(--color-bg-tertiary)',
                            color: 'var(--color-text-tertiary)',
                          }}
                        >
                          <XCircle size={12} /> {t('inspection.templates.inactive')}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 'var(--space-1)' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => handleEditTemplate(tpl)}
                          title={t('common.edit')}
                          aria-label={t('common.edit')}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => handleDeleteTemplate(tpl)}
                          disabled={deletingId === tpl.id}
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

      {modalOpen && (
        <InspectionTemplateModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          sedeId={selectedSedeId}
          template={editingTemplate}
          onSaved={() => {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.inspectionTemplates(selectedSedeId),
            });
          }}
        />
      )}
    </div>
  );
}
