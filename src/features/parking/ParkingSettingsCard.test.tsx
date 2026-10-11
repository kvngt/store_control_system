// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import { todayLocal } from '../../lib/dates';
import type { ParkingConfig, ParkingPreview } from '../../types/domain/parking.types';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  saveConfig: vi.fn(),
  getPreview: vi.fn(),
  getSedes: vi.fn(),
}));

vi.mock('../../services/parking.service', () => ({
  parkingService: {
    getConfig: mocks.getConfig,
    saveConfig: mocks.saveConfig,
    getPreview: mocks.getPreview,
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

const { default: ParkingSettingsCard } = await import('./ParkingSettingsCard');

const sampleConfig: ParkingConfig = {
  sede_id: 'sede-1',
  habilitado: false,
  vigente_desde: '2026-10-01',
  incluir_ordenes_previas: false,
  avisar_cliente: true,
  politica_es: 'Política en español',
  politica_en: 'Policy in English',
  perfiles: {
    seguro: {
      habilitado: true,
      evento_inicio: 'ingreso',
      cobra_dia_evento: true,
      dias_gracia: 0,
      gracia_dias_habiles: false,
      tope_dias: null,
      tope_monto: null,
      tramos: [{ desde_dia: 1, tarifa_diaria: 40 }],
    },
    particular: {
      habilitado: true,
      evento_inicio: 'lista_para_entregar',
      cobra_dia_evento: false,
      dias_gracia: 2,
      gracia_dias_habiles: false,
      tope_dias: 10,
      tope_monto: 500,
      tramos: [{ desde_dia: 1, tarifa_diaria: 30 }],
    },
  },
};

const samplePreview: ParkingPreview = {
  inicio: '2026-10-03',
  dias: 7,
  monto: 210,
  detalle: [{ desde_dia: 1, hasta_dia: 7, dias: 7, tarifa: 30, subtotal: 210 }],
  tope_aplicado: false,
};

describe('ParkingSettingsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSedes.mockResolvedValue([
      { id: 'sede-1', nombre: 'Sede Central' },
      { id: 'sede-2', nombre: 'Sede Norte' },
    ]);
  });

  it('carga y muestra la configuración de la sede', async () => {
    mocks.getConfig.mockResolvedValue(sampleConfig);
    mocks.getPreview.mockResolvedValue(samplePreview);

    renderWithProviders(<ParkingSettingsCard />);

    expect(await screen.findByText('Cobrar parqueo en esta sede')).toBeInTheDocument();
    expect(screen.getAllByText('Con seguro').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Sin seguro (Particular)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByDisplayValue('Política en español')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Policy in English')).toBeInTheDocument();
  });

  it('permite agregar un nuevo tramo a un perfil', async () => {
    mocks.getConfig.mockResolvedValue(sampleConfig);
    mocks.getPreview.mockResolvedValue(samplePreview);
    const user = userEvent.setup();

    renderWithProviders(<ParkingSettingsCard />);

    expect(await screen.findByText('Cobrar parqueo en esta sede')).toBeInTheDocument();

    const addTierButtons = screen.getAllByRole('button', { name: /Agregar tramo/i });
    // Click on add tier for first profile
    await user.click(addTierButtons[0]);

    expect(screen.getByDisplayValue('2')).toBeInTheDocument();
  });

  it('calcula la vista previa en vivo', async () => {
    mocks.getConfig.mockResolvedValue(sampleConfig);
    mocks.getPreview.mockResolvedValue(samplePreview);

    renderWithProviders(<ParkingSettingsCard />);

    expect(await screen.findByText(/Si el evento es el/)).toBeInTheDocument();
    expect(screen.getByText(/se cobra desde el 2026-10-03/)).toBeInTheDocument();
    expect(screen.getByText(/a los 7 días: \$210\.00/)).toBeInTheDocument();
  });

  // La configuración guardada tenía "vigente desde" en el pasado (2026-10-01) con el cobro
  // apagado: al encenderlo pasa a hoy, porque la base rechaza encender el cobro hacia atrás.
  it('guarda la configuración modificada, y al encender el cobro "vigente desde" pasa a hoy', async () => {
    mocks.getConfig.mockResolvedValue(sampleConfig);
    mocks.saveConfig.mockResolvedValue({ ...sampleConfig, habilitado: true });
    mocks.getPreview.mockResolvedValue(samplePreview);
    const user = userEvent.setup();

    renderWithProviders(<ParkingSettingsCard />);

    const enableCheckbox = await screen.findByRole('checkbox', { name: /Cobrar parqueo en esta sede/i });
    await user.click(enableCheckbox);

    const saveButton = screen.getByRole('button', { name: /Guardar/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mocks.saveConfig).toHaveBeenCalledWith(
        'sede-1',
        expect.objectContaining({
          habilitado: true,
          vigente_desde: todayLocal(),
          perfiles: expect.objectContaining({
            seguro: expect.any(Object),
            particular: expect.any(Object),
          }),
        })
      );
    });
  });
});
