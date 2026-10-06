// @vitest-environment jsdom
//
// Empleados (reunión con el taller, sept. 2026): cómo se le paga a cada quien. Comisión con el
// porcentaje de la sede, con uno propio, o salario. Cambiarlo recalcula en la base lo que está
// pendiente; pasar a salario con comisiones pendientes se avisa con el monto.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, authValue, ADMIN_USER, SEDE_CENTRO } from '../test/renderWithProviders';
import type { PayScheme, UserProfile } from '../types/database';

const tecnico = (id: string, nombre: string, rol: 'mecanico' | 'pintor' = 'mecanico'): UserProfile => ({
  id,
  nombre_completo: nombre,
  rol,
  sede_id: SEDE_CENTRO.id,
  telefono: '',
  email: `${id}@restorify.test`,
  creado_en: '2026-01-01T00:00:00Z',
});

const MARIO = tecnico('u-mario', 'Mario Mecánico');
const PAULA = tecnico('u-paula', 'Paula Pintora', 'pintor');
const MEMO = tecnico('u-memo', 'Memo Mecánico');
const ALAN = tecnico('u-alan', 'Alan Mixto');

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getPaySchemes: vi.fn(),
  savePayScheme: vi.fn(),
  getSummary: vi.fn(),
  getRecentAssignments: vi.fn(),
  getRecentProgress: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));
vi.mock('../services/employees.service', () => ({
  employeesService: {
    getPaySchemes: mocks.getPaySchemes,
    savePayScheme: mocks.savePayScheme,
    getSummary: mocks.getSummary,
    getRecentAssignments: mocks.getRecentAssignments,
    getRecentProgress: mocks.getRecentProgress,
  },
}));
vi.mock('../services/supabaseService', () => {
  const sedes = { getSedes: vi.fn().mockResolvedValue([{ ...SEDE_CENTRO, comision_porcentaje: 35 }]) };
  const users = { getUsers: vi.fn().mockResolvedValue([ADMIN_USER, MARIO, PAULA, MEMO, ALAN]) };
  return { sedesService: sedes, usersService: users, supabaseService: { ...sedes, ...users } };
});

const { default: Employees } = await import('./Employees');

const SCHEMES: PayScheme[] = [
  { usuario_id: 'u-paula', esquema: 'comision', comision_porcentaje: 40, salario_monto: null, salario_periodo: null },
  { usuario_id: 'u-memo', esquema: 'salario', comision_porcentaje: null, salario_monto: 900, salario_periodo: 'quincenal' },
  { usuario_id: 'u-alan', esquema: 'mixto', comision_porcentaje: 20, salario_monto: 1000, salario_periodo: 'semanal' },
];

const payRow = (name: string) =>
  screen.getAllByText(name).map((el) => el.closest('tr')).find((tr) => tr && within(tr).queryByRole('button', { name: 'Ver' })) as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.current = authValue(ADMIN_USER);
  mocks.getPaySchemes.mockResolvedValue(SCHEMES);
  mocks.savePayScheme.mockImplementation(async (s: PayScheme) => s);
  mocks.getSummary.mockResolvedValue({ comisiones_pendientes: 0, comisiones_pagadas: 0, ultimo_pago: null, ordenes_activas: 1, ordenes_entregadas: 3 });
  mocks.getRecentAssignments.mockResolvedValue([]);
  mocks.getRecentProgress.mockResolvedValue([]);
});

describe('Empleados: el pago de cada quien', () => {
  it('muestra el porcentaje de la sede, el propio o el salario', async () => {
    renderWithProviders(<Employees />);

    await screen.findAllByText('Mario Mecánico');
    await waitFor(() => expect(within(payRow('Paula Pintora')).getByText('Comisión · 40%')).toBeInTheDocument());
    expect(within(payRow('Mario Mecánico')).getByText('Comisión · 35% (el de la sede)')).toBeInTheDocument();
    expect(within(payRow('Memo Mecánico')).getByText('Salario · $900.00 quincenal')).toBeInTheDocument();
    expect(within(payRow('Alan Mixto')).getByText('Mixto · $1,000.00 semanal + 20%')).toBeInTheDocument();
  });

  it('guarda un porcentaje propio', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Employees />);

    await screen.findAllByText('Mario Mecánico');
    await user.click(within(payRow('Mario Mecánico')).getByRole('button', { name: 'Ver' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mario Mecánico' });
    await user.type(within(dialog).getByLabelText('Porcentaje de comisión'), '40');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(mocks.savePayScheme).toHaveBeenCalledWith({
        usuario_id: 'u-mario',
        esquema: 'comision',
        comision_porcentaje: 40,
        salario_monto: null,
        salario_periodo: null,
      })
    );
  });

  it('un porcentaje fuera de 0-100 se rechaza dentro del diálogo', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Employees />);

    await screen.findAllByText('Mario Mecánico');
    await user.click(within(payRow('Mario Mecánico')).getByRole('button', { name: 'Ver' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mario Mecánico' });
    await user.type(within(dialog).getByLabelText('Porcentaje de comisión'), '150');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(within(dialog).getByText('El porcentaje tiene que estar entre 0 y 100.')).toBeInTheDocument();
    expect(mocks.savePayScheme).not.toHaveBeenCalled();
  });

  it('elegir "Mixto" muestra los dos campos y guarda los tres valores', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Employees />);

    await screen.findAllByText('Mario Mecánico');
    await user.click(within(payRow('Mario Mecánico')).getByRole('button', { name: 'Ver' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mario Mecánico' });
    await user.click(within(dialog).getByRole('radio', { name: 'Mixto' }));
    
    await user.type(within(dialog).getByLabelText('Porcentaje de comisión'), '40');
    await user.type(within(dialog).getByLabelText('Monto del salario'), '900');
    await user.selectOptions(within(dialog).getByLabelText('Cada'), 'quincenal');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(mocks.savePayScheme).toHaveBeenCalledWith({
        usuario_id: 'u-mario',
        esquema: 'mixto',
        comision_porcentaje: 40,
        salario_monto: 900,
        salario_periodo: 'quincenal',
      })
    );
  });

  it('pasar a salario con comisiones pendientes lo avisa con el monto', async () => {
    mocks.getSummary.mockResolvedValue({ comisiones_pendientes: 175, comisiones_pagadas: 0, ultimo_pago: null, ordenes_activas: 0, ordenes_entregadas: 1 });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderWithProviders(<Employees />);

    await screen.findAllByText('Mario Mecánico');
    await user.click(within(payRow('Mario Mecánico')).getByRole('button', { name: 'Ver' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mario Mecánico' });
    await within(dialog).findByText('$175.00');
    await user.click(within(dialog).getByRole('radio', { name: 'Salario' }));
    await user.type(within(dialog).getByLabelText('Monto del salario'), '900');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('$175.00'));
    expect(mocks.savePayScheme).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
