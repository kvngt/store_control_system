// La cola de subida decide qué pasa con los videos de un técnico cuando el wifi
// del taller se cae a la mitad, cuando el teléfono descarta la pestaña, o cuando
// el archivo subió pero guardar su fila falló. Estos son esos casos.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MediaUploadQueue, isRetryable, type MediaUploader, type NewUpload, type UploadItem } from './uploadQueue';
import { createMemoryStore } from './queueStore';
import { MediaProcessingError } from './errors';

function upload(overrides: Partial<NewUpload> = {}): NewUpload {
  return {
    userId: 'user-1',
    ordenId: 'ord-1',
    sedeId: 'sede-1',
    origen: 'avance',
    avanceId: 'av-1',
    tipo: 'video',
    blob: new Blob(['video-bytes'], { type: 'video/mp4' }),
    mime: 'video/mp4;codecs=avc1',
    thumb: new Blob(['thumb'], { type: 'image/jpeg' }),
    duracionSeg: 42,
    ancho: 1280,
    alto: 720,
    ...overrides,
  };
}

function fakeUploader(overrides: Partial<MediaUploader> = {}) {
  const calls = { upload: [] as string[], saveRow: [] as string[] };
  const uploader: MediaUploader = {
    upload: vi.fn(async (item: UploadItem, which: 'principal' | 'miniatura', onProgress: (f: number) => void) => {
      calls.upload.push(`${item.id}:${which}`);
      onProgress(1);
    }),
    saveRow: vi.fn(async (item: UploadItem) => {
      calls.saveRow.push(item.id);
    }),
    removeFiles: vi.fn(async () => {}),
    ...overrides,
  };
  return { uploader, calls };
}

/** Deja correr las promesas encadenadas de la cola. */
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

let ids = 0;
const newId = () => `id-${++ids}`;

beforeEach(() => {
  ids = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MediaUploadQueue', () => {
  it('sube el archivo y la miniatura, guarda la fila y lo marca listo', async () => {
    const { uploader, calls } = fakeUploader();
    const onItemDone = vi.fn();
    const queue = new MediaUploadQueue({ uploader, store: createMemoryStore(), newId, onItemDone, isOnline: () => true });
    await queue.setUser('user-1');

    const [item] = queue.enqueue([upload()]);
    await settle();

    expect(item.ruta).toBe('sede-1/ord-1/id-1.mp4');
    expect(item.rutaMiniatura).toBe('sede-1/ord-1/id-1-thumb.jpg');
    expect(calls.upload).toEqual(['id-1:principal', 'id-1:miniatura']);
    expect(calls.saveRow).toEqual(['id-1']);
    expect(queue.getSnapshot()[0].estado).toBe('listo');
    expect(onItemDone).toHaveBeenCalledTimes(1);

    // Visible un momento en la bandeja y después se va.
    vi.advanceTimersByTime(5000);
    expect(queue.getSnapshot()).toHaveLength(0);
  });

  it('no vuelve a subir un archivo que ya subió cuando lo que falló fue guardar la fila', async () => {
    let failSave = true;
    const { uploader, calls } = fakeUploader({
      saveRow: vi.fn(async () => {
        if (failSave) throw new Error('network down');
      }),
    });
    const queue = new MediaUploadQueue({
      uploader,
      store: createMemoryStore(),
      newId,
      isOnline: () => true,
      retryDelayMs: () => 1000,
    });
    await queue.setUser('user-1');

    queue.enqueue([upload()]);
    await settle();
    expect(queue.getSnapshot()[0].estado).toBe('pendiente');
    expect(queue.getSnapshot()[0].subidoPrincipal).toBe(true);

    failSave = false;
    vi.advanceTimersByTime(1000);
    await settle();

    // Una sola subida de cada archivo, aunque la fila se intentó dos veces.
    expect(calls.upload).toEqual(['id-1:principal', 'id-1:miniatura']);
    expect(queue.getSnapshot()[0].estado).toBe('listo');
  });

  it('deja en error, sin reintentar solo, lo que no se arregla esperando', async () => {
    const { uploader } = fakeUploader({
      saveRow: vi.fn(async () => {
        throw Object.assign(new Error('permiso denegado'), { code: '42501' });
      }),
    });
    const queue = new MediaUploadQueue({ uploader, store: createMemoryStore(), newId, isOnline: () => true });
    await queue.setUser('user-1');

    queue.enqueue([upload()]);
    await settle();

    const [item] = queue.getSnapshot();
    expect(item.estado).toBe('error');
    expect(item.intentos).toBe(1);
    expect(uploader.saveRow).toHaveBeenCalledTimes(1);
  });

  it('se rinde después de los intentos automáticos y espera un reintento manual', async () => {
    const { uploader } = fakeUploader({
      upload: vi.fn(async () => {
        throw new Error('timeout');
      }),
    });
    const queue = new MediaUploadQueue({
      uploader,
      store: createMemoryStore(),
      newId,
      isOnline: () => true,
      maxAutoAttempts: 2,
      retryDelayMs: () => 100,
    });
    await queue.setUser('user-1');

    queue.enqueue([upload()]);
    await settle();
    vi.advanceTimersByTime(100);
    await settle();

    expect(queue.getSnapshot()[0].estado).toBe('error');
    expect(uploader.upload).toHaveBeenCalledTimes(2);

    (uploader.upload as ReturnType<typeof vi.fn>).mockImplementation(async (_i: UploadItem, _w: string, p: (f: number) => void) => p(1));
    queue.retry('id-1');
    await settle();
    expect(queue.getSnapshot()[0].estado).toBe('listo');
  });

  it('retoma después de una recarga lo que quedó pendiente, solo para el mismo usuario', async () => {
    const store = createMemoryStore();
    const never = fakeUploader({ upload: vi.fn(() => new Promise<void>(() => {})) });
    const first = new MediaUploadQueue({ uploader: never.uploader, store, newId, isOnline: () => true });
    await first.setUser('user-1');
    first.enqueue([upload(), upload({ userId: 'user-2' })]);
    await settle();
    first.dispose(); // la pestaña se cerró a mitad de la subida

    const { uploader, calls } = fakeUploader();
    const second = new MediaUploadQueue({ uploader, store, newId, isOnline: () => true });
    await second.setUser('user-1');
    await settle();

    expect(calls.saveRow).toEqual(['id-1']);
    expect(second.getSnapshot().map((i) => i.userId)).toEqual(['user-1']);
  });

  it('respeta el límite de subidas simultáneas', async () => {
    const resolvers: (() => void)[] = [];
    const { uploader } = fakeUploader({
      upload: vi.fn(
        (_i: UploadItem, _w: string, p: (f: number) => void) =>
          new Promise<void>((resolve) =>
            resolvers.push(() => {
              p(1);
              resolve();
            })
          )
      ),
    });
    const queue = new MediaUploadQueue({ uploader, store: createMemoryStore(), newId, isOnline: () => true, concurrency: 2 });
    await queue.setUser('user-1');

    queue.enqueue([upload({ thumb: null }), upload({ thumb: null }), upload({ thumb: null })]);
    await settle();
    expect(uploader.upload).toHaveBeenCalledTimes(2);

    resolvers[0]();
    await settle();
    expect(uploader.upload).toHaveBeenCalledTimes(3);
  });

  it('no arranca sin conexión, y reintenta lo fallido al volver', async () => {
    let online = false;
    const { uploader } = fakeUploader();
    const queue = new MediaUploadQueue({ uploader, store: createMemoryStore(), newId, isOnline: () => online });
    await queue.setUser('user-1');

    queue.enqueue([upload()]);
    await settle();
    expect(uploader.upload).not.toHaveBeenCalled();

    online = true;
    queue.retryFailed();
    await settle();
    expect(queue.getSnapshot()[0].estado).toBe('listo');
  });

  it('al descartar un archivo que ya subió, borra lo subido', async () => {
    const { uploader } = fakeUploader({
      saveRow: vi.fn(() => new Promise<void>(() => {})),
    });
    const queue = new MediaUploadQueue({ uploader, store: createMemoryStore(), newId, isOnline: () => true });
    await queue.setUser('user-1');

    queue.enqueue([upload()]);
    await settle();
    await queue.discard('id-1');

    expect(queue.getSnapshot()).toHaveLength(0);
    expect(uploader.removeFiles).toHaveBeenCalledTimes(1);
  });
});

describe('isRetryable', () => {
  it('reintenta errores de red y del servidor', () => {
    expect(isRetryable(new Error('Failed to fetch'))).toBe(true);
    expect(isRetryable({ statusCode: '503' })).toBe(true);
    expect(isRetryable({ status: 429 })).toBe(true);
  });

  it('no reintenta permisos, restricciones ni archivos rechazados', () => {
    expect(isRetryable({ code: '42501' })).toBe(false);
    expect(isRetryable({ code: '23514' })).toBe(false);
    expect(isRetryable({ statusCode: '413' })).toBe(false);
    expect(isRetryable(new MediaProcessingError('too-long'))).toBe(false);
  });
});
