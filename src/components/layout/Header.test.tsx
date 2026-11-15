// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, authValue, ADMIN_USER } from '../../test/renderWithProviders';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../../test/renderWithProviders').authValue> | null },
  globalSearch: vi.fn(),
}));

vi.mock('../../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));

vi.mock('../../services/search.service', () => ({
  searchService: { globalSearch: mocks.globalSearch },
}));

vi.mock('../../features/notifications/NotificationBell', () => ({ default: () => null }));

const { default: Header } = await import('./Header');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.current = authValue(ADMIN_USER);
});

describe('Header global search', () => {
  it('muestra error sin vaciar los resultados previos cuando falla una búsqueda', async () => {
    const user = userEvent.setup();
    mocks.globalSearch
      .mockResolvedValueOnce({
        customers: [],
        vehicles: [],
        orders: [{ id: 'ord-1', numero_orden: 'OT-2026-0001', estatus: 'recepcion', cliente: { nombre: 'Marta' } }],
      })
      .mockRejectedValueOnce(new Error('Failed to fetch'));

    renderWithProviders(<Header sidebarCollapsed={false} onMobileMenuToggle={vi.fn()} />);

    const input = screen.getByPlaceholderText('Buscar...');
    await user.type(input, 'OT');
    expect(await screen.findByText('OT-2026-0001')).toBeInTheDocument();

    await user.type(input, '-2026');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/No se pudo buscar/));
    expect(screen.queryByText('Sin resultados')).not.toBeInTheDocument();
    expect(screen.getByText('OT-2026-0001')).toBeInTheDocument();
  });
});
