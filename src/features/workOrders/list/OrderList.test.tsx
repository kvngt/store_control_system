// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import OrderList from './OrderList';
import type { WorkOrder } from '../../../types/database';

function makeOrder(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: 'wo-1',
    numero_orden: 'ORD-001',
    sede_id: 'sede-1',
    cliente_id: 'cli-1',
    vehiculo_id: 'veh-1',
    tipo_trabajo: 'mecanica',
    estatus: 'recepcion',
    millas_ingreso: 45000,
    nivel_gasolina: '1/2',
    inspeccion_360_notas: '',
    fecha_ingreso: '2026-11-01T00:00:00Z',
    fecha_estimada_entrega: '2026-11-10',
    porcentaje_avance: 0,
    con_seguro: false,
    retirada_sin_reparar: false,
    cliente: { id: 'cli-1', nombre: 'Ana López', telefono: '5551112233' },
    vehiculo: { id: 'veh-1', anio: 2021, marca: 'Honda', modelo: 'Civic', color: 'Gris' },
    montos: {
      subtotal_labor: 0,
      subtotal_repuestos: 0,
      subtotal_parqueo: 0,
      descuento: 0,
      total_general: 0,
      total_impuestos: 0,
    },
    por_autorizar: false,
    ...overrides,
  } as unknown as WorkOrder;
}

describe('OrderList (A-11: Por autorizar)', () => {
  it('en escritorio para admin muestra "Por autorizar" en lugar de "$0.00" cuando por_autorizar es true', () => {
    const orders = [
      makeOrder({ id: 'o1', numero_orden: 'ORD-001', por_autorizar: true }),
      makeOrder({
        id: 'o2',
        numero_orden: 'ORD-002',
        por_autorizar: false,
        montos: {
          subtotal_labor: 150,
          subtotal_repuestos: 0,
          subtotal_parqueo: 0,
          descuento: 0,
          total_general: 150,
          total_impuestos: 0,
        } as unknown as WorkOrder['montos'],
      }),
    ];

    renderWithProviders(
      <OrderList
        orders={orders}
        isAdmin={true}
        isMobile={false}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onArchive={vi.fn()}
      />
    );

    expect(screen.getByText('Por autorizar')).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
    expect(screen.getByText('$150.00')).toBeInTheDocument();
  });

  it('en teléfono para admin muestra "Por autorizar" en la tarjeta en lugar de "$0.00"', () => {
    renderWithProviders(
      <OrderList
        orders={[makeOrder({ id: 'o1', numero_orden: 'ORD-001', por_autorizar: true })]}
        isAdmin={true}
        isMobile={true}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onArchive={vi.fn()}
      />
    );

    expect(screen.getByText('Por autorizar')).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });

  it('para técnico (sin montos ni admin) no muestra "Por autorizar" ni montos', () => {
    renderWithProviders(
      <OrderList
        orders={[makeOrder({ id: 'o1', numero_orden: 'ORD-001', por_autorizar: true, montos: null })]}
        isAdmin={false}
        isMobile={true}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onArchive={vi.fn()}
      />
    );

    expect(screen.queryByText('Por autorizar')).not.toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });
});
