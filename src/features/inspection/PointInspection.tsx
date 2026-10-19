import { useState, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Camera,
  FileText,
  Play,
  Check,
  Eye,
  EyeOff,
  BookOpen,
  FileSignature,
} from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { inspectionService } from '../../services/inspection.service';
import { queryKeys } from '../../lib/queryClient';
import { getErrorMessage } from '../../lib/errors';
import { prepareMediaFile } from '../media/prepareMedia';
import CatalogPickerModal from '../catalog/CatalogPickerModal';
import type {
  InspectionPoint,
  InspectionPointState,
  OrderInspection,
  OrderMedia,
  PreparedMedia,
  OrderAssignment,
} from '../../types/database';
import type { Technician } from '../workOrders/tasks';
import type { UploadItem } from '../../lib/media/uploadQueue';

interface PointInspectionProps {
  orderId: string;
  orderSedeId: string;
  isAdmin: boolean;
  canEdit: boolean;
  isDelivered: boolean;
  media: OrderMedia[];
  pendingUploads: UploadItem[];
  technicians?: Technician[];
  assignments?: readonly Pick<OrderAssignment, 'usuario_id' | 'tipo_tarea'>[];
  onQuotePoint?: (point: InspectionPoint) => void;
  onRefreshOrder?: () => Promise<void>;
  onAddMedia: (puntoId: string, items: PreparedMedia[]) => void;
}

export default function PointInspection({
  orderId,
  orderSedeId,
  isAdmin,
  canEdit,
  isDelivered,
  media,
  pendingUploads,
  technicians = [],
  assignments = [],
  onQuotePoint,
  onRefreshOrder,
  onAddMedia,
}: PointInspectionProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [starting, setStarting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [catalogPoint, setCatalogPoint] = useState<InspectionPoint | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const activePointForPhotoRef = useRef<string | null>(null);

  const inspectionQuery = useQuery({
    queryKey: queryKeys.inspection(orderId),
    queryFn: () => inspectionService.getForOrder(orderId),
    enabled: !!orderId,
  });

  const inspection = inspectionQuery.data;
  const puntos = useMemo(() => inspection?.puntos ?? [], [inspection?.puntos]);

  // Puntos agrupados por sección conservando el orden de aparición
  const sections = useMemo(() => {
    const map = new Map<string, InspectionPoint[]>();
    for (const p of puntos) {
      const list = map.get(p.seccion) ?? [];
      list.push(p);
      map.set(p.seccion, list);
    }
    return Array.from(map.entries()).map(([seccion, items]) => ({ seccion, items }));
  }, [puntos]);

  const totalPoints = puntos.length;
  const reviewedPoints = puntos.filter((p) => p.estado !== 'pendiente').length;
  const pendingPoints = totalPoints - reviewedPoints;
  const isFinished = Boolean(inspection?.completada_en);
  const isPublished = Boolean(inspection?.publicada_en);

  const handleStartInspection = async () => {
    setStarting(true);
    try {
      await inspectionService.start(orderId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.inspection(orderId) });
      showToast('success', t('inspection.startedSuccess'));
    } catch (err) {
      showToast('error', t('inspection.startError'), getErrorMessage(err, language));
    } finally {
      setStarting(false);
    }
  };

  const handleMarkPoint = async (point: InspectionPoint, targetState: InspectionPointState) => {
    if (!canEdit || isDelivered) return;
    // Si se toca el estado actual, se revierte a 'pendiente'
    const nextState: InspectionPointState = point.estado === targetState ? 'pendiente' : targetState;

    // Actualización optimista en caché de React Query
    queryClient.setQueryData<OrderInspection | null>(queryKeys.inspection(orderId), (prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        puntos: (prev.puntos ?? []).map((p) => (p.id === point.id ? { ...p, estado: nextState } : p)),
      };
    });

    try {
      await inspectionService.markPoint(point.id, nextState, point.nota);
    } catch (err) {
      // Revertir en caso de error
      await queryClient.invalidateQueries({ queryKey: queryKeys.inspection(orderId) });
      showToast('error', getErrorMessage(err, language));
    }
  };

  const handleOpenNote = (point: InspectionPoint) => {
    if (editingNoteId === point.id) {
      setEditingNoteId(null);
    } else {
      setEditingNoteId(point.id);
      setNoteDraft(point.nota ?? '');
    }
  };

  const handleSaveNote = async (point: InspectionPoint) => {
    setSavingNoteId(point.id);
    const trimmed = noteDraft.trim() || null;
    try {
      await inspectionService.markPoint(point.id, point.estado, trimmed);
      queryClient.setQueryData<OrderInspection | null>(queryKeys.inspection(orderId), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          puntos: (prev.puntos ?? []).map((p) => (p.id === point.id ? { ...p, nota: trimmed } : p)),
        };
      });
      setEditingNoteId(null);
      showToast('success', t('inspection.noteSaved'));
    } catch (err) {
      showToast('error', t('inspection.noteError'), getErrorMessage(err, language));
    } finally {
      setSavingNoteId(null);
    }
  };

  const handleTriggerPhoto = (pointId: string) => {
    activePointForPhotoRef.current = pointId;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const pointId = activePointForPhotoRef.current;
    e.target.value = '';
    if (!file || !pointId) return;

    try {
      const prepared = await prepareMediaFile(file);
      onAddMedia(pointId, [prepared]);
      showToast('success', t('inspection.photoAdded'));
    } catch {
      showToast('error', t('inspection.photoError'));
    }
  };

  const handleCompleteInspection = async () => {
    if (!inspection || pendingPoints > 0) return;
    setCompleting(true);
    try {
      await inspectionService.complete(inspection.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.inspection(orderId) });
      showToast('success', t('inspection.finishedSuccess'));
    } catch (err) {
      showToast('error', t('inspection.finishError'), getErrorMessage(err, language));
    } finally {
      setCompleting(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!inspection || !isAdmin) return;
    const nextPublish = !isPublished;
    setPublishing(true);
    try {
      await inspectionService.publish(inspection.id, nextPublish);
      await queryClient.invalidateQueries({ queryKey: queryKeys.inspection(orderId) });
      showToast('success', t(nextPublish ? 'inspection.publishedSuccess' : 'inspection.unpublishedSuccess'));
    } catch (err) {
      showToast('error', t('inspection.publishError'), getErrorMessage(err, language));
    } finally {
      setPublishing(false);
    }
  };

  // Sin inspección: botón para iniciar
  if (!inspection) {
    return (
      <div className="point-inspection" data-testid="point-inspection-empty">
        <h4 style={{ marginBottom: 'var(--space-2)' }}>{t('inspection.title')}</h4>
        <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>
          {t('inspection.empty')}
        </p>
        {(canEdit || isAdmin) && !isDelivered && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleStartInspection}
            disabled={starting}
          >
            <Play size={16} /> {starting ? t('common.loading') : t('inspection.start')}
          </button>
        )}
      </div>
    );
  }

  const progressPercent = totalPoints > 0 ? Math.round((reviewedPoints / totalPoints) * 100) : 0;

  return (
    <div className="point-inspection" data-testid="point-inspection-active">
      {/* Hidden file input for capturing point photos */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <div className="inspection-header">
        <div>
          <h4 style={{ margin: 0 }}>{inspection.nombre || t('inspection.title')}</h4>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            {t('inspection.progressCount').replace('{reviewed}', String(reviewedPoints)).replace('{total}', String(totalPoints))}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {isFinished ? (
            <span className="badge badge-success">
              <Check size={12} /> {t('inspection.completedBadge')}
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handleCompleteInspection}
              disabled={completing || pendingPoints > 0 || isDelivered}
            >
              <Check size={16} /> {completing ? t('common.loading') : t('inspection.finish')}
            </button>
          )}

          {isAdmin && isFinished && (
            <button
              type="button"
              className={`btn btn-sm ${isPublished ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={handleTogglePublish}
              disabled={publishing}
              title={isPublished ? t('inspection.hideFromCustomer') : t('inspection.showToCustomer')}
            >
              {isPublished ? <Eye size={16} style={{ color: 'var(--color-success)' }} /> : <EyeOff size={16} />}
              {isPublished ? t('inspection.publishedBadge') : t('inspection.showToCustomer')}
            </button>
          )}
        </div>
      </div>

      <div className="inspection-progress-bar">
        <div className="inspection-progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      {sections.map(({ seccion, items }) => (
        <div key={seccion} className="inspection-section-group">
          <div className="inspection-section-title">{seccion}</div>

          {items.map((point) => {
            const pointMedia = media.filter((m) => m.inspeccion_punto_id === point.id);
            const pointPending = pendingUploads.filter((p) => p.inspeccionPuntoId === point.id);
            const hasMedia = pointMedia.length > 0 || pointPending.length > 0;
            const hasNote = Boolean(point.nota?.trim());
            const needsAction = point.estado === 'atencion' || point.estado === 'urgente';

            return (
              <div key={point.id} className="inspection-point-row">
                <div className="inspection-point-header">
                  <span className="inspection-point-name">{point.nombre}</span>

                  <div className="inspection-point-buttons">
                    <button
                      type="button"
                      className={`inspection-btn is-bien ${point.estado === 'bien' ? 'is-active' : ''}`}
                      onClick={() => handleMarkPoint(point, 'bien')}
                      disabled={!canEdit || isDelivered}
                      title={t('inspection.states.bien')}
                      aria-pressed={point.estado === 'bien'}
                    >
                      <CheckCircle2 size={16} />
                      <span>{t('inspection.states.bien')}</span>
                    </button>

                    <button
                      type="button"
                      className={`inspection-btn is-atencion ${point.estado === 'atencion' ? 'is-active' : ''}`}
                      onClick={() => handleMarkPoint(point, 'atencion')}
                      disabled={!canEdit || isDelivered}
                      title={t('inspection.states.atencion')}
                      aria-pressed={point.estado === 'atencion'}
                    >
                      <AlertTriangle size={16} />
                      <span>{t('inspection.states.atencion')}</span>
                    </button>

                    <button
                      type="button"
                      className={`inspection-btn is-urgente ${point.estado === 'urgente' ? 'is-active' : ''}`}
                      onClick={() => handleMarkPoint(point, 'urgente')}
                      disabled={!canEdit || isDelivered}
                      title={t('inspection.states.urgente')}
                      aria-pressed={point.estado === 'urgente'}
                    >
                      <AlertOctagon size={16} />
                      <span>{t('inspection.states.urgente')}</span>
                    </button>

                    <button
                      type="button"
                      className={`inspection-btn is-na ${point.estado === 'no_aplica' ? 'is-active' : ''}`}
                      onClick={() => handleMarkPoint(point, 'no_aplica')}
                      disabled={!canEdit || isDelivered}
                      title={t('inspection.states.no_aplica')}
                      aria-pressed={point.estado === 'no_aplica'}
                    >
                      {t('inspection.states.no_aplica')}
                    </button>

                    <button
                      type="button"
                      className={`inspection-icon-btn ${hasNote ? 'has-note' : ''}`}
                      onClick={() => handleOpenNote(point)}
                      title={hasNote ? point.nota! : t('inspection.addNote')}
                      aria-label={t('inspection.addNote')}
                    >
                      <FileText size={18} />
                    </button>

                    <button
                      type="button"
                      className="inspection-icon-btn"
                      onClick={() => handleTriggerPhoto(point.id)}
                      disabled={!canEdit || isDelivered}
                      title={t('inspection.takePhoto')}
                      aria-label={t('inspection.takePhoto')}
                    >
                      <Camera size={18} />
                    </button>
                  </div>
                </div>

                {/* Nota inline si está abierta */}
                {editingNoteId === point.id && (
                  <div className="inspection-note-box">
                    <textarea
                      className="form-input"
                      rows={2}
                      maxLength={500}
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder={t('inspection.notePlaceholder')}
                      style={{ width: '100%', marginBottom: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setEditingNoteId(null)}
                      >
                        {t('inspection.cancelNote')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleSaveNote(point)}
                        disabled={savingNoteId === point.id}
                      >
                        {savingNoteId === point.id ? t('common.loading') : t('inspection.saveNote')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Nota guardada visible si no se está editando */}
                {editingNoteId !== point.id && hasNote && (
                  <p
                    className="field-hint"
                    style={{ margin: 0, cursor: 'pointer', fontStyle: 'italic' }}
                    onClick={() => handleOpenNote(point)}
                  >
                    «{point.nota}»
                  </p>
                )}

                {/* Miniaturas de fotos del punto */}
                {hasMedia && (
                  <div className="inspection-point-media">
                    {pointMedia.map((m) => (
                      <img
                        key={m.id}
                        src={m.ruta_miniatura || m.ruta}
                        alt={point.nombre}
                        className="inspection-thumb"
                      />
                    ))}
                    {pointPending.map((p) => (
                      <div
                        key={p.id}
                        className="inspection-thumb"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'var(--color-bg-secondary)',
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-tertiary)',
                        }}
                      >
                        {Math.round(p.progreso * 100)}%
                      </div>
                    ))}
                  </div>
                )}

                {/* Acciones de administración en inspección terminada para puntos de atención o urgente */}
                {isAdmin && isFinished && needsAction && (
                  <div className="inspection-admin-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => onQuotePoint?.(point)}
                    >
                      <FileSignature size={14} /> {t('inspection.quote')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setCatalogPoint(point)}
                    >
                      <BookOpen size={14} /> {t('inspection.fromCatalog')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Modal del catálogo si se eligió agregar desde catálogo en un punto */}
      {catalogPoint && (
        <CatalogPickerModal
          isOpen={true}
          onClose={() => setCatalogPoint(null)}
          sedeId={orderSedeId}
          orderId={orderId}
          technicians={technicians}
          assignments={assignments}
          onJobAdded={async () => {
            setCatalogPoint(null);
            if (onRefreshOrder) await onRefreshOrder();
            showToast('success', t('catalog.jobAddedSuccess'));
          }}
        />
      )}
    </div>
  );
}
