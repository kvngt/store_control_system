// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import LaborTable from './LaborTable';
import type { LaborItem } from '../../types/database';

const ITEMS: LaborItem[] = [
  {
    id: 'l1',
    orden_id: 'ord-1',
    descripcion: 'Diagnóstico',
    costo: 100,
    horas: 1.5,
    estado: 'aprobado',
    asignado_a: null,
    reparto_heredado: true,
    especialidad: 'mecanica',
  },
];

const TECHNICIANS = [
  { id: 'tech-1', nombre_completo: 'Mario Mecánico', rol: 'mecanico' as const },
];

const BASE_PROPS = {
  items: ITEMS,
  orderId: 'ord-1',
  orderSedeId: 'sede-centro',
  catalogAllowed: true,
  canEdit: true,
  busy: false,
  technicians: TECHNICIANS,
  onAssign: vi.fn(async () => undefined),
  onAdd: vi.fn(async () => true),
  onUpdate: vi.fn(async () => true),
  onRemove: vi.fn(async () => undefined),
  canComplete: false,
  onToggleComplete: vi.fn(),
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('LaborTable — módulos catalogo, reloj y comisiones', () => {
  it('muestra Del catálogo cuando catalogo está encendido y lo esconde al apagarlo', () => {
    const { unmount } = renderWithProviders(<LaborTable {...BASE_PROPS} />);
    expect(screen.getByRole('button', { name: 'Del catálogo' })).toBeInTheDocument();
    unmount();

    vi.stubEnv('VITE_MODULOS_APAGADOS', 'catalogo');
    renderWithProviders(<LaborTable {...BASE_PROPS} />);
    expect(screen.queryByRole('button', { name: 'Del catálogo' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar trabajo' })).toBeInTheDocument();
  });

  it('oculta horas, tiempos y campo Horas al editar cuando reloj está apagado', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProviders(<LaborTable {...BASE_PROPS} />);
    expect(screen.getByText('1.5 h')).toBeInTheDocument();
    unmount();

    vi.stubEnv('VITE_MODULOS_APAGADOS', 'reloj');
    renderWithProviders(<LaborTable {...BASE_PROPS} />);
    expect(screen.queryByText('1.5 h')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.queryByRole('spinbutton', { name: 'Horas' })).not.toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Precio' })).toBeInTheDocument();
  });

  it('cambia Reparto por especialidad a Sin asignar cuando comisiones está apagado', () => {
    const { unmount } = renderWithProviders(<LaborTable {...BASE_PROPS} />);
    expect(screen.getByRole('option', { name: 'Reparto por especialidad' })).toBeInTheDocument();
    unmount();

    vi.stubEnv('VITE_MODULOS_APAGADOS', 'comisiones');
    renderWithProviders(<LaborTable {...BASE_PROPS} />);
    expect(screen.queryByRole('option', { name: 'Reparto por especialidad' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sin asignar' })).toBeInTheDocument();
  });
});
