import { useEffect, useMemo, useState } from 'react';
import { Mic, Play, Video, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { formatDuration } from '../../lib/media/mime';
import type { PreparedMedia } from '../../types/database';
import MediaLightbox from './MediaLightbox';

/** Una object URL que vive lo que vive el componente que la pide. */
function useObjectUrl(source: Blob | null) {
  const url = useMemo(() => (source ? URL.createObjectURL(source) : null), [source]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url]
  );
  return url;
}

/**
 * El visor de un archivo del borrador. Aparte de la miniatura para que la URL del video
 * completo exista solo mientras se mira, no por cada video del borrador.
 */
function DraftViewer({ media, poster, onClose }: { media: PreparedMedia; poster: string | null; onClose: () => void }) {
  const src = useObjectUrl(media.blob);
  return (
    <MediaLightbox
      tipo={media.tipo === 'video' ? 'video' : 'foto'}
      itemKey={`${media.blob.size}`}
      src={src ?? undefined}
      poster={poster ?? undefined}
      onClose={onClose}
    />
  );
}

/**
 * Miniatura de un archivo que todavía no se envía. Dueña de su object URL, así
 * que la URL muere con la miniatura y no se queda ocupando memoria toda la
 * jornada en la tablet del taller.
 *
 * Una foto o un video se abren al tocarlos. Antes el video mostraba un ícono de
 * reproducir que no reproducía nada, y con una miniatura negra el técnico no tenía
 * cómo saber si la toma servía antes de guardar el avance (reunión con el taller,
 * sept. 2026).
 */
function DraftThumb({ media, onRemove }: { media: PreparedMedia; onRemove: () => void }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const url = useObjectUrl(media.thumb ?? (media.tipo === 'foto' ? media.blob : null));
  const canOpen = media.tipo !== 'audio';

  const preview = (
    <>
      {url ? <img src={url} alt="" /> : media.tipo === 'video' ? <Video size={20} /> : <Mic size={20} />}
      {media.tipo !== 'foto' && (
        <span className="draft-media-badge">
          {media.tipo === 'video' ? <Play size={10} fill="currentColor" /> : <Mic size={10} />}
          {formatDuration(media.duracionSeg)}
        </span>
      )}
    </>
  );

  return (
    <div className={'draft-media' + (media.tipo === 'audio' ? ' is-audio' : '')}>
      {canOpen ? (
        <button type="button" className="draft-media-open" onClick={() => setOpen(true)} aria-label={t('media.kind.' + media.tipo)}>
          {preview}
        </button>
      ) : (
        preview
      )}
      <button type="button" className="photo-zone-remove" onClick={onRemove} aria-label={t('common.delete')}>
        <X size={12} />
      </button>
      {open && <DraftViewer media={media} poster={url} onClose={() => setOpen(false)} />}
    </div>
  );
}

export default function DraftMediaStrip({ items, onRemove }: { items: PreparedMedia[]; onRemove: (index: number) => void }) {
  if (!items.length) return null;
  return (
    <div className="draft-media-strip">
      {items.map((media, index) => (
        // El Blob es la identidad real; el índice solo desempata.
        <DraftThumb key={`${media.blob.size}-${index}`} media={media} onRemove={() => onRemove(index)} />
      ))}
    </div>
  );
}
