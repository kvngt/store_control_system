import { useState } from 'react';
import { MessageSquarePlus, Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import type { UploadItem } from '../../lib/media/uploadQueue';
import type { OrderMedia, OrderProgressUpdate, PreparedMedia } from '../../types/database';
import DraftMediaStrip from '../media/DraftMediaStrip';
import MediaCaptureBar from '../media/MediaCaptureBar';
import MediaGallery from '../media/MediaGallery';

interface ProgressLogProps {
  entries: OrderProgressUpdate[];
  /** Toda la multimedia de la orden; cada avance toma la suya. */
  media: OrderMedia[];
  /** Lo que todavía sube de esta orden. */
  pending: UploadItem[];
  canEdit: boolean;
  busy: boolean;
  isAdmin: boolean;
  userId?: string;
  /** Resolves true when the entry was stored, so the draft can be cleared. */
  onAdd: (note: string, media: PreparedMedia[]) => Promise<boolean>;
  onRemove: (id: string) => Promise<void>;
  onToggleVisibility: (media: OrderMedia) => void;
  onDeleteMedia: (media: OrderMedia) => void;
}

/**
 * Donde mecánicos y pintores documentan lo que hicieron: una nota, fotos, videos
 * cortos y notas de voz.
 *
 * Un avance puede ser solo un video o solo una nota de voz: para explicar una
 * falla, grabarla es más rápido y más claro que escribirla con los guantes
 * puestos. Lo que se sube aquí es interno hasta que un admin lo publica al cliente.
 */
export default function ProgressLog({
  entries,
  media,
  pending,
  canEdit,
  busy,
  isAdmin,
  userId,
  onAdd,
  onRemove,
  onToggleVisibility,
  onDeleteMedia,
}: ProgressLogProps) {
  const { t, language } = useLanguage();
  const [note, setNote] = useState('');
  const [drafts, setDrafts] = useState<PreparedMedia[]>([]);

  const submit = async () => {
    if (await onAdd(note, drafts)) {
      setNote('');
      setDrafts([]);
    }
  };

  const canSubmit = canEdit && !busy && (note.trim().length > 0 || drafts.length > 0);

  return (
    <div className="card" style={{ marginTop: 'var(--space-4)' }}>
      <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
        <MessageSquarePlus size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
        {t('workOrders.progressLog')}
      </h3>

      {canEdit && (
        <div className="progress-entry-form">
          <textarea
            className="form-input form-textarea"
            placeholder={t('workOrders.progressPlaceholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          <DraftMediaStrip items={drafts} onRemove={(index) => setDrafts((prev) => prev.filter((_, i) => i !== index))} />
          <MediaCaptureBar onAdd={(items) => setDrafts((prev) => [...prev, ...items])} disabled={busy} />
          <div className="progress-entry-submit">
            <p className="field-hint">{t('media.internalUntilPublished')}</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={!canSubmit}>
              <Plus size={16} /> {busy ? t('common.loading') : t('workOrders.addProgress')}
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>{t('common.noResults')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {entries.map((avance) => (
            <div key={avance.id} className="progress-entry">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                  {avance.usuario?.nombre_completo || '—'} ·{' '}
                  {new Date(avance.creado_en).toLocaleString(language === 'es' ? 'es' : 'en')}
                </div>
                {(isAdmin || userId === avance.usuario_id) && (
                  <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => onRemove(avance.id)} aria-label={t('common.delete')}>
                    <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                  </button>
                )}
              </div>
              {avance.descripcion && (
                <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6 }}>{avance.descripcion}</p>
              )}
              <div style={{ marginTop: 'var(--space-3)' }}>
                <MediaGallery
                  media={media.filter((m) => m.avance_id === avance.id)}
                  pending={pending.filter((p) => p.avanceId === avance.id)}
                  canManage={isAdmin}
                  canDeleteOwn={canEdit}
                  currentUserId={userId}
                  onToggleVisibility={onToggleVisibility}
                  onDelete={onDeleteMedia}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
