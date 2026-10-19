// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { InspectionTemplate } from '../../types/database';

const mocks = vi.hoisted(() => ({
  listTemplates: vi.fn(),
  saveTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  getSedes: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../../services/inspection.service', () => ({
  inspectionService: {
    listTemplates: mocks.listTemplates,
    saveTemplate: mocks.saveTemplate,
    deleteTemplate: mocks.deleteTemplate,
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

// Simulación parcial: renderWithProviders sigue necesitando el ToastContext real.
vi.mock('../../context/toast.context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../context/toast.context')>()),
  useToast: () => ({
    showToast: mocks.showToast,
  }),
}));

const { default: InspectionTemplatesCard } = await import('./InspectionTemplatesCard');

const sampleTemplates: InspectionTemplate[] = [
  {
    id: 'tmpl-1',
    sede_id: 'sede-1',
    nombre: 'Inspección multipunto estándar',
    activo: true,
    predeterminada: true,
    creado_en: '2026-10-10T08:00:00Z',
    actualizado_en: '2026-10-10T08:00:00Z',
    puntos: [
      {
        id: 'tp-1',
        seccion: 'Frenos',
        nombre: 'Pastillas delanteras',
        posicion: 0,
      },
      {
        id: 'tp-2',
        seccion: 'Fluidos',
        nombre: 'Aceite de motor',
        posicion: 1,
      },
    ],
  },
];

describe('InspectionTemplatesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSedes.mockResolvedValue([
      { id: 'sede-1', nombre: 'Sede Central' },
    ]);
  });

  it('renders the list of templates with point counts and default star', async () => {
    mocks.listTemplates.mockResolvedValueOnce(sampleTemplates);

    renderWithProviders(<InspectionTemplatesCard />);

    await screen.findByText('Plantillas de inspección multipunto');
    expect(await screen.findByText('Inspección multipunto estándar')).toBeInTheDocument();
    expect(screen.getByText('Predeterminada')).toBeInTheDocument();
    expect(screen.getByText('2 punto(s)')).toBeInTheDocument();
  });

  it('opens the template modal when clicking "Nueva plantilla"', async () => {
    mocks.listTemplates.mockResolvedValueOnce(sampleTemplates);

    renderWithProviders(<InspectionTemplatesCard />);

    const newBtn = await screen.findByRole('button', { name: /Nueva plantilla/i });
    await userEvent.click(newBtn);

    expect(await screen.findByRole('button', { name: /^Guardar$/ })).toBeInTheDocument();
  });

  it('confirms and deletes a template when clicking delete button', async () => {
    mocks.listTemplates.mockResolvedValueOnce(sampleTemplates);
    mocks.deleteTemplate.mockResolvedValueOnce(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderWithProviders(<InspectionTemplatesCard />);

    await screen.findByText('Inspección multipunto estándar');

    const deleteBtn = screen.getByTitle('Eliminar');
    await userEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(mocks.deleteTemplate).toHaveBeenCalledWith('tmpl-1');
  });
});
