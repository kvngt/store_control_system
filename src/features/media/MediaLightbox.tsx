import { useEffect } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import BodyPortal from '../../components/BodyPortal';

interface MediaLightboxProps {
  tipo: 'foto' | 'video';
  /** Identidad de lo que se muestra: al cambiar, el video se vuelve a montar. */
  itemKey: string;
  /** Sin `src` todavía (la URL firmada no llega), un spinner. */
  src?: string;
  poster?: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

/**
 * Una foto o un video a pantalla completa. Lo usan la galería de la orden y el borrador
 * de un avance, que antes mostraba la miniatura de un video sin forma de reproducirlo.
 */
export default function MediaLightbox({ tipo, itemKey, src, poster, onClose, onPrev, onNext }: MediaLightboxProps) {
  const { t } = useLanguage();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev?.();
      if (e.key === 'ArrowRight') onNext?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  // En <body>, por lo mismo que el grabador: la galería vive dentro de una tarjeta, y con el
  // `:hover` pegado del teléfono el visor quedaba encerrado en ella.
  return (
    <BodyPortal>
    <div className="lightbox-overlay" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label={t('common.close')}>
        <X size={20} />
      </button>
      {onPrev && (
        <button
          className="lightbox-nav is-prev"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label={t('common.previous')}
        >
          <ChevronLeft size={24} />
        </button>
      )}
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        {!src ? (
          <div className="spinner" />
        ) : tipo === 'video' ? (
          // `key`: al pasar de un video a otro, el elemento se vuelve a montar en
          // vez de seguir reproduciendo el anterior con otro `src`.
          <video key={itemKey} src={src} poster={poster} controls autoPlay playsInline preload="metadata" />
        ) : (
          <img src={src} alt={t('media.kind.foto')} />
        )}
      </div>
      {onNext && (
        <button
          className="lightbox-nav is-next"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          aria-label={t('common.next')}
        >
          <ChevronRight size={24} />
        </button>
      )}
    </div>
    </BodyPortal>
  );
}
