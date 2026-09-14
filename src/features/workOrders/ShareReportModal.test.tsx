// @vitest-environment jsdom
//
// "Enviar reporte" comparte el enlace web del cliente: por correo desde el sistema,
// por WhatsApp o copiándolo. Ya no hay PDF que subir.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { WorkOrder } from '../../types/database';

const mocks = vi.hoisted(() => ({ sendReportEmail: vi.fn() }));

vi.mock('../../services/customerPortal.service', () => ({
  customerPortalService: { sendReportEmail: mocks.sendReportEmail },
}));

const { default: ShareReportModal } = await import('./ShareReportModal');

const LINK = `https://reinventa.shop/r/${'e'.repeat(64)}`;

function order(customer: Record<string, unknown> = {}): WorkOrder {
  return {
    id: 'ord-1',
    numero_orden: 'ORD-2026-014',
    cliente: { nombre: 'Marta Ruiz', telefono: '512-555-0100', email: 'marta@example.com', acepta_correos: true, ...customer },
  } as unknown as WorkOrder;
}

beforeEach(() => vi.clearAllMocks());

describe('ShareReportModal', () => {
  it('manda el reporte por correo desde el sistema y cierra', async () => {
    mocks.sendReportEmail.mockResolvedValue({ correo: 'encolado', token: 'e'.repeat(64) });
    const onClose = vi.fn();
    renderWithProviders(
      <ShareReportModal order={order()} link={LINK} message="Hola" onClose={onClose} onDownload={vi.fn()} downloading={false} />
    );

    await userEvent.click(screen.getByRole('button', { name: /Enviar por correo/ }));

    expect(mocks.sendReportEmail).toHaveBeenCalledWith('ord-1');
    expect(await screen.findByText(/Reporte enviado/)).toBeInTheDocument();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('sin correo o con la baja del cliente no ofrece mandarlo por correo', () => {
    const { unmount } = renderWithProviders(
      <ShareReportModal order={order({ email: '' })} link={LINK} message="Hola" onClose={vi.fn()} onDownload={vi.fn()} downloading={false} />
    );
    expect(screen.getByRole('button', { name: /Enviar por correo/ })).toBeDisabled();
    unmount();

    renderWithProviders(
      <ShareReportModal order={order({ acepta_correos: false })} link={LINK} message="Hola" onClose={vi.fn()} onDownload={vi.fn()} downloading={false} />
    );
    expect(screen.getByRole('button', { name: /Enviar por correo/ })).toBeDisabled();
    expect(screen.getByText(/pidió no recibir correos/)).toBeInTheDocument();
  });

  it('WhatsApp va al teléfono del cliente con el mensaje, y el enlace se puede abrir', () => {
    renderWithProviders(
      <ShareReportModal order={order()} link={LINK} message={`Hola Marta ${LINK}`} onClose={vi.fn()} onDownload={vi.fn()} downloading={false} />
    );

    const whatsapp = screen.getByRole('link', { name: /Enviar por WhatsApp/ });
    expect(whatsapp.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/15125550100\?text=/);
    expect(decodeURIComponent(whatsapp.getAttribute('href')!)).toContain(LINK);
    expect(screen.getByRole('link', { name: /Abrir/ })).toHaveAttribute('href', LINK);
    expect(screen.getByText(/90 días después de entregarla/)).toBeInTheDocument();
  });

  it('el PDF queda como descarga', async () => {
    const onDownload = vi.fn();
    renderWithProviders(
      <ShareReportModal order={order()} link={LINK} message="Hola" onClose={vi.fn()} onDownload={onDownload} downloading={false} />
    );
    await userEvent.click(screen.getByRole('button', { name: /Descargar PDF/ }));
    expect(onDownload).toHaveBeenCalled();
  });
});
