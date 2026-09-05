// @vitest-environment jsdom
//
// The intake dialog holds full-resolution photos as `blob:` URLs. Nothing used
// to revoke them, so every discarded draft, every replaced tile and every
// closed dialog left the image pinned in memory for the life of the tab — on a
// shop tablet that captures six photos per order, all day. These tests pin the
// ownership rule as much as the field behaviour.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useIntakePhotos, ZONES } from './useIntakePhotos';

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
  it('revokes a zone photo when it is replaced', () => {
    const { result } = renderHook(() => useIntakePhotos());

    act(() => result.current.setZonePhoto('front', photo('a.jpg')));
    const first = created[0];

    act(() => result.current.setZonePhoto('front', photo('b.jpg')));

    expect(revoked).toContain(first);
    expect(leaked()).toHaveLength(1);
    expect(result.current.photos['front']?.file.name).toBe('b.jpg');
  });

  it('revokes a photo when the tile is cleared', () => {
    const { result } = renderHook(() => useIntakePhotos());

    act(() => result.current.setZonePhoto('rear', photo('a.jpg')));
    act(() => result.current.removePhoto('rear'));

    expect(leaked()).toHaveLength(0);
    expect(result.current.photos['rear']).toBeUndefined();
  });

  it('revokes every photo when the draft is discarded', () => {
    const { result } = renderHook(() => useIntakePhotos());

    act(() => {
      result.current.setZonePhoto('front', photo('a.jpg'));
      result.current.addExtraPhotos([photo('b.jpg'), photo('c.jpg')]);
    });
    expect(leaked()).toHaveLength(3);

    act(() => result.current.reset());

    expect(leaked()).toHaveLength(0);
    expect(Object.keys(result.current.photos)).toHaveLength(0);
  });

  it('revokes everything still held when the dialog unmounts', () => {
    const { result, unmount } = renderHook(() => useIntakePhotos());

    act(() => result.current.addExtraPhotos([photo('a.jpg'), photo('b.jpg')]));
    expect(leaked()).toHaveLength(2);

    unmount();

    expect(leaked()).toHaveLength(0);
  });

  it('keeps extra photos out of the six fixed zones', () => {
    const { result } = renderHook(() => useIntakePhotos());

    act(() => {
      result.current.setZonePhoto('front', photo('front.jpg'));
      result.current.addExtraPhotos([photo('dent.jpg')]);
    });

    expect(result.current.zonesCovered).toBe(1);
    expect(result.current.extraPhotos).toHaveLength(1);
    expect(ZONES.some((z) => z.key === result.current.extraPhotos[0].key)).toBe(false);
  });
});
