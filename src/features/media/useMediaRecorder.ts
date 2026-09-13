import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_MEDIA_SECONDS, VIDEO_AUDIO_BITRATE, VIDEO_BITRATE, VOICE_BITRATE } from '../../lib/media/constants';
import { fromGetUserMediaError, MediaProcessingError } from '../../lib/media/errors';
import { pickRecorderMime } from '../../lib/media/mime';

export type RecorderState = 'idle' | 'starting' | 'ready' | 'recording' | 'recorded' | 'error';

export interface Recording {
  blob: Blob;
  mime: string;
  duration: number;
}

/**
 * Cámara o micrófono → `MediaRecorder` → un Blob, con el tope de 2 minutos
 * aplicado mientras se graba y no después.
 *
 * Se graba dentro de la app, y no con la cámara nativa, por el peso: la cámara
 * de un iPhone produce HEVC en 4K que habría que convertir antes de subir, y aquí
 * el archivo sale ya a 720p y ~1.5 Mbps. Además, cortar en el segundo 120 evita
 * que un técnico grabe cinco minutos para enterarse al final de que no sirven.
 */
export function useMediaRecorder(kind: 'video' | 'audio') {
  const [state, setState] = useState<RecorderState>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<MediaProcessingError | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopTicking = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  };

  const release = useCallback(() => {
    stopTicking();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  // La cámara no puede quedar encendida al cerrar el diálogo: en un teléfono es
  // la luz verde encendida y la batería gastándose.
  useEffect(() => release, [release]);

  const openDevice = useCallback(
    async (facingMode: 'environment' | 'user' = 'environment') => {
      release();
      setError(null);
      setState('starting');
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(new MediaProcessingError('recorder-unsupported'));
        setState('error');
        return;
      }
      try {
        const constraints: MediaStreamConstraints =
          kind === 'video'
            ? {
                video: {
                  facingMode,
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                  frameRate: { ideal: 30, max: 30 },
                },
                audio: { echoCancellation: true, noiseSuppression: true },
              }
            : { audio: { echoCancellation: true, noiseSuppression: true } };
        const media = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = media;
        setStream(media);
        setState('ready');
      } catch (err) {
        setError(fromGetUserMediaError(err));
        setState('error');
      }
    },
    [kind, release]
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stopTicking();
  }, []);

  const start = useCallback(() => {
    const media = streamRef.current;
    if (!media) return;
    const mime = pickRecorderMime(kind);
    if (!mime) {
      setError(new MediaProcessingError('recorder-unsupported'));
      setState('error');
      return;
    }

    const bitrates =
      kind === 'video'
        ? { videoBitsPerSecond: VIDEO_BITRATE, audioBitsPerSecond: VIDEO_AUDIO_BITRATE }
        : { audioBitsPerSecond: VOICE_BITRATE };

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(media, { mimeType: mime, ...bitrates });
    } catch {
      // Algunos navegadores rechazan la combinación de tipo y bitrate; mejor
      // grabar con sus valores por defecto que no grabar.
      recorder = new MediaRecorder(media, { mimeType: mime });
    }

    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const duration = Math.min((performance.now() - startedAtRef.current) / 1000, MAX_MEDIA_SECONDS);
      const type = recorder.mimeType || mime;
      setRecording({ blob: new Blob(chunksRef.current, { type }), mime: type, duration });
      setState('recorded');
      // El micrófono y la cámara se sueltan en cuanto hay grabación: la vista
      // previa ya no los necesita.
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
    };

    // Trozos de un segundo: si el navegador se cae a la mitad, lo grabado hasta
    // ahí ya está en memoria y no en un único bloque que se pierde.
    recorder.start(1000);
    recorderRef.current = recorder;
    startedAtRef.current = performance.now();
    setElapsed(0);
    setState('recording');

    tickRef.current = setInterval(() => {
      const seconds = (performance.now() - startedAtRef.current) / 1000;
      setElapsed(seconds);
      if (seconds >= MAX_MEDIA_SECONDS) stop();
    }, 250);
  }, [kind, stop]);

  const reset = useCallback(() => {
    setRecording(null);
    setElapsed(0);
  }, []);

  return { state, stream, elapsed, recording, error, openDevice, start, stop, reset, release };
}
