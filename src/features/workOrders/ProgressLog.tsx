import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, MessageSquarePlus, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/auth.context';
import { useLanguage } from '../../context/language.context';
import type { OrderProgressUpdate } from '../../types/database';

/**
 * Thumbnail for a progress photo still waiting to be uploaded.
 *
 * The object URL used to be minted inline in the render — `<img
 * src={URL.createObjectURL(file)} />` — which handed out a fresh one on every
 * keystroke in the note field and revoked none of them. Owning the URL in a
 * component ties its lifetime to the thumbnail's.
 */
function DraftPhotoThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  return (
    <div style={{ position: 'relative', width: 72, height: 72, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-surface-border)' }}>
      <img src={url} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <button type="button" className="photo-zone-remove" onClick={onRemove}>
        <X size={12} />
      </button>
    </div>
  );
}

interface ProgressLogProps {
  entries: OrderProgressUpdate[];
  canEdit: boolean;
  busy: boolean;
  /** Resolves true when the entry was stored, so the draft can be cleared. */
  onAdd: (note: string, files: File[]) => Promise<boolean>;
  onRemove: (id: string) => Promise<void>;
  onOpenPhoto: (url: string) => void;
}

/** Where mechanics and painters document what they did, with photos. */
export default function ProgressLog({ entries, canEdit, busy, onAdd, onRemove, onOpenPhoto }: ProgressLogProps) {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) setPhotos((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const submit = async () => {
    if (await onAdd(note, photos)) {
      setNote('');
      setPhotos([]);
    }
  };

  return (
    <div className="card" style={{ marginTop: 'var(--space-4)' }}>
      <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
        <MessageSquarePlus size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
        {t('workOrders.progressLog')}
      </h3>

      {/* New entry form */}
      <div style={{ padding: 'var(--space-4)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-4)' }}>
        <textarea
          className="form-input form-textarea"
          placeholder={t('workOrders.progressPlaceholder')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          capture="environment"
          multiple
          style={{ display: 'none' }}
          onChange={addPhotos}
        />
        {photos.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
            {photos.map((file, i) => (
              <DraftPhotoThumb
                key={`${file.name}-${i}`}
                file={file}
                onRemove={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
              />
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
            <Camera size={16} /> {t('workOrders.addPhotos')}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={submit}
            disabled={!canEdit || busy || !note.trim()}
          >
            <Plus size={16} /> {busy ? t('common.loading') : t('workOrders.addProgress')}
          </button>
        </div>
      </div>

      {/* Timeline */}
      {entries.length === 0 ? (
        <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>{t('common.noResults')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {entries.map((avance) => (
            <div
              key={avance.id}
              style={{
                padding: 'var(--space-4)',
                borderLeft: '3px solid var(--color-primary)',
                background: 'var(--color-bg-tertiary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                  {avance.usuario?.nombre_completo || '—'} · {new Date(avance.creado_en).toLocaleString(language === 'es' ? 'es' : 'en')}
                </div>
                {(user?.rol === 'admin' || user?.id === avance.usuario_id) && (
                  <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => onRemove(avance.id)}>
                    <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                  </button>
                )}
              </div>
              <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6 }}>{avance.descripcion}</p>
              {avance.fotos && avance.fotos.length > 0 && (
                <div className="photo-gallery-grid" style={{ marginTop: 'var(--space-3)' }}>
                  {avance.fotos.map((url, i) => (
                    <button key={i} type="button" className="photo-gallery-thumb" onClick={() => onOpenPhoto(url)}>
                      <img src={url} alt={`avance-${i}`} loading="lazy" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
