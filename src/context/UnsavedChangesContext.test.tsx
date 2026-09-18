/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { UnsavedChangesProvider } from './UnsavedChangesContext';
import { useUnsavedChanges, type Guard } from './unsavedChanges.context';

afterEach(cleanup);

/** Deja el contexto a la vista de la prueba y registra los guardias que reciba. */
function harness(guards: Guard[], slot?: Guard) {
  const api: { confirmNavigation?: () => boolean; unregister: (() => void)[] } = { unregister: [] };

  function Consumer() {
    const ctx = useUnsavedChanges();
    api.confirmNavigation = ctx.confirmNavigation;
    if (api.unregister.length === 0) {
      for (const g of guards) api.unregister.push(ctx.registerGuard(g));
      if (slot) ctx.setGuard(slot);
    }
    return null;
  }

  render(
    <UnsavedChangesProvider>
      <Consumer />
    </UnsavedChangesProvider>,
  );
  return api;
}

describe('UnsavedChanges: varios guardias a la vez', () => {
  it('deja salir cuando no hay ninguno', () => {
    const api = harness([]);
    expect(api.confirmNavigation!()).toBe(true);
  });

  // El hueco único hacía que dos formularios sucios se pisaran: el que se
  // registraba último dejaba al otro sin protección.
  it('basta con que un guardia diga que no', () => {
    const si = vi.fn(() => true);
    const no = vi.fn(() => false);
    const api = harness([si, no]);

    expect(api.confirmNavigation!()).toBe(false);
  });

  it('dar de baja uno deja vivo al otro', () => {
    const no = vi.fn(() => false);
    const api = harness([no]);
    expect(api.confirmNavigation!()).toBe(false);

    api.unregister[0]();

    expect(api.confirmNavigation!()).toBe(true);
  });

  it('el hueco de setGuard sigue valiendo junto a los registrados', () => {
    const api = harness([() => true], () => false);
    expect(api.confirmNavigation!()).toBe(false);
  });

  it('no encadena dos confirmaciones: para en el primero que dice que no', () => {
    const segundo = vi.fn(() => true);
    const api = harness([() => false, segundo]);

    api.confirmNavigation!();

    expect(segundo).not.toHaveBeenCalled();
  });
});
