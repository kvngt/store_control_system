// @vitest-environment jsdom
//
// La tarjeta del enlace del cliente: crear, compartir y saber si el cliente lo
// abrió, y ver qué correos le llegaron.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { CustomerEmail, CustomerLink, WorkOrder } from '../../types/database';

const mocks = vi.hoisted(() => ({
  getActiveLink: vi.fn(),
  createLink: vi.fn(),
  regenerateLink: vi.fn(),
  revokeLink: vi.fn(),
  notifyProgress: vi.fn(),
  listEmails: vi.fn(),
}));

vi.mock('../../services/customerPortal.service', () => ({
  customerPortalService: {
    ...mocks,
    portalUrl: (token: string) => `https://reinventa.shop/r/${token}`,
  },
}));

const { default: CustomerLinkCard } = await import('./CustomerLinkCard');

const TOKEN = 'c'.repeat(64);

const LINK: CustomerLink = {
  id: 'l1',
  orden_id: 'ord-1',
  sede_id: 's1',
  token: TOKEN,
  creado_en: '2026-09-10T15:00:00Z',
  expira_en: null,
  revocado_en: null,
  ultimo_acceso_en: new Date(Date.now() - 2 * 3600_000).toISOString(),
  accesos: 3,
};

function order(customer: Partial<NonNullable<WorkOrder['cliente']>> = {}): WorkOrder {
  return {
    id: 'ord-1',
    numero_orden: 'ORD-2026-014',
    cliente: {
      id: 'c1', sede_id: 's1', nombre: 'Marta Ruiz', telefono: '512-555-0100', email: 'marta@example.com',
      direccion: '', notas_crm: '', creado_en: '2026-09-01T00:00:00Z', acepta_correos: true, ...customer,
    },
  } as WorkOrder;
}

const STATUS_LABELS = { en_proceso: 'En Proceso', finalizado: 'Finalizado' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listEmails.mockResolvedValue([]);
});

describe('CustomerLinkCard', () => {
  it('sin enlace, lo crea al pedirlo', async () => {
    mocks.getActiveLink.mockResolvedValueOnce(null).mockResolvedValue(LINK);
    mocks.createLink.mockResolvedValue(LINK);
    renderWithProviders(<CustomerLinkCard order={order()} statusLabels={STATUS_LABELS} />);

    await userEvent.click(await screen.findByRole('button', { name: /Crear enlace/ }));

    expect(mocks.createLink).toHaveBeenCalledWith('ord-1');
    expect(await screen.findByDisplayValue(`https://reinventa.shop/r/${TOKEN}`)).toBeInTheDocument();
  });

  it('muestra cuántas veces lo abrió el cliente y lo comparte por WhatsApp con el enlace', async () => {
    mocks.getActiveLink.mockResolvedValue(LINK);
    renderWithProviders(<CustomerLinkCard order={order()} statusLabels={STATUS_LABELS} />);

    expect(await screen.findByText(/Abierto 3 veces/)).toBeInTheDocument();
    const whatsapp = screen.getByRole('link', { name: /Enviar por WhatsApp/ });
    expect(decodeURIComponent(whatsapp.getAttribute('href')!)).toContain(`https://reinventa.shop/r/${TOKEN}`);
    expect(whatsapp.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/15125550100/);
  });

  it('cambiar el enlace pide confirmación antes de invalidar el anterior', async () => {
    mocks.getActiveLink.mockResolvedValue(LINK);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderWithProviders(<CustomerLinkCard order={order()} statusLabels={STATUS_LABELS} />);

    const button = await screen.findByRole('button', { name: /Cambiar enlace/ });
    await userEvent.click(button);
    expect(mocks.regenerateLink).not.toHaveBeenCalled();

    await userEvent.click(button);
    await waitFor(() => expect(mocks.regenerateLink).toHaveBeenCalledWith('ord-1'));
    confirmSpy.mockRestore();
  });

  it('lista los correos con qué estado anunciaron y cuáles no salieron', async () => {
    mocks.getActiveLink.mockResolvedValue(LINK);
    const emails: CustomerEmail[] = [
      {
        id: 'e2', plantilla: 'estatus', estado: 'omitido', destinatario: 'marta@example.com',
        datos: { estatus: 'en_proceso' }, intentos: 1, ultimo_error: 'El cliente ya recibió el aviso de este estado.',
        enviar_despues_de: '2026-09-11T10:00:00Z', creado_en: '2026-09-11T09:57:00Z', enviado_en: null,
      },
      {
        id: 'e1', plantilla: 'recepcion', estado: 'enviado', destinatario: 'marta@example.com',
        datos: {}, intentos: 1, ultimo_error: null,
        enviar_despues_de: '2026-09-10T15:12:00Z', creado_en: '2026-09-10T15:10:00Z', enviado_en: '2026-09-10T15:12:05Z',
      },
    ];
    mocks.listEmails.mockResolvedValue(emails);
    renderWithProviders(<CustomerLinkCard order={order()} statusLabels={STATUS_LABELS} />);

    expect(await screen.findByText('Cambio de estado: En Proceso')).toBeInTheDocument();
    expect(screen.getByText('No enviado')).toBeInTheDocument();
    expect(screen.getByText(/ya recibió el aviso/)).toBeInTheDocument();
    expect(screen.getByText('Recepción')).toBeInTheDocument();
    expect(screen.getByText('Enviado')).toBeInTheDocument();
  });

  it('avisa novedades al cliente con correo', async () => {
    mocks.getActiveLink.mockResolvedValue(LINK);
    mocks.notifyProgress.mockResolvedValue('encolado');
    renderWithProviders(<CustomerLinkCard order={order()} statusLabels={STATUS_LABELS} />);

    await userEvent.click(await screen.findByRole('button', { name: /Avisar novedades/ }));
    expect(mocks.notifyProgress).toHaveBeenCalledWith('ord-1');
    expect(await screen.findByText(/Aviso en camino/)).toBeInTheDocument();
  });

  it('sin correo del cliente no ofrece avisar y sugiere WhatsApp', async () => {
    mocks.getActiveLink.mockResolvedValue(LINK);
    renderWithProviders(<CustomerLinkCard order={order({ email: '' })} statusLabels={STATUS_LABELS} />);

    expect(await screen.findByText(/no tiene correo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Avisar novedades/ })).not.toBeInTheDocument();
  });

  it('respeta que el cliente pidió no recibir correos', async () => {
    mocks.getActiveLink.mockResolvedValue(LINK);
    renderWithProviders(<CustomerLinkCard order={order({ acepta_correos: false })} statusLabels={STATUS_LABELS} />);

    expect(await screen.findByText(/pidió no recibir correos/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Avisar novedades/ })).not.toBeInTheDocument();
  });
});
