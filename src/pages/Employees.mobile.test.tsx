// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, authValue, ADMIN_USER, SEDE_CENTRO } from '../test/renderWithProviders';
import { setViewportMatches } from '../test/viewport';
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
  const users = { getUsers: vi.fn().mockResolvedValue([ADMIN_USER, MARIO, PAULA]) };
  return { sedesService: sedes, usersService: users, supabaseService: { ...sedes, ...users } };
});

const { default: Employees } = await import('./Employees');

const SCHEMES: PayScheme[] = [
  { usuario_id: 'u-mario', esquema: 'comision', comision_porcentaje: null, salario_monto: null, salario_periodo: null },
  { usuario_id: 'u-paula', esquema: 'salario', comision_porcentaje: null, salario_monto: 900, salario_periodo: 'quincenal' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.current = authValue(ADMIN_USER);
  mocks.getPaySchemes.mockResolvedValue(SCHEMES);
  mocks.getSummary.mockResolvedValue({ comisiones_pendientes: 0, comisiones_pagadas: 0, ultimo_pago: null, ordenes_activas: 1, ordenes_entregadas: 3 });
  mocks.getRecentAssignments.mockResolvedValue([]);
  mocks.getRecentProgress.mockResolvedValue([]);
});

describe('Empleados: vista móvil', () => {
  it('la sección arranca cerrada, muestra nombres y permite abrir el pago y editar', async () => {
    setViewportMatches(true);
    const user = userEvent.setup();
    renderWithProviders(<Employees />);

    // Esperar a que cargue la lista (aparecen como mínimo en el DOM)
    const buttonSection = await screen.findByRole('button', { name: /Pago de cada empleado/ });
    expect(buttonSection).toHaveAttribute('aria-expanded', 'false');

    // Al abrir la sección se ven los nombres
    await user.click(buttonSection);
    
    const marioToggle = await screen.findByRole('button', { name: 'Mario Mecánico' });
    expect(marioToggle).toHaveAttribute('aria-expanded', 'false');

    // Al tocar el nombre, aparece su información (rol, sede, y esquema de pago)
    await user.click(marioToggle);
    expect(marioToggle).toHaveAttribute('aria-expanded', 'true');

    expect(screen.getByText('Comisión · 35% (el de la sede)')).toBeInTheDocument();
    
    // Tocar el botón "Ver" ("Editar pago" o "Ver" en código) abre el modal
    await user.click(screen.getByRole('button', { name: 'Ver' }));
    expect(await screen.findByRole('dialog', { name: 'Mario Mecánico' })).toBeInTheDocument();
  });
});
