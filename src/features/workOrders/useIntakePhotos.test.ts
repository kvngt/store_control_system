// @vitest-environment jsdom
//
// The intake dialog holds full-resolution photos as `blob:` URLs. Nothing used
// to revoke them, so every discarded draft, every replaced tile and every
// closed dialog left the image pinned in memory for the life of the tab — on a
// shop tablet that captures six photos per order, all day. These tests pin the
// ownership rule as much as the field behaviour.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { PreparedMedia } from '../../types/database';

// jsdom no tiene canvas. La compresión se prueba por su cuenta; aquí importa lo
// que el hook hace con el resultado: vistas previas, zonas y su ciclo de vida.
const compress = vi.hoisted(() => ({
  fn: vi.fn(async (file: Blob): Promise<PreparedMedia> => ({
    tipo: 'foto',
    blob: file,
    mime: 'image/jpeg',
    thumb: new Blob(['thumb'], { type: 'image/jpeg' }),
    duracionSeg: null,
    ancho: 1920,
    alto: 1440,
  })),
}));
vi.mock('../../lib/media/image', () => ({ compressImage: compress.fn }));

const { useIntakePhotos, ZONES } = await import('./useIntakePhotos');

const created: string[] = [];
const revoked: string[] = [];
let seq = 0;

function photo(name: string) {
  return new File(['x'], name, { type: 'image/jpeg' });
}

/** URLs handed out but not yet revoked. */
function leaked() {
  return created.filter((url) => !revoked.includes(url));
}

beforeEach(() => {
  created.length = 0;
  revoked.length = 0;
  seq = 0;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => {
      const url = `blob:mock/${++seq}`;
      created.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => { revoked.push(url); }),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('useIntakePhotos', () => {
  it('revokes a zone photo when it is replaced', async () => {
    const { result } = renderHook(() => useIntakePhotos());

    await act(() => result.current.setZonePhoto('front', photo('a.jpg')));
    const first = created[0];

    await act(() => result.current.setZonePhoto('front', photo('b.jpg')));

    expect(revoked).toContain(first);
    expect(leaked()).toHaveLength(1);
    const front = result.current.photos['front'];
    expect(front).toBeDefined();
    expect((front!.media.blob as File).name).toBe('b.jpg');
  });

  it('revokes a photo when the tile is cleared', async () => {
    const { result } = renderHook(() => useIntakePhotos());

    await act(() => result.current.setZonePhoto('rear', photo('a.jpg')));
    act(() => result.current.removePhoto('rear'));

    expect(leaked()).toHaveLength(0);
    expect(result.current.photos['rear']).toBeUndefined();
  });

  it('revokes every photo when the draft is discarded', async () => {
    const { result } = renderHook(() => useIntakePhotos());

    await act(async () => {
      await result.current.setZonePhoto('front', photo('a.jpg'));
      await result.current.addExtraPhotos([photo('b.jpg'), photo('c.jpg')]);
    });
    expect(leaked()).toHaveLength(3);

    act(() => result.current.reset());

    expect(leaked()).toHaveLength(0);
    expect(Object.keys(result.current.photos)).toHaveLength(0);
  });

  it('revokes everything still held when the dialog unmounts', async () => {
    const { result, unmount } = renderHook(() => useIntakePhotos());

    await act(() => result.current.addExtraPhotos([photo('a.jpg'), photo('b.jpg')]));
    expect(leaked()).toHaveLength(2);

    unmount();

    expect(leaked()).toHaveLength(0);
  });

  it('adds the photos that compressed and reports the one that did not', async () => {
    compress.fn.mockImplementationOnce(async () => {
      throw new Error('unsupported-image');
    });
    const { result } = renderHook(() => useIntakePhotos());

    let error: unknown;
    await act(async () => {
      await result.current.addExtraPhotos([photo('bad.heic'), photo('good.jpg')]).catch((e) => (error = e));
    });

    expect(error).toBeInstanceOf(Error);
    expect(result.current.extraPhotos).toHaveLength(1);
    expect(result.current.processing).toBe(0);
  });

  it('drops a photo that finishes compressing after the draft was discarded', async () => {
    let finish: (m: PreparedMedia) => void = () => {};
    compress.fn.mockImplementationOnce(() => new Promise<PreparedMedia>((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useIntakePhotos());

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.setZonePhoto('front', photo('slow.jpg'));
    });
    act(() => result.current.reset());
    await act(async () => {
      finish({ tipo: 'foto', blob: photo('slow.jpg'), mime: 'image/jpeg', thumb: null, duracionSeg: null, ancho: 1, alto: 1 });
      await pending;
    });

    expect(result.current.photos['front']).toBeUndefined();
    expect(leaked()).toHaveLength(0);
  });

  it('keeps extra photos out of the six fixed zones', async () => {
    const { result } = renderHook(() => useIntakePhotos());

    await act(async () => {
      await result.current.setZonePhoto('front', photo('front.jpg'));
      await result.current.addExtraPhotos([photo('dent.jpg')]);
    });

    expect(result.current.zonesCovered).toBe(1);
    expect(result.current.extraPhotos).toHaveLength(1);
    expect(ZONES.some((z) => z.key === result.current.extraPhotos[0].key)).toBe(false);
  });
});
