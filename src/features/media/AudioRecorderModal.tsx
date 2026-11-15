import { useEffect, useMemo } from 'react';
import { Check, Mic, RotateCcw, Square } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { MAX_MEDIA_SECONDS } from '../../lib/media/constants';
import { formatDuration } from '../../lib/media/mime';
import type { PreparedMedia } from '../../types/database';
import { useMediaRecorder } from './useMediaRecorder';
import Modal from '../../components/Modal';
import { useDiscardGuard } from '../../components/useDiscardGuard';

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

  // La X, el fondo y el «atrás» de Android: con una nota grabándose o sin usar, se pregunta antes de
  // tirarla; sin nota, cierran el grabador sin sacar de la orden.
  const guard = useDiscardGuard({
    dirty: state === 'recording' || state === 'recorded',
    onClose,
    title: t('media.discardRecordingTitle'),
    body: t('media.discardAudioBody'),
  });

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

  // En `<body>` y no donde la abren: en el alta de la orden se abre dentro de otro diálogo
  // (y de su formulario), y una capa fija anidada queda a merced de los estilos de sus
  // ancestros (ver `BodyPortal`).
  return (
    <>
      <Modal
        usePortal
        onClose={guard.requestClose}
        title={t('media.recordAudio')}
        className="audio-recorder"
        style={{ maxWidth: 420 }}
        bodyClassName="audio-recorder-body"
        footer={
          state === 'recorded' ? (
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
          )
        }
      >
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
      </Modal>
      {guard.dialog}
    </>
  );
}
