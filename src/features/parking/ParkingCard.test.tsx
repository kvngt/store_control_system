// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { OrderParking } from '../../types/domain/parking.types';

const mocks = vi.hoisted(() => ({
  getOrderParking: vi.fn(),
  adjustOrderParking: vi.fn(),
}));

vi.mock('../../services/parking.service', () => ({
  parkingService: {
    getOrderParking: mocks.getOrderParking,
    adjustOrderParking: mocks.adjustOrderParking,
  },
}));

const { default: ParkingCard } = await import('./ParkingCard');

const ORDER = { id: 'ord-123', sede_id: 'sede-1', con_seguro: false };

const sampleParking: OrderParking = {
  orden_id: 'ord-123',
  cobrar: true,
  tarifa_manual: null,
  inicio_manual: null,
  dias_exonerados: 0,
  nota: null,
  perfil: 'particular',
  estado: 'acumulando',
  inicio_cobro: '2026-10-01',
  fin_congelado: null,
  dias_cobrados: 5,
  monto: 200,
  detalle: [
    { desde_dia: 1, hasta_dia: 5, dias: 5, tarifa: 40, subtotal: 200 },
  ],
  tope_aplicado: true,
  calculado_hasta: '2026-10-05',
  calculado_en: '2026-10-05T12:00:00Z',
  tarifa_inicial: 40,
};

describe('ParkingCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra el perfil, estado, días cobrados, monto y desglose por tramos', async () => {
    mocks.getOrderParking.mockResolvedValue(sampleParking);
    renderWithProviders(<ParkingCard order={ORDER} />);

    expect(await screen.findByText('Sin seguro (Particular)')).toBeInTheDocument();
    expect(screen.getByText('Acumulando desde el 2026-10-01')).toBeInTheDocument();
    expect(screen.getByText('5 días')).toBeInTheDocument();
    expect(screen.getAllByText('$200.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Tope aplicado')).toBeInTheDocument();
    expect(screen.getByText(/Días 1–5/)).toBeInTheDocument();
  });

  it('permite guardar ajustes administrativos con las claves exactas', async () => {
    mocks.getOrderParking.mockResolvedValue(sampleParking);
    mocks.adjustOrderParking.mockResolvedValue({
      ...sampleParking,
      tarifa_manual: 25,
      dias_exonerados: 1,
      nota: 'Ajuste comercial',
    });

    const user = userEvent.setup();
    renderWithProviders(<ParkingCard order={ORDER} />);

    expect(await screen.findByText('Sin seguro (Particular)')).toBeInTheDocument();

    const tarifaInput = screen.getByPlaceholderText('Automática');
    await user.type(tarifaInput, '25');

    const notaInput = screen.getByPlaceholderText('Motivo de ajuste o exoneración...');
    await user.type(notaInput, 'Ajuste comercial');

    const saveBtn = screen.getByRole('button', { name: /Guardar ajustes/i });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mocks.adjustOrderParking).toHaveBeenCalledWith('ord-123', {
        cobrar: true,
        tarifa_manual: 25,
        inicio_manual: null,
        dias_exonerados: 0,
        nota: 'Ajuste comercial',
      });
    });
  });

  it('muestra diferentes estados en palabras', async () => {
    mocks.getOrderParking.mockResolvedValue({
      ...sampleParking,
      estado: 'por_empezar',
      inicio_cobro: '2026-10-15',
      dias_cobrados: 0,
      monto: 0,
      detalle: [],
      tope_aplicado: false,
    });
    renderWithProviders(<ParkingCard order={ORDER} />);

    expect(await screen.findByText('Empieza el 2026-10-15')).toBeInTheDocument();
  });
});
