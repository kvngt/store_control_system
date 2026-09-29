// @vitest-environment jsdom
//
// Cuánto dejó cada trabajo (reunión con el taller, sept. 2026). La cuenta es de la base
// (`balance_orden`, `margen_ordenes`); aquí se fija qué muestra la pantalla y qué pide.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { OrderMarginPage } from '../../types/database';

const mocks = vi.hoisted(() => ({ getOrderBalance: vi.fn(), getOrderMargins: vi.fn() }));
vi.mock('../../services/supabaseService', () => ({ financeService: mocks }));

const { default: OrderBalanceCard } = await import('./OrderBalanceCard');
const { default: OrderMarginCard } = await import('./OrderMarginCard');
const { monthRange } = await import('../../lib/dates');

const fila = (n: number) => ({
  id: `ord-${n}`,
  numero_orden: `ORD-2026-${String(n).padStart(3, '0')}`,
  cliente: 'Marta Ruiz',
  fecha_finalizacion: '2026-09-15T18:00:00Z',
  total_orden: 1300,
  cobrado: 1300,
  costo_repuestos: 100,
  comisiones: 420,
  margen: 780,
});

beforeEach(() => vi.clearAllMocks());

describe('monthRange', () => {
  it('va del día 1 al día 1 del mes siguiente, también en diciembre', () => {
    expect(monthRange('2026-09')).toEqual(['2026-09-01', '2026-10-01']);
    expect(monthRange('2026-12')).toEqual(['2026-12-01', '2027-01-01']);
  });
});

describe('OrderBalanceCard', () => {
  it('muestra lo cobrado, los costos y el margen que calcula la base', async () => {
    mocks.getOrderBalance.mockResolvedValue({
      total_orden: 1300, cobrado: 1300, costo_repuestos: 100, comisiones: 420, comisiones_pagadas: 70, margen: 780,
      otros: [{ id: 'm1', fecha: '2026-09-15', tipo: 'egreso', categoria: 'compra_repuesto', descripcion: 'Filtros AutoZone', monto: 40, importado: true }],
    });
    renderWithProviders(<OrderBalanceCard orderId="ord-1" />);

    expect(await screen.findByText('$780.00')).toBeInTheDocument();
    expect(screen.getByText('$1,300.00')).toBeInTheDocument();
    expect(screen.getByText('-$100.00')).toBeInTheDocument();
    expect(screen.getByText('-$420.00')).toBeInTheDocument();
    expect(screen.getByText(/\$70\.00 ya pagadas/)).toBeInTheDocument();
    // La compra del banco se lista, pero no se resta otra vez.
    expect(screen.getByText('Filtros AutoZone')).toBeInTheDocument();
    expect(mocks.getOrderBalance).toHaveBeenCalledWith('ord-1');
  });
});

describe('OrderMarginCard', () => {
  it('pide el mes en curso a la base y muestra las sumas que devuelve', async () => {
    const page: OrderMarginPage = {
      total_filas: 1,
      sumas: { cobrado: 1300, costo_repuestos: 100, comisiones: 420, margen: 780 },
      filas: [fila(1)],
    };
    mocks.getOrderMargins.mockResolvedValue(page);
    renderWithProviders(<OrderMarginCard sedeId="sede-centro" />);

    expect(await screen.findByText('ORD-2026-001')).toBeInTheDocument();
    expect(screen.getByText('Total del mes (1 órdenes)')).toBeInTheDocument();
    const call = mocks.getOrderMargins.mock.calls[0][0];
    expect(call).toMatchObject({ sedeId: 'sede-centro', limit: 25, offset: 0 });
    expect(call.desde).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it('pasa de página pidiendo la siguiente a la base', async () => {
    mocks.getOrderMargins.mockImplementation(async ({ offset }: { offset: number }) => ({
      total_filas: 30,
      sumas: { cobrado: 0, costo_repuestos: 0, comisiones: 0, margen: 0 },
      filas: [fila(offset + 1)],
    }));
    const user = userEvent.setup();
    renderWithProviders(<OrderMarginCard sedeId="sede-centro" />);

    expect(await screen.findByText('Página 1 de 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => expect(mocks.getOrderMargins).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 25 })));
    expect(await screen.findByText('ORD-2026-026')).toBeInTheDocument();
  });

  it('sin órdenes entregadas en el mes lo dice', async () => {
    mocks.getOrderMargins.mockResolvedValue({ total_filas: 0, sumas: { cobrado: 0, costo_repuestos: 0, comisiones: 0, margen: 0 }, filas: [] });
    renderWithProviders(<OrderMarginCard />);

    expect(await screen.findByText('No se entregaron órdenes en este mes.')).toBeInTheDocument();
  });
});
