// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import PartsTable from './PartsTable';
import type { WorkOrderPart } from '../../types/database';

const PARTS: WorkOrderPart[] = [
  {
    id: 'part-1',
    orden_id: 'o-1',
    descripcion: 'Filtro de aceite',
    cantidad: 1,
    costo_unitario: 10,
    precio_venta_unitario: 25,
    subtotal: 25,
    estado: 'aprobado',
  },
];

describe('PartsTable', () => {
  it('mantiene el editor abierto si onUpdate devuelve false y solo cierra con true', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    renderWithProviders(
      <PartsTable
        items={PARTS}
        canEdit
        busy={false}
        onAdd={vi.fn(async () => true)}
        onUpdate={onUpdate}
        onRemove={vi.fn(async () => {})}
      />
    );

    const row = screen.getByText('Filtro de aceite').closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Editar' }));

    const desc = screen.getByRole('textbox', { name: 'Descripción' });
    await user.clear(desc);
    await user.type(desc, 'Filtro sintético');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'Descripción' })).toHaveValue('Filtro sintético');

    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('textbox', { name: 'Descripción' })).not.toBeInTheDocument();
  });

  it('al guardar edición sin descripción avisa con error y marca aria-invalid', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn(async () => true);

    renderWithProviders(
      <PartsTable
        items={PARTS}
        canEdit
        busy={false}
        onAdd={vi.fn(async () => true)}
        onUpdate={onUpdate}
        onRemove={vi.fn(async () => {})}
      />
    );

    const row = screen.getByText('Filtro de aceite').closest('tr') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: 'Editar' }));

    const desc = screen.getByRole('textbox', { name: 'Descripción' });
    await user.clear(desc);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(desc).toHaveAttribute('aria-invalid', 'true');
    expect(await screen.findByText('Describe el repuesto.')).toBeInTheDocument();
  });

  it('B-08: el botón Agregar no se apaga vacío y al pulsarlo avisa y enfoca', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(async () => true);

    renderWithProviders(
      <PartsTable
        items={PARTS}
        canEdit
        busy={false}
        onAdd={onAdd}
        onUpdate={vi.fn(async () => true)}
        onRemove={vi.fn(async () => {})}
      />
    );

    const addBtn = screen.getByRole('button', { name: 'Agregar' });
    const desc = screen.getByRole('textbox', { name: 'Nuevo repuesto' });

    expect(addBtn).toBeEnabled();
    await user.click(addBtn);

    expect(onAdd).not.toHaveBeenCalled();
    expect(desc).toHaveAttribute('aria-invalid', 'true');
    expect(desc).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('Describe el repuesto.');

    await user.type(desc, 'Bujías');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(desc).not.toHaveAttribute('aria-invalid');
  });
});
