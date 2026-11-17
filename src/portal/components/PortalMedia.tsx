import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Mic, Play, Video, X } from 'lucide-react';
import { formatDuration } from '../../lib/media/mime';
import type { Formatters, PortalStrings } from '../format';
import type { PortalMedia } from '../portal.types';

export interface PortalPhotoProps {
  src: string;
  alt: string;
  errorLabel: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}

export function PortalPhoto({ src, alt, errorLabel, className, loading }: PortalPhotoProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) {
    return (
      <div
        role="img"
        aria-label={errorLabel}
        className={className ? `portal-photo-error ${className}` : 'portal-photo-error'}
      >
        <span>{errorLabel}</span>
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} loading={loading} onError={() => setFailedSrc(src)} />;
}

export interface PortalMediaGridProps {
  media: PortalMedia[];
  s: PortalStrings;
  fmt: Formatters;
  showDates?: boolean;
}

export function PortalMediaGrid({ media, s, fmt, showDates = false }: PortalMediaGridProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const visual = media.filter((m) => m.tipo !== 'audio');
  const audio = media.filter((m) => m.tipo === 'audio');
  const opened = openIndex !== null ? visual[openIndex] : null;

  return (
    <div className="media-gallery portal-media">
      {visual.length > 0 && (
        <div className="media-grid">
          {visual.map((m, i) => {
            const thumb = m.miniatura_url ?? (m.tipo === 'foto' ? m.url : null);
            const photoAlt = `${s.photo} ${i + 1}`;
            return (
              <div key={m.id} className="media-cell">
                <button type="button" className="media-tile" onClick={() => setOpenIndex(i)} aria-label={m.tipo === 'video' ? s.video : s.photo}>
                  {thumb ? (
                    <PortalPhoto src={thumb} alt={photoAlt} errorLabel={s.photoLoadError} loading="lazy" />
                  ) : m.tipo === 'video' ? (
                    // Un video cuyo cuadro salió negro llega sin miniatura: el ícono, no un
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
                {showDates && <div className="portal-media-date">{fmt.dateTime(m.creado_en)}</div>}
              </div>
            );
          })}
        </div>
      )}

      {audio.length > 0 && (
        <ul className="media-audio-list">
          {audio.map((m) => (
            <li key={m.id} className="media-audio-row">
              {playingAudio === m.id ? (
                <audio src={m.url} controls autoPlay preload="none" className="media-audio-player" />
              ) : (
                <button type="button" className="media-audio-play" onClick={() => setPlayingAudio(m.id)}>
                  <Play size={14} fill="currentColor" />
                  <Mic size={14} />
                  <span>
                    {s.voiceNote} · {formatDuration(m.duracion_seg)}
                    {showDates && ` · ${fmt.dateTime(m.creado_en)}`}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {opened && openIndex !== null && (
        <PortalViewer
          media={opened}
          position={openIndex + 1}
          s={s}
          onClose={() => setOpenIndex(null)}
          onPrev={visual.length > 1 ? () => setOpenIndex((i) => ((i ?? 0) - 1 + visual.length) % visual.length) : undefined}
          onNext={visual.length > 1 ? () => setOpenIndex((i) => ((i ?? 0) + 1) % visual.length) : undefined}
        />
      )}
    </div>
  );
}

export interface PortalViewerProps {
  media: PortalMedia;
  position?: number;
  s: PortalStrings;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export function PortalViewer({ media, position, s, onClose, onPrev, onNext }: PortalViewerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div className="lightbox-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <button type="button" className="lightbox-close" onClick={onClose} aria-label={s.close}>
        <X size={20} />
      </button>
      {onPrev && (
        <button
          type="button"
          className="lightbox-nav is-prev"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label={s.previous}
        >
          <ChevronLeft size={24} />
        </button>
      )}
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        {media.tipo === 'video' ? (
          <video key={media.id} src={media.url} poster={media.miniatura_url ?? undefined} controls autoPlay playsInline preload="metadata" />
        ) : (
          <PortalPhoto
            src={media.url}
            alt={position !== undefined ? `${s.photo} ${position}` : s.photo}
            errorLabel={s.photoLoadError}
          />
        )}
      </div>
      {onNext && (
        <button
          type="button"
          className="lightbox-nav is-next"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          aria-label={s.next}
        >
          <ChevronRight size={24} />
        </button>
      )}
    </div>
  );
}
