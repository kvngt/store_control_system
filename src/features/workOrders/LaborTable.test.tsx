// @vitest-environment jsdom
//
// La tabla de mano de obra con presupuestos: el total es lo autorizado, lo que falta
// se ve aparte, y lo que espera al cliente no se puede tocar.

import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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

    expect(screen.getByRole('button', { name: 'Agregar trabajo' })).toBeInTheDocument();
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


// Comisión por tarea (reunión con el taller, 03/10/2026; 20261010000006): cada línea dice su
// tipo y su técnico, que es quien cobra su comisión. Administración los cambia en la fila.
describe('LaborTable: tipo y técnico de cada línea', () => {
  const MARIO = { id: 'u-mario', nombre_completo: 'Mario Mecánico', rol: 'mecanico' as const };
  const PAULA = { id: 'u-paula', nombre_completo: 'Paula Pintora', rol: 'pintor' as const };
  const TECHS = [MARIO, PAULA];

  const tasks: LaborItem[] = [
    { id: 'p1', orden_id: 'o', descripcion: 'Pintura general', costo: 1000, estado: 'aprobado', especialidad: 'pintura', asignado_a: PAULA.id, reparto_heredado: false, tecnico: PAULA },
    { id: 'm1', orden_id: 'o', descripcion: 'Cambio de aceite', costo: 200, estado: 'aprobado', especialidad: 'mecanica', asignado_a: null, reparto_heredado: false },
    { id: 'h1', orden_id: 'o', descripcion: 'Frenos (antes)', costo: 300, estado: 'aprobado', especialidad: 'mecanica', asignado_a: null, reparto_heredado: true },
  ];
  const rowOf = (desc: string) => screen.getByText(desc).closest('tr') as HTMLElement;

  function renderAdmin(overrides: Partial<Parameters<typeof LaborTable>[0]> = {}) {
    const onAssign = vi.fn(async () => {});
    const onChangeSpecialty = vi.fn(async () => {});
    renderWithProviders(
      <LaborTable
        items={tasks}
        canEdit
        busy={false}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
        canComplete={false}
        onToggleComplete={vi.fn()}
        workType="combinado"
        technicians={TECHS}
        onAssign={onAssign}
        onChangeSpecialty={onChangeSpecialty}
        {...overrides}
      />
    );
    return { onAssign, onChangeSpecialty };
  }

  it('al técnico le muestra el tipo y el técnico de cada tarea, sin controles', () => {
    renderWithProviders(
      <LaborTable items={tasks} canEdit={false} busy={false} onAdd={noop} onUpdate={noop} onRemove={noop} canComplete={false} onToggleComplete={vi.fn()} />
    );

    expect(within(rowOf('Pintura general')).getByText('Pintura')).toBeInTheDocument();
    expect(within(rowOf('Pintura general')).getByText('Paula Pintora')).toBeInTheDocument();
    expect(within(rowOf('Cambio de aceite')).getByText('Mecánica')).toBeInTheDocument();
    expect(within(rowOf('Cambio de aceite')).getByText('Sin técnico')).toBeInTheDocument();
    // Una línea de antes, sin técnico, sigue en el reparto: no se marca como huérfana.
    expect(within(rowOf('Frenos (antes)')).queryByText('Sin técnico')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
  });

  it('a administración le marca la tarea sin técnico, no la heredada', () => {
    renderAdmin();

    expect(within(rowOf('Cambio de aceite')).getByText('Sin técnico')).toHaveClass('labor-no-tech');
    expect(within(rowOf('Frenos (antes)')).queryByText('Sin técnico')).not.toBeInTheDocument();
    // La opción vacía dice qué pasa con esa línea.
    expect(within(rowOf('Cambio de aceite')).getByRole('combobox', { name: 'Técnico' })).toHaveDisplayValue('Sin asignar');
    expect(within(rowOf('Frenos (antes)')).getByRole('combobox', { name: 'Técnico' })).toHaveDisplayValue('Reparto por especialidad');
    expect(within(rowOf('Pintura general')).getByRole('combobox', { name: 'Técnico' })).toHaveValue(PAULA.id);
  });

  it('cambia el técnico de una fila', async () => {
    const user = userEvent.setup();
    const { onAssign } = renderAdmin();

    await user.selectOptions(within(rowOf('Cambio de aceite')).getByRole('combobox', { name: 'Técnico' }), MARIO.id);

    expect(onAssign).toHaveBeenCalledWith(tasks[1], MARIO.id);
  });

  it('quitarle el técnico manda nulo', async () => {
    const user = userEvent.setup();
    const { onAssign } = renderAdmin();

    await user.selectOptions(within(rowOf('Pintura general')).getByRole('combobox', { name: 'Técnico' }), '');

    expect(onAssign).toHaveBeenCalledWith(tasks[0], null);
  });

  it('una tarea de pintura a un mecánico pregunta antes, y "Asignar igual" la asigna', async () => {
    const user = userEvent.setup();
    const { onAssign } = renderAdmin();

    await user.selectOptions(within(rowOf('Pintura general')).getByRole('combobox', { name: 'Técnico' }), MARIO.id);

    const dialog = screen.getByRole('alertdialog', { name: '¿Asignar una tarea de pintura a un mecánico?' });
    expect(onAssign).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Asignar igual' }));

    expect(onAssign).toHaveBeenCalledWith(tasks[0], MARIO.id);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('"Elegir otro" no asigna y vuelve al selector con el técnico de antes', async () => {
    const user = userEvent.setup();
    const { onAssign } = renderAdmin();

    await user.selectOptions(within(rowOf('Pintura general')).getByRole('combobox', { name: 'Técnico' }), MARIO.id);
    await user.click(screen.getByRole('button', { name: 'Elegir otro' }));

    expect(onAssign).not.toHaveBeenCalled();
    const select = within(rowOf('Pintura general')).getByRole('combobox', { name: 'Técnico' });
    expect(select).toHaveValue(PAULA.id);
    await waitFor(() => expect(select).toHaveFocus());
  });

  it('"Cancelar" no asigna nada', async () => {
    const user = userEvent.setup();
    const { onAssign } = renderAdmin();

    // Mecánica a una pintora: la otra dirección del mismo aviso.
    await user.selectOptions(within(rowOf('Cambio de aceite')).getByRole('combobox', { name: 'Técnico' }), PAULA.id);
    expect(screen.getByRole('alertdialog', { name: '¿Asignar una tarea de mecánica a un pintor?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onAssign).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(within(rowOf('Cambio de aceite')).getByRole('combobox', { name: 'Técnico' })).toHaveValue('');
  });

  it('cambia el tipo desde la fila, también de una línea que espera al cliente', async () => {
    const user = userEvent.setup();
    const pendiente: LaborItem = { ...tasks[1], id: 'm2', descripcion: 'Alineación', estado: 'pendiente' };
    const { onChangeSpecialty } = renderAdmin({ items: [...tasks, pendiente] });

    await user.selectOptions(within(rowOf('Alineación')).getByRole('combobox', { name: 'Tipo' }), 'pintura');

    expect(onChangeSpecialty).toHaveBeenCalledWith(pendiente, 'pintura');
  });

  it('con la comisión ya pagada, el tipo y el técnico quedan bloqueados y dicen por qué', () => {
    renderAdmin({ lockedIds: new Set(['p1']) });

    const row = rowOf('Pintura general');
    expect(within(row).getByRole('combobox', { name: 'Técnico' })).toBeDisabled();
    expect(within(row).getByRole('combobox', { name: 'Tipo' })).toBeDisabled();
    expect(within(row).getByRole('img', { name: /ya se pagó/ })).toBeInTheDocument();
    expect(within(rowOf('Cambio de aceite')).getByRole('combobox', { name: 'Técnico' })).toBeEnabled();
  });

  // La base rechaza borrar una línea con la comisión pagada; el botón lo dice en vez de dejar
  // intentarlo y que el rechazo salga lejos, arriba de la página.
  it('con la comisión ya pagada, Borrar queda deshabilitado y dice por qué', () => {
    renderAdmin({ lockedIds: new Set(['p1']) });

    const borrar = within(rowOf('Pintura general')).getByRole('button', { name: /Eliminar: .*ya se pagó/ });
    expect(borrar).toBeDisabled();
    expect(within(rowOf('Cambio de aceite')).getByRole('button', { name: 'Eliminar' })).toBeEnabled();
  });

  // Cambiar el tipo es la otra forma de llegar al mismo cruce de oficios que cambiar el técnico.
  it('pasar a pintura una tarea de un mecánico pregunta antes, y "Cambiar igual" la cambia', async () => {
    const user = userEvent.setup();
    const deMario: LaborItem = { ...tasks[1], id: 'm3', descripcion: 'Escaneo', asignado_a: MARIO.id, tecnico: MARIO };
    const { onChangeSpecialty } = renderAdmin({ items: [...tasks, deMario] });

    await user.selectOptions(within(rowOf('Escaneo')).getByRole('combobox', { name: 'Tipo' }), 'pintura');

    const dialog = screen.getByRole('alertdialog', { name: '¿Pasar a pintura una tarea de un mecánico?' });
    expect(onChangeSpecialty).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cambiar igual' }));

    expect(onChangeSpecialty).toHaveBeenCalledWith(deMario, 'pintura');
  });

  it('"Cancelar" deja el tipo como estaba', async () => {
    const user = userEvent.setup();
    const dePaula: LaborItem = { ...tasks[0], id: 'p3', descripcion: 'Pulido' };
    const { onChangeSpecialty } = renderAdmin({ items: [...tasks, dePaula] });

    await user.selectOptions(within(rowOf('Pulido')).getByRole('combobox', { name: 'Tipo' }), 'mecanica');
    expect(screen.getByRole('alertdialog', { name: '¿Pasar a mecánica una tarea de un pintor?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onChangeSpecialty).not.toHaveBeenCalled();
    expect(within(rowOf('Pulido')).getByRole('combobox', { name: 'Tipo' })).toHaveValue('pintura');
  });

  it('sin técnico, cambiar el tipo no pregunta', async () => {
    const user = userEvent.setup();
    const { onChangeSpecialty } = renderAdmin();

    await user.selectOptions(within(rowOf('Cambio de aceite')).getByRole('combobox', { name: 'Tipo' }), 'pintura');

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onChangeSpecialty).toHaveBeenCalledWith(tasks[1], 'pintura');
  });

  // Una línea heredada autorizada sigue en el reparto al cambiar de tipo, y la base no la deja
  // entrar a un reparto ya pagado (su comisión no la cobraría nadie).
  it('una línea heredada no se ofrece a pasar a una especialidad con el reparto pagado', () => {
    renderAdmin({ paidPools: new Set(['pintura']) });

    const heredada = within(rowOf('Frenos (antes)')).getByRole('option', { name: /Pintura/ });
    expect(heredada).toBeDisabled();
    expect(heredada).toHaveTextContent('reparto ya pagado');
    // Una tarea nueva no entra a ningún reparto: su tipo se cambia libre.
    expect(within(rowOf('Cambio de aceite')).getByRole('option', { name: 'Pintura' })).toBeEnabled();
  });

  // En el teléfono la celda de la descripción lleva una clase propia para que tipo y técnico
  // bajen a su renglón (`src/styles/laborMobile.test.ts`).
  it('la celda de la descripción lleva la clase del arreglo para el teléfono', () => {
    renderAdmin();
    expect(screen.getByText('Cambio de aceite').closest('td')).toHaveClass('labor-desc-cell');
  });

  // Una tarea con técnico la marca ese técnico (o administración): a otro no se le ofrece.
  it('el botón de hecho se ofrece por línea', () => {
    renderWithProviders(
      <LaborTable
        items={tasks}
        canEdit={false}
        busy={false}
        onAdd={noop}
        onUpdate={noop}
        onRemove={noop}
        canComplete={(item) => !item.asignado_a || item.asignado_a === MARIO.id}
        onToggleComplete={vi.fn()}
      />
    );

    expect(within(rowOf('Pintura general')).queryByRole('button')).toBeNull();
    expect(within(rowOf('Cambio de aceite')).getByRole('button', { name: 'Marcar como hecho' })).toBeInTheDocument();
    expect(within(rowOf('Frenos (antes)')).getByRole('button', { name: 'Marcar como hecho' })).toBeInTheDocument();
  });

  it('al editar una línea se cambian descripción y precio, sin tocar el técnico', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn(async () => {});
    renderAdmin({ onUpdate });

    await user.click(within(rowOf('Cambio de aceite')).getByRole('button', { name: 'Editar' }));
    const price = screen.getByRole('spinbutton', { name: 'Precio' });
    await user.clear(price);
    await user.type(price, '250');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onUpdate).toHaveBeenCalledWith('m1', { descripcion: 'Cambio de aceite', costo: 250 });
  });

  it('el alta viene con el técnico de la primera tarea que tiene uno', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn(async () => true);
    renderAdmin({ onAdd, workType: 'pintura' });

    await user.click(screen.getByRole('button', { name: 'Agregar trabajo' }));
    expect(screen.getByLabelText('Técnico', { selector: '#labor-new-technician' })).toHaveValue(PAULA.id);
    await user.type(screen.getByLabelText('Descripción', { selector: 'input' }), 'Pulido');
    await user.type(screen.getByLabelText('Precio', { selector: '#labor-new-price' }), '150');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onAdd).toHaveBeenCalledWith({ descripcion: 'Pulido', costo: 150, especialidad: 'pintura', asignado_a: PAULA.id });
  });
});
