import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RESUMABLE_THRESHOLD_BYTES } from '../lib/media/constants';
import type { UploadItem } from '../lib/media/uploadQueue';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  tusCtor: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      refreshSession: mocks.refreshSession,
    },
  },
}));

vi.mock('tus-js-client', () => ({
  Upload: class MockUpload {
    options: { headers?: Record<string, string>; onSuccess?: () => void };
    constructor(_blob: Blob, options: { headers?: Record<string, string>; onSuccess?: () => void }) {
      this.options = options;
      mocks.tusCtor(options);
    }
    findPreviousUploads() {
      return Promise.resolve([]);
    }
    resumeFromPreviousUpload() {}
    start() {
      this.options.onSuccess?.();
    }
    abort() {
      return Promise.resolve();
    }
  },
}));

const { mediaService, resumableEndpoint } = await import('./media.service');
const { getValidAccessToken } = await import('./support');

function sessionResponse(access_token: string | null, expires_at?: number) {
  return {
    data: {
      session: access_token ? { access_token, expires_at } : null,
    },
  };
}

function makeLargeUploadItem(): UploadItem {
  const blob = new Blob(['video-bytes'], { type: 'video/mp4' });
  Object.defineProperty(blob, 'size', { value: RESUMABLE_THRESHOLD_BYTES + 1 });
  return {
    id: 'up-1',
    userId: 'u-1',
    ordenId: 'ord-1',
    sedeId: 'sede-1',
    numeroOrden: 'ORD-1',
    avanceId: null,
    origen: 'avance',
    zona: null,
    tipo: 'video',
    blob,
    mime: 'video/mp4',
    thumb: null,
    duracionSeg: 10,
    ancho: 1280,
    alto: 720,
    ruta: 'ord-1/video.mp4',
    rutaMiniatura: null,
    estado: 'pendiente',
    progreso: 0,
    error: null,
    subidoPrincipal: false,
    subidaMiniatura: false,
    intentos: 0,
    creadoEn: Date.now(),
  };
}

describe('resumableEndpoint', () => {
  it('usa el host directo de Storage para un proyecto de Supabase', () => {
    // Supabase lo recomienda para archivos grandes: evita un salto de proxy.
    expect(resumableEndpoint('https://abcdefghijkl.supabase.co')).toBe(
      'https://abcdefghijkl.storage.supabase.co/storage/v1/upload/resumable'
    );
  });

  it('usa la URL tal cual con un dominio propio o en local', () => {
    expect(resumableEndpoint('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321/storage/v1/upload/resumable');
    expect(resumableEndpoint('https://api.restorifyauto.net')).toBe('https://api.restorifyauto.net/storage/v1/upload/resumable');
  });
});

describe('getValidAccessToken y subida reanudable con sesión vencida', () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.refreshSession.mockReset();
    mocks.tusCtor.mockReset();
  });

  it('refresca la sesión cuando el token ya venció y lo usa al subir por TUS', async () => {
    const pastSeconds = Math.floor(Date.now() / 1000) - 30;
    mocks.getSession.mockResolvedValue(sessionResponse('jwt-vencido', pastSeconds));
    mocks.refreshSession.mockResolvedValue(sessionResponse('jwt-renovado'));

    const uploader = mediaService.createUploader();
    await uploader.upload(
      makeLargeUploadItem(),
      'principal',
      () => {},
      new AbortController().signal
    );

    expect(mocks.refreshSession).toHaveBeenCalledOnce();
    expect(mocks.tusCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer jwt-renovado' }),
      })
    );
  });

  it('falla con session_expired si ni getSession ni refreshSession devuelven token', async () => {
    mocks.getSession.mockResolvedValue(sessionResponse(null));
    mocks.refreshSession.mockResolvedValue(sessionResponse(null));

    await expect(getValidAccessToken()).rejects.toMatchObject({
      status: 401,
      code: 'session_expired',
    });
    expect(mocks.tusCtor).not.toHaveBeenCalled();
  });
});
