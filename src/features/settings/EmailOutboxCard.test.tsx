// @vitest-environment jsdom
//
// "Correos al cliente" en Configuración: cuenta los que fallaron y los devuelve a la cola de
// una vez, para después de corregir la llave de Resend (octubre 2026).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';

const mocks = vi.hoisted(() => ({
  failedEmailCount: vi.fn(),
  retryFailedEmails: vi.fn(),
}));

vi.mock('../../services/customerPortal.service', () => ({ customerPortalService: mocks }));

const { default: EmailOutboxCard } = await import('./EmailOutboxCard');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('EmailOutboxCard', () => {
  it('sin correos fallidos lo dice y no ofrece reintentar', async () => {
    mocks.failedEmailCount.mockResolvedValue(0);
    renderWithProviders(<EmailOutboxCard />);

    expect(await screen.findByText(/Ningún correo falló/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reintentar todos/ })).not.toBeInTheDocument();
  });

  it('cuenta los fallidos y los reintenta todos', async () => {
    mocks.failedEmailCount.mockResolvedValueOnce(3).mockResolvedValue(0);
    mocks.retryFailedEmails.mockResolvedValue(3);
    renderWithProviders(<EmailOutboxCard />);

    expect(await screen.findByText(/3 correo\(s\) fallaron/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Reintentar todos/ }));

    await waitFor(() => expect(mocks.retryFailedEmails).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/3 correo\(s\) volvieron a la cola/)).toBeInTheDocument();
    // Se vuelve a contar: ya no queda ninguno.
    expect(await screen.findByText(/Ningún correo falló/)).toBeInTheDocument();
  });
});
