import { useRef, useState } from 'react';
import { Camera, Images, Mic, Video } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { compressImage } from '../../lib/media/image';
import { isMediaError, MediaProcessingError } from '../../lib/media/errors';
import type { PreparedMedia } from '../../types/database';
import AudioRecorderModal from './AudioRecorderModal';
import VideoRecorderModal from './VideoRecorderModal';

interface MediaCaptureBarProps {
  onAdd: (items: PreparedMedia[]) => void;
  disabled?: boolean;
  /** Qué botones mostrar. Por defecto, todos. */
  allow?: { photo?: boolean; video?: boolean; audio?: boolean; gallery?: boolean };
}

/**
 * Los cuatro caminos para documentar una orden desde el teléfono.
 *
 * Todo sale de aquí ya procesado — la foto comprimida, el video en 720p, la
 * nota de voz liviana — para que lo que entra a la cola sea lo que se va a
 * subir, sin trabajo pendiente que pueda perderse si la pestaña se cierra.
 */
export default function MediaCaptureBar({ onAdd, disabled, allow = {} }: MediaCaptureBarProps) {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [recorder, setRecorder] = useState<'video' | 'audio' | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const show = { photo: true, video: true, audio: true, gallery: true, ...allow };
  const busy = disabled || processing !== null;

  const reportError = (err: unknown) => {
    const detail = isMediaError(err) ? t('media.errors.' + err.code) : t('media.errors.unsupported-file');
    showToast('error', t('media.addError'), detail);
  };

  const processFiles = async (files: File[]) => {
    const prepared: PreparedMedia[] = [];
    for (const [index, file] of files.entries()) {
      const label = files.length > 1 ? ` (${index + 1}/${files.length})` : '';
      try {
        if (file.type.startsWith('image/')) {
          setProcessing(t('media.processing') + label);
          prepared.push(await compressImage(file));
        } else if (file.type.startsWith('video/')) {
          setProcessing(t('media.converting').replace('{pct}', '0') + label);
          // Solo aquí se descarga la librería de conversión.
          const { prepareGalleryVideo } = await import('../../lib/media/galleryVideo');
          prepared.push(
            await prepareGalleryVideo(file, {
              onProgress: (p) =>
                setProcessing(t('media.converting').replace('{pct}', String(Math.round(p * 100))) + label),
            })
          );
        } else {
          throw new MediaProcessingError('unsupported-file');
        }
      } catch (err) {
        // Un archivo malo no descarta los demás que sí se pudieron preparar.
        reportError(err);
      }
    }
    setProcessing(null);
    if (prepared.length) onAdd(prepared);
  };

  const onFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Limpiar antes de procesar: elegir el mismo archivo otra vez tiene que
    // volver a disparar el evento.
    e.target.value = '';
    if (files.length) void processFiles(files);
  };

  return (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onFiles} />
      <input ref={galleryRef} type="file" accept="image/*,video/*" multiple hidden onChange={onFiles} />

      <div className="media-capture-bar">
        {show.photo && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => cameraRef.current?.click()} disabled={busy}>
            <Camera size={16} /> {t('media.takePhoto')}
          </button>
        )}
        {show.video && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRecorder('video')} disabled={busy}>
            <Video size={16} /> {t('media.recordVideo')}
          </button>
        )}
        {show.audio && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRecorder('audio')} disabled={busy}>
            <Mic size={16} /> {t('media.recordAudio')}
          </button>
        )}
        {show.gallery && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => galleryRef.current?.click()} disabled={busy}>
            <Images size={16} /> {t('media.fromGallery')}
          </button>
        )}
      </div>
      {processing && (
        <p className="field-hint media-capture-status" role="status">
          <span className="spinner-small media-capture-spinner" /> {processing}
        </p>
      )}

      {recorder === 'video' && (
        <VideoRecorderModal
          onClose={() => setRecorder(null)}
          onDone={(media) => {
            setRecorder(null);
            onAdd([media]);
          }}
        />
      )}
      {recorder === 'audio' && (
        <AudioRecorderModal
          onClose={() => setRecorder(null)}
          onDone={(media) => {
            setRecorder(null);
            onAdd([media]);
          }}
        />
      )}
    </>
  );
}
