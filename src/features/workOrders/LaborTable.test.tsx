// @vitest-environment jsdom
//
// La tabla de mano de obra con presupuestos: el total es lo autorizado, lo que falta
// se ve aparte, y lo que espera al cliente no se puede tocar.

import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import LaborTable from './LaborTable';
import type { LaborItem } from '../../types/database';

const items: LaborItem[] = [
  { id: 'l1', orden_id: 'o', descripcion: 'Diagnóstico', costo: 100, estado: 'aprobado' },
  { id: 'l2', orden_id: 'o', descripcion: 'Frenos', costo: 300, estado: 'pendiente' },
  { id: 'l3', orden_id: 'o', descripcion: 'Pintura', costo: 500, estado: 'rechazado' },
  { id: 'l4', orden_id: 'o', descripcion: 'Alineación', costo: 80, estado: 'borrador' },
];

const noop = vi.fn(async () => {});

describe('LaborTable con estados', () => {
  it('suma solo lo autorizado y muestra aparte lo que falta autorizar', () => {
    renderWithProviders(<LaborTable items={items} canEdit busy={false} onAdd={noop} onUpdate={noop} onRemove={noop} />);

    const totalCell = screen.getAllByText('$100.00').find((el) => el.getAttribute('data-label'));
    expect(totalCell).toBeTruthy();
    // Pendiente + borrador: $380. Lo rechazado no se cobra ni se espera.
    expect(screen.getByText('$380.00')).toBeInTheDocument();
  });

  it('marca cada estado y bloquea la edición de lo que espera al cliente', () => {
    renderWithProviders(<LaborTable items={items} canEdit busy={false} onAdd={noop} onUpdate={noop} onRemove={noop} />);

    expect(screen.getByText('Esperando al cliente')).toBeInTheDocument();
    expect(screen.getByText('No realizar')).toBeInTheDocument();
    // La insignia del borrador (el mismo texto rotula la fila del total sin autorizar).
    expect(screen.getByText('Alineación').closest('td')!.querySelector('.line-state-borrador')).toHaveTextContent('Sin autorizar');

    const pendingRow = screen.getByText('Frenos').closest('tr')!;
    expect(within(pendingRow).queryAllByRole('button')).toHaveLength(0);
    const draftRow = screen.getByText('Alineación').closest('tr')!;
    expect(within(draftRow).getAllByRole('button')).toHaveLength(2);
  });

  it('un técnico ve los estados sin controles', () => {
    renderWithProviders(<LaborTable items={items} canEdit={false} busy={false} onAdd={noop} onUpdate={noop} onRemove={noop} />);
    expect(screen.getByText('No realizar')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
