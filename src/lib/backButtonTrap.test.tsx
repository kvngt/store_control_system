// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useBackButtonTrap } from './backButtonTrap';

beforeEach(() => {
  window.history.replaceState({ idx: 3, key: 'k' }, '', '/');
});

/** Lo que haría el botón «atrás»: gasta la entrada de arriba y avisa. */
const atras = () => act(() => { window.history.back(); });

describe('useBackButtonTrap', () => {
  it('con el diálogo abierto deja una entrada de reserva y copia el estado del enrutador', () => {
    const antes = window.history.length;
    renderHook(() => useBackButtonTrap(true, vi.fn()));
    expect(window.history.length).toBe(antes + 1);
    expect(window.history.state).toMatchObject({ idx: 3, key: 'k', restorifyTrap: true });
  });

  it('sin diálogo no toca el historial', () => {
    const antes = window.history.length;
    renderHook(() => useBackButtonTrap(false, vi.fn()));
    expect(window.history.length).toBe(antes);
  });

  it('«atrás» avisa a la pantalla, que se queda donde estaba', async () => {
    const onBack = vi.fn();
    renderHook(() => useBackButtonTrap(true, onBack));

    atras();
    await vi.waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(window.location.pathname).toBe('/');
    expect(window.history.state).toMatchObject({ idx: 3 });
  });

  it('si la persona decide seguir, rearm deja otra entrada y el siguiente «atrás» vuelve a avisar', async () => {
    const onBack = vi.fn();
    const { result } = renderHook(() => useBackButtonTrap(true, onBack));

    atras();
    await vi.waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    act(() => result.current.rearm());
    atras();
    await vi.waitFor(() => expect(onBack).toHaveBeenCalledTimes(2));
  });

  it('al cerrar el diálogo por otro camino, release quita la entrada de reserva sin avisar', async () => {
    const onBack = vi.fn();
    const { result } = renderHook(() => useBackButtonTrap(true, onBack));

    act(() => result.current.release());
    await new Promise((r) => setTimeout(r, 30));

    expect(onBack).not.toHaveBeenCalled();
    expect((window.history.state as { restorifyTrap?: boolean }).restorifyTrap).toBeUndefined();
  });

  it('al desmontar quita la entrada de reserva', async () => {
    const onBack = vi.fn();
    const { unmount } = renderHook(() => useBackButtonTrap(true, onBack));

    unmount();
    await new Promise((r) => setTimeout(r, 30));

    expect(onBack).not.toHaveBeenCalled();
    expect((window.history.state as { restorifyTrap?: boolean }).restorifyTrap).toBeUndefined();
  });
});
