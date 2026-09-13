import { useEffect, useMemo } from 'react';
import { Mic, Play, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { formatDuration } from '../../lib/media/mime';
import type { PreparedMedia } from '../../types/database';

/**
 * Miniatura de un archivo que todavía no se envía. Dueña de su object URL, así
 * que la URL muere con la miniatura y no se queda ocupando memoria toda la
 * jornada en la tablet del taller.
 */
function DraftThumb({ media, onRemove }: { media: PreparedMedia; onRemove: () => void }) {
  const { t } = useLanguage();
  const source = media.thumb ?? (media.tipo === 'foto' ? media.blob : null);
  const url = useMemo(() => (source ? URL.createObjectURL(source) : null), [source]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url]
  );

  return (
    <div className={'draft-media' + (media.tipo === 'audio' ? ' is-audio' : '')}>
      {url ? <img src={url} alt="" /> : <Mic size={20} />}
      {media.tipo !== 'foto' && (
        <span className="draft-media-badge">
          {media.tipo === 'video' ? <Play size={10} fill="currentColor" /> : <Mic size={10} />}
          {formatDuration(media.duracionSeg)}
        </span>
      )}
      <button type="button" className="photo-zone-remove" onClick={onRemove} aria-label={t('common.delete')}>
        <X size={12} />
      </button>
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
