// @vitest-environment jsdom
//
// "Autorización del cliente" en el Resumen (pedido del taller del 06/10/2026): dice si falta
// mandar el presupuesto y deja mandarlo desde ahí, y cuenta qué autorizó o rechazó el cliente.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { Quote, WorkOrder } from '../../types/database';
import * as queryClientLib from '../../lib/queryClient';

const mocks = vi.hoisted(() => ({ listQuotes: vi.fn(), sendQuote: vi.fn() }));
const portalMocks = vi.hoisted(() => ({ getActiveLink: vi.fn() }));
vi.mock('../../services/quotes.service', () => ({ quotesService: mocks }));
vi.mock('../../services/customerPortal.service', () => ({
  customerPortalService: {
    ...portalMocks,
    portalUrl: (token: string) => `https://restorifyauto.net/r/${token}`,
  },
}));

const { default: AuthorizationPanel } = await import('./AuthorizationPanel');

const order = (
  labor: Partial<NonNullable<WorkOrder['labor_items']>[number]>[],
  customer: Partial<NonNullable<WorkOrder['cliente']>> = { nombre: 'Marta Ruiz', telefono: '512-555-0100', email: 'marta@example.com', idioma: 'es', acepta_correos: true }
) =>
  ({
    id: 'o-1',
    numero_orden: 'ORD-2026-014',
    estatus: 'en_proceso',
    cliente: customer,
    labor_items: labor.map((l, i) => ({ id: `l-${i}`, orden_id: 'o-1', costo: 100, ...l })),
    repuestos: [],
  }) as unknown as WorkOrder;

const quote = (extra: Partial<Quote>): Quote =>
  ({ id: 'p-1', orden_id: 'o-1', numero: 1, estado: 'respondido', creado_en: '2026-10-06T10:00:00Z', respondido_en: '2026-10-06T12:00:00Z', ...extra }) as Quote;

beforeEach(() => {
  vi.clearAllMocks();
  portalMocks.getActiveLink.mockResolvedValue(null);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AuthorizationPanel', () => {
  it('avisa lo cotizado sin enviar y lo envía desde el Resumen', async () => {
    const spy = vi.spyOn(queryClientLib, 'invalidateOrderEffects');
    mocks.listQuotes.mockResolvedValue([]);
    mocks.sendQuote.mockResolvedValue({ correo: 'encolado' });
    const user = userEvent.setup();
    renderWithProviders(<AuthorizationPanel order={order([{ descripcion: 'Frenos', estado: 'borrador' }])} onOpenQuote={vi.fn()} />);

    expect(await screen.findByText(/1 trabajo\(s\) cotizados sin enviar al cliente/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Enviar presupuesto/ }));
    expect(mocks.sendQuote).toHaveBeenCalledWith('o-1', true);
    expect(spy).toHaveBeenCalledWith(expect.anything(), { orderId: 'o-1' });
  });

  it('dice qué autorizó y qué no el cliente en la última respuesta', async () => {
    mocks.listQuotes.mockResolvedValue([quote({ id: 'p-2', numero: 2 })]);
    renderWithProviders(
      <AuthorizationPanel
        order={order([
          { descripcion: 'Aceite', estado: 'aprobado', presupuesto_id: 'p-2' },
          { descripcion: 'Frenos', estado: 'rechazado', presupuesto_id: 'p-2' },
        ])}
        onOpenQuote={vi.fn()}
      />
    );

    expect(await screen.findByText(/El cliente respondió el presupuesto 2/)).toBeInTheDocument();
    expect(screen.getByText('Autorizó: Aceite')).toBeInTheDocument();
    expect(screen.getByText('No autorizó: Frenos')).toBeInTheDocument();
  });

  it('con un presupuesto enviado, dice que espera al cliente', async () => {
    mocks.listQuotes.mockResolvedValue([quote({ estado: 'enviado', respondido_en: null })]);
    const onOpenQuote = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<AuthorizationPanel order={order([{ descripcion: 'Frenos', estado: 'pendiente', presupuesto_id: 'p-1' }])} onOpenQuote={onOpenQuote} />);

    expect(await screen.findByText(/esperando al cliente/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Enviar por WhatsApp/ })).not.toBeInTheDocument();
    expect(portalMocks.getActiveLink).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Ver presupuesto' }));
    expect(onOpenQuote).toHaveBeenCalled();
  });

  it('sin correo adapta la confirmación y avisa sin error', async () => {
    mocks.listQuotes.mockResolvedValue([]);
    mocks.sendQuote.mockResolvedValue({ correo: 'sin_correo' });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    renderWithProviders(
      <AuthorizationPanel
        order={order(
          [{ descripcion: 'Frenos', estado: 'borrador' }],
          { nombre: 'Marta Ruiz', telefono: '512-555-0100', email: '', idioma: 'en', acepta_correos: true }
        )}
        onOpenQuote={vi.fn()}
      />
    );

    await user.click(await screen.findByRole('button', { name: /Enviar presupuesto/ }));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/no tiene correo.*WhatsApp/i));

    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent(/no tiene correo/);
    expect(toast).toHaveClass('toast-info');
  });

  it('con presupuesto enviado y cliente sin correo muestra WhatsApp y copiar enlace al cargar', async () => {
    mocks.listQuotes.mockResolvedValue([quote({ estado: 'enviado', respondido_en: null })]);
    portalMocks.getActiveLink.mockResolvedValue({ id: 'lnk-1', token: 'tok-abc' });
    const user = userEvent.setup();
    const writeSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    renderWithProviders(
      <AuthorizationPanel
        order={order(
          [{ descripcion: 'Frenos', estado: 'pendiente', presupuesto_id: 'p-1' }],
          { nombre: 'Marta Ruiz', telefono: '512-555-0100', email: '', idioma: 'en', acepta_correos: true }
        )}
        onOpenQuote={vi.fn()}
      />
    );

    const wa = await screen.findByRole('link', { name: /Enviar por WhatsApp/ });
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/15125550100\?text=/);
    expect(decodeURIComponent(wa.getAttribute('href')!)).toContain('https://restorifyauto.net/r/tok-abc');
    expect(decodeURIComponent(wa.getAttribute('href')!)).toContain('estimate');

    await user.click(screen.getByRole('button', { name: /Copiar enlace/ }));
    expect(writeSpy).toHaveBeenCalledWith('https://restorifyauto.net/r/tok-abc');
  });

  it('con presupuesto enviado y cliente sin correo no muestra botones si no hay enlace activo', async () => {
    mocks.listQuotes.mockResolvedValue([quote({ estado: 'enviado', respondido_en: null })]);
    portalMocks.getActiveLink.mockResolvedValue(null);

    renderWithProviders(
      <AuthorizationPanel
        order={order(
          [{ descripcion: 'Frenos', estado: 'pendiente', presupuesto_id: 'p-1' }],
          { nombre: 'Marta Ruiz', telefono: '512-555-0100', email: '', idioma: 'es', acepta_correos: false }
        )}
        onOpenQuote={vi.fn()}
      />
    );

    await waitFor(() => expect(portalMocks.getActiveLink).toHaveBeenCalledWith('o-1'));
    expect(screen.queryByRole('link', { name: /Enviar por WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copiar enlace/ })).not.toBeInTheDocument();
  });
});
