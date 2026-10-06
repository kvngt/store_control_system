import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, RefreshCw, RotateCcw, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { MAX_MEDIA_SECONDS } from '../../lib/media/constants';
import { formatDuration } from '../../lib/media/mime';
import { inspectVideo, thumbFromVideoElement } from '../../lib/media/videoFrame';
import type { PreparedMedia } from '../../types/database';
import { useMediaRecorder } from './useMediaRecorder';
import BodyPortal from '../../components/BodyPortal';

interface VideoRecorderModalProps {
  onDone: (media: PreparedMedia) => void;
  onClose: () => void;
}

interface Poster {
  thumb: Blob | null;
  width: number | null;
  height: number | null;
}

const NO_POSTER: Poster = { thumb: null, width: null, height: null };

/**
 * Cuánto espera "Usar video" a la miniatura sacada del archivo. Casi siempre ya está
 * cuando el técnico termina de revisar la toma; si no, se sigue con la de la cámara en
 * vivo en vez de dejarlo esperando.
 */
const FILE_POSTER_WAIT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    void promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

/** Pantalla completa de grabación: vista previa, tope de 2 minutos, revisar y usar. */
export default function VideoRecorderModal({ onDone, onClose }: VideoRecorderModalProps) {
  const { t } = useLanguage();
  const recorder = useMediaRecorder('video');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const previewRef = useRef<HTMLVideoElement>(null);
  // Dos miniaturas posibles. La del archivo es lo que de verdad quedó grabado; la de la
  // cámara en vivo es el respaldo. En la reunión con el taller el video salía negro antes
  // de guardarlo: la miniatura venía solo de la cámara en vivo, y en varios teléfonos
  // dibujar la cámara en un canvas da un cuadro negro. Las dos descartan un cuadro negro.
  const livePosterRef = useRef<Poster>(NO_POSTER);
  const [liveThumb, setLiveThumb] = useState<Blob | null>(null);
  const filePosterRef = useRef<Promise<Poster> | null>(null);
  const [filePoster, setFilePoster] = useState<Poster | null>(null);
  const [finishing, setFinishing] = useState(false);

  const { openDevice, stream, recording, state, elapsed } = recorder;

  useEffect(() => {
    void openDevice(facing);
  }, [openDevice, facing]);

  useEffect(() => {
    if (previewRef.current) previewRef.current.srcObject = stream;
  }, [stream]);

  const playbackUrl = useMemo(() => (recording ? URL.createObjectURL(recording.blob) : null), [recording]);
  useEffect(
    () => () => {
      if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    },
    [playbackUrl]
  );

  // En cuanto hay grabación se busca su miniatura, mientras el técnico la revisa.
  useEffect(() => {
    setFilePoster(null);
    if (!recording) {
      filePosterRef.current = null;
      return;
    }
    let current = true;
    const pending = inspectVideo(recording.blob)
      .then(({ thumb, width, height }): Poster => ({ thumb, width, height }))
      .catch(() => NO_POSTER);
    filePosterRef.current = pending;
    void pending.then((poster) => {
      if (current) setFilePoster(poster);
    });
    return () => {
      current = false;
    };
  }, [recording]);

  const shownThumb = filePoster?.thumb ?? liveThumb;
  const posterUrl = useMemo(() => (shownThumb ? URL.createObjectURL(shownThumb) : null), [shownThumb]);
  useEffect(
    () => () => {
      if (posterUrl) URL.revokeObjectURL(posterUrl);
    },
    [posterUrl]
  );

  const grabPoster = async () => {
    const video = previewRef.current;
    if (!video) return;
    const thumb = await thumbFromVideoElement(video);
    livePosterRef.current = { thumb, width: video.videoWidth || null, height: video.videoHeight || null };
    setLiveThumb(thumb);
  };

  // La miniatura en vivo se toma un instante antes de detener. Es el respaldo: en algunos
  // navegadores el archivo recién grabado todavía no tiene índice y buscar en él tarda o
  // falla, y en otros la cámara en vivo da un cuadro negro.
  const captureAndStop = async () => {
    await grabPoster();
    recorder.stop();
  };

  // Al llegar al tope el hook detiene solo; la miniatura se toma justo antes.
  const remaining = MAX_MEDIA_SECONDS - elapsed;
  const nearLimit = state === 'recording' && remaining <= 1.5;
  useEffect(() => {
    if (nearLimit && !livePosterRef.current.thumb) void grabPoster();
  }, [nearLimit]);

  const use = async () => {
    if (!recording || finishing) return;
    setFinishing(true);
    const fromFile = await withTimeout(filePosterRef.current ?? Promise.resolve(NO_POSTER), FILE_POSTER_WAIT_MS, NO_POSTER);
    const live = livePosterRef.current;
    onDone({
      tipo: 'video',
      blob: recording.blob,
      mime: recording.mime,
      thumb: fromFile.thumb ?? live.thumb,
      duracionSeg: recording.duration,
      ancho: fromFile.width ?? live.width,
      alto: fromFile.height ?? live.height,
    });
  };

  const retake = () => {
    recorder.reset();
    livePosterRef.current = NO_POSTER;
    setLiveThumb(null);
    void openDevice(facing);
  };

  const timerClass = remaining <= 15 ? 'recorder-timer is-ending' : 'recorder-timer';

  // En <body> y no dentro de la tarjeta que lo abre: con el `:hover` pegado del teléfono la
  // tarjeta se transformaba y el grabador quedaba encajonado en ella, bajo la barra inferior.
  return (
    <BodyPortal>
    <div className="recorder-overlay" role="dialog" aria-modal="true" aria-label={t('media.recordVideo')}>
      <div className="recorder-topbar">
        <button type="button" className="recorder-icon-btn" onClick={onClose} aria-label={t('common.close')}>
          <X size={22} />
        </button>
        {state === 'recording' && (
          <span className={timerClass}>
            <span className="recorder-dot" />
            {formatDuration(elapsed)} / {formatDuration(MAX_MEDIA_SECONDS)}
          </span>
        )}
        <span className="recorder-spacer" />
      </div>

      <div className="recorder-stage">
        {state === 'recorded' && playbackUrl ? (
          // Sin `autoPlay`: con sonido el navegador lo bloquea y el iPhone deja el cuadro en
          // negro hasta que se toca. Con póster y `preload="metadata"` se ve la toma y se
          // reproduce al tocarla.
          //
          // Las `key` hacen que la toma y la cámara en vivo sean dos <video> distintos. Sin
          // ellas React reusaba el elemento de la cámara: le ponía `src` pero le quedaba el
          // `srcObject` de la cámara ya apagada, que manda sobre `src`, y al darle play la
          // pantalla se quedaba en negro (06/10/2026).
          <video
            key="playback"
            className="recorder-video"
            src={playbackUrl}
            poster={posterUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
          />
        ) : (
          <video key="live" className="recorder-video" ref={previewRef} muted playsInline autoPlay />
        )}

        {state === 'starting' && <div className="recorder-message">{t('media.cameraStarting')}</div>}
        {state === 'error' && recorder.error && (
          <div className="recorder-message is-error">{t('media.errors.' + recorder.error.code)}</div>
        )}
      </div>

      <div className="recorder-controls">
        {state === 'recorded' ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={retake} disabled={finishing}>
              <RotateCcw size={18} /> {t('media.retake')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void use()} disabled={finishing}>
              <Check size={18} /> {finishing ? t('media.preparingVideo') : t('media.useVideo')}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="recorder-icon-btn"
              onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
              disabled={state === 'recording'}
              aria-label={t('media.switchCamera')}
            >
              <RefreshCw size={22} />
            </button>
            {state === 'recording' ? (
              <button
                type="button"
                className="recorder-shutter is-recording"
                onClick={() => void captureAndStop()}
                aria-label={t('media.stop')}
              >
                <span />
              </button>
            ) : (
              <button
                type="button"
                className="recorder-shutter"
                onClick={recorder.start}
                disabled={state !== 'ready'}
                aria-label={t('media.record')}
              >
                <span />
              </button>
            )}
            <span className="recorder-spacer" />
          </>
        )}
      </div>
      {state === 'ready' && <p className="recorder-hint">{t('media.videoLimitHint')}</p>}
    </div>
    </BodyPortal>
  );
}
