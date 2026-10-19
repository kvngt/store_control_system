// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, MECHANIC_USER } from '../../test/renderWithProviders';
import ServiceStickerModal from './ServiceStickerModal';
import NextServiceCard from './NextServiceCard';
import QuickActions from './QuickActions';
import type { WorkOrder } from '../../types/database';

vi.mock('../../context/auth.context', () => ({
  useAuth: vi.fn(),
}));

const mockOrder: WorkOrder = {
  id: 'order-123',
  sede_id: 'sede-centro',
  numero_orden: 'ORD-2026-001',
  fecha_ingreso: '2026-10-14T10:00:00Z',
  fecha_estimada_entrega: '2026-10-20',
  total_labor: 0,
  creado_por: 'admin-1',
  cliente_id: 'client-1',
  vehiculo_id: 'veh-1',
  estatus: 'en_proceso',
  tipo_trabajo: 'mecanica',
  millas_ingreso: 60000,
  nivel_gasolina: '1/2',
  inspeccion_360_notas: '',
  con_seguro: false,
  aseguradora: null,
  numero_reclamo: null,
  porcentaje_avance: 50,
  lista_para_entregar_en: null,
  retirada_sin_reparar: false,
  archivada_en: null,
  creado_en: '2026-10-14T10:00:00Z',
  cliente: {
    id: 'client-1',
    nombre: 'Juan Pérez',
    telefono: '555-1234',
    email: 'juan@example.com',
    idioma: 'es',
    direccion: '',
    sede_id: 'sede-centro',
    notas_crm: '',
    creado_en: '2026-10-14T10:00:00Z',
  },
  vehiculo: {
    id: 'veh-1',
    marca: 'Toyota',
    modelo: 'Corolla',
    anio: 2020,
    placa: 'ABC-123',
    color: 'Blanco',
    vin: '12345678901234567',
    cliente_id: 'client-1',
    creado_en: '2026-10-14T10:00:00Z',
  },
  asignaciones: [
    {
      id: 'asig-1',
      orden_id: 'order-123',
      usuario_id: MECHANIC_USER.id,
      tipo_tarea: 'mecanica',
      estatus_tarea: 'en_curso',
      origen: 'manual',
      usuario: MECHANIC_USER,
    },
  ],
};

describe('NextService smoke test', () => {
  it('el admin ve Sticker de servicio y el técnico ve Sugerir próximo servicio en QuickActions', () => {
    // Admin quick actions
    const adminActions = [
      { key: 'serviceSticker', icon: vi.fn() as any, label: 'quickActions.serviceSticker', onClick: vi.fn() },
    ];
    const { unmount } = renderWithProviders(<QuickActions actions={adminActions} />);
    expect(screen.getByRole('button', { name: /Sticker de servicio/i })).toBeInTheDocument();
    unmount();

    // Technician quick actions
    const techActions = [
      { key: 'suggestService', icon: vi.fn() as any, label: 'quickActions.suggestService', onClick: vi.fn() },
    ];
    renderWithProviders(<QuickActions actions={techActions} />);
    expect(screen.getByRole('button', { name: /Sugerir próximo servicio/i })).toBeInTheDocument();
  });

  it('el técnico no ve "Guardar e imprimir" en el modal, solo "Enviar sugerencia"', () => {
    renderWithProviders(
      <ServiceStickerModal
        mode="tecnico"
        order={mockOrder}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Enviar sugerencia/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar e imprimir/i })).not.toBeInTheDocument();
  });

  it('el admin ve "Guardar e imprimir" y "Guardar" en el modal', () => {
    renderWithProviders(
      <ServiceStickerModal
        mode="admin"
        order={mockOrder}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /Guardar e imprimir/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Guardar$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enviar sugerencia/i })).not.toBeInTheDocument();
  });

  it('Usar sugerencia en NextServiceCard llena el formulario de ServiceStickerModal', async () => {
    const user = userEvent.setup();
    const onOpenModalMock = vi.fn();

    // Mock query result for NextServiceCard with a technician suggestion
    const serviceWithSuggestion = {
      id: 'order-123',
      orden_id: 'order-123',
      fecha: null,
      millas: null,
      nota: null,
      token: null,
      sugerido_fecha: '2027-10-14',
      sugerido_millas: 65000,
      sugerido_nota: 'Aceite sintético 5W-30',
      sugerido_por: MECHANIC_USER.id,
      sugerido_en: '2026-10-14T11:00:00Z',
    };

    vi.spyOn(await import('../../services/nextService.service'), 'nextServiceService', 'get').mockReturnValue({
      getNextService: vi.fn().mockResolvedValue(serviceWithSuggestion),
      suggest: vi.fn(),
      program: vi.fn(),
      remove: vi.fn(),
      discardSuggestion: vi.fn(),
    } as any);

    const { unmount } = renderWithProviders(
      <NextServiceCard
        order={mockOrder}
        isAdmin={true}
        canSuggest={false}
        onOpenModal={onOpenModalMock}
      />
    );

    // Esperar a que la tarjeta pinte la sugerencia
    const useSuggestionBtn = await screen.findByRole('button', { name: /Usar sugerencia/i });
    expect(useSuggestionBtn).toBeInTheDocument();

    await user.click(useSuggestionBtn);

    // Debe haber llamado a onOpenModal con los datos de la sugerencia
    expect(onOpenModalMock).toHaveBeenCalledWith({
      fecha: '2027-10-14',
      millas: 65000,
      nota: 'Aceite sintético 5W-30',
    });
    unmount();

    // Ahora renderizamos ServiceStickerModal con esos datos iniciales y comprobamos que los campos se llenaron
    renderWithProviders(
      <ServiceStickerModal
        mode="admin"
        order={mockOrder}
        initialData={{
          fecha: '2027-10-14',
          millas: 65000,
          nota: 'Aceite sintético 5W-30',
        }}
        onClose={vi.fn()}
      />
    );

    const fechaInput = screen.getByLabelText(/Fecha recomendada/i) as HTMLInputElement;
    // Con millas de ingreso (60,000) se escribe cuántas faltan: 65,000 − 60,000.
    const millasInput = screen.getByLabelText(/En cuántas millas/i) as HTMLInputElement;
    const notaInput = screen.getByLabelText(/Nota o servicio/i) as HTMLInputElement;

    expect(fechaInput.value).toBe('2027-10-14');
    expect(millasInput.value).toBe('5000');
    expect(notaInput.value).toBe('Aceite sintético 5W-30');
  });
});
