// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { resetBackButtonTrapsForTests } from '../../lib/backButtonTrap';
import MediaLightbox from './MediaLightbox';

beforeEach(() => {
  resetBackButtonTrapsForTests();
  window.history.replaceState({ idx: 0, key: 'base' }, '', '/');
});

afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 40));
});

describe('MediaLightbox', () => {
  // En el teléfono, «atrás» con una foto abierta salía de la orden.
  it('«atrás» cierra el visor', async () => {
    const onClose = vi.fn();
    renderWithProviders(<MediaLightbox tipo="foto" itemKey="m1" src="blob:foto" onClose={onClose} />);
    act(() => { window.history.back(); });
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
