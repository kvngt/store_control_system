// @vitest-environment jsdom
//
// El archivo de órdenes entregadas. Lo que importa aquí es que NO se comporte como el
// tablero: pagina de verdad y busca en el servidor, porque es la lista que crece sin fin.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { WorkOrder } from '../../types/database';

const mocks = vi.hoisted(() => ({ getArchived: vi.fn() }));

vi.mock('../../services/workOrders.service', () => ({
  workOrdersService: { getArchivedWorkOrders: mocks.getArchived },
}));

const { default: ArchivedOrders } = await import('./ArchivedOrders');

const orden = (n: number): WorkOrder =>
  ({
    id: `o${n}`,
    numero_orden: `ORD-2025-${String(n).padStart(3, '0')}`,
    estatus: 'entregado',
    tipo_trabajo: 'mecanica',
    fecha_finalizacion: '2025-06-01T15:00:00Z',
    montos: { total_general: 500 },
    cliente: { nombre: 'PRUEBA Marta' },
    vehiculo: { marca: 'Toyota', modelo: 'Camry', anio: 2019, placa: 'ABC123' },
  }) as unknown as WorkOrder;

beforeEach(() => {
  mocks.getArchived.mockReset();
});

describe('ArchivedOrders', () => {
  it('lista las entregadas y abre una al pulsarla', async () => {
    mocks.getArchived.mockResolvedValue([orden(1)]);
    const onOpen = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(<ArchivedOrders sedeId="s1" isAdmin onOpen={onOpen} />);

    await user.click(await screen.findByText('ORD-2025-001'));
    expect(onOpen).toHaveBeenCalledWith('o1');
    // El total, con el formato de `lib/money`. Está aquí para que la prueba de abajo —
    // "un técnico no ve la columna" — no pase por buscar un texto que nadie pinta.
    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });

  it('sin nada archivado lo explica en vez de dejar la pantalla vacía', async () => {
    mocks.getArchived.mockResolvedValue([]);
    renderWithProviders(<ArchivedOrders sedeId="s1" isAdmin onOpen={vi.fn()} />);

    expect(await screen.findByText(/pasa aquí a los 90 días/)).toBeInTheDocument();
  });

  // La búsqueda va al servidor: filtrar en memoria solo buscaría dentro de la página cargada.
  it('la búsqueda se manda al servidor', async () => {
    mocks.getArchived.mockResolvedValue([orden(1)]);
    const user = userEvent.setup();
    renderWithProviders(<ArchivedOrders sedeId="s1" isAdmin onOpen={vi.fn()} />);

    await screen.findByText('ORD-2025-001');
    await user.type(screen.getByRole('textbox'), 'Marta');

    await vi.waitFor(() =>
      expect(mocks.getArchived).toHaveBeenLastCalledWith('s1', expect.objectContaining({ search: 'Marta' }))
    );
  });

  // Una página completa puede significar que hay más; una incompleta, que no.
  it('ofrece cargar más solo cuando la página vino llena', async () => {
    mocks.getArchived.mockResolvedValue(Array.from({ length: 25 }, (_, i) => orden(i + 1)));
    const user = userEvent.setup();
    renderWithProviders(<ArchivedOrders sedeId="s1" isAdmin onOpen={vi.fn()} />);

    const masBtn = await screen.findByText('Cargar más');
    await user.click(masBtn);

    await vi.waitFor(() =>
      expect(mocks.getArchived).toHaveBeenLastCalledWith('s1', expect.objectContaining({ limit: 50 }))
    );
  });

  // La regla 10 del proyecto: una consulta que falla no es "no hay datos". Esta pantalla
  // decía "nada ha pasado al archivo todavía" cuando la petición devolvía 400, y así se
  // esconde un error del servidor detrás de un dato falso.
  it('una consulta que falla se dice, no se pinta como archivo vacío', async () => {
    mocks.getArchived.mockRejectedValue(new Error('Se cayó la red'));
    renderWithProviders(<ArchivedOrders sedeId="s1" isAdmin onOpen={vi.fn()} />);

    expect(await screen.findByText('Se cayó la red')).toBeInTheDocument();
    expect(screen.queryByText(/pasa aquí a los 90 días/)).not.toBeInTheDocument();
  });

  it('un técnico no ve la columna de total', async () => {
    mocks.getArchived.mockResolvedValue([orden(1)]);
    renderWithProviders(<ArchivedOrders sedeId="s1" isAdmin={false} onOpen={vi.fn()} />);

    await screen.findByText('ORD-2025-001');
    expect(screen.queryByText('$500.00')).not.toBeInTheDocument();
  });
});
