// @vitest-environment jsdom
//
// La tarjeta de presupuesto del admin: enviar lo que falta autorizar, registrar lo
// que el cliente autorizó por teléfono, cancelar, y ver las respuestas anteriores.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { Quote, WorkOrder } from '../../types/database';
import * as queryClientLib from '../../lib/queryClient';

const mocks = vi.hoisted(() => ({
  listQuotes: vi.fn(),
  sendQuote: vi.fn(),
  cancelQuote: vi.fn(),
  registerAuthorization: vi.fn(),
}));
const portalMocks = vi.hoisted(() => ({
  getActiveLink: vi.fn(),
}));

vi.mock('../../services/quotes.service', () => ({ quotesService: mocks }));
vi.mock('../../services/customerPortal.service', () => ({
  customerPortalService: {
    ...portalMocks,
    portalUrl: (token: string) => `https://restorifyauto.net/r/${token}`,
  },
}));

const { default: QuoteCard } = await import('./QuoteCard');

function order(
  lines: { id: string; descripcion: string; costo: number; estado: string; presupuesto_id?: string }[],
  customer: Partial<NonNullable<WorkOrder['cliente']>> = { nombre: 'Marta Ruiz', telefono: '512-555-0100', email: 'marta@example.com', idioma: 'es', acepta_correos: true }
): WorkOrder {
  return {
    id: 'ord-1',
    numero_orden: 'ORD-2026-014',
    cliente: customer,
    labor_items: lines.map((l, i) => ({ ...l, orden_id: 'ord-1', creado_en: `2026-09-12T10:0${i}:00Z` })),
    repuestos: [],
  } as unknown as WorkOrder;
}

const RESPONDED: Quote = {
  id: 'q1', orden_id: 'ord-1', sede_id: 's1', numero: 1, estado: 'respondido', creado_en: '2026-09-10T10:00:00Z',
  enviado_por: null, total_propuesto: 700, respondido_en: '2026-09-11T10:00:00Z', respondido_via: 'cliente_portal',
  respondido_por_nombre: 'Marta Ruiz', respondido_por_perfil: null, total_aprobado: 200,
  comentario_cliente: 'La pintura después', nota_admin: null, cancelado_en: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listQuotes.mockResolvedValue([]);
  portalMocks.getActiveLink.mockResolvedValue(null);
});

describe('QuoteCard', () => {
  it('sin nada por autorizar ni historial no ocupa lugar', async () => {
    renderWithProviders(<QuoteCard order={order([{ id: 'l1', descripcion: 'Frenos', costo: 300, estado: 'aprobado' }])} />);
    await waitFor(() => expect(mocks.listQuotes).toHaveBeenCalled());
    expect(screen.queryByRole('heading', { name: /Presupuesto/ })).not.toBeInTheDocument();
  });

  it('con borradores, envía el presupuesto al cliente tras confirmar', async () => {
    const spy = vi.spyOn(queryClientLib, 'invalidateOrderEffects');
    mocks.sendQuote.mockResolvedValue({ presupuesto_id: 'q2', numero: 2, lineas: 1, total: 500, correo: 'encolado' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithProviders(<QuoteCard order={order([{ id: 'l1', descripcion: 'Pintura', costo: 500, estado: 'borrador' }])} />);

    expect(await screen.findByText(/1 línea\(s\) por \$500.00/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Enviar presupuesto al cliente/ }));

    expect(mocks.sendQuote).toHaveBeenCalledWith('ord-1', true);
    expect(await screen.findByText(/Presupuesto enviado/)).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith(expect.anything(), { orderId: 'ord-1' });
  });

  it('sin correo adapta la confirmación y avisa como información', async () => {
    mocks.sendQuote.mockResolvedValue({ presupuesto_id: 'q2', numero: 2, lineas: 1, total: 500, correo: 'sin_correo' });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(
      <QuoteCard
        order={order(
          [{ id: 'l1', descripcion: 'Pintura', costo: 500, estado: 'borrador' }],
          { nombre: 'Marta Ruiz', telefono: '512-555-0100', email: '', idioma: 'es', acepta_correos: true }
        )}
      />
    );

    await user.click(await screen.findByRole('button', { name: /Enviar presupuesto al cliente/ }));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/no tiene correo.*WhatsApp/i));

    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent(/no tiene correo/);
    expect(toast).toHaveClass('toast-info');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('con presupuesto enviado y cliente sin correo muestra WhatsApp y copiar enlace al cargar', async () => {
    mocks.listQuotes.mockResolvedValue([{ ...RESPONDED, id: 'q2', numero: 2, estado: 'enviado', respondido_via: null, respondido_en: null }]);
    portalMocks.getActiveLink.mockResolvedValue({ id: 'lnk-1', token: 'tok-quote' });
    const user = userEvent.setup();
    const writeSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    renderWithProviders(
      <QuoteCard
        order={order(
          [{ id: 'l1', descripcion: 'Pintura', costo: 500, estado: 'pendiente', presupuesto_id: 'q2' }],
          { nombre: 'Marta Ruiz', telefono: '512-555-0100', email: '', idioma: 'es', acepta_correos: true }
        )}
      />
    );

    const wa = await screen.findByRole('link', { name: /Enviar por WhatsApp/ });
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/15125550100\?text=/);
    expect(decodeURIComponent(wa.getAttribute('href')!)).toContain('https://restorifyauto.net/r/tok-quote');

    await user.click(screen.getByRole('button', { name: /Copiar enlace/ }));
    expect(writeSpy).toHaveBeenCalledWith('https://restorifyauto.net/r/tok-quote');
  });

  it('con presupuesto enviado y cliente sin correo no muestra botones si no hay enlace activo', async () => {
    mocks.listQuotes.mockResolvedValue([{ ...RESPONDED, id: 'q2', numero: 2, estado: 'enviado', respondido_via: null, respondido_en: null }]);
    portalMocks.getActiveLink.mockResolvedValue(null);

    renderWithProviders(
      <QuoteCard
        order={order(
          [{ id: 'l1', descripcion: 'Pintura', costo: 500, estado: 'pendiente', presupuesto_id: 'q2' }],
          { nombre: 'Marta Ruiz', telefono: '512-555-0100', email: '', idioma: 'es', acepta_correos: false }
        )}
      />
    );

    await waitFor(() => expect(portalMocks.getActiveLink).toHaveBeenCalledWith('ord-1'));
    expect(screen.queryByRole('link', { name: /Enviar por WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copiar enlace/ })).not.toBeInTheDocument();
  });

  it('registra una autorización por teléfono: lo desmarcado queda rechazado', async () => {
    mocks.listQuotes.mockResolvedValue([{ ...RESPONDED, id: 'q2', numero: 2, estado: 'enviado', respondido_via: null, respondido_en: null }]);
    mocks.registerAuthorization.mockResolvedValue({ presupuesto_id: 'q2', numero: 2, autorizados: 1, rechazados: 1, total_autorizado: 200 });
    renderWithProviders(
      <QuoteCard
        order={order([
          { id: 'l1', descripcion: 'Alineación', costo: 200, estado: 'pendiente', presupuesto_id: 'q2' },
          { id: 'l2', descripcion: 'Pintura', costo: 500, estado: 'pendiente', presupuesto_id: 'q2' },
        ])}
      />
    );

    expect(await screen.findByText('Presupuesto 2 enviado')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Registrar autorización/ }));

    const dialog = screen.getByRole('dialog');
    // Todo viene marcado: se desmarca lo que el cliente no quiso.
    await userEvent.click(within(dialog).getByLabelText(/Pintura/));
    expect(within(dialog).getByText('Total autorizado').parentElement).toHaveTextContent('$200.00');
    await userEvent.selectOptions(within(dialog).getByLabelText('¿Cómo autorizó?'), 'admin_whatsapp');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Registrar' }));

    expect(mocks.registerAuthorization).toHaveBeenCalledWith({
      orderId: 'ord-1',
      approvedIds: ['l1'],
      shownIds: ['l1', 'l2'],
      via: 'admin_whatsapp',
      name: 'Marta Ruiz',
      note: '',
    });
    expect(await screen.findByText(/Autorización registrada/)).toBeInTheDocument();
  });

  it('cancelar un presupuesto abierto pide confirmación', async () => {
    mocks.listQuotes.mockResolvedValue([{ ...RESPONDED, id: 'q2', numero: 2, estado: 'enviado' }]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderWithProviders(<QuoteCard order={order([{ id: 'l1', descripcion: 'Pintura', costo: 500, estado: 'pendiente', presupuesto_id: 'q2' }])} />);

    const button = await screen.findByRole('button', { name: /Cancelar presupuesto/ });
    await userEvent.click(button);
    expect(mocks.cancelQuote).not.toHaveBeenCalled();
    await userEvent.click(button);
    await waitFor(() => expect(mocks.cancelQuote).toHaveBeenCalledWith('q2'));
    confirmSpy.mockRestore();
  });

  it('muestra cómo respondió el cliente, qué autorizó y su comentario', async () => {
    mocks.listQuotes.mockResolvedValue([RESPONDED]);
    renderWithProviders(
      <QuoteCard
        order={order([
          { id: 'l1', descripcion: 'Alineación', costo: 200, estado: 'aprobado', presupuesto_id: 'q1' },
          { id: 'l2', descripcion: 'Pintura', costo: 500, estado: 'rechazado', presupuesto_id: 'q1' },
        ])}
      />
    );

    expect(await screen.findByText(/Presupuesto 1 · desde su enlace/)).toBeInTheDocument();
    expect(screen.getByText(/1 autorizado\(s\) · 1 rechazado\(s\) · \$200.00/)).toBeInTheDocument();
    expect(screen.getByText(/La pintura después/)).toBeInTheDocument();
  });
});
