// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { CatalogJob } from '../../types/database';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  addJobFromCatalog: vi.fn(),
}));

vi.mock('../../services/catalog.service', () => ({
  catalogService: {
    list: mocks.list,
  },
}));

vi.mock('../../services/workOrders.service', () => ({
  workOrdersService: {
    addJobFromCatalog: mocks.addJobFromCatalog,
  },
}));

const { default: CatalogPickerModal } = await import('./CatalogPickerModal');

const sampleJobs: CatalogJob[] = [
  {
    id: 'job-cat-1',
    nombre: 'Cambio de frenos delanteros',
    activo: true,
    total: 180,
    lineas: [
      {
        id: 'cl-1',
        tipo: 'mano_obra',
        descripcion: 'Instalación de pastillas',
        especialidad: 'mecanica',
        cantidad: 1,
        precio: 80,
        costo_unitario: null,
        posicion: 0,
      },
      {
        id: 'cl-2',
        tipo: 'repuesto',
        descripcion: 'Pastillas delanteras cerámicas',
        especialidad: null,
        cantidad: 1,
        precio: 100,
        costo_unitario: 50,
        posicion: 1,
      },
    ],
  },
  {
    id: 'job-cat-2',
    nombre: 'Alineación y balanceo',
    activo: true,
    total: 90,
    lineas: [
      {
        id: 'cl-3',
        tipo: 'mano_obra',
        descripcion: 'Alineación computarizada',
        especialidad: 'mecanica',
        cantidad: 1,
        precio: 90,
        costo_unitario: null,
        posicion: 0,
      },
    ],
  },
];

describe('CatalogPickerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue(sampleJobs);
  });

  it('en modo orden llama a addJobFromCatalog con la orden y el catálogo', async () => {
    mocks.addJobFromCatalog.mockResolvedValue('new-order-job-id');
    const onJobAdded = vi.fn();
    const onClose = vi.fn();

    renderWithProviders(
      <CatalogPickerModal
        isOpen={true}
        onClose={onClose}
        sedeId="sede-1"
        orderId="ord-123"
        onJobAdded={onJobAdded}
      />
    );

    // Debe mostrar los trabajos activos
    expect(await screen.findByText('Cambio de frenos delanteros')).toBeInTheDocument();
    expect(screen.getByText('Alineación y balanceo')).toBeInTheDocument();

    // Seleccionar el primer trabajo
    await userEvent.click(screen.getByText('Cambio de frenos delanteros'));

    // Debe mostrar el desglose de líneas
    expect(screen.getByText('Instalación de pastillas')).toBeInTheDocument();
    expect(screen.getByText('Pastillas delanteras cerámicas')).toBeInTheDocument();

    // Presionar agregar a la orden
    const addButton = screen.getByRole('button', { name: /Agregar trabajo/i });
    await userEvent.click(addButton);

    expect(mocks.addJobFromCatalog).toHaveBeenCalledWith('ord-123', 'job-cat-1', null);
    expect(onJobAdded).toHaveBeenCalledWith('new-order-job-id');
    expect(onClose).toHaveBeenCalled();
  });

  it('en modo borrador devuelve el trabajo mediante onSelectDraft sin llamar a la base', async () => {
    const onSelectDraft = vi.fn();
    const onClose = vi.fn();

    renderWithProviders(
      <CatalogPickerModal
        isOpen={true}
        onClose={onClose}
        sedeId="sede-1"
        onSelectDraft={onSelectDraft}
      />
    );

    expect(await screen.findByText('Alineación y balanceo')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Alineación y balanceo'));

    const addButton = screen.getByRole('button', { name: /Agregar trabajo/i });
    await userEvent.click(addButton);

    expect(mocks.addJobFromCatalog).not.toHaveBeenCalled();
    expect(onSelectDraft).toHaveBeenCalledWith(sampleJobs[1], null);
    expect(onClose).toHaveBeenCalled();
  });

  it('filtra los trabajos por texto de búsqueda', async () => {
    renderWithProviders(
      <CatalogPickerModal
        isOpen={true}
        onClose={vi.fn()}
        sedeId="sede-1"
        orderId="ord-123"
      />
    );

    expect(await screen.findByText('Cambio de frenos delanteros')).toBeInTheDocument();
    expect(screen.getByText('Alineación y balanceo')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText(/Buscar trabajo/i);
    await userEvent.type(searchInput, 'frenos');

    expect(screen.getByText('Cambio de frenos delanteros')).toBeInTheDocument();
    expect(screen.queryByText('Alineación y balanceo')).not.toBeInTheDocument();
  });
});
