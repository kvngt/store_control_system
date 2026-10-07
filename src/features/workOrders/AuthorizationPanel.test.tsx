// @vitest-environment jsdom
//
// "Autorización del cliente" en el Resumen (pedido del taller del 06/10/2026): dice si falta
// mandar el presupuesto y deja mandarlo desde ahí, y cuenta qué autorizó o rechazó el cliente.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { Quote, WorkOrder } from '../../types/database';

const mocks = vi.hoisted(() => ({ listQuotes: vi.fn(), sendQuote: vi.fn() }));
vi.mock('../../services/quotes.service', () => ({ quotesService: mocks }));

const { default: AuthorizationPanel } = await import('./AuthorizationPanel');

const order = (labor: Partial<NonNullable<WorkOrder['labor_items']>[number]>[]) =>
  ({
    id: 'o-1',
    estatus: 'en_proceso',
    labor_items: labor.map((l, i) => ({ id: `l-${i}`, orden_id: 'o-1', costo: 100, ...l })),
    repuestos: [],
  }) as unknown as WorkOrder;

const quote = (extra: Partial<Quote>): Quote =>
  ({ id: 'p-1', orden_id: 'o-1', numero: 1, estado: 'respondido', creado_en: '2026-10-06T10:00:00Z', respondido_en: '2026-10-06T12:00:00Z', ...extra }) as Quote;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AuthorizationPanel', () => {
  it('avisa lo cotizado sin enviar y lo envía desde el Resumen', async () => {
    mocks.listQuotes.mockResolvedValue([]);
    mocks.sendQuote.mockResolvedValue({ correo: 'encolado' });
    const user = userEvent.setup();
    renderWithProviders(<AuthorizationPanel order={order([{ descripcion: 'Frenos', estado: 'borrador' }])} onOpenQuote={vi.fn()} />);

    expect(await screen.findByText(/1 trabajo\(s\) cotizados sin enviar al cliente/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Enviar presupuesto/ }));
    expect(mocks.sendQuote).toHaveBeenCalledWith('o-1', true);
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
    await user.click(screen.getByRole('button', { name: 'Ver presupuesto' }));
    expect(onOpenQuote).toHaveBeenCalled();
  });
});
