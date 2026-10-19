// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import TaskEditor from './TaskEditor';
import type { Technician } from './tasks';

const MARIO: Technician = { id: 'u-mario', nombre_completo: 'Mario Mecánico', rol: 'mecanico' };
const TECHS = [MARIO];

describe('TaskEditor - Campo de horas (M1)', () => {
  it('permite a un administrador ingresar horas y las incluye en el payload de onAdd', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    renderWithProviders(
      <TaskEditor
        workType="mecanica"
        technicians={TECHS}
        defaultTechnicianId={MARIO.id}
        isAdmin={true}
        onAdd={onAdd}
      />
    );

    // Abrir editor
    await user.click(screen.getByRole('button', { name: 'Agregar trabajo' }));

    const descInput = screen.getByLabelText('Descripción');
    const priceInput = screen.getByLabelText('Precio');
    const hoursInput = screen.getByLabelText('Horas');

    expect(hoursInput).toBeInTheDocument();

    await user.type(descInput, 'Alineación y balanceo');
    await user.type(priceInput, '120');
    await user.type(hoursInput, '2.5');

    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        descripcion: 'Alineación y balanceo',
        costo: 120,
        horas: 2.5,
        asignado_a: MARIO.id,
        especialidad: 'mecanica',
      })
    );
  });

  it('sin horas escritas, la tarea nueva no lleva la llave horas', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    renderWithProviders(
      <TaskEditor
        workType="mecanica"
        technicians={TECHS}
        defaultTechnicianId={MARIO.id}
        isAdmin={true}
        onAdd={onAdd}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Agregar trabajo' }));

    await user.type(screen.getByLabelText('Descripción'), 'Diagnóstico general');
    await user.type(screen.getByLabelText('Precio'), '50');

    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        descripcion: 'Diagnóstico general',
        costo: 50,
      })
    );
    // La base la deja vacía sola; mandarla en null cambiaba la carga de siempre.
    expect(onAdd.mock.calls[0][0]).not.toHaveProperty('horas');
  });

  it('no muestra el campo de horas cuando isAdmin es false', async () => {
    const user = userEvent.setup();

    renderWithProviders(
      <TaskEditor
        workType="mecanica"
        technicians={TECHS}
        defaultTechnicianId={MARIO.id}
        isAdmin={false}
        onAdd={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Agregar trabajo' }));

    expect(screen.queryByLabelText('Horas')).not.toBeInTheDocument();
  });
});
