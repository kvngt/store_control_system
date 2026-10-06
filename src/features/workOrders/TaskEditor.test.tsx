// @vitest-environment jsdom
//
// El editor de tareas (reunión con el taller, 03/10/2026; comisión por tarea, 20261010000006):
// "Agregar trabajo" abre un formulario con tipo, descripción, precio y técnico. El tipo nace del
// tipo de la orden, el técnico del de la primera tarea, y asignar fuera de oficio pregunta antes.
// No depende de una orden existente: el alta de la orden (F4) lo usará con un borrador.

import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test/renderWithProviders';
import TaskEditor from './TaskEditor';
import type { TaskDraft, Technician } from './tasks';

const MARIO: Technician = { id: 'u-mario', nombre_completo: 'Mario Mecánico', rol: 'mecanico' };
const PAULA: Technician = { id: 'u-paula', nombre_completo: 'Paula Pintora', rol: 'pintor' };
const TECHS = [MARIO, PAULA];

const typeSelect = () => screen.getByLabelText('Tipo');
const technicianSelect = () => screen.getByLabelText('Técnico');
const description = () => screen.getByLabelText('Descripción');
const price = () => screen.getByLabelText('Precio');

async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Agregar trabajo' }));
}

describe('TaskEditor', () => {
  it('es un botón verde hasta que se abre', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskEditor workType="mecanica" technicians={TECHS} onAdd={vi.fn()} />);

    const start = screen.getByRole('button', { name: 'Agregar trabajo' });
    expect(start).toHaveClass('btn-success');
    expect(screen.queryByLabelText('Descripción')).not.toBeInTheDocument();

    await user.click(start);
    expect(description()).toHaveFocus();
  });

  it('el tipo nace del tipo de la orden y el técnico es el que le pasan por defecto', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskEditor workType="pintura" technicians={TECHS} defaultTechnicianId={PAULA.id} onAdd={vi.fn()} />);
    await openEditor(user);

    expect(typeSelect()).toHaveValue('pintura');
    expect(technicianSelect()).toHaveValue(PAULA.id);
  });

  it('sin técnico por defecto queda "Sin asignar" y avisa que nadie cobra', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskEditor workType="mecanica" technicians={TECHS} onAdd={vi.fn()} />);
    await openEditor(user);

    expect(typeSelect()).toHaveValue('mecanica');
    expect(technicianSelect()).toHaveDisplayValue('Sin asignar');
    expect(screen.getByText(/Nadie cobrará la comisión de esta tarea/)).toBeInTheDocument();
  });

  it('un técnico por defecto que ya no está en la lista no se preselecciona', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TaskEditor workType="mecanica" technicians={TECHS} defaultTechnicianId="u-otro" onAdd={vi.fn()} />);
    await openEditor(user);

    expect(technicianSelect()).toHaveValue('');
  });

  it('manda la tarea con su técnico y queda listo para la siguiente', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(async () => true);
    renderWithProviders(<TaskEditor workType="mecanica" technicians={TECHS} defaultTechnicianId={MARIO.id} onAdd={onAdd} />);
    await openEditor(user);

    await user.type(description(), '  Cambio de aceite ');
    await user.type(price(), '120');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onAdd).toHaveBeenCalledWith({ descripcion: 'Cambio de aceite', costo: 120, especialidad: 'mecanica', asignado_a: MARIO.id });
    await waitFor(() => expect(description()).toHaveValue(''));
    // Junto al botón, y no solo en el aviso de arriba que el teclado del teléfono tapa.
    expect(screen.getByRole('status')).toHaveTextContent('Agregado: Cambio de aceite');
    expect(price()).toHaveValue(null);
    expect(technicianSelect()).toHaveValue(MARIO.id);
    // Y con el foco en Descripción, para escribir la siguiente sin volver a hacer clic.
    await waitFor(() => expect(description()).toHaveFocus());
  });

  // El foco se pedía mientras el campo seguía deshabilitado (guardando, y el `busy` de la orden),
  // y un control deshabilitado no lo recibe: quedaba en el body.
  it('el foco vuelve a Descripción cuando el padre deja de estar ocupado', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [busy, setBusy] = useState(false);
      const onAdd = async () => {
        setBusy(true);
        await Promise.resolve();
        // Como `refresh()` de la orden: el padre se desocupa un momento después de guardar.
        setTimeout(() => setBusy(false), 20);
        return true;
      };
      return <TaskEditor workType="mecanica" technicians={TECHS} busy={busy} onAdd={onAdd} />;
    }
    renderWithProviders(<Harness />);
    await openEditor(user);

    await user.type(description(), 'Frenos{Enter}');

    await waitFor(() => expect(description()).not.toBeDisabled());
    await waitFor(() => expect(description()).toHaveFocus());
    expect(description()).toHaveValue('');
  });

  it('sin técnico manda nulo, y un precio negativo se recorta a cero', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(async () => true);
    renderWithProviders(<TaskEditor workType="mecanica" technicians={TECHS} onAdd={onAdd} />);
    await openEditor(user);

    await user.type(description(), 'Diagnóstico');
    await user.type(price(), '-50');
    await user.keyboard('{Enter}');

    expect(onAdd).toHaveBeenCalledWith({ descripcion: 'Diagnóstico', costo: 0, especialidad: 'mecanica', asignado_a: null });
  });

  it('sin descripción no manda nada y lo dice', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    renderWithProviders(<TaskEditor workType="mecanica" technicians={TECHS} onAdd={onAdd} />);
    await openEditor(user);

    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Describe el trabajo.');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('si no se guardó, deja lo escrito para reintentar', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(async () => false);
    renderWithProviders(<TaskEditor workType="mecanica" technicians={TECHS} onAdd={onAdd} />);
    await openEditor(user);

    await user.type(description(), 'Frenos');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(description()).toHaveValue('Frenos');
  });

  it('en un combinado empieza en mecánica y después recuerda el último tipo usado', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(async () => true);
    renderWithProviders(<TaskEditor workType="combinado" technicians={TECHS} onAdd={onAdd} />);
    await openEditor(user);
    expect(typeSelect()).toHaveValue('mecanica');

    await user.selectOptions(typeSelect(), 'pintura');
    await user.type(description(), 'Pulido');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(1));
    expect(typeSelect()).toHaveValue('pintura');

    // Cerrar y volver a abrir también arranca en el último usado.
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await openEditor(user);
    expect(typeSelect()).toHaveValue('pintura');
  });

  describe('tipo que no es del oficio del técnico', () => {
    async function askMismatch(user: ReturnType<typeof userEvent.setup>, onAdd: (task: TaskDraft) => Promise<boolean>) {
      renderWithProviders(<TaskEditor workType="pintura" technicians={TECHS} defaultTechnicianId={MARIO.id} onAdd={onAdd} />);
      await openEditor(user);
      await user.type(description(), 'Pintar defensa');
      await user.type(price(), '400');
      await user.click(screen.getByRole('button', { name: 'Agregar' }));
      return screen.getByRole('alertdialog', { name: '¿Asignar una tarea de pintura a un mecánico?' });
    }

    it('pregunta antes de guardar y "Asignar igual" la guarda con ese técnico', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn(async () => true);
      const dialog = await askMismatch(user, onAdd);

      expect(within(dialog).getByText(/Mario Mecánico está registrado como mecánico/)).toBeInTheDocument();
      expect(onAdd).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole('button', { name: 'Asignar igual' }));

      expect(onAdd).toHaveBeenCalledWith({ descripcion: 'Pintar defensa', costo: 400, especialidad: 'pintura', asignado_a: MARIO.id });
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });

    it('"Elegir otro" no guarda y lleva al selector de técnico, con lo escrito intacto', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn(async () => true);
      const dialog = await askMismatch(user, onAdd);

      await user.click(within(dialog).getByRole('button', { name: 'Elegir otro' }));

      expect(onAdd).not.toHaveBeenCalled();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      await waitFor(() => expect(technicianSelect()).toHaveFocus());
      expect(description()).toHaveValue('Pintar defensa');

      // Con la pintora ya no pregunta.
      await user.selectOptions(technicianSelect(), PAULA.id);
      await user.click(screen.getByRole('button', { name: 'Agregar' }));
      expect(onAdd).toHaveBeenCalledWith({ descripcion: 'Pintar defensa', costo: 400, especialidad: 'pintura', asignado_a: PAULA.id });
    });

    it('"Cancelar" no guarda y deja el formulario como estaba', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn(async () => true);
      const dialog = await askMismatch(user, onAdd);

      await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      expect(onAdd).not.toHaveBeenCalled();
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(description()).toHaveValue('Pintar defensa');
      expect(technicianSelect()).toHaveValue(MARIO.id);
    });

    it('sin técnico no pregunta', async () => {
      const user = userEvent.setup();
      const onAdd = vi.fn(async () => true);
      renderWithProviders(<TaskEditor workType="pintura" technicians={TECHS} onAdd={onAdd} />);
      await openEditor(user);
      await user.type(description(), 'Pintar defensa');
      await user.click(screen.getByRole('button', { name: 'Agregar' }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(onAdd).toHaveBeenCalled();
    });
  });
});
