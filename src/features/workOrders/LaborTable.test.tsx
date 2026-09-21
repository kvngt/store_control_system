// @vitest-environment jsdom
//
// La tabla de mano de obra con presupuestos: el total es lo autorizado, lo que falta
// se ve aparte, y lo que espera al cliente no se puede tocar.

import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    renderWithProviders(<LaborTable items={items} canEdit busy={false} onAdd={noop} onUpdate={noop} onRemove={noop} canComplete={false} onToggleComplete={vi.fn()} />);

    const totalCell = screen.getAllByText('$100.00').find((el) => el.getAttribute('data-label'));
    expect(totalCell).toBeTruthy();
    // Pendiente + borrador: $380. Lo rechazado no se cobra ni se espera.
    expect(screen.getByText('$380.00')).toBeInTheDocument();
  });

  // Eran botones con solo un icono dentro: un lector de pantalla anunciaba "botón" y nada
  // más, y el color del icono no dice nada a quien no lo ve.
  it('los botones de solo icono se anuncian por su nombre', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LaborTable items={items} canEdit busy={false} onAdd={noop} onUpdate={noop} onRemove={noop} canComplete={false} onToggleComplete={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Agregar' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Editar' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Eliminar' }).length).toBeGreaterThan(0);

    // Guardar y Cancelar solo existen mientras se edita una línea.
    await user.click(screen.getAllByRole('button', { name: 'Editar' })[0]);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('marca cada estado y bloquea la edición de lo que espera al cliente', () => {
    renderWithProviders(<LaborTable items={items} canEdit busy={false} onAdd={noop} onUpdate={noop} onRemove={noop} canComplete={false} onToggleComplete={vi.fn()} />);

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
    renderWithProviders(<LaborTable items={items} canEdit={false} busy={false} onAdd={noop} onUpdate={noop} onRemove={noop} canComplete={false} onToggleComplete={vi.fn()} />);
    expect(screen.getByText('No realizar')).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  // Tachar el trabajo es del técnico asignado, así que el control existe aunque no pueda
  // cotizar. Solo sobre lo que el cliente autorizó: marcar una línea rechazada la
  // devolvería a borrador y reviviría en el siguiente presupuesto.
  it('ofrece tachar solo las líneas aprobadas, también a quien no puede cotizar', () => {
    const toggle = vi.fn();
    renderWithProviders(
      <LaborTable items={items} canEdit={false} busy={false} onAdd={noop} onUpdate={noop} onRemove={noop} canComplete onToggleComplete={toggle} />
    );

    const aprobada = screen.getByText('Diagnóstico').closest('tr')!;
    expect(within(aprobada).getAllByRole('button')).toHaveLength(1);
    for (const desc of ['Frenos', 'Pintura', 'Alineación']) {
      expect(within(screen.getByText(desc).closest('tr')!).queryAllByRole('button')).toHaveLength(0);
    }
  });

  it('avisa de qué línea se marcó y cuenta las hechas', async () => {
    const toggle = vi.fn();
    const hechas = [{ ...items[0], completado_en: new Date().toISOString() }, ...items.slice(1)];
    renderWithProviders(
      <LaborTable items={hechas} canEdit={false} busy={false} onAdd={noop} onUpdate={noop} onRemove={noop} canComplete onToggleComplete={toggle} />
    );

    expect(screen.getByText('Diagnóstico').closest('tr')).toHaveClass('line-done');
    expect(screen.getByText('1 / 1')).toBeInTheDocument();

    await userEvent.click(within(screen.getByText('Diagnóstico').closest('tr')!).getByRole('button'));
    expect(toggle).toHaveBeenCalledWith(hechas[0]);
  });
});
