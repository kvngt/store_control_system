// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { OrderInspection, OrderMedia } from '../../types/database';

const mocks = vi.hoisted(() => ({
  getForOrder: vi.fn(),
  start: vi.fn(),
  markPoint: vi.fn(),
  complete: vi.fn(),
  publish: vi.fn(),
  showToast: vi.fn(),
  signUrls: vi.fn(),
}));

// Las fotos viven en un bucket privado: el componente pide URLs firmadas, nunca usa la ruta.
vi.mock('../../services/media.service', () => ({
  SIGNED_URL_TTL_SECONDS: 3600,
  mediaService: { signUrls: mocks.signUrls },
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

  // 20261010000040: publicada, la base rechaza la marca y la foto del técnico. Botones apagados y
  // un aviso, en vez de un error al tocarlos.
  it('a technician cannot change a published inspection, and is told why', async () => {
    mocks.getForOrder.mockResolvedValueOnce({ ...sampleInspectionCompleted, publicada_en: '2026-10-10T12:00:00Z' });

    renderWithProviders(
      <PointInspection
        orderId="ord-1"
        orderSedeId="sede-1"
        canEdit={true}
        isAdmin={false}
        isDelivered={false}
        media={[]}
        pendingUploads={[]}
        onAddMedia={vi.fn()}
      />
    );

    expect(await screen.findByText(/El cliente ya ve esta inspección/)).toBeInTheDocument();
    for (const b of screen.getAllByRole('button', { name: 'Bien' })) expect(b).toBeDisabled();
    await userEvent.click(screen.getByText(/Desgaste crítico/));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(mocks.markPoint).not.toHaveBeenCalled();
  });

  // Revisión 03/11/2026: la miniatura usaba la ruta privada tal cual y no se veía.
  it('shows each point photo through a signed URL, never the raw storage path', async () => {
    mocks.getForOrder.mockResolvedValueOnce(sampleInspectionPending);
    mocks.signUrls.mockResolvedValue({ 'sede-1/ord-1/pt1-thumb.webp': 'https://firmada.example/pt1-thumb.webp?token=x' });
    const photo = {
      id: 'm-1',
      orden_id: 'ord-1',
      sede_id: 'sede-1',
      avance_id: null,
      inspeccion_punto_id: 'pt-1',
      tipo: 'foto',
      origen: 'inspeccion',
      zona: null,
      ruta: 'sede-1/ord-1/pt1.jpg',
      ruta_miniatura: 'sede-1/ord-1/pt1-thumb.webp',
      mime: 'image/jpeg',
      bytes: 1024,
      duracion_seg: null,
      ancho: null,
      alto: null,
      visible_cliente: false,
      proveedor: 'supabase',
      subido_por: null,
      creado_en: '2026-10-10T10:00:00Z',
    } as unknown as OrderMedia;

    renderWithProviders(
      <PointInspection
        orderId="ord-1"
        orderSedeId="sede-1"
        canEdit={true}
        isAdmin={false}
        isDelivered={false}
        media={[photo]}
        pendingUploads={[]}
        onAddMedia={vi.fn()}
      />
    );

    const img = await screen.findByAltText('Pastillas delanteras');
    expect(img).toHaveAttribute('src', 'https://firmada.example/pt1-thumb.webp?token=x');
    expect(mocks.signUrls).toHaveBeenCalledWith(['sede-1/ord-1/pt1-thumb.webp']);
  });
});
