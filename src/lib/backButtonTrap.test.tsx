// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { resetBackButtonTrapsForTests, useBackButtonTrap } from './backButtonTrap';

/** El `history.go` que lanza una trampa al soltarse llega en otra tarea: se espera a que llegue. */
const asentar = () => new Promise((r) => setTimeout(r, 40));

beforeEach(() => {
  resetBackButtonTrapsForTests();
  window.history.replaceState({ idx: 3, key: 'k' }, '', '/');
});

afterEach(async () => {
  cleanup();
  await asentar();
});

/** Lo que haría el botón «atrás»: gasta la entrada de arriba y avisa. */
const atras = () => act(() => { window.history.back(); });

describe('useBackButtonTrap', () => {
  it('con el diálogo abierto deja una entrada de reserva y copia el estado del enrutador', () => {
    const antes = window.history.length;
    renderHook(() => useBackButtonTrap(true, vi.fn()));
    expect(window.history.length).toBe(antes + 1);
    expect(window.history.state).toMatchObject({ idx: 3, key: 'k', restorifyTrap: 1 });
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

describe('useBackButtonTrap con diálogos anidados', () => {
  // El diálogo de un avance abre la cámara, que tiene su propia trampa encima.
  function Interno({ onBack }: { onBack: () => void }) {
    useBackButtonTrap(true, onBack);
    return null;
  }
  function Externo({ conInterno, onExterno, onInterno }: { conInterno: boolean; onExterno: () => void; onInterno: () => void }) {
    useBackButtonTrap(true, onExterno);
    return conInterno ? <Interno onBack={onInterno} /> : null;
  }

  it('«atrás» lo atiende solo el de arriba; el siguiente, el de abajo', async () => {
    const onExterno = vi.fn();
    const onInterno = vi.fn();
    render(<Externo conInterno onExterno={onExterno} onInterno={onInterno} />);
    expect(window.history.state).toMatchObject({ restorifyTrap: expect.any(Number) });

    atras();
    await vi.waitFor(() => expect(onInterno).toHaveBeenCalledTimes(1));
    expect(onExterno).not.toHaveBeenCalled();

    atras();
    await vi.waitFor(() => expect(onExterno).toHaveBeenCalledTimes(1));
    expect(onInterno).toHaveBeenCalledTimes(1);
  });

  it('cerrar el de adentro por otro camino no se toma como un «atrás» del de afuera', async () => {
    const onExterno = vi.fn();
    const onInterno = vi.fn();
    const { rerender } = render(<Externo conInterno onExterno={onExterno} onInterno={onInterno} />);

    rerender(<Externo conInterno={false} onExterno={onExterno} onInterno={onInterno} />);
    await asentar();
    expect(onExterno).not.toHaveBeenCalled();
    expect(onInterno).not.toHaveBeenCalled();
    expect(window.history.state).toMatchObject({ restorifyTrap: expect.any(Number) });

    // La entrada del de afuera sigue: el siguiente «atrás» es suyo.
    atras();
    await vi.waitFor(() => expect(onExterno).toHaveBeenCalledTimes(1));
    expect(onInterno).not.toHaveBeenCalled();
  });

  it('cerrar los dos a la vez quita las dos entradas sin avisar a nadie', async () => {
    const onExterno = vi.fn();
    const onInterno = vi.fn();
    const { unmount } = render(<Externo conInterno onExterno={onExterno} onInterno={onInterno} />);

    unmount();
    await asentar();
    expect(onExterno).not.toHaveBeenCalled();
    expect(onInterno).not.toHaveBeenCalled();
    expect(window.history.state).toMatchObject({ idx: 3, key: 'k' });
    expect((window.history.state as { restorifyTrap?: boolean }).restorifyTrap).toBeUndefined();
  });

  // Un «adelante» (botón del mouse, trackpad) sobre la entrada que soltó el de adentro no es un «atrás»:
  // el de afuera no se cierra ni pregunta, y se vuelve a la entrada que corresponde.
  it('un «adelante» no cuenta como «atrás»', async () => {
    const onExterno = vi.fn();
    const onInterno = vi.fn();
    const { rerender } = render(<Externo conInterno onExterno={onExterno} onInterno={onInterno} />);
    rerender(<Externo conInterno={false} onExterno={onExterno} onInterno={onInterno} />);
    await asentar();
    expect(window.history.state).toMatchObject({ restorifyTrap: 1 });

    // Dos `popstate`: el «adelante» y la vuelta que hace la trampa.
    let pops = 0;
    const contar = () => { pops += 1; };
    window.addEventListener('popstate', contar);
    act(() => { window.history.forward(); });
    await vi.waitFor(() => expect(pops).toBe(2), { timeout: 1000 });
    window.removeEventListener('popstate', contar);
    expect(onExterno).not.toHaveBeenCalled();
    expect(window.history.state).toMatchObject({ restorifyTrap: 1 });

    // Y el «atrás» siguiente sigue siendo del de afuera.
    atras();
    await vi.waitFor(() => expect(onExterno).toHaveBeenCalledTimes(1));
  });
});
