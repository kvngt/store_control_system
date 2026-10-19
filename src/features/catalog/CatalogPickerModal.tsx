import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Search, Wrench, Package, BookOpen } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { AlertError } from '../../components/AlertError';
import { catalogService } from '../../services/catalog.service';
import { workOrdersService } from '../../services/workOrders.service';
import { queryKeys } from '../../lib/queryClient';
import { emptyList } from '../../lib/emptyList';
import { money } from '../../lib/money';
import { getErrorMessage } from '../../lib/errors';
import TechnicianSelect from '../workOrders/TechnicianSelect';
import { suggestedTechnicianFor, type Technician } from '../workOrders/tasks';
import type { CatalogJob, OrderAssignment, Specialty } from '../../types/database';

interface CatalogPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sedeId: string;
  orderId?: string;
  technicians?: Technician[];
  assignments?: readonly Pick<OrderAssignment, 'usuario_id' | 'tipo_tarea'>[];
  onJobAdded?: (jobId: string) => void;
  onSelectDraft?: (job: CatalogJob, assignedTechnicianId: string | null) => void;
}

export default function CatalogPickerModal({
  isOpen,
  onClose,
  sedeId,
  orderId,
  technicians = emptyList<Technician>(),
  assignments = emptyList<OrderAssignment>(),
  onJobAdded,
  onSelectDraft,
}: CatalogPickerModalProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [assignedTechnicianId, setAssignedTechnicianId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const catalogQuery = useQuery({
    queryKey: queryKeys.catalog(sedeId),
    queryFn: () => catalogService.list(sedeId, false),
    enabled: isOpen && !!sedeId,
  });

  const allJobs = catalogQuery.data ?? emptyList<CatalogJob>();

  // Filtro de búsqueda por nombre
  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allJobs;
    return allJobs.filter((j) => j.nombre.toLowerCase().includes(q));
  }, [allJobs, search]);

  const selectedJob = useMemo(() => {
    return allJobs.find((j) => j.id === selectedJobId) ?? null;
  }, [allJobs, selectedJobId]);

  // Al elegir un trabajo, sugiere el técnico de la primera mano de obra
  const handleSelectJob = (job: CatalogJob) => {
    setSelectedJobId(job.id);
    const firstLabor = job.lineas?.find((l) => l.tipo === 'mano_obra');
    if (firstLabor) {
      const spec = (firstLabor.especialidad ?? 'mecanica') as Specialty;
      const suggested = suggestedTechnicianFor(spec, assignments, technicians);
      setAssignedTechnicianId(suggested ?? '');
    } else {
      setAssignedTechnicianId('');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedJobId(null);
      setAssignedTechnicianId('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!selectedJob) return;

    if (onSelectDraft) {
      onSelectDraft(selectedJob, assignedTechnicianId || null);
      onClose();
      return;
    }

    if (!orderId) return;

    try {
      setBusy(true);
      setError('');
      const newJobId = await workOrdersService.addJobFromCatalog(
        orderId,
        selectedJob.id,
        assignedTechnicianId || null
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.workOrderDetail(orderId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.orderJobs(orderId) }),
      ]);

      showToast('success', t('catalog.jobAddedSuccess'));
      onJobAdded?.(newJobId);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setBusy(false);
    }
  };

  const hasLabor = selectedJob?.lineas?.some((l) => l.tipo === 'mano_obra');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 720,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="modal-header">
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <BookOpen size={18} /> {t('catalog.selectJob')}
          </h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={busy}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <AlertError message={error} />

          <div style={{ position: 'relative' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-tertiary)',
              }}
            />
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: 36 }}
              placeholder={t('catalog.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: selectedJob ? '1fr 1fr' : '1fr',
              gap: 'var(--space-4)',
              minHeight: 260,
            }}
          >
            {/* Lista de trabajos frecuentes */}
            <div
              style={{
                border: '1px solid var(--color-surface-border)',
                borderRadius: 'var(--radius-md)',
                overflowY: 'auto',
                maxHeight: 340,
              }}
            >
              {catalogQuery.isLoading ? (
                <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  {t('common.loading')}
                </div>
              ) : filteredJobs.length === 0 ? (
                <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  {t('common.noResults')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {filteredJobs.map((job) => {
                    const isSelected = job.id === selectedJobId;
                    return (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => handleSelectJob(job)}
                        disabled={busy}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: 'var(--space-3)',
                          border: 'none',
                          borderBottom: '1px solid var(--color-surface-border)',
                          background: isSelected ? 'var(--color-bg-hover)' : 'transparent',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1, paddingRight: 'var(--space-2)' }}>
                          <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                            {job.nombre}
                          </div>
                          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                            {job.lineas?.length ?? 0} {t('catalog.lines').toLowerCase()}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                            {money(job.total)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Desglose del trabajo elegido */}
            {selectedJob && (
              <div
                style={{
                  border: '1px solid var(--color-surface-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                  background: 'var(--color-bg-secondary)',
                  overflowY: 'auto',
                  maxHeight: 340,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                    {selectedJob.nombre}
                  </h4>
                  <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)' }}>
                    {money(selectedJob.total)}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flex: 1 }}>
                  {selectedJob.lineas?.map((l, idx) => (
                    <div
                      key={l.id ?? idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 'var(--font-size-xs)',
                        padding: '4px 0',
                        borderBottom: '1px solid var(--color-surface-border)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                        <span className="job-chip">
                          {l.tipo === 'mano_obra' ? <Wrench size={10} /> : <Package size={10} />}
                          {l.tipo === 'mano_obra'
                            ? (l.especialidad === 'pintura' ? t('workOrders.painting') : t('workOrders.mechanical'))
                            : `x${l.cantidad}`}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.descripcion}
                        </span>
                      </div>
                      <span style={{ fontWeight: 600, marginLeft: 8 }}>
                        {money(l.tipo === 'mano_obra' ? l.precio : l.cantidad * l.precio)}
                      </span>
                    </div>
                  ))}
                </div>

                {hasLabor && technicians.length > 0 && (
                  <div style={{ marginTop: 'auto', paddingTop: 'var(--space-2)' }}>
                    <label
                      htmlFor="catalog-picker-tech"
                      className="form-label"
                      style={{ fontSize: 'var(--font-size-xs)' }}
                    >
                      {t('catalog.assignedTo')}
                    </label>
                    <TechnicianSelect
                      id="catalog-picker-tech"
                      value={assignedTechnicianId}
                      onChange={setAssignedTechnicianId}
                      technicians={technicians}
                      emptyLabel={t('tasks.noTechnician')}
                      disabled={busy}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={!selectedJob || busy}
          >
            {busy ? t('common.loading') : t('catalog.addJobToOrder')}
          </button>
        </div>
      </div>
    </div>
  );
}
