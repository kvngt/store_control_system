import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Check, X, Layers } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { AlertError } from '../../components/AlertError';
import { workOrdersService } from '../../services/workOrders.service';
import { queryKeys } from '../../lib/queryClient';
import { emptyList } from '../../lib/emptyList';
import { money } from '../../lib/money';
import { getErrorMessage } from '../../lib/errors';
import type { OrderJob } from '../../types/database';

interface OrderJobsListProps {
  orderId: string;
  onRefresh?: () => void;
}

export default function OrderJobsList({ orderId, onRefresh }: OrderJobsListProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { data: jobs = emptyList<OrderJob>() } = useQuery({
    queryKey: queryKeys.orderJobs(orderId),
    queryFn: () => workOrdersService.getOrderJobs(orderId),
    enabled: !!orderId,
  });

  if (!jobs || jobs.length === 0) {
    return null;
  }

  const handleStartRename = (job: OrderJob) => {
    setRenamingId(job.id);
    setRenamingTitle(job.titulo);
    setError('');
  };

  const handleSaveRename = async (jobId: string) => {
    const cleanTitle = renamingTitle.trim();
    if (!cleanTitle) return;

    try {
      setBusyId(jobId);
      setError('');
      await workOrdersService.renameJob(jobId, cleanTitle);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.orderJobs(orderId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workOrderDetail(orderId) }),
      ]);
      setRenamingId(null);
      showToast('success', t('catalog.jobRenamedSuccess'));
      onRefresh?.();
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveJob = async (job: OrderJob) => {
    const msg = t('catalog.removeOrderJobConfirm').replace('{n}', String(job.lineas));
    if (!window.confirm(msg)) return;

    try {
      setBusyId(job.id);
      setError('');
      await workOrdersService.removeJob(job.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.orderJobs(orderId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workOrderDetail(orderId) }),
      ]);
      showToast('success', t('catalog.jobRemovedSuccess'));
      onRefresh?.();
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="order-jobs-list"
      style={{
        marginBottom: 'var(--space-3)',
        padding: 'var(--space-3)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-surface-border)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          fontSize: 'var(--font-size-xs)',
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          textTransform: 'uppercase',
          marginBottom: 'var(--space-2)',
        }}
      >
        <Layers size={14} /> {t('catalog.jobsListTitle')}
      </div>

      <AlertError message={error} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {jobs.map((job) => {
          const isRenaming = renamingId === job.id;
          const isBusy = busyId === job.id;

          return (
            <div
              key={job.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-bg-tertiary)',
                gap: 'var(--space-2)',
                flexWrap: 'wrap',
              }}
            >
              {isRenaming ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: 1 }}>
                  <input
                    type="text"
                    className="form-input"
                    style={{ flex: 1, padding: '4px 8px' }}
                    value={renamingTitle}
                    onChange={(e) => setRenamingTitle(e.target.value)}
                    maxLength={120}
                    disabled={isBusy}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    onClick={() => handleSaveRename(job.id)}
                    disabled={isBusy || !renamingTitle.trim()}
                    aria-label={t('common.save')}
                  >
                    <Check size={14} style={{ color: 'var(--color-success)' }} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    onClick={() => setRenamingId(null)}
                    disabled={isBusy}
                    aria-label={t('common.cancel')}
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                      {job.titulo}
                    </span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                      ({job.lineas} {t('catalog.lines').toLowerCase()})
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginLeft: 'auto' }}>
                    <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                      {money(job.total)}
                    </span>
                    <div style={{ display: 'inline-flex', gap: 2 }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-icon"
                        onClick={() => handleStartRename(job)}
                        disabled={isBusy}
                        title={t('catalog.renameJob')}
                        aria-label={t('catalog.renameJob')}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-icon"
                        onClick={() => handleRemoveJob(job)}
                        disabled={isBusy}
                        title={t('common.delete')}
                        aria-label={t('common.delete')}
                      >
                        <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
