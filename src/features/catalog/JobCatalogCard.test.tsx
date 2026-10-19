// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { CatalogJob } from '../../types/database';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
  getSedes: vi.fn(),
}));

vi.mock('../../services/catalog.service', () => ({
  catalogService: {
    list: mocks.list,
    save: mocks.save,
    remove: mocks.remove,
  },
}));

vi.mock('../../services/supabaseService', () => ({
  sedesService: {
    getSedes: mocks.getSedes,
  },
}));

vi.mock('../../context/auth.context', () => ({
  useAuth: () => ({
    user: { id: 'u-1', rol: 'admin', nombre_completo: 'Admin' },
    currentSede: { id: 'sede-1', nombre: 'Sede Central' },
  }),
}));

const { default: JobCatalogCard } = await import('./JobCatalogCard');

const sampleJobs: CatalogJob[] = [
  {
    id: 'job-1',
    nombre: 'Afinación mayor',
    activo: true,
    total: 250,
    lineas: [
      {
        id: 'l-1',
        tipo: 'mano_obra',
        descripcion: 'Mano de obra afinación',
        especialidad: 'mecanica',
        cantidad: 1,
        precio: 150,
        costo_unitario: null,
        posicion: 0,
      },
      {
        id: 'l-2',
        tipo: 'repuesto',
        descripcion: 'Bujías y filtros',
        especialidad: null,
        cantidad: 1,
        precio: 100,
        costo_unitario: 60,
        posicion: 1,
      },
    ],
  },
];

describe('JobCatalogCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSedes.mockResolvedValue([
      { id: 'sede-1', nombre: 'Sede Central' },
      { id: 'sede-2', nombre: 'Sede Norte' },
    ]);
  });

  it('muestra la lista de trabajos con nombre, total y estado activo', async () => {
    mocks.list.mockResolvedValue(sampleJobs);

    renderWithProviders(<JobCatalogCard />);

    expect(await screen.findByText('Catálogo de trabajos frecuentes')).toBeInTheDocument();
    expect(await screen.findByText('Afinación mayor')).toBeInTheDocument();
    expect(screen.getByText('$250.00')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('muestra estado vacío cuando no hay trabajos', async () => {
    mocks.list.mockResolvedValue([]);

    renderWithProviders(<JobCatalogCard />);

    expect(
      await screen.findByText(/Todavía no hay trabajos en el catálogo/i)
    ).toBeInTheDocument();
  });

  it('abre el modal, guarda un trabajo con el servicio simulado y maneja 23505', async () => {
    mocks.list.mockResolvedValue([]);
    mocks.save.mockRejectedValueOnce({ code: '23505', message: 'duplicate key value violates unique constraint' });

    renderWithProviders(<JobCatalogCard />);

    await userEvent.click(await screen.findByRole('button', { name: /Nuevo trabajo/i }));

    expect(await screen.findByRole('heading', { name: 'Nuevo trabajo' })).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText(/Cambio de aceite y filtro/i);
    await userEvent.type(nameInput, 'Afinación mayor');

    // Agregar mano de obra
    await userEvent.click(screen.getByRole('button', { name: /\+ Mano de obra/i }));
    const descInput = screen.getByPlaceholderText(/Descripción de la tarea/i);
    await userEvent.type(descInput, 'Mano de obra afinación');
    await userEvent.type(screen.getByPlaceholderText(/^Precio$/), '150');

    // Guardar
    const saveButton = screen.getByRole('button', { name: /^Guardar$/i });
    await userEvent.click(saveButton);

    // Debe mostrar el error 23505 traducido
    expect(
      await screen.findByText('Ya hay un trabajo con ese nombre en esta sede.')
    ).toBeInTheDocument();
    expect(mocks.save).toHaveBeenCalledTimes(1);

    // Ahora guardamos exitosamente
    mocks.save.mockResolvedValueOnce('new-job-id');
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(mocks.save).toHaveBeenCalledTimes(2);
    });
  });
});
