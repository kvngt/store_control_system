import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, RefreshCw, RotateCcw, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { MAX_MEDIA_SECONDS } from '../../lib/media/constants';
import { formatDuration } from '../../lib/media/mime';
import { thumbFromVideoElement } from '../../lib/media/videoFrame';
import type { PreparedMedia } from '../../types/database';
import { useMediaRecorder } from './useMediaRecorder';

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

/** Pantalla completa de grabación: vista previa, tope de 2 minutos, revisar y usar. */
export default function VideoRecorderModal({ onDone, onClose }: VideoRecorderModalProps) {
  const { t } = useLanguage();
  const recorder = useMediaRecorder('video');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const previewRef = useRef<HTMLVideoElement>(null);
  const posterRef = useRef<Poster>(NO_POSTER);

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

  const grabPoster = async () => {
    const video = previewRef.current;
    if (!video) return;
    posterRef.current = {
      thumb: await thumbFromVideoElement(video),
      width: video.videoWidth || null,
      height: video.videoHeight || null,
    };
  };

  // La miniatura sale de la vista previa en vivo, un instante antes de detener:
  // es más confiable que buscar un fotograma dentro del archivo recién grabado,
  // que en algunos navegadores todavía no tiene índice.
  const captureAndStop = async () => {
    await grabPoster();
    recorder.stop();
  };

  // Al llegar al tope el hook detiene solo; la miniatura se toma justo antes.
  const remaining = MAX_MEDIA_SECONDS - elapsed;
  const nearLimit = state === 'recording' && remaining <= 1.5;
  useEffect(() => {
    if (nearLimit && !posterRef.current.thumb) void grabPoster();
  }, [nearLimit]);

  const use = () => {
    if (!recording) return;
    onDone({
      tipo: 'video',
      blob: recording.blob,
      mime: recording.mime,
      thumb: posterRef.current.thumb,
      duracionSeg: recording.duration,
      ancho: posterRef.current.width,
      alto: posterRef.current.height,
    });
  };

  const retake = () => {
    recorder.reset();
    posterRef.current = NO_POSTER;
    void openDevice(facing);
  };

  const timerClass = remaining <= 15 ? 'recorder-timer is-ending' : 'recorder-timer';

  return (
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
          <video className="recorder-video" src={playbackUrl} controls playsInline autoPlay />
        ) : (
          <video className="recorder-video" ref={previewRef} muted playsInline autoPlay />
        )}

        {state === 'starting' && <div className="recorder-message">{t('media.cameraStarting')}</div>}
        {state === 'error' && recorder.error && (
          <div className="recorder-message is-error">{t('media.errors.' + recorder.error.code)}</div>
        )}
      </div>

      <div className="recorder-controls">
        {state === 'recorded' ? (
          <>
            <button type="button" className="btn btn-secondary" onClick={retake}>
              <RotateCcw size={18} /> {t('media.retake')}
            </button>
            <button type="button" className="btn btn-primary" onClick={use}>
              <Check size={18} /> {t('media.useVideo')}
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
  );
}
