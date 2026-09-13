import { useEffect, useMemo } from 'react';
import { Check, Mic, RotateCcw, Square, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { MAX_MEDIA_SECONDS } from '../../lib/media/constants';
import { formatDuration } from '../../lib/media/mime';
import type { PreparedMedia } from '../../types/database';
import { useMediaRecorder } from './useMediaRecorder';

interface AudioRecorderModalProps {
  onDone: (media: PreparedMedia) => void;
  onClose: () => void;
}

/**
 * Nota de voz: para explicar una falla con las manos ocupadas, más rápido que
 * escribirla con los guantes puestos.
 */
export default function AudioRecorderModal({ onDone, onClose }: AudioRecorderModalProps) {
  const { t } = useLanguage();
  const recorder = useMediaRecorder('audio');
  const { openDevice, recording, state, elapsed } = recorder;

  useEffect(() => {
    void openDevice();
  }, [openDevice]);

  const playbackUrl = useMemo(() => (recording ? URL.createObjectURL(recording.blob) : null), [recording]);
  useEffect(
    () => () => {
      if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    },
    [playbackUrl]
  );

  const remaining = MAX_MEDIA_SECONDS - elapsed;

  const use = () => {
    if (!recording) return;
    onDone({
      tipo: 'audio',
      blob: recording.blob,
      mime: recording.mime,
      thumb: null,
      duracionSeg: recording.duration,
      ancho: null,
      alto: null,
    });
  };

  const retake = () => {
    recorder.reset();
    void openDevice();
  };

  const micClass = state === 'recording' ? 'audio-recorder-mic is-recording' : 'audio-recorder-mic';
  const timerClass =
    state === 'recording' && remaining <= 15 ? 'audio-recorder-timer is-ending' : 'audio-recorder-timer';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal audio-recorder"
        style={{ maxWidth: 420 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('media.recordAudio')}
      >
        <div className="modal-header">
          <h2 className="modal-title">{t('media.recordAudio')}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body audio-recorder-body">
          {state === 'recorded' && playbackUrl ? (
            <audio src={playbackUrl} controls style={{ width: '100%' }} />
          ) : (
            <>
              <div className={micClass}>
                <Mic size={36} />
              </div>
              <div className={timerClass}>
                {formatDuration(elapsed)} / {formatDuration(MAX_MEDIA_SECONDS)}
              </div>
            </>
          )}

          {state === 'starting' && <p className="field-hint">{t('media.micStarting')}</p>}
          {state === 'error' && recorder.error && (
            <p className="field-hint field-hint-error">{t('media.errors.' + recorder.error.code)}</p>
          )}
        </div>
        <div className="modal-footer">
          {state === 'recorded' ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={retake}>
                <RotateCcw size={16} /> {t('media.retake')}
              </button>
              <button type="button" className="btn btn-primary" onClick={use}>
                <Check size={16} /> {t('media.useAudio')}
              </button>
            </>
          ) : state === 'recording' ? (
            <button type="button" className="btn btn-danger" onClick={recorder.stop}>
              <Square size={16} /> {t('media.stop')}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={recorder.start} disabled={state !== 'ready'}>
              <Mic size={16} /> {t('media.record')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
