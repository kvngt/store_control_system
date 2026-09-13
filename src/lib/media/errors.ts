/**
 * Por qué no se pudo preparar un archivo. Cada código tiene su frase en
 * `media.errors.*`: el mensaje se traduce al pintarlo, no al lanzarlo, igual que
 * el resto de los errores de la app.
 */
export type MediaErrorCode =
  | 'unsupported-image'
  | 'unsupported-file'
  | 'too-long'
  | 'too-large'
  | 'no-video'
  | 'cannot-convert'
  | 'permission-denied'
  | 'no-device'
  | 'recorder-unsupported';

export class MediaProcessingError extends Error {
  readonly code: MediaErrorCode;

  constructor(code: MediaErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'MediaProcessingError';
    this.code = code;
  }
}

export function isMediaError(err: unknown): err is MediaProcessingError {
  return err instanceof MediaProcessingError;
}

/** `getUserMedia` falla con DOMException; se traduce a algo que el técnico entienda. */
export function fromGetUserMediaError(err: unknown): MediaProcessingError {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return new MediaProcessingError('permission-denied');
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return new MediaProcessingError('no-device');
  return new MediaProcessingError('recorder-unsupported', String((err as Error)?.message ?? err));
}
