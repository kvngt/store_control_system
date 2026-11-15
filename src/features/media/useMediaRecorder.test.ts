// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useMediaRecorder } from './useMediaRecorder';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeStream() {
  const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  return {
    stream: { getTracks: () => tracks } as unknown as MediaStream,
    tracks,
  };
}

describe('useMediaRecorder', () => {
  const getUserMedia = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
  });

  it('detiene todas las pistas si el hook se desmonta mientras getUserMedia sigue pendiente', async () => {
    const pending = deferred<MediaStream>();
    getUserMedia.mockReturnValueOnce(pending.promise);

    const { result, unmount } = renderHook(() => useMediaRecorder('video'));

    act(() => {
      void result.current.openDevice('environment');
    });

    unmount();

    const { stream, tracks } = makeStream();
    await act(async () => {
      pending.resolve(stream);
      await pending.promise;
    });

    expect(tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(tracks[1].stop).toHaveBeenCalledTimes(1);
  });

  it('descarta la respuesta de una cámara vieja si ya se pidió otra mientras esperaba', async () => {
    const first = deferred<MediaStream>();
    const second = deferred<MediaStream>();
    getUserMedia.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result } = renderHook(() => useMediaRecorder('video'));

    act(() => {
      void result.current.openDevice('environment');
      void result.current.openDevice('user');
    });

    const stale = makeStream();
    const fresh = makeStream();

    await act(async () => {
      second.resolve(fresh.stream);
      await second.promise;
    });
    expect(result.current.stream).toBe(fresh.stream);
    expect(result.current.state).toBe('ready');

    await act(async () => {
      first.resolve(stale.stream);
      await first.promise;
    });

    expect(stale.tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(stale.tracks[1].stop).toHaveBeenCalledTimes(1);
    expect(result.current.stream).toBe(fresh.stream);
    expect(result.current.state).toBe('ready');
  });
});
