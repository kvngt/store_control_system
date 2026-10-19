// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { OrderInspection } from '../../types/database';

const mocks = vi.hoisted(() => ({
  getForOrder: vi.fn(),
  start: vi.fn(),
  markPoint: vi.fn(),
  complete: vi.fn(),
  publish: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('../../services/inspection.service', () => ({
  inspectionService: {
    getForOrder: mocks.getForOrder,
    start: mocks.start,
    markPoint: mocks.markPoint,
    complete: mocks.complete,
    publish: mocks.publish,
  },
}));

// Simulación parcial: renderWithProviders sigue necesitando el ToastContext real.
vi.mock('../../context/toast.context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../context/toast.context')>()),
  useToast: () => ({
    showToast: mocks.showToast,
  }),
}));

const { default: PointInspection } = await import('./PointInspection');

const sampleInspectionPending: OrderInspection = {
  id: 'insp-1',
  orden_id: 'ord-1',
  plantilla_id: 'plant-1',
  nombre: 'Inspección multipunto',
  creado_por: null,
  creado_en: '2026-10-10T10:00:00Z',
  completada_en: null,
  completada_por: null,
  publicada_en: null,
  puntos: [
    {
      id: 'pt-1',
      inspeccion_id: 'insp-1',
      orden_id: 'ord-1',
      seccion: 'Frenos',
      nombre: 'Pastillas delanteras',
      posicion: 0,
      estado: 'pendiente',
      nota: null,
      actualizado_por: null,
      actualizado_en: '2026-10-10T10:00:00Z',
    },
    {
      id: 'pt-2',
      inspeccion_id: 'insp-1',
      orden_id: 'ord-1',
      seccion: 'Frenos',
      nombre: 'Pastillas traseras',
      posicion: 1,
      estado: 'bien',
      nota: null,
      actualizado_por: null,
      actualizado_en: '2026-10-10T10:00:00Z',
    },
  ],
};

const sampleInspectionCompleted: OrderInspection = {
  ...sampleInspectionPending,
  completada_en: '2026-10-10T11:00:00Z',
  puntos: [
    {
      ...sampleInspectionPending.puntos![0],
      estado: 'urgente',
      nota: 'Desgaste crítico',
    },
    {
      ...sampleInspectionPending.puntos![1],
      estado: 'bien',
    },
  ],
};

describe('PointInspection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders start inspection button when no inspection exists and calls start on click', async () => {
    mocks.getForOrder.mockResolvedValueOnce(null);
    mocks.start.mockResolvedValueOnce('insp-1');

    renderWithProviders(
      <PointInspection
        orderId="ord-1"
        orderSedeId="sede-1"
        canEdit={true}
        isAdmin={true}
        isDelivered={false}
        media={[]}
        pendingUploads={[]}
        onQuotePoint={vi.fn()}
        onAddMedia={vi.fn()}
      />
    );

    const startBtn = await screen.findByRole('button', { name: /Iniciar inspección/i });
    expect(startBtn).toBeInTheDocument();

    await userEvent.click(startBtn);
    expect(mocks.start).toHaveBeenCalledWith('ord-1');
  });

  it('calls markPoint when marking a point state', async () => {
    mocks.getForOrder.mockResolvedValueOnce(sampleInspectionPending);
    mocks.markPoint.mockResolvedValueOnce({
      ...sampleInspectionPending.puntos![0],
      estado: 'bien',
    });

    renderWithProviders(
      <PointInspection
        orderId="ord-1"
        orderSedeId="sede-1"
        canEdit={true}
        isAdmin={true}
        isDelivered={false}
        media={[]}
        pendingUploads={[]}
        onQuotePoint={vi.fn()}
        onAddMedia={vi.fn()}
      />
    );

    await screen.findByText('Pastillas delanteras');

    // The first point has state 'pendiente', find its "Bien" button
    const bienButtons = screen.getAllByRole('button', { name: 'Bien' });
    await userEvent.click(bienButtons[0]);

    expect(mocks.markPoint).toHaveBeenCalledWith('pt-1', 'bien', null);
  });

  it('keeps "Terminar inspección" button disabled while there are pending points', async () => {
    mocks.getForOrder.mockResolvedValueOnce(sampleInspectionPending);

    renderWithProviders(
      <PointInspection
        orderId="ord-1"
        orderSedeId="sede-1"
        canEdit={true}
        isAdmin={true}
        isDelivered={false}
        media={[]}
        pendingUploads={[]}
        onQuotePoint={vi.fn()}
        onAddMedia={vi.fn()}
      />
    );

    const completeBtn = await screen.findByRole('button', { name: /Terminar inspección/i });
    expect(completeBtn).toBeDisabled();
  });

  it('does not display "Mostrar al cliente" to a technician even when completed', async () => {
    mocks.getForOrder.mockResolvedValueOnce(sampleInspectionCompleted);

    renderWithProviders(
      <PointInspection
        orderId="ord-1"
        orderSedeId="sede-1"
        canEdit={true}
        isAdmin={false} // Technician view
        isDelivered={false}
        media={[]}
        pendingUploads={[]}
        onQuotePoint={vi.fn()}
        onAddMedia={vi.fn()}
      />
    );

    await screen.findByText('Pastillas delanteras');

    // "Mostrar al cliente" should NOT be visible to a non-admin technician
    expect(screen.queryByText(/Mostrar al cliente/i)).not.toBeInTheDocument();
  });

  it('displays "Mostrar al cliente" to admin when completed and calls publish on toggle', async () => {
    mocks.getForOrder.mockResolvedValueOnce(sampleInspectionCompleted);
    mocks.publish.mockResolvedValueOnce({
      ...sampleInspectionCompleted,
      publicada_en: '2026-10-10T12:00:00Z',
    });

    renderWithProviders(
      <PointInspection
        orderId="ord-1"
        orderSedeId="sede-1"
        canEdit={true}
        isAdmin={true} // Admin view
        isDelivered={false}
        media={[]}
        pendingUploads={[]}
        onQuotePoint={vi.fn()}
        onAddMedia={vi.fn()}
      />
    );

    const publishCheckbox = await screen.findByRole('button', { name: /Mostrar al cliente/i });
    expect(publishCheckbox).toBeInTheDocument();
    expect(publishCheckbox).not.toBeChecked();

    await userEvent.click(publishCheckbox);
    expect(mocks.publish).toHaveBeenCalledWith('insp-1', true);
  });
});
