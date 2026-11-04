// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import TechOrderStatus from './TechOrderStatus';
import type { LaborItem, WorkOrder } from '../../types/database';

const order = { id: 'o1', estatus: 'recepcion', retirada_sin_reparar: false } as unknown as WorkOrder;
const borrador = { id: 'l1', orden_id: 'o1', descripcion: 'Frenos', costo: 100, estado: 'borrador' } as unknown as LaborItem;

describe('TechOrderStatus', () => {
  // Decisión del dueño (20261010000041): sin nada autorizado el técnico no empieza ni termina, y
  // la pantalla le dice por qué en vez de dejar que el botón falle.
  it('avisa que la orden espera la autorización del cliente', () => {
    renderWithProviders(<TechOrderStatus order={order} myTasks={[borrador]} statusLabel="Recepción" waitingAuthorization />);
    expect(screen.getByText(/todavía no autoriza ningún trabajo/)).toBeInTheDocument();
  });

  it('sin esa marca no lo dice', () => {
    renderWithProviders(<TechOrderStatus order={order} myTasks={[borrador]} statusLabel="Recepción" />);
    expect(screen.queryByText(/todavía no autoriza ningún trabajo/)).not.toBeInTheDocument();
  });
});
