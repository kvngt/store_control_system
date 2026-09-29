import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Mic, Play, Trash2, Video } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { formatDuration } from '../../lib/media/mime';
import type { UploadItem } from '../../lib/media/uploadQueue';
import type { OrderMedia } from '../../types/database';
import { useSignedUrls } from './useSignedUrls';
import MediaLightbox from './MediaLightbox';

interface MediaGalleryProps {
  media: OrderMedia[];
  /** Archivos de este mismo lugar que todavía están subiendo. */
  pending?: UploadItem[];
  /** Admin: publicar al cliente y borrar cualquier archivo. */
  canManage?: boolean;
  /** Quien subió un archivo puede borrarlo mientras la orden no esté entregada. */
  canDeleteOwn?: boolean;
  currentUserId?: string;
  onToggleVisibility?: (media: OrderMedia) => void;
  onDelete?: (media: OrderMedia) => void;
  emptyLabel?: string;
}

/** La miniatura local de algo que todavía sube: el Blob ya está en el teléfono. */
function PendingTile({ item }: { item: UploadItem }) {
  const { t } = useLanguage();
  const source = item.thumb ?? (item.tipo === 'foto' ? item.blob : null);
  const url = useMemo(() => (source ? URL.createObjectURL(source) : null), [source]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url]
  );

  const label =
    item.estado === 'error'
      ? t('media.uploadFailed')
      : item.estado === 'pendiente'
        ? t('media.uploadWaiting')
        : `${Math.round(item.progreso * 100)}%`;

  return (
    <div className={'media-tile is-pending' + (item.estado === 'error' ? ' has-error' : '')} title={t('media.uploading')}>
      {url ? (
        <img src={url} alt="" />
      ) : item.tipo === 'video' ? (
        <Video size={24} className="media-tile-icon" />
      ) : (
        <Mic size={24} className="media-tile-icon" />
      )}
      <div className="media-tile-pending">
        <span>{label}</span>
        <div className="progress-bar" style={{ height: 4, width: '80%' }}>
          <div className="progress-fill" style={{ width: `${Math.round(item.progreso * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

/**
 * Fotos, videos y notas de voz de un lugar de la orden (la recepción o un avance).
 *
 * En la cuadrícula solo viajan miniaturas de ~30 KB; el video o la foto completa
 * se piden al abrirlos. Así una orden con diez videos abre igual de rápido que una
 * sin ninguno, que es la preocupación del cliente con la multimedia.
 */
export default function MediaGallery({
  media,
  pending = [],
  canManage = false,
  canDeleteOwn = false,
  currentUserId,
  onToggleVisibility,
  onDelete,
  emptyLabel,
}: MediaGalleryProps) {
  const { t } = useLanguage();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);

  const { urls } = useSignedUrls(media.flatMap((m) => [m.ruta, m.ruta_miniatura]));

  const visual = media.filter((m) => m.tipo !== 'audio');
  const audio = media.filter((m) => m.tipo === 'audio');
  const pendingVisual = pending.filter((p) => p.tipo !== 'audio');
  const pendingAudio = pending.filter((p) => p.tipo === 'audio');

  if (!media.length && !pending.length) {
    return emptyLabel ? <p className="media-empty">{emptyLabel}</p> : null;
  }

  const canDelete = (m: OrderMedia) => canManage || (canDeleteOwn && !!currentUserId && m.subido_por === currentUserId);

  const actions = (m: OrderMedia) => (
    <div className="media-tile-actions">
      {canManage ? (
        <button
          type="button"
          className={'media-visibility' + (m.visible_cliente ? ' is-visible' : '')}
          onClick={() => onToggleVisibility?.(m)}
          title={m.visible_cliente ? t('media.unpublish') : t('media.publish')}
          // El texto visible dice el estado ("Interno"); el nombre accesible dice
          // lo que hace el botón, que es lo que un lector de pantalla necesita.
          aria-label={m.visible_cliente ? t('media.unpublish') : t('media.publish')}
          aria-pressed={m.visible_cliente}
        >
          {m.visible_cliente ? <Eye size={13} /> : <EyeOff size={13} />}
          <span>{m.visible_cliente ? t('media.visibleToCustomer') : t('media.internal')}</span>
        </button>
      ) : (
        m.visible_cliente && (
          <span className="media-visibility is-visible is-readonly">
            <Eye size={13} /> <span>{t('media.visibleToCustomer')}</span>
          </span>
        )
      )}
      {canDelete(m) && onDelete && (
        <button type="button" className="media-delete" onClick={() => onDelete(m)} aria-label={t('common.delete')} title={t('common.delete')}>
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );

  const opened = openIndex !== null ? visual[openIndex] : null;

  return (
    <div className="media-gallery">
      {(visual.length > 0 || pendingVisual.length > 0) && (
        <div className="media-grid">
          {visual.map((m, i) => {
            const thumb = m.ruta_miniatura ? urls[m.ruta_miniatura] : m.tipo === 'foto' ? urls[m.ruta] : undefined;
            return (
              <div key={m.id} className="media-cell">
                <button type="button" className="media-tile" onClick={() => setOpenIndex(i)} aria-label={t('media.kind.' + m.tipo)}>
                  {thumb ? (
                    <img src={thumb} alt="" loading="lazy" />
                  ) : m.tipo === 'video' && !m.ruta_miniatura ? (
                    // Sin miniatura (el cuadro salió negro y se descartó): el ícono, no un
                    // "cargando" que no termina nunca.
                    <Video size={24} className="media-tile-icon" />
                  ) : (
                    <span className="media-tile-placeholder" />
                  )}
                  {m.tipo === 'video' && (
                    <span className="media-tile-badge">
                      <Play size={12} fill="currentColor" /> {formatDuration(m.duracion_seg)}
                    </span>
                  )}
                </button>
                {actions(m)}
              </div>
            );
          })}
          {pendingVisual.map((item) => (
            <div key={item.id} className="media-cell">
              <PendingTile item={item} />
            </div>
          ))}
        </div>
      )}

      {(audio.length > 0 || pendingAudio.length > 0) && (
        <ul className="media-audio-list">
          {audio.map((m) => (
            <li key={m.id} className="media-audio-row">
              {playingAudio === m.id && urls[m.ruta] ? (
                <audio src={urls[m.ruta]} controls autoPlay preload="none" className="media-audio-player" />
              ) : (
                <button type="button" className="media-audio-play" onClick={() => setPlayingAudio(m.id)} disabled={!urls[m.ruta]}>
                  <Play size={14} fill="currentColor" />
                  <Mic size={14} />
                  <span>
                    {t('media.kind.audio')} · {formatDuration(m.duracion_seg)}
                  </span>
                </button>
              )}
              {actions(m)}
            </li>
          ))}
          {pendingAudio.map((item) => (
            <li key={item.id} className="media-audio-row is-pending">
              <Mic size={14} />
              <span>
                {t('media.kind.audio')} · {formatDuration(item.duracionSeg)} ·{' '}
                {item.estado === 'error' ? t('media.uploadFailed') : `${Math.round(item.progreso * 100)}%`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {opened && (
        <MediaLightbox
          tipo={opened.tipo === 'video' ? 'video' : 'foto'}
          itemKey={opened.id}
          src={urls[opened.ruta]}
          poster={opened.ruta_miniatura ? urls[opened.ruta_miniatura] : undefined}
          onClose={() => setOpenIndex(null)}
          onPrev={visual.length > 1 ? () => setOpenIndex((i) => ((i ?? 0) - 1 + visual.length) % visual.length) : undefined}
          onNext={visual.length > 1 ? () => setOpenIndex((i) => ((i ?? 0) + 1) % visual.length) : undefined}
        />
      )}
    </div>
  );
}
